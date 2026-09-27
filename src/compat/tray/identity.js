import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {call} from './dbus.js';

export async function trayIdentity(item) {
    const {Id: id = '', Title: title = ''} = item.props ?? {};
    if (id.startsWith('wine-')) return `wine:${title || id}`;
    if (id.startsWith('chrome_status_icon_')) {
        const [pid] = await call(item.bus, 'org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', 'GetConnectionUnixProcessID', new GLib.Variant('(s)', [item.service]), item.cancellable);
        try { return `electron:${GLib.path_get_basename(GLib.file_read_link(`/proc/${pid}/exe`))}:${id}`; }
        catch { return `electron:${title || id}`; }
    }
    return `sni:${id || title || item.path}`;
}

export function rememberTrayItem(settings, key, title) {
    let known;
    try { known = JSON.parse(settings.get_string('tray-known-items')); } catch { known = {}; }
    if (!known || typeof known !== 'object' || Array.isArray(known)) known = {};
    if (known[key] === title) return;
    known[key] = title;
    settings.set_string('tray-known-items', JSON.stringify(Object.fromEntries(Object.entries(known).slice(-100))));
}
