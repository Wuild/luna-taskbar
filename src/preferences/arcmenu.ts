import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type Adw from 'gi://Adw';

export function watchArcMenu(window: Adw.PreferencesWindow, update: (active: boolean, path?: string) => void): void {
    update(false);
    let closed = false;
    const refreshArcMenu = () => Gio.DBus.session.call('org.gnome.Shell',
        '/org/gnome/Shell', 'org.gnome.Shell.Extensions', 'GetExtensionInfo',
        new GLib.Variant('(s)', ['arcmenu@arcmenu.com']), null,
        Gio.DBusCallFlags.NONE, 2000, null, (bus, result) => {
            if (closed) return;
            let active = false;
            let path: string | undefined;
            try {
                const [info] = bus!.call_finish(result).deep_unpack() as [Record<string, GLib.Variant>];
                active = info.state?.unpack() === 1;
                path = info.path?.unpack() as string | undefined;
            } catch { /* Leave unavailable optional controls hidden. */ }
            update(active, path);
        });
    const extensionSignal = Gio.DBus.session.signal_subscribe('org.gnome.Shell',
        'org.gnome.Shell.Extensions', 'ExtensionStateChanged', '/org/gnome/Shell',
        'arcmenu@arcmenu.com', Gio.DBusSignalFlags.NONE, refreshArcMenu);
    window.connect('close-request', () => {
        closed = true;
        Gio.DBus.session.signal_unsubscribe(extensionSignal);
        return false;
    });
    refreshArcMenu();
}
