"""Regression guards for the services-layer de-duplication (audit cleanup).

These lock the consolidation so a divergent second copy can't creep back:
- the youtube handler has ONE implementation, re-exported on both import paths;
- the speculative per-service facade (services.SearchService, ...) stays gone;
- src.constants / src.exceptions are thin shims over their core.* originals
  (no byte-identical duplicate to drift).
"""
import importlib

import pytest


def test_youtube_handler_is_single_implementation():
    from src import youtube_handler as canonical
    from services.youtube import youtube_handler as shim

    # Same function objects on both paths → no divergent second copy.
    for name in (
        "is_youtube_url",
        "extract_youtube_id",
        "fetch_youtube_comments",
        "format_comments_for_context",
        "_find_ytdlp",
    ):
        assert getattr(shim, name) is getattr(canonical, name), name


def test_youtube_guards_present_on_canonical():
    from src.youtube_handler import extract_youtube_id, format_comments_for_context

    # non-string url → None (was only in the old services copy)
    assert extract_youtube_id(1234) is None
    # non-dict comment rows skipped, not crashed (json.loads can yield bare strings)
    out = format_comments_for_context(
        {"success": True, "comments": [{"author": "a", "text": "hi", "likes": 1}, "junk", None]},
        "https://youtu.be/x",
    )
    assert "@a" in out and "junk" not in out


def test_service_facade_stays_removed():
    services = importlib.import_module("services")
    for gone in ("SearchService", "DocsService", "ResearchService", "MemoryService", "ShellService"):
        assert not hasattr(services, gone), f"{gone} facade re-appeared"
    with pytest.raises(ImportError):
        from services import SearchService  # noqa: F401


def test_constants_and_exceptions_are_shims_not_duplicates():
    import src.constants
    import core.constants
    import src.exceptions
    import core.exceptions

    # Same value, sourced from core (the src copy's stale 1.0.0 is gone).
    assert src.constants.APP_VERSION == core.constants.APP_VERSION
    # Same class object → `except src.exceptions.X` catches a core-raised X.
    assert src.exceptions.SessionNotFoundError is core.exceptions.SessionNotFoundError
