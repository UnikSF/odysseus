#!/usr/bin/env python3
"""Generate PWA icon PNGs from the SVG source.

Requires: pip install cairosvg  OR  pip install Pillow
Falls back to a simple solid-color PNG if neither is available.

Usage:
    python scripts/generate-icons.py
"""
import os
import struct
import zlib

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")
SVG_SRC = os.path.join(STATIC_DIR, "icon.svg")


def _minimal_png(size: int, r: int, g: int, b: int) -> bytes:
    """Return a valid solid-color PNG of `size × size` pixels."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + bytes([r, g, b] * size) for _ in range(size))
    idat = zlib.compress(raw, 9)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def generate(size: int, out_path: str) -> None:
    if os.path.exists(out_path):
        print(f"  [skip] {os.path.relpath(out_path, BASE_DIR)} already exists")
        return

    # Try cairosvg first
    try:
        import cairosvg
        cairosvg.svg2png(url=SVG_SRC, write_to=out_path, output_width=size, output_height=size)
        print(f"  [ok] {os.path.relpath(out_path, BASE_DIR)} (cairosvg)")
        return
    except ImportError:
        pass

    # Try Pillow + cairosvg alternative
    try:
        from PIL import Image
        import io
        img = Image.new("RGBA", (size, size), (40, 44, 52, 255))
        img.save(out_path, "PNG")
        print(f"  [ok] {os.path.relpath(out_path, BASE_DIR)} (Pillow solid color)")
        return
    except ImportError:
        pass

    # Pure-stdlib fallback: solid #282c34 PNG
    data = _minimal_png(size, 40, 44, 52)
    with open(out_path, "wb") as f:
        f.write(data)
    print(f"  [ok] {os.path.relpath(out_path, BASE_DIR)} (stdlib fallback)")


if __name__ == "__main__":
    generate(192, os.path.join(STATIC_DIR, "icon-192.png"))
    generate(512, os.path.join(STATIC_DIR, "icon-512.png"))
