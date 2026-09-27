import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {parseTrayAddress} from './address.js';

const WATCHER = 'org.kde.StatusNotifierWatcher';
const WATCHER_PATH = '/StatusNotifierWatcher';
const ITEM = 'org.kde.StatusNotifierItem';
const DBUS = 'org.freedesktop.DBus';
const DBUS_PATH = '/org/freedesktop/DBus';

function request(bus, name, path, iface, method, args, cancel) {
    return new Promise((resolve, reject) => bus.call(name, path, iface, method, args, null,
        Gio.DBusCallFlags.NO_AUTO_START, 750, cancel, (connection, result) => {
            try { resolve(connection.call_finish(result).recursiveUnpack()); } catch (error) { reject(error); }
        }));
}

export async function recoverTrayItems(bus, owner, cancel) {
    const call = (name, path, iface, method, args = null) => request(bus, name, path, iface, method, args, cancel);
    const [props] = await call(owner, WATCHER_PATH, 'org.freedesktop.DBus.Properties', 'GetAll', new GLib.Variant('(s)', [WATCHER]));
    const known = new Set();
    for (const value of props.RegisteredStatusNotifierItems ?? []) {
        const address = parseTrayAddress(value);
        if (!address) continue;
        try {
            const [service] = address.service.startsWith(':') ? [address.service] :
                await call(DBUS, DBUS_PATH, DBUS, 'GetNameOwner', new GLib.Variant('(s)', [address.service]));
            known.add(service + address.path);
        } catch { /* The app exited while its registry entry was being read. */ }
    }
    const [names] = await call(DBUS, DBUS_PATH, DBUS, 'ListNames');
    const pending = names.filter(name => name.startsWith(':') && name !== owner && name !== bus.get_unique_name());
    let restored = 0;
    await Promise.all(Array.from({length: 4}, async () => {
        while (pending.length && !cancel.is_cancelled()) {
            const service = pending.shift();
            const paths = [['/StatusNotifierItem', 0], ['/org/ayatana/NotificationItem', 0], ['/', 0]];
            const visited = new Set();
            // Bound work for unrelated services with large object trees.
            while (paths.length && visited.size < 64 && !cancel.is_cancelled()) {
                const [path, depth] = paths.shift();
                if (visited.has(path) || !GLib.Variant.is_object_path(path)) continue;
                visited.add(path);
                const restore = async () => {
                    if (known.has(service + path)) return;
                    const [item] = await call(service, path, 'org.freedesktop.DBus.Properties', 'GetAll', new GLib.Variant('(s)', [ITEM]));
                    if (!['Passive', 'Active', 'NeedsAttention'].includes(item.Status)) return;
                    await call(owner, WATCHER_PATH, WATCHER, 'RegisterStatusNotifierItem', new GLib.Variant('(s)', [service + path]));
                    known.add(service + path);
                    restored++;
                };
                if (path === '/StatusNotifierItem') {
                    try { await restore(); } catch { /* Not a tray endpoint. */ }
                }
                try {
                    const [xml] = await call(service, path, 'org.freedesktop.DBus.Introspectable', 'Introspect');
                    const info = Gio.DBusNodeInfo.new_for_xml(xml);
                    if (info.interfaces.some(iface => iface.name === ITEM)) await restore();
                    if (depth < 6)
                        for (const child of info.nodes ?? [])
                            paths.push([child.path.startsWith('/') ? child.path : `${path === '/' ? '' : path}/${child.path}`, depth + 1]);
                } catch { /* Most session services have no tray item; exits are normal. */ }
            }
        }
    }));
    return restored;
}

export function watchTrayRecovery(bus = Gio.DBus.session) {
    let cancel = null, retry = 0;
    const stopScan = () => {
        cancel?.cancel(); cancel = null;
        if (retry) { GLib.Source.remove(retry); retry = 0; }
    };
    const watch = Gio.bus_watch_name_on_connection(bus, WATCHER, Gio.BusNameWatcherFlags.NONE,
        (_bus, _name, owner) => {
            stopScan();
            const current = cancel = new Gio.Cancellable();
            const run = async (attempt = 0) => {
                try {
                    const pid = name => request(bus, DBUS, DBUS_PATH, DBUS, 'GetConnectionUnixProcessID', new GLib.Variant('(s)', [name]), current);
                    const [[watcherPid], [shellPid]] = await Promise.all([pid(owner), pid('org.gnome.Shell')]);
                    if (watcherPid !== shellPid || current.is_cancelled()) return;
                    const count = await recoverTrayItems(bus, owner, current);
                    if (count) console.log(`Recovered ${count} existing tray items`);
                } catch (error) {
                    if (current.is_cancelled()) return;
                    // The name may be acquired just before its object is exported.
                    if (attempt < 3) retry = GLib.timeout_add(0, 250, () => {
                        retry = 0; run(attempt + 1); return GLib.SOURCE_REMOVE;
                    });
                    else console.warn(`Tray recovery: ${error.message}`);
                }
            };
            run();
        }, stopScan);
    return () => { Gio.bus_unwatch_name(watch); stopScan(); };
}
