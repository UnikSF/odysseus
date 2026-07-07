# services/youtube/youtube_handler.py — re-export shim.
# The canonical implementation lives in src/youtube_handler.py; this keeps the
# services.youtube.youtube_handler import path working without a second copy.
from src.youtube_handler import *  # noqa: F401,F403
from src.youtube_handler import (  # explicit names (incl. private helper used by tests)
    init_youtube,
    is_youtube_url,
    extract_youtube_id,
    extract_transcript_async,
    format_transcript_for_context,
    fetch_youtube_comments,
    format_comments_for_context,
    _find_ytdlp,
)
