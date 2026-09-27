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
for (const mode of ['near', 'maximized', 'either']) {
    assert(!check(mode, {...base, snapped: true, maximized: true}), `${mode}: snapped windows keep regular appearance`);
}
assert(usesWindowAppearance('maximized', [{...base, snapped: true, maximized: true}, {...base, maximized: true}], bar, 24, 0),
    'An ordinary maximized window still triggers appearance alongside a snapped window');
assert(check('maximized', {...base, snapped: false, maximized: true}), 'An unsnapped maximized window triggers appearance again');
print('Window-appearance checks passed');
