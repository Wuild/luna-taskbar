"""Verify that a blurred popup does not paint its rectangular outer corners."""
import json
from pathlib import Path
import sys

from PIL import Image


root = Path(sys.argv[1])
bounds = json.loads((root / "popup-bounds.json").read_text())
closed = Image.open(root / "popup-closed.png").convert("RGB")
opened = Image.open(root / "popup-open.png").convert("RGB")
x, y, width, height, radius = (round(bounds[key]) for key in (
    "x", "y", "width", "height", "radius"))

outside = (
    (x + 1, y + 1),
    (x + width - 2, y + 1),
    (x + 1, y + height - 2),
    (x + width - 2, y + height - 2),
)
for point in outside:
    before = closed.getpixel(point)
    after = opened.getpixel(point)
    assert max(abs(a - b) for a, b in zip(before, after)) <= 3, (
        "rectangular popup blur leaked outside rounded mask", point, before, after)

inside = (x + width // 2, y + min(height // 2, radius))
before = closed.getpixel(inside)
after = opened.getpixel(inside)
assert max(abs(a - b) for a, b in zip(before, after)) > 8, (
    "popup test surface did not paint", inside, before, after)
print("LUNA_POPUP_MASK_PIXELS_PASS")
