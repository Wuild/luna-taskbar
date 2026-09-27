import {usesWindowAppearance} from '../windowAppearance.js';
function assert(value, message) { if (!value) throw new Error(message); }
const bar = {x: 0, y: 950, width: 1920, height: 50};
const base = {monitor: 0, minimized: false, skipTaskbar: false, maximized: false,
    frame: {x: 100, y: 100, width: 800, height: 830}};
const check = (mode, window = base, distance = 24) => usesWindowAppearance(mode, [window], bar, distance, 0);
assert(check('near'), 'Window inside proximity threshold activates the profile');
assert(!check('near', base, 19), 'Window outside threshold keeps regular appearance');
assert(!check('near', {...base, minimized: true}), 'Minimized windows do not trigger appearance');
assert(!check('near', {...base, monitor: 1}), 'Other display is independent');
assert(!check('near', {...base, skipTaskbar: true}), 'Non-task windows are excluded');
assert(!check('near', {...base, frame: {...base.frame, x: 2000}}), 'Horizontal separation is respected');
assert(check('maximized', {...base, maximized: true}), 'Maximized mode ignores proximity');
assert(!check('maximized'), 'Nearby normal windows do not trigger maximized-only mode');
assert(check('either') && check('either', {...base, maximized: true}), 'Either condition can trigger combined mode');
assert(!check('disabled', {...base, maximized: true}), 'Disabled mode keeps the regular profile');
assert(check('near', {...base, frame: {...base.frame, height: 850}}, 0), 'Touching taskbar works at zero threshold');
print('11 window-appearance checks passed');
