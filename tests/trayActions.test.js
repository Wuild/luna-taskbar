import {activateTrayItem, hasRemoteMenu, resolveMenuAction} from '../tray/actions.js';
function assert(value, message) { if (!value) throw new Error(message); }
assert(!hasRemoteMenu('/NO_DBUSMENU'), 'Wine sentinel must not create a DBusMenu');
assert(!hasRemoteMenu('/') && !hasRemoteMenu(null), 'Absent menu paths');
assert(hasRemoteMenu('/MenuBar'), 'Real menu paths remain supported');
const calls = [];
const base = {props: {Id: 'wine-123', Title: 'Battle.net'},
    invoke: async name => calls.push(name), isCancelled: () => false,
    restoreWindow: () => calls.push('restore')};
await activateTrayItem({...base, button: 3});
assert(calls.splice(0).join() === 'ContextMenu', 'Wine native right click');
await activateTrayItem({...base, button: 1});
assert(calls.splice(0).join() === 'Activate,restore', 'Wine activation fallback');
await activateTrayItem({...base, button: 2});
assert(calls.splice(0).join() === 'SecondaryActivate', 'Middle click preserves protocol');
await activateTrayItem({...base, props: {Id: 'native'}, button: 1});
assert(calls.splice(0).join() === 'Activate', 'Other apps do not use Wine fallback');
await activateTrayItem({...base, button: 3, remoteMenu: {toggle: async () => calls.push('menu')}});
assert(calls.splice(0).join() === 'menu', 'Working DBusMenu stays in use');
await activateTrayItem({...base, button: 3, remoteMenu: {toggle: async () => {throw new Error('UnknownMethod');}}});
assert(calls.splice(0).join() === 'ContextMenu', 'Invalid exported menu falls back to native action');
await activateTrayItem({...base, button: 3, isCancelled: () => true});
assert(calls.length === 0, 'Destroyed tray items do not invoke actions');
let failed = false;
try { await activateTrayItem({...base, button: 3, remoteMenu: {toggle: async () => {throw new Error('timeout');}}}); }
catch { failed = true; }
assert(failed && !calls.length, 'Unrelated errors do not invoke duplicate actions');

const freshLayout = [0, {}, [[99, {label: 'Open'}, []], [100, {label: 'Quit', enabled: false}, []]]];
assert(resolveMenuAction(freshLayout, [{label: 'Open', index: 0}])[0] === 99, 'Resolve refreshed action ID');
assert(resolveMenuAction(freshLayout, [{label: 'Quit', index: 1}]) === null, 'Do not run newly disabled actions');
assert(resolveMenuAction(freshLayout, [{label: 'Deleted', index: 0}]) === null, 'Never run a different action at a reused position');

await activateTrayItem({...base, props: {Id: 'chrome_status_icon_1'}, button: 1});
assert(calls.splice(0).join() === 'Activate,restore', 'Electron primary click can restore its main window');
print('TRAY_ACTIONS_PASS');
