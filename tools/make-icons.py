#!/usr/bin/env python3
"""Generate the Satisfy Blast app icons.

Pure standard library, no third party packages and no build step. It draws the
Satisfy Blast mark (four glossy blocks on a violet gradient) and writes:

    icons/icon-192.png        "any" mask icon, transparent rounded corners
    icons/icon-512.png        "any" mask icon, transparent rounded corners
    icons/maskable-512.png    full bleed, art kept inside the mask safe zone
    icons/apple-touch-icon.png  full bleed 180px square for iOS

Run from the project root:

    python3 tools/make-icons.py
"""

import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "icons"))

BG_TOP = (0x8A, 0x66, 0xF7)   # violet
BG_BOT = (0x4B, 0x2F, 0xBE)   # deep violet
WHITE = (255.0, 255.0, 255.0)
BLOCKS = [
    (0xF0, 0x68, 0x4F),       # coral
    (0xF2, 0xA9, 0x3B),       # amber
    (0x3D, 0xBE, 0x8F),       # green
    (0x3F, 0x96, 0xE6),       # blue
]


def mix(a, b, t):
    return (a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def sd_round_rect(px, py, x, y, w, h, r):
    """Signed distance from (px, py) to a rounded rect. Negative is inside."""
    hw, hh = w / 2.0, h / 2.0
    cx, cy = x + hw, y + hh
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    ax = qx if qx > 0 else 0.0
    ay = qy if qy > 0 else 0.0
    return (ax * ax + ay * ay) ** 0.5 + min(max(qx, qy), 0.0) - r


def layout(size, cluster_frac):
    total = size * cluster_frac
    gap = total * 0.07
    block = (total - gap) / 2.0
    ox = (size - total) / 2.0
    oy = (size - total) / 2.0
    r = block * 0.24
    pos = [
        (ox, oy),
        (ox + block + gap, oy),
        (ox, oy + block + gap),
        (ox + block + gap, oy + block + gap),
    ]
    return block, r, pos


def sample(px, py, size, cluster_frac, rounded):
    """Colour of one sub-pixel as (r, g, b, a)."""
    if rounded and sd_round_rect(px, py, 0, 0, size, size, 0.225 * size) > 0:
        return (0.0, 0.0, 0.0, 0.0)

    col = mix(BG_TOP, BG_BOT, py / size)

    block, br, pos = layout(size, cluster_frac)
    for i, (bx, by) in enumerate(pos):
        if sd_round_rect(px, py, bx, by, block, block, br) <= 0:
            col = BLOCKS[i]
            hx = bx + block * 0.13
            hy = by + block * 0.11
            if sd_round_rect(px, py, hx, hy, block * 0.74, block * 0.34, br * 0.6) <= 0:
                col = mix(col, WHITE, 0.30)
            break
    return (col[0], col[1], col[2], 1.0)


def render(size, cluster_frac, rounded, ss=3):
    rows = []
    inv = 1.0 / (ss * ss)
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = a = 0.0
            for sy in range(ss):
                py = y + (sy + 0.5) / ss
                for sx in range(ss):
                    px = x + (sx + 0.5) / ss
                    sr, sg, sb, sa = sample(px, py, size, cluster_frac, rounded)
                    r += sr * sa
                    g += sg * sa
                    b += sb * sa
                    a += sa
            if a > 0:
                row += bytes((int(r / a + 0.5), int(g / a + 0.5), int(b / a + 0.5), int(a * inv * 255 + 0.5)))
            else:
                row += b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    return rows


def hexc(rgb):
    return "#%02X%02X%02X" % rgb


def write_favicon_svg(path):
    """The vector twin of the PNG mark, for the crisp browser tab icon."""
    size = 64.0
    block, br, pos = layout(size, 0.62)
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Satisfy Blast">',
        '  <defs>',
        '    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">',
        '      <stop offset="0" stop-color="%s"/>' % hexc(BG_TOP),
        '      <stop offset="1" stop-color="%s"/>' % hexc(BG_BOT),
        '    </linearGradient>',
        '  </defs>',
        '  <rect width="64" height="64" rx="%.2f" fill="url(#bg)"/>' % (0.225 * size),
    ]
    for i, (x, y) in enumerate(pos):
        parts.append('  <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" fill="%s"/>'
                     % (x, y, block, block, br, hexc(BLOCKS[i])))
        parts.append('  <rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" fill="#fff" opacity="0.3"/>'
                     % (x + block * 0.13, y + block * 0.11, block * 0.74, block * 0.34, br * 0.6))
    parts.append('</svg>')
    with open(path, "w") as fh:
        fh.write("\n".join(parts) + "\n")


def write_png(path, size, rows):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    raw = b"".join(b"\x00" + row for row in rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, 0.62, True),
        ("icon-512.png", 512, 0.62, True),
        ("maskable-512.png", 512, 0.42, False),
        ("apple-touch-icon.png", 180, 0.60, False),
    ]
    for name, size, frac, rounded in jobs:
        path = os.path.join(OUT, name)
        write_png(path, size, render(size, frac, rounded))
        print("wrote", os.path.relpath(path))

    favicon = os.path.normpath(os.path.join(HERE, "..", "favicon.svg"))
    write_favicon_svg(favicon)
    print("wrote", os.path.relpath(favicon))


if __name__ == "__main__":
    main()
