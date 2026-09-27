import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import {call} from './dbus.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {nativeMenuPosition} from './menuGeometry.js';

const watchers = new Set();
const popupListeners = new Set();
export function watchNativeTrayPopups(callback) {
    popupListeners.add(callback);
    return () => popupListeners.delete(callback);
}
const recognizedPopups = new WeakSet();
export function isNativeTrayPopup(window) {
    return recognizedPopups.has(window) || [...watchers].some(watcher => watcher._matches(window));
}

export class NativeTrayMenus {
    constructor(getDrawer, logger) {
        this._drawer = getDrawer ?? (() => null);
        this._logger = logger;
        this._popups = new Map();
        this._serial = 0;
        watchers.add(this);
        this._map = global.window_manager.connect('map', (_wm, actor) => {
            if (this._matches(actor.meta_window)) this._trackPopup(actor.meta_window);
        });
        this._cancellable = new Gio.Cancellable();
        this._helper = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('x11.py').get_path();
        this._press = global.stage.connect('captured-event', (_stage, event) => {
            if (!this._pid) return Clutter.EVENT_PROPAGATE;
            if (event.type() === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape)
                this.close();
            if (event.type() === Clutter.EventType.BUTTON_PRESS)
                this._outside(...event.get_coords());
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _outside(x, y) {
        if ([...this._popups.keys()].some(w => {
            const r = w.get_frame_rect();
            return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
        })) return;
        const drawer = this._drawer();
        const overDrawer = drawer?.menu.isOpen && (() => {
            const [dx, dy] = drawer.menu.actor.get_transformed_position();
            const [dw, dh] = drawer.menu.actor.get_transformed_size();
            return x >= dx && x < dx + dw && y >= dy && y < dy + dh;
        })();
        this.close().then(serial => { if (serial === this._serial && !overDrawer) this._drawer()?.close(); });
    }

    async prepare(item, method, point) {
        if (method !== 'ContextMenu') return;
        const serial = await this.close(false);
        if (this._destroyed || serial !== this._serial) return false;
        try {
            const [pid] = await call(item.bus, 'org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'GetConnectionUnixProcessID',
                new GLib.Variant('(s)', [item.service]), this._cancellable);
            if (this._destroyed || serial !== this._serial) return false;
            this.watch(pid, {wine: item.props?.Id?.startsWith('wine-'), title: item.props?.Title, point});
            return true;
        } catch (error) {
            if (serial === this._serial) this._drawer()?.resumeAfterNativeMenu();
            throw error;
        }
    }

    watch(pid, {wine = false, title = null, point = null} = {}) {
        if (this._poll) GLib.Source.remove(this._poll);
        this._poll = 0;
        this._pid = pid;
        this._wine = wine;
        this._title = title;
        const [x, y] = global.get_pointer();
        this._point = point ?? {x, y};
        this._rootSeen = false;
        this._baseline = new Set([...new Set([...global.display.list_all_windows(), ...global.get_window_actors().map(actor => actor.meta_window)])]
            .filter(window => window.get_compositor_private()?.mapped));
        this._until = GLib.get_monotonic_time() + 2000000;
        this._drawer()?.suspendForNativeMenu();
        this._lastButtons = global.get_pointer()[2];
        this._poll = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
            for (const [window, id] of this._popups) {
                if (!window.get_compositor_private()?.mapped) {
                    window.disconnect(id);
                    this._popups.delete(window);
                }
            }
            for (const window of [...new Set([...global.display.list_all_windows(), ...global.get_window_actors().map(actor => actor.meta_window)])]) {
                if (window.get_compositor_private()?.mapped && this._matches(window))
                    this._trackPopup(window);
            }
            const [x, y, buttons] = global.get_pointer();
            const mask = Clutter.ModifierType.BUTTON1_MASK | Clutter.ModifierType.BUTTON2_MASK | Clutter.ModifierType.BUTTON3_MASK;
            const pressed = buttons & ~this._lastButtons & mask;
            this._lastButtons = buttons;
            if (pressed && this._popups.size) {
                this._outside(x, y);
                if (!this._pid) return GLib.SOURCE_REMOVE;
            }
            if (!this._popups.size && GLib.get_monotonic_time() > this._until) {
                this._poll = 0;
                this._finish();
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _matches(window) {
        if (!this._pid || !window || this._popups.has(window) ||
            (this._baseline?.has(window) && !recognizedPopups.has(window)) ||
            window.get_pid() !== this._pid || window.get_client_type() !== Meta.WindowClientType.X11) return false;
        if (recognizedPopups.has(window)) return true;
        return [Meta.WindowType.POPUP_MENU, Meta.WindowType.DROPDOWN_MENU, Meta.WindowType.MENU].includes(window.get_window_type()) ||
            window.is_override_redirect() || (this._wine && window.get_window_type() === Meta.WindowType.NORMAL &&
                !window.decorated && !window.allows_resize() && window.get_title() === this._title);
    }

    _trackPopup(window) {
        if (this._popups.has(window)) return;
        recognizedPopups.add(window);
        for (const listener of popupListeners) listener(window);
        this._popups.set(window, window.connect('unmanaged', () => this._popups.delete(window)));
        this._until = 0;
        const first = !this._rootSeen;
        this._rootSeen = true;
        if (first) this._drawer()?.placeBelowNativeMenu(window);
        if (!first || !this._wine || window.get_window_type() !== Meta.WindowType.NORMAL || window.is_override_redirect()) return;
        const monitor = Main.layoutManager.monitors.find(m => this._point.x >= m.x &&
            this._point.x < m.x + m.width && this._point.y >= m.y && this._point.y < m.y + m.height);
        if (!monitor) return;
        const rect = window.get_frame_rect();
        const work = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const position = nativeMenuPosition(this._point, rect, work);
        window.move_frame(false, position.x, position.y);
    }

    _finish(resume = true) {
        if (this._poll) GLib.Source.remove(this._poll);
        this._poll = 0;
        this._pid = 0;
        for (const [window, id] of this._popups) window.disconnect(id);
        this._popups.clear();
        if (resume) this._drawer()?.resumeAfterNativeMenu();
    }

    async close(resume = true) {
        if (this._dismissing) return this._dismissing;
        this._dismissing = this._dismiss(resume);
        try { return await this._dismissing; }
        finally { this._dismissing = null; }
    }

    async _dismiss(resume) {
        const serial = ++this._serial;
        const windows = [...this._popups.keys()];
        const wine = this._wine;
        const closedNormally = new Set();
        for (const window of windows) {
            if (wine && window.get_window_type() === Meta.WindowType.NORMAL && !window.is_override_redirect()) {
                try {
                    window.delete(global.get_current_time());
                    closedNormally.add(window);
                } catch (error) { this._logger.warn(`Native popup close request: ${error.message}`); }
            }
        }
        const xids = windows.filter(window => !closedNormally.has(window))
            .map(w => w.get_description().match(/^0x[0-9a-f]+/i)?.[0]).filter(Boolean);
        await Promise.all(xids.map(xid => new Promise(resolve => {
            try {
                const launcher = new Gio.SubprocessLauncher({flags:
                    Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_PIPE});
                launcher.set_environ(global.create_app_launch_context(0, -1).get_environment());
                const process = launcher.spawnv(['python3', this._helper, 'dismiss', xid, ...(wine ? ['wine'] : [])]);
                process.communicate_utf8_async(null, null, (proc, result) => {
                    try {
                        const [, , stderr] = proc.communicate_utf8_finish(result);
                        if (!proc.get_successful()) this._logger.warn(`Native menu dismissal: ${stderr.trim()}`);
                    } catch (error) { this._logger.warn(error.message); }
                    resolve();
                });
            } catch (error) { this._logger.warn(error.message); resolve(); }
        })));
        for (let attempt = 0; attempt < 10 && serial === this._serial &&
            windows.some(window => window.get_compositor_private()?.mapped); attempt++) {
            await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => {
                resolve(); return GLib.SOURCE_REMOVE;
            }));
        }
        if (serial === this._serial && !windows.some(window => window.get_compositor_private()?.mapped))
            this._finish(resume);
        else if (serial === this._serial)
            this._logger.warn('Native tray menu is still mapped after dismissal; retaining tracking');
        return serial;
    }

    destroy() {
        this._destroyed = true;
        watchers.delete(this);
        global.window_manager.disconnect(this._map);
        this._cancellable.cancel();
        global.stage.disconnect(this._press);
        this.close(false).finally(() => this._finish(false));
    }
}
