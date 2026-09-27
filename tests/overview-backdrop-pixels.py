"""Compare screenshots from overview-backdrop-shell.js (requires Pillow)."""
import json
from PIL import Image

with open('/tmp/luna-overview-samples.json') as stream:
    points = json.load(stream)
with Image.open('/tmp/luna-overview-undimmed.png') as first, Image.open('/tmp/luna-overview-dimmed.png') as second:
    first, second = first.convert('RGB'), second.convert('RGB')
    for name, point in points.items():
        before, after = first.getpixel(tuple(point)), second.getpixel(tuple(point))
        delta = max(abs(a - b) for a, b in zip(before, after))
        if name == 'bar':
            assert delta <= 2, f'Overview dimming changed the taskbar: {before} → {after}'
        else:
            assert delta >= 20, f'The overview itself must still dim: {before} → {after}'
print('LUNA_OVERVIEW_BACKDROP_PIXELS_PASS')
