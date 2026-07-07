# src/exceptions.py — re-export of the canonical core.exceptions module,
# kept as a shim so `from src.exceptions import X` keeps working everywhere.
from core.exceptions import *  # noqa: F401,F403
