"""Guided weighted benchmark search ("Decision" mode).

Powers the Benchmark chat toggle: given an open-ended query like "utility vehicle",
the LLM asks clarifying questions, proposes weighted criteria from the answers, then
ranks real options gathered via live web search.

Three async steps, each a single LLM round-trip. Reuses the existing web-search
pipeline (services.search.comprehensive_web_search) and LLM plumbing
(src.llm_core.llm_call_async). The weighted total is computed in Python from the
user-adjusted weights, so the model only supplies per-criterion 0-10 scores.
"""

import json
import logging
import re
from typing import Dict, List, Optional, Tuple

from src.llm_core import llm_call_async
from src.research_utils import strip_thinking

logger = logging.getLogger(__name__)

# Keep search/scoring bounded — a handful of queries is plenty for a ranking.
_MAX_SEARCH_QUERIES = 4
_MAX_CANDIDATES = 6


# --------------------------------------------------------------------------
# JSON parsing helpers (adapted from DeepResearcher._parse_json_* so the model
# can wrap its answer in prose or code fences without breaking us).
# --------------------------------------------------------------------------
def _strip_code_block(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse_json_object(text: str) -> Optional[Dict]:
    text = _strip_code_block(text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    logger.warning("benchmark: could not parse JSON object from: %s", text[:200])
    return None


async def _llm(url, model, headers, messages, *, temperature=0.3, max_tokens=4096,
               timeout=90) -> str:
    response = await llm_call_async(
        url=url,
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        headers=headers,
        timeout=timeout,
    )
    return strip_thinking(response or "")


# --------------------------------------------------------------------------
# Step 1: clarifying questions
# --------------------------------------------------------------------------
async def generate_questions(query: str, url: str, model: str,
                             headers: Optional[Dict]) -> Dict:
    """Ask the LLM for 3-6 clarifying questions about the user's needs."""
    system = (
        "You are a decision assistant. The user wants help finding the best option "
        "for a category of thing. Before recommending anything, you ask focused "
        "clarifying questions to understand their needs, priorities, budget, and "
        "constraints — like a thoughtful expert would.\n\n"
        "Return ONLY JSON, no prose, in this exact shape:\n"
        '{"intro": "<one short sentence framing what you\'ll help decide>", '
        '"questions": ["<question 1>", "<question 2>", ...]}\n'
        "Rules: 3 to 6 questions. Each question must be specific to the category and "
        "help you weigh options (e.g. budget, intended use, must-have features, "
        "deal-breakers). Plain text questions, no numbering."
    )
    user = f'The user is looking for: "{query}". Produce the clarifying questions.'
    raw = await _llm(url, model, headers,
                     [{"role": "system", "content": system},
                      {"role": "user", "content": user}],
                     temperature=0.4, max_tokens=1024)
    data = _parse_json_object(raw) or {}
    questions = [str(q).strip() for q in (data.get("questions") or []) if str(q).strip()]
    if not questions:
        # Defensive fallback so the UI always has something to show.
        questions = [
            "What is your budget range?",
            "What will you primarily use it for?",
            "Are there any must-have features or deal-breakers?",
        ]
    return {
        "intro": str(data.get("intro") or f"Let's find the best {query} for you.").strip(),
        "questions": questions[:6],
    }


# --------------------------------------------------------------------------
# Step 2: propose weighted criteria + search queries
# --------------------------------------------------------------------------
async def propose_criteria(query: str, qa_pairs: List[Dict], url: str, model: str,
                           headers: Optional[Dict]) -> Dict:
    """From the Q&A, infer weighted scoring criteria and web-search queries.

    qa_pairs: [{"question": str, "answer": str}, ...]
    Returns {"criteria": [{"name","weight","why"}], "search_queries": [...]}
    with weights normalized to sum to 100.
    """
    qa_text = "\n".join(
        f"Q: {p.get('question','').strip()}\nA: {p.get('answer','').strip() or '(no answer)'}"
        for p in qa_pairs
    ) or "(no answers provided)"
    system = (
        "You are a decision assistant building a weighted scoring benchmark. Based on "
        "the user's category and their answers, define the criteria that matter for "
        "choosing the best option, assign each an importance weight (integer, weights "
        "across all criteria sum to 100), and give a short reason. Also produce web "
        "search queries that will surface real, current candidate options to compare.\n\n"
        "Return ONLY JSON, no prose, in this exact shape:\n"
        '{"criteria": [{"name": "<criterion>", "weight": <int>, "why": "<short reason>"}], '
        '"search_queries": ["<query 1>", "<query 2>"]}\n'
        "Rules: 3 to 6 criteria, weights are positive integers summing to 100, ordered "
        "most-important first. 2 to 4 search queries targeting real products/options."
    )
    user = (
        f'Category the user wants: "{query}".\n\n'
        f"Their answers:\n{qa_text}\n\n"
        "Produce the weighted criteria and search queries."
    )
    raw = await _llm(url, model, headers,
                     [{"role": "system", "content": system},
                      {"role": "user", "content": user}],
                     temperature=0.3, max_tokens=2048)
    data = _parse_json_object(raw) or {}
    criteria = _normalize_criteria(data.get("criteria"))
    queries = [str(q).strip() for q in (data.get("search_queries") or []) if str(q).strip()]
    if not queries:
        queries = [f"best {query}", f"{query} comparison review"]
    return {"criteria": criteria, "search_queries": queries[:_MAX_SEARCH_QUERIES]}


def _normalize_criteria(raw_criteria) -> List[Dict]:
    """Clean criteria list and rescale weights to sum to 100 (integers)."""
    out: List[Dict] = []
    for c in (raw_criteria or []):
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or "").strip()
        if not name:
            continue
        try:
            weight = float(c.get("weight") or 0)
        except (TypeError, ValueError):
            weight = 0.0
        out.append({"name": name, "weight": max(weight, 0.0),
                    "why": str(c.get("why") or "").strip()})
    if not out:
        out = [{"name": "Overall fit", "weight": 100.0, "why": "General suitability"}]
    return _rescale_weights(out)


def _rescale_weights(criteria: List[Dict]) -> List[Dict]:
    total = sum(c["weight"] for c in criteria)
    if total <= 0:
        even = 100 // len(criteria)
        for c in criteria:
            c["weight"] = even
        criteria[0]["weight"] += 100 - even * len(criteria)
        return criteria
    # Scale to 100 then fix rounding drift on the largest criterion.
    for c in criteria:
        c["weight"] = round(c["weight"] / total * 100)
    drift = 100 - sum(c["weight"] for c in criteria)
    if drift and criteria:
        criteria[0]["weight"] += drift
    return criteria


# --------------------------------------------------------------------------
# Step 3: search + score + rank
# --------------------------------------------------------------------------
async def rank(query: str, criteria: List[Dict], search_queries: List[str],
               url: str, model: str, headers: Optional[Dict]) -> Dict:
    """Gather candidates via web search, score each criterion, weight, and rank.

    criteria: [{"name","weight",...}] with user-adjusted weights (authoritative).
    """
    criteria = _normalize_criteria(criteria)  # honor user edits, re-normalize
    context, sources = await _gather_context(search_queries or [f"best {query}"])
    if not context.strip():
        return {"candidates": [], "winner": None, "sources": [],
                "error": "Web search returned no results. Try rephrasing or check search settings."}

    crit_names = [c["name"] for c in criteria]
    system = (
        "You are a decision assistant scoring candidate options against weighted "
        "criteria using ONLY the provided search context. Identify the distinct real "
        "options mentioned, then score each option on every criterion from 0 (poor) "
        "to 10 (excellent). If the context lacks evidence for a criterion, give your "
        "best estimate and keep it conservative. Do not invent options not supported "
        "by the context.\n\n"
        "Return ONLY JSON, no prose, in this exact shape:\n"
        '{"candidates": [{"name": "<option>", "summary": "<one-line why it fits or not>", '
        '"scores": {' + ", ".join(f'"{n}": <0-10>' for n in crit_names) + "}}]}\n"
        f"Rules: at most {_MAX_CANDIDATES} candidates. Every candidate must score all "
        f"{len(crit_names)} criteria. Use the exact criterion names given."
    )
    crit_block = "\n".join(f"- {c['name']} (weight {c['weight']})" for c in criteria)
    user = (
        f'The user wants the best: "{query}".\n\n'
        f"Criteria to score (0-10 each):\n{crit_block}\n\n"
        f"Search context:\n{context[:12000]}"
    )
    raw = await _llm(url, model, headers,
                     [{"role": "system", "content": system},
                      {"role": "user", "content": user}],
                     temperature=0.2, max_tokens=4096)
    data = _parse_json_object(raw) or {}
    candidates = _score_candidates(data.get("candidates"), criteria)
    winner = candidates[0]["name"] if candidates else None
    return {"candidates": candidates, "winner": winner, "criteria": criteria,
            "sources": sources}


async def _gather_context(queries: List[str]) -> Tuple[str, List[Dict]]:
    """Run web search for each query and merge context + deduped sources."""
    import asyncio
    from services.search import comprehensive_web_search

    parts: List[str] = []
    sources: List[Dict] = []
    seen_urls = set()
    for q in queries[:_MAX_SEARCH_QUERIES]:
        try:
            ctx, srcs = await asyncio.to_thread(
                comprehensive_web_search, q, max_pages=3, return_sources=True
            )
        except Exception as e:
            logger.warning("benchmark search failed for %r: %s", q, e)
            continue
        if ctx:
            parts.append(f"### Results for: {q}\n{ctx}")
        for s in (srcs or []):
            su = (s.get("url") if isinstance(s, dict) else None) or ""
            if su and su in seen_urls:
                continue
            if su:
                seen_urls.add(su)
            sources.append(s)
    return "\n\n".join(parts), sources


def _score_candidates(raw_candidates, criteria: List[Dict]) -> List[Dict]:
    """Compute the weighted total per candidate (Python-side) and sort desc."""
    weight_by_name = {c["name"]: c["weight"] for c in criteria}
    total_weight = sum(weight_by_name.values()) or 1
    out: List[Dict] = []
    for c in (raw_candidates or []):
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or "").strip()
        if not name:
            continue
        raw_scores = c.get("scores") if isinstance(c.get("scores"), dict) else {}
        scores: Dict[str, float] = {}
        weighted = 0.0
        for crit_name, weight in weight_by_name.items():
            try:
                val = float(raw_scores.get(crit_name, 0))
            except (TypeError, ValueError):
                val = 0.0
            val = max(0.0, min(10.0, val))
            scores[crit_name] = round(val, 1)
            weighted += val * weight
        out.append({
            "name": name,
            "summary": str(c.get("summary") or "").strip(),
            "scores": scores,
            # 0-100 overall match score.
            "total": round(weighted / total_weight * 10, 1),
        })
    out.sort(key=lambda x: x["total"], reverse=True)
    return out[:_MAX_CANDIDATES]
