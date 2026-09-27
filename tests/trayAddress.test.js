import {parseTrayAddress} from '../tray/address.js';
function assert(ok, message) { if (!ok) throw new Error(message); }
for (const address of [':1.62@/org/ayatana/NotificationItem/dnf_app_center_updater', ':1.107@/StatusNotifierItem', ':1.133@/StatusNotifierItem']) {
    const parsed = parseTrayAddress(address);
    assert(parsed && parsed.id === address.replace('@/', '/'), 'AppIndicator address is normalized');
}
assert(parseTrayAddress(':1.107/StatusNotifierItem').id === parseTrayAddress(':1.107@/StatusNotifierItem').id,
    'Equivalent formats deduplicate and unregister together');
assert(parseTrayAddress('org.example.Tray').path === '/StatusNotifierItem', 'Bare service gets standard path');
for (const invalid of [null, '', '/Menu', 'invalid@service/Item', ':1.2/bad-path'])
    assert(parseTrayAddress(invalid) === null, 'Invalid tray address rejected');
print('TRAY_ADDRESS_PASS');
