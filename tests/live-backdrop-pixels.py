import json
from PIL import Image

with open('/tmp/luna-live-point.json') as stream:
    point = tuple(json.load(stream))
pixels = {}
for name in ('before', 'wallpaper', 'covered', 'removed', 'square'):
    with Image.open(f'/tmp/luna-live-{name}.png') as image:
        pixels[name] = image.convert('RGB').getpixel(point)
def difference(a, b):
    return max(abs(x - y) for x, y in zip(pixels[a], pixels[b]))
assert difference('before', 'wallpaper') > 40, pixels
assert difference('wallpaper', 'covered') > 40, pixels
assert difference('wallpaper', 'removed') <= 3, pixels
assert difference('removed', 'square') <= 3, pixels
print('LUNA_LIVE_BACKDROP_PIXELS_PASS', pixels)
