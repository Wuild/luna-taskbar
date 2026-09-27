import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function parseTrayAddress(address: unknown) {
    if (typeof address !== 'string') return null;
    const slash = address.indexOf('/');
    const service = (slash < 0 ? address : address.slice(0, slash)).replace(/@$/, '');
    const path = slash < 0 ? '/StatusNotifierItem' : address.slice(slash);
    if (!Gio.dbus_is_name(service) || !GLib.Variant.is_object_path(path)) return null;
    return {service, path, id: service + path};
}
