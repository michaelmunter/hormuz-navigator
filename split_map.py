#!/usr/bin/env python3
"""Split map.jpg into land and ocean RGBA layers for the game engine.

Uses color classification + flood fill from ocean seeds to avoid
classifying dark mountain shadows as ocean.
"""

from PIL import Image, ImageFilter
import numpy as np
from collections import deque

src = Image.open("map.jpg").convert("RGB")
arr = np.array(src, dtype=np.float32)
w, h = src.size
print(f"Source: {w}x{h}")

# --- Per-pixel ocean candidate classification ---
r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
brightness = r * 0.299 + g * 0.587 + b * 0.114
max_c = np.maximum(np.maximum(r, g), b)
min_c = np.minimum(np.minimum(r, g), b)
chroma = max_c - min_c

# Hue (0-360)
hue = np.zeros_like(brightness)
mask_nz = chroma > 0
mask_r = (max_c == r) & mask_nz
mask_g = (max_c == g) & mask_nz
mask_b = (max_c == b) & mask_nz
hue[mask_r] = (60 * ((g[mask_r] - b[mask_r]) / chroma[mask_r])) % 360
hue[mask_g] = 60 * ((b[mask_g] - r[mask_g]) / chroma[mask_g]) + 120
hue[mask_b] = 60 * ((r[mask_b] - g[mask_b]) / chroma[mask_b]) + 240

# Ocean candidates: blue-green hue and dark, OR extremely dark
is_blue_green = (hue > 100) & (hue < 260)
is_dark_water = is_blue_green & (brightness < 170)
is_very_dark = brightness < 25  # deep ocean nearly black
is_warm = ((hue < 60) | (hue > 310)) & (brightness > 50)

# Candidate = could be ocean (generous — flood fill will constrain)
candidate = (is_dark_water | is_very_dark) & ~is_warm

# --- Flood fill from known ocean points ---
# Seed points in the middle of the Gulf (known ocean).
# Proportional to image size so they work at any resolution.
seeds = [
    (h // 2, w // 3),                 # mid-Gulf
    (h // 2, w // 2),                 # central
    (int(h * 0.30), int(w * 0.15)),   # northwest Gulf
    (int(h * 0.55), int(w * 0.65)),   # near strait
    (int(h * 0.45), int(w * 0.80)),   # Gulf of Oman
    (int(h * 0.48), int(w * 0.90)),   # far east Gulf of Oman
]

ocean_mask = np.zeros((h, w), dtype=bool)
visited = np.zeros((h, w), dtype=bool)
candidate_arr = np.array(candidate)

queue = deque()
for sy, sx in seeds:
    # Find nearest candidate pixel to seed (in case seed lands on non-candidate)
    found = False
    for radius in range(0, 50):
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                ny, nx = sy + dy, sx + dx
                if 0 <= ny < h and 0 <= nx < w and candidate_arr[ny, nx] and not visited[ny, nx]:
                    queue.append((ny, nx))
                    visited[ny, nx] = True
                    ocean_mask[ny, nx] = True
                    found = True
        if found:
            break

print(f"Flood fill from {len(seeds)} seeds, queue start: {len(queue)}")

# 4-connected flood fill through candidate pixels
while queue:
    cy, cx = queue.popleft()
    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        ny, nx = cy + dy, cx + dx
        if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and candidate_arr[ny, nx]:
            visited[ny, nx] = True
            ocean_mask[ny, nx] = True
            queue.append((ny, nx))

print(f"After flood fill: {ocean_mask.sum()} ocean pixels ({ocean_mask.sum() / ocean_mask.size * 100:.1f}%)")

# --- Morphological cleanup ---
mask_img = Image.fromarray((ocean_mask * 255).astype(np.uint8), mode='L')
# Close small gaps (islands that should be ocean-connected, thin coastal artifacts)
mask_img = mask_img.filter(ImageFilter.MaxFilter(3))
mask_img = mask_img.filter(ImageFilter.MinFilter(3))
# Smooth coastline
mask_img = mask_img.filter(ImageFilter.MedianFilter(5))
# Slight expansion to cover coastal fringe
mask_img = mask_img.filter(ImageFilter.MaxFilter(3))

ocean_final = np.array(mask_img) > 128

# Also fill any small enclosed holes in ocean (inland seas etc.)
# by flood-filling land from edges and inverting
land_from_edge = np.zeros((h, w), dtype=bool)
edge_queue = deque()
for y in range(h):
    for x in [0, w-1]:
        if not ocean_final[y, x] and not land_from_edge[y, x]:
            land_from_edge[y, x] = True
            edge_queue.append((y, x))
for x in range(w):
    for y in [0, h-1]:
        if not ocean_final[y, x] and not land_from_edge[y, x]:
            land_from_edge[y, x] = True
            edge_queue.append((y, x))

while edge_queue:
    cy, cx = edge_queue.popleft()
    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        ny, nx = cy + dy, cx + dx
        if 0 <= ny < h and 0 <= nx < w and not ocean_final[ny, nx] and not land_from_edge[ny, nx]:
            land_from_edge[ny, nx] = True
            edge_queue.append((ny, nx))

# Pixels that are not ocean AND not reachable from edge = enclosed in ocean = should be ocean
# (But skip this if it would eat islands — only fill truly tiny holes)
enclosed = ~ocean_final & ~land_from_edge
print(f"Enclosed land pixels (potential holes): {enclosed.sum()}")

print(f"Final ocean: {ocean_final.sum() / ocean_final.size * 100:.1f}%")

# --- Build output layers ---
src_arr = np.array(src)
alpha_ocean = np.where(ocean_final, 255, 0).astype(np.uint8)
alpha_land = np.where(~ocean_final, 255, 0).astype(np.uint8)

ocean_rgba = np.zeros((h, w, 4), dtype=np.uint8)
ocean_rgba[:,:,:3] = src_arr
ocean_rgba[:,:,3] = alpha_ocean

land_rgba = np.zeros((h, w, 4), dtype=np.uint8)
land_rgba[:,:,:3] = src_arr
land_rgba[:,:,3] = alpha_land

Image.fromarray(ocean_rgba).save("hormuz-ocean-new.png")
Image.fromarray(land_rgba).save("hormuz-land-new.png")
print("Saved hormuz-ocean-new.png and hormuz-land-new.png")
