import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {decodeWindowIcon} from './taskModel.js';

// Constructing an icon theme loads its index and search paths. Share it across
// taskbar and preview icons instead of rebuilding it for every window.
let iconTheme;

export function createTaskIcon(app, window, size = 28) {
    let desktopIcon = app?.get_app_info()?.get_icon();
    if (!desktopIcon && window) {
        for (const id of [window.get_gtk_application_id(), window.get_wm_class()].filter(Boolean)) {
            const info = GioUnix.DesktopAppInfo.new(`${id.replace(/\.desktop$/, '').toLowerCase()}.desktop`);
            if (info?.get_icon()) { desktopIcon = info.get_icon(); break; }
        }
    }
    if (desktopIcon instanceof Gio.ThemedIcon) {
        for (const name of desktopIcon.get_names()) {
            if (name.includes('/')) continue;
            const file = GLib.get_system_data_dirs().flatMap(dir => ['png', 'svg', 'xpm'].map(ext =>
                Gio.File.new_for_path(`${dir}/pixmaps/${name}.${ext}`))).find(candidate => candidate.query_exists(null));
            if (file) { desktopIcon = new Gio.FileIcon({file}); break; }
        }
    }
    const theme = iconTheme ??= new St.IconTheme();
    const usable = desktopIcon instanceof Gio.FileIcon
        ? desktopIcon.get_file().query_exists(null)
        : desktopIcon instanceof Gio.ThemedIcon &&
            desktopIcon.get_names().some(name => theme.has_icon(name));
    const icon = new St.Icon({
        icon_size: size,
        fallback_icon_name: 'application-x-executable',
        ...(usable ? {gicon: desktopIcon} : {icon_name: 'application-x-executable'}),
    });
    if (usable || !window)
        return icon;

    const bundledIcon = appImageIcon(window.get_pid());
    if (bundledIcon) {
        icon.gicon = new Gio.FileIcon({file: bundledIcon});
        return icon;
    }

    const candidates = [window.get_gtk_application_id(),
        window.get_sandboxed_app_id(), window.get_wm_class_instance(), window.get_wm_class()];
    for (const candidate of candidates.filter(Boolean)) {
        const name = [candidate, candidate.toLowerCase()].find(value => theme.has_icon(value));
        if (name) {
            icon.icon_name = name;
            break;
        }
    }

    if (window.get_client_type() !== Meta.WindowClientType.X11)
        return icon;
    const xid = window.get_description().match(/^0x[0-9a-f]+\b/i)?.[0];
    const xprop = GLib.find_program_in_path('xprop');
    if (!xid || !xprop)
        return icon;

    let process;
    try {
        process = Gio.Subprocess.new([xprop, '-id', xid, '-notype',
            '-f', '_NET_WM_ICON', '32c', '_NET_WM_ICON'],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
    } catch {
        return icon;
    }
    const cancellable = new Gio.Cancellable();
    const timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
        timeoutActive = false;
        cancellable.cancel();
        process.force_exit();
        return GLib.SOURCE_REMOVE;
    });
    let timeoutActive = true;
    // Clear the timeout even if it already fired, without removing a reused ID.
    const cancelTimeout = () => {
        if (timeoutActive) {
            const source = GLib.MainContext.default().find_source_by_id(timeout);
            source?.destroy();
            timeoutActive = false;
        }
    };
    let alive = true;
    const destroyId = icon.connect('destroy', () => {
        alive = false;
        cancelTimeout();
        cancellable.cancel();
        process.force_exit();
    });
    process.communicate_utf8_async(null, cancellable, (proc, result) => {
        cancelTimeout();
        try {
            const [, output] = proc.communicate_utf8_finish(result);
            if (!alive || !proc.get_successful())
                return;
            const decoded = decodeWindowIcon(output);
            if (!decoded)
                return;
            const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(
                new GLib.Bytes(decoded.pixels), GdkPixbuf.Colorspace.RGB,
                true, 8, decoded.width, decoded.height, decoded.width * 4);
            const [ok, buffer] = pixbuf.save_to_bufferv('png', [], []);
            if (ok)
                icon.gicon = new Gio.BytesIcon({bytes: new GLib.Bytes(buffer)});
        } catch {
            // A closed window, unavailable X server, or invalid icon keeps fallback.
        } finally {
            if (alive)
                icon.disconnect(destroyId);
        }
    });
    return icon;
}

// AppImage's mounted filesystem carries a .DirIcon even without desktop
// integration. Inspect only the owning process's mount, not unrelated mounts.
export function appImageIcon(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return null;
    for (const source of ['exe', 'cwd']) {
        let path;
        try { path = GLib.file_read_link(`/proc/${pid}/${source}`); }
        catch { continue; }
        let directory = Gio.File.new_for_path(path);
        for (let depth = 0; directory && depth < 12; depth++, directory = directory.get_parent()) {
            if (!directory.get_basename()?.startsWith('.mount_')) continue;
            const icon = directory.get_child('.DirIcon');
            if (icon.query_exists(null)) return icon;
            break;
        }
    }
    return null;
}
