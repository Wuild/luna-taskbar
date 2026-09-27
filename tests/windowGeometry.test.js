import {restoreGeometry} from '../windowGeometry.js';
function assert(value, message) { if (!value) throw new Error(message); }
const monitors = [{index: 0, id: 'DP-1', work: {x: 0, y: 0, width: 1920, height: 1034}},
    {index: 1, id: 'DP-2', work: {x: -1280, y: 0, width: 1280, height: 978}}];
const saved = {rect: {x: -1200, y: 40, width: 800, height: 600}, monitor: 'DP-2', work: monitors[1].work, maximized: 3};
let result = restoreGeometry(saved, monitors, 0);
assert(result.monitor === 1 && result.rect.x === -1200 && result.maximized === 3, 'Restore negative-coordinate display and maximize state');
result = restoreGeometry(saved, [monitors[0]], 0);
assert(result.monitor === 0 && result.rect.x === 560 && result.rect.width === 800, 'Disconnected screen moves to primary without resizing unnecessarily');
result = restoreGeometry({...saved, maximized: 0, rect: {...saved.rect, width: 4000, height: 3000}}, monitors, 0);
assert(result.rect.width === 1920 && result.rect.height === 1034, 'Oversized windows fit primary work area');
result = restoreGeometry({...saved, maximized: 0, rect: {...saved.rect, x: -20}}, monitors, 0);
assert(result.monitor === 0, 'Partially out-of-bounds layout falls back to primary');
const moved = [monitors[0], {...monitors[1], work: {...monitors[1].work, x: 1920}}];
result = restoreGeometry(saved, moved, 0);
assert(result.monitor === 1 && result.rect.x === 2000, 'Display rearrangement preserves relative position');
assert(restoreGeometry({rect: {x: NaN, y: 0, width: 20, height: 20}}, monitors, 0) === null, 'Invalid saved layout rejected');
assert(restoreGeometry(saved, [], -1) === null, 'No displays is safe');
assert(!('minimized' in restoreGeometry({...saved, minimized: true}, monitors, 0)), 'Minimized state never restored');
print('WINDOW_GEOMETRY_PASS');

result = restoreGeometry({...saved, rect: {x: 1991, y: 130, width: 2289, height: 1241}}, monitors, 0);
assert(result.monitor === 1 && result.maximized === 3 && result.rect.width === 1280,
    'Maximized window with old-monitor normal geometry remains on its saved display');
const reordered = [{...monitors[1], index: 0}, {...monitors[0], index: 1}];
result = restoreGeometry(saved, reordered, 1);
assert(result.monitor === 0, 'Saved connector survives changed display numbering');
