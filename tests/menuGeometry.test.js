import {nativeMenuPosition} from '../tray/menuGeometry.js';
const work = {x: 1920, y: 0, width: 1920, height: 1034};
for (const [point, expected] of [
    [{x: 2100, y: 100}, {x: 2100, y: 100}],
    [{x: 3800, y: 1060}, {x: 3546, y: 489}],
    [{x: 1930, y: 1060}, {x: 1930, y: 489}],
]) {
    const actual = nativeMenuPosition(point, {width: 254, height: 545}, work);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(JSON.stringify({actual, expected}));
}
const negative = nativeMenuPosition({x: -20, y: -20}, {width: 200, height: 100}, {x: -1920, y: -1080, width: 1920, height: 1080});
if (negative.x !== -220 || negative.y !== -120) throw Error('Negative monitor origin');
print('NATIVE_MENU_GEOMETRY_PASS');
