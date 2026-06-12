"""Agent routing endpoint — POST /api/agent/route.

Multi-model orchestrator:
  1. Utility model (qwen2.5:1.5b) classifies + rewrites the prompt in one
     compact JSON call.
  2. Routes to the right specialist:
       code     → qwen2.5-coder:7b
       research → qwen3:8b
       search   → SearXNG query → qwen3:8b synthesis
       general  → qwen2.5:1.5b  (stays local, fastest)
  3. Returns a structured JSON response with the answer, routing metadata,
     and search sources when applicable.

Auth: session cookie OR  Authorization: Bearer ody_xxx  with agent:route scope.
All four model IDs and the Ollama base URL are overridable via env vars.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from src.auth_helpers import require_user

logger = logging.getLogger(__name__)

# ── Configurable model / endpoint ────────────────────────────────────────────
# Defaults target Docker's host.docker.internal so the container can reach
# Ollama running on the Windows/NAS host.  Override in .env on bare-metal:
#   AGENT_OLLAMA_URL=http://localhost:11434/api
_OLLAMA_URL     = os.getenv("AGENT_OLLAMA_URL",     "http://host.docker.internal:11434/api")
_UTILITY_MODEL  = os.getenv("AGENT_UTILITY_MODEL",  "qwen2.5:1.5b")
_CODE_MODEL     = os.getenv("AGENT_CODE_MODEL",     "qwen2.5-coder:7b")
_RESEARCH_MODEL = os.getenv("AGENT_RESEARCH_MODEL", "qwen3:8b")
_SEARCH_MODEL   = os.getenv("AGENT_SEARCH_MODEL",   "qwen3:8b")

# ── System prompts ────────────────────────────────────────────────────────────
_ROUTER_SYSTEM = (
    "You are a request router. Output ONLY valid JSON, no markdown:\n"
    '{"intent":"<code|research|search|general>","prompt":"<rewritten>","query":"<search terms or null>"}\n\n'
    "Intents:\n"
    "  code     — programming, debugging, algorithms, code review, technical impl\n"
    "  research — deep reasoning, math, analysis, step-by-step thinking, comparisons\n"
    "  search   — needs live/current web data, news, prices, recent events\n"
    "  general  — simple Q&A, definitions, quick facts\n\n"
    "rewritten: strip filler, keep core intent, as short as possible.\n"
    "query: concise search terms when intent=search, else null."
)

_CODE_SYSTEM = (
    "Expert programmer. Return working, idiomatic code. "
    "Comment only non-obvious logic. Omit prose unless the user asks for explanation."
)

_RESEARCH_SYSTEM = (
    "Deep reasoning assistant. Think step by step before answering. "
    "Structure your response with clear sections when helpful. Be thorough and precise."
)

_SEARCH_SYNTHESIS_SYSTEM = (
    "Search result synthesizer. Given web search results and a question, "
    "answer directly and factually. Cite sources inline as [1], [2], etc. "
    "Be concise. Do not hallucinate beyond what the results say."
)

_GENERAL_SYSTEM = "Concise, helpful assistant. Answer directly. No filler words."

_MODEL_FOR_INTENT = {
    "code": lambda: _CODE_MODEL,
    "research": lambda: _RESEARCH_MODEL,
    "search": lambda: _SEARCH_MODEL,
    "general": lambda: _UTILITY_MODEL,
}


# ── Request schema ────────────────────────────────────────────────────────────
class RouteRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=16_000)
    max_tokens: int = Field(default=1024, ge=1, le=8192)


# ── Auth helper ───────────────────────────────────────────────────────────────
def _check_auth(request: Request) -> str:
    """Return owner username.

    Session-cookie callers pass through after require_user.
    Bearer-token callers must also carry the agent:route scope.
    """
    user = require_user(request)
    if getattr(request.state, "api_token", False):
        scopes = getattr(request.state, "api_token_scopes", None) or []
        if "agent:route" not in scopes:
            raise HTTPException(403, "Token missing agent:route scope")
    return user


# ── LLM helper ───────────────────────────────────────────────────────────────
async def _call(
    model: str,
    system: str,
    user_prompt: str,
    *,
    max_tokens: int = 512,
    temperature: float = 0.7,
) -> str:
    from src.llm_core import llm_call_async
    messages = [
        {"role": "system", "content": system},
        {"role": "user",   "content": user_prompt},
    ]
    return await llm_call_async(
        url=_OLLAMA_URL,
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=180,
    )


# ── Router output parser ──────────────────────────────────────────────────────
def _parse_routing(raw: str) -> dict:
    """Extract the JSON routing decision from the utility model's response.

    The model occasionally wraps JSON in markdown fences or adds a sentence
    before the object.  We find the first '{' … last '}' block and parse that.
    Falls back to intent=general if parsing fails entirely.
    """
    text = (raw or "").strip()
    for attempt in (text, text[text.find("{"):text.rfind("}") + 1] if "{" in text else ""):
        try:
            obj = json.loads(attempt)
            if isinstance(obj, dict):
                return obj
        except (json.JSONDecodeError, ValueError):
            continue
    logger.warning("agent/route: could not parse router JSON, defaulting to general. raw=%r", text[:200])
    return {"intent": "general", "prompt": text, "query": None}


# ── Route factory ─────────────────────────────────────────────────────────────
def setup_agent_route_routes() -> APIRouter:
    router = APIRouter(tags=["agent"])

    @router.post("/api/agent/route")
    async def agent_route(request: Request, req: RouteRequest):
        """Classify a prompt and route it to the right local specialist model.

        Returns JSON:
        ```json
        {
          "response": "...",
          "intent": "code|research|search|general",
          "routed_to": "<model id>",
          "rewritten_prompt": "...",
          "sources": []          // populated for search intent
        }
        ```

        **Auth** — one of:
        - Session cookie (browser / same-origin)
        - `Authorization: Bearer ody_xxx` token that has the `agent:route` scope

        **Example (curl)**
        ```
        curl -X POST https://your-nas/api/agent/route \\
             -H "Authorization: Bearer ody_..." \\
             -H "Content-Type: application/json" \\
             -d '{"prompt": "write a binary search in Python"}'
        ```
        """
        _check_auth(request)

        # ── 1. Classify + rewrite via utility model ───────────────────────────
        try:
            raw_routing = await _call(
                _UTILITY_MODEL,
                _ROUTER_SYSTEM,
                req.prompt,
                max_tokens=128,
                temperature=0.0,     # deterministic classification
            )
        except Exception as exc:
            logger.error("agent/route: utility model error: %s", exc)
            raise HTTPException(502, f"Utility model unavailable — is Ollama running? ({exc})")

        routing   = _parse_routing(raw_routing)
        intent    = routing.get("intent") or "general"
        if intent not in ("code", "research", "search", "general"):
            intent = "general"
        rewritten = (routing.get("prompt") or req.prompt).strip() or req.prompt
        search_q  = (routing.get("query") or "").strip()

        logger.info("agent/route: intent=%s model=%s prompt_len=%d",
                    intent, _MODEL_FOR_INTENT.get(intent, lambda: "?")(), len(rewritten))

        # ── 2. Route to specialist ────────────────────────────────────────────
        sources: list = []
        try:
            if intent == "code":
                answer = await _call(
                    _CODE_MODEL, _CODE_SYSTEM, rewritten,
                    max_tokens=req.max_tokens,
                )

            elif intent == "research":
                answer = await _call(
                    _RESEARCH_MODEL, _RESEARCH_SYSTEM, rewritten,
                    max_tokens=req.max_tokens,
                )

            elif intent == "search":
                # 2a. Retrieve from SearXNG (synchronous, run in executor)
                query_text = search_q or rewritten
                raw_context = ""
                try:
                    from services.search import comprehensive_web_search
                    loop = asyncio.get_event_loop()
                    ctx, srcs = await loop.run_in_executor(
                        None, comprehensive_web_search, query_text
                    )
                    raw_context = ctx or ""
                    sources = srcs if isinstance(srcs, list) else []
                except Exception as se:
                    logger.warning("agent/route: SearXNG search failed: %s", se)

                # 2b. Synthesize results
                synthesis_prompt = (
                    f"Question: {rewritten}\n\n"
                    f"Search results:\n{raw_context[:6000]}\n\n"
                    "Based only on the search results above, give a direct answer."
                )
                answer = await _call(
                    _SEARCH_MODEL, _SEARCH_SYNTHESIS_SYSTEM, synthesis_prompt,
                    max_tokens=req.max_tokens,
                )

            else:  # general — stays on the utility model, fast and cheap
                answer = await _call(
                    _UTILITY_MODEL, _GENERAL_SYSTEM, rewritten,
                    max_tokens=req.max_tokens,
                )

        except HTTPException:
            raise
        except Exception as exc:
            logger.error("agent/route: specialist call failed: %s", exc)
            raise HTTPException(502, f"Specialist model unavailable ({exc})")

        return {
            "response":         answer,
            "intent":           intent,
            "routed_to":        _MODEL_FOR_INTENT.get(intent, lambda: _UTILITY_MODEL)(),
            "rewritten_prompt": rewritten,
            "sources":          sources,
        }

    return router
