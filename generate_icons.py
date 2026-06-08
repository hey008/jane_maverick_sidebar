#!/usr/bin/env python3
"""Generate sidebar browser extension icons as simple PNG files."""
import struct, zlib, os

def png(w, h, pixel_fn):
    raw = b''
    for y in range(h):
        raw += b'\x00'  # filter: none
        for x in range(w):
            raw += bytes(pixel_fn(x, y, w, h))

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw))
        + chunk(b'IEND', b'')
    )

# Colours
BLUE   = (0, 120, 212)  # #0078d4  (Microsoft / Edge blue)
DARK   = (0,  48,  96)  # dark panel
WHITE  = (255, 255, 255)
PANEL  = (0,  80, 160)  # sidebar strip

def sidebar_pixel(x, y, w, h):
    pad  = max(1, w // 10)
    tab  = max(1, h // 7)
    sep  = max(1, w // 4)   # sidebar divider from left

    # outer frame edge → accent blue
    if x < pad or x >= w - pad or y < pad or y >= h - pad:
        return BLUE

    lx = x - pad
    ly = y - pad
    iw = w - 2 * pad
    ih = h - 2 * pad

    # tab-bar row at top
    if ly < tab:
        return WHITE

    # sidebar strip on the left
    if lx < sep:
        return PANEL

    # main content area
    return WHITE

os.makedirs('icons', exist_ok=True)
for size in (16, 32, 48, 128):
    data = png(size, size, sidebar_pixel)
    path = f'icons/icon{size}.png'
    with open(path, 'wb') as f:
        f.write(data)
    print(f'  {path}  ({size}×{size})')

print('Done.')
