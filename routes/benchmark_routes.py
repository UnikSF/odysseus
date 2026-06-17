"""Benchmark / Decision mode routes — /api/benchmark/*.

Backs the Benchmark chat toggle: clarifying questions -> AI-proposed weighted
criteria -> live-web-search ranking. See src/benchmark.py for the logic.
"""

import json
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from src import benchmark
from src.auth_helpers import _auth_disabled, get_current_user
from src.endpoint_resolver import resolve_endpoint

logger = logging.getLogger(__name__)


class QuestionsRequest(BaseModel):
    query: str


class CriterionIn(BaseModel):
    name: str
    weight: float = 0
    why: str = ""


class QAPair(BaseModel):
    question: str = ""
    answer: str = ""


class CriteriaRequest(BaseModel):
    query: str
    answers: List[QAPair] = Field(default_factory=list)


class RankRequest(BaseModel):
    query: str
    criteria: List[CriterionIn] = Field(default_factory=list)
    search_queries: List[str] = Field(default_factory=list)


def _owned_first_enabled_endpoint(user: str):
    """Owner-scoped first-enabled endpoint (url, model, headers) or (None, None, None).

    Mirrors research_routes — never borrow another user's private endpoint/api_key.
    """
    from src.database import SessionLocal, ModelEndpoint
    from src.auth_helpers import owner_filter
    from src.endpoint_resolver import normalize_base, build_chat_url, build_headers
    db = SessionLocal()
    try:
        q = db.query(ModelEndpoint).filter(ModelEndpoint.is_enabled == True)  # noqa: E712
        ep = owner_filter(q, ModelEndpoint, user).first()
        if not ep:
            return None, None, None
        base = normalize_base(ep.base_url)
        model = ""
        if ep.cached_models:
            try:
                models = json.loads(ep.cached_models)
                # First non-embedding/non-tts model.
                for m in models:
                    low = str(m).lower()
                    if not any(p in low for p in ("embedding", "tts-", "whisper",
                                                  "rerank", "dall-e", "clip")):
                        model = m
                        break
                if not model and models:
                    model = models[0]
            except Exception:
                pass
        return build_chat_url(base), model, build_headers(ep.api_key, base)
    finally:
        db.close()


def _resolve_endpoint(user: str):
    """Resolve (url, model, headers) for a benchmark call: research -> utility ->
    default -> chat settings, then owner-scoped first-enabled fallback."""
    for prefix in ("research", "utility", "default", "chat"):
        url, model, headers = resolve_endpoint(prefix, owner=user or None)
        if url:
            return url, model, headers
    return _owned_first_enabled_endpoint(user)


def setup_benchmark_routes(session_manager=None) -> APIRouter:
    router = APIRouter(tags=["benchmark"])

    def _require_user(request: Request) -> str:
        user = get_current_user(request)
        if not user:
            if _auth_disabled():
                return ""
            raise HTTPException(401, "Not authenticated")
        return user

    def _endpoint_or_400(user: str):
        url, model, headers = _resolve_endpoint(user)
        if not url:
            raise HTTPException(400, "No endpoints configured. Add one in Settings first.")
        return url, model, headers

    @router.post("/api/benchmark/questions")
    async def benchmark_questions(body: QuestionsRequest, request: Request):
        user = _require_user(request)
        query = (body.query or "").strip()
        if not query:
            raise HTTPException(400, "query is required")
        url, model, headers = _endpoint_or_400(user)
        try:
            return await benchmark.generate_questions(query, url, model, headers)
        except Exception as e:
            logger.exception("benchmark questions failed")
            raise HTTPException(500, f"Failed to generate questions: {e}")

    @router.post("/api/benchmark/criteria")
    async def benchmark_criteria(body: CriteriaRequest, request: Request):
        user = _require_user(request)
        query = (body.query or "").strip()
        if not query:
            raise HTTPException(400, "query is required")
        url, model, headers = _endpoint_or_400(user)
        qa = [{"question": p.question, "answer": p.answer} for p in body.answers]
        try:
            return await benchmark.propose_criteria(query, qa, url, model, headers)
        except Exception as e:
            logger.exception("benchmark criteria failed")
            raise HTTPException(500, f"Failed to propose criteria: {e}")

    @router.post("/api/benchmark/rank")
    async def benchmark_rank(body: RankRequest, request: Request):
        user = _require_user(request)
        query = (body.query or "").strip()
        if not query:
            raise HTTPException(400, "query is required")
        url, model, headers = _endpoint_or_400(user)
        criteria = [c.model_dump() for c in body.criteria]
        try:
            return await benchmark.rank(query, criteria, body.search_queries,
                                        url, model, headers)
        except Exception as e:
            logger.exception("benchmark rank failed")
            raise HTTPException(500, f"Failed to rank options: {e}")

    return router
