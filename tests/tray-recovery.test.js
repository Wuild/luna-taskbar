import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {recoverTrayItems} from '../tray/recovery.js';
const loop = new GLib.MainLoop(null, false);
const client = Gio.DBusConnection.new_for_address_sync(Gio.dbus_address_get_for_bus_sync(Gio.BusType.SESSION, null),
    Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, null, null);
const watcher = Gio.DBus.session;
const registered = [], exports = [];
let failure;
function assert(ok, message) { if (!ok) throw Error(message); }
const watcherObject = Gio.DBusExportedObject.wrapJSObject(`<node><interface name="org.kde.StatusNotifierWatcher">
<property name="RegisteredStatusNotifierItems" type="as" access="read"/>
<method name="RegisterStatusNotifierItem"><arg type="s" direction="in"/></method>
</interface></node>`, {
    get RegisteredStatusNotifierItems() { return registered; },
    RegisterStatusNotifierItem(id) { registered.push(id); },
});
watcherObject.export(watcher, '/StatusNotifierWatcher');
for (const path of ['/StatusNotifierItem', '/org/ayatana/NotificationItem/test', '/custom/nested/Tray']) {
    const item = path === '/StatusNotifierItem' ? Gio.DBusExportedObject.wrapJSObject('<node><interface name="org.freedesktop.DBus.Properties"><method name="GetAll"><arg type="s" direction="in"/><arg type="a{sv}" direction="out"/></method></interface></node>', {GetAll: () => ({Id: new GLib.Variant('s', 'Electron'), Status: new GLib.Variant('s', 'Active')})}) : Gio.DBusExportedObject.wrapJSObject('<node><interface name="org.kde.StatusNotifierItem"><property name="Id" type="s" access="read"/><property name="Status" type="s" access="read"/></interface></node>', {Id: 'Test', Status: 'Active'});
    item.export(client, path); exports.push(item);
}
(async () => {
    const cancel = new Gio.Cancellable();
    let restored = await recoverTrayItems(watcher, watcher.get_unique_name(), cancel);
    assert(restored === 3 && registered.length === 3, 'Recover non-introspectable Electron, AppIndicator, and custom-path items without app re-registration');
    restored = await recoverTrayItems(watcher, watcher.get_unique_name(), cancel);
    assert(restored === 0 && registered.length === 3, 'Repeated recovery does not duplicate icons');
    registered.length = 0;
    restored = await recoverTrayItems(watcher, watcher.get_unique_name(), cancel);
    assert(restored === 3, 'Watcher reload recovers clients that never register again');
    for (const item of exports.splice(0)) item.unexport();
    registered.length = 0;
    assert(await recoverTrayItems(watcher, watcher.get_unique_name(), cancel) === 0, 'Removed objects are not restored');
    print('TRAY_RECOVERY_PASS');
})().catch(error => {failure = error; console.error(error);}).finally(() => {
    watcherObject.unexport();
    for (const item of exports.splice(0)) item.unexport();
    client.close_sync(null); loop.quit();
});
loop.run();
if (failure) throw failure;
