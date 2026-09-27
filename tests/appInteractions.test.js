import {performAppAction} from '../appInteractions.js';
function assert(value, message) { if (!value) throw new Error(message); }
let calls = [];
const window = (id, focus = false) => ({get_stable_sequence: () => id, has_focus: () => focus, minimize: () => calls.push(`min:${id}`)});
const a = window(1, true), b = window(2), c = window(3);
const handlers = {activate: w => calls.push(w.get_stable_sequence()), launch: fresh => calls.push(fresh ? 'new' : 'launch'), menu: () => calls.push('menu'), previews: ws => calls.push(`preview:${ws.length}`)};
function run(action, windows, expected, direction = 1) {
 calls = []; performAppAction(action, {windows, window: windows[0]}, handlers, direction);
 assert(JSON.stringify(calls) === JSON.stringify(expected), `${action}: ${JSON.stringify(calls)} != ${JSON.stringify(expected)}`);
}
run('default', [a], ['min:1']); run('default', [b], [2]);
run('default', [a,b], ['preview:2']); run('default', [], ['launch']);
run('cycle', [c,a,b], [2]); run('cycle', [b,c,a], [3], -1);
run('cycle', [b,c], [2]); run('cycle', [b,c], [3], -1);
run('activate', [a,b], [1]); run('toggle-group', [a,b], ['min:1','min:2']);
run('toggle-group', [b,c], [3,2]); run('minimize', [b,c], ['min:2','min:3']);
run('new-window', [a,b], ['new']); run('menu', [], ['menu']);
run('none', [a,b], []); run('previews', [], []); run('previews', [b], ['preview:1']);
print('APP_INTERACTIONS_PASS');
