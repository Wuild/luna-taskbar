import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {isNativeTrayPopup} from './tray/nativeMenu.js';
import {restoreGeometry, validRect} from './windowGeometry.js';

const plainRect = r => ({x: r.x, y: r.y, width: r.width, height: r.height});

// Remember normal application windows only, without storing document titles.
// Multiple windows use slots within an app/role, matched in opening order.
export class WindowPlacement {
    constructor(settings) {
        this._settings = settings;
        this._windows = new Map();
        this._pending = new Map();
        this._saved = {};
        try {
            const parsed = JSON.parse(settings.get_string('saved-window-layouts'));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                this._saved = Object.fromEntries(Object.entries(parsed).filter(([, slots]) => Array.isArray(slots)).slice(0, 200).map(([key, slots]) => [key, slots.slice(0, 20)]));
        } catch { /* An invalid saved layout starts afresh. */ }
        this._layoutsId = settings.connect('changed::saved-window-layouts', () => {
            // A preferences reset must also clear cached geometry and queued saves.
            if (settings.get_string('saved-window-layouts') !== '{}') return;
            this._saved = {};
            for (const record of this._windows.values()) {
                if (record.timer) GLib.Source.remove(record.timer);
                record.timer = 0;
                record.normal = record.normalWork = null;
            }
            if (this._saveTimer) GLib.Source.remove(this._saveTimer);
            this._saveTimer = 0;
        });
        this._createdId = global.display.connect('window-created', (_d, window) => {
            this._pending.set(window, window.connect('unmanaged', () => this._forget(window)));
        });
        this._mapId = global.window_manager.connect('map', (_wm, actor) => {
            const window = actor.meta_window;
            if (!this._pending.has(window)) return;
            this._forget(window);
            this._track(window, true);
        });
        this._settingsId = settings.connect('changed::remember-window-positions', () => {
            this._clear();
            if (this._enabled()) this._trackExisting();
        });
        if (this._enabled()) this._trackExisting();
    }

    _enabled() { return this._settings.get_boolean('remember-window-positions'); }

    _trackExisting() {
        for (const window of global.display.list_all_windows()) this._track(window, false);
    }

    _track(window, restore) {
        if (this._windows.has(window) || isNativeTrayPopup(window) ||
            window.get_window_type() !== Meta.WindowType.NORMAL || window.is_override_redirect() ||
            window.get_transient_for() || window.skip_taskbar) return;
        if (!this._enabled()) {
            // Only newly mapped application windows move; changing the setting
            // must not rearrange existing windows or restore saved state.
            const primary = Main.layoutManager.primaryIndex;
            if (restore && Main.layoutManager.monitors.some(m => m.index === primary) &&
                window.get_monitor() !== primary)
                window.move_to_monitor(primary);
            return;
        }
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        const identity = app?.get_app_info()?.get_id() || window.get_gtk_application_id() || window.get_wm_class();
        if (!identity) return;
        const key = JSON.stringify([identity, window.get_role() || '']);
        const used = new Set([...this._windows.values()].filter(r => r.key === key).map(r => r.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        if (slot >= 20) return;
        const saved = this._saved[key]?.[slot];
        const record = {key, slot, normal: validRect(saved?.rect) ? saved.rect : null, normalWork: saved?.work, signals: []};
        this._windows.set(window, record);
        const changed = () => {
            if (record.timer) GLib.Source.remove(record.timer);
            record.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                record.timer = 0;
                this._capture(window, record);
                return GLib.SOURCE_REMOVE;
            });
        };
        for (const signal of ['position-changed', 'size-changed', 'notify::maximized-horizontally', 'notify::maximized-vertically'])
            record.signals.push(window.connect(signal, changed));
        record.signals.push(window.connect('unmanaged', () => this._untrack(window)));
        if (restore && saved) {
            const layout = this._place(window, saved);
            if (layout) {
                record.normal = layout.rect;
                record.normalWork = this._monitors().find(m => m.index === layout.monitor)?.work;
            }
        }
        changed();
    }

    _monitors() {
        const logical = global.backend.get_monitor_manager().get_logical_monitors();
        return Main.layoutManager.monitors.map(m => ({index: m.index,
            id: logical.find(l => l.get_number() === m.index)?.get_monitors()[0]?.get_connector() ?? '',
            work: plainRect(Main.layoutManager.getWorkAreaForMonitor(m.index))}));
    }

    _place(window, saved) {
        const layout = restoreGeometry(saved, this._monitors(), Main.layoutManager.primaryIndex);
        if (!layout) return;
        if (window.minimized) window.unminimize();
        if (window.is_maximized()) window.unmaximize();
        window.move_to_monitor(layout.monitor);
        const r = layout.rect;
        window.move_resize_frame(false, r.x, r.y, r.width, r.height);
        if (layout.maximized === Meta.MaximizeFlags.BOTH && window.can_maximize()) window.maximize();
        else if (layout.maximized && window.can_maximize()) window.set_maximize_flags(layout.maximized);
        return layout;
    }

    _capture(window, record) {
        if (this._windows.get(window) !== record || record.closed || !this._enabled()) return;
        if (isNativeTrayPopup(window)) { this._untrack(window); return; }
        if (!window.get_workspace() || window.minimized || window.fullscreen) return;
        const maximized = window.get_maximize_flags();
        const monitor = this._monitors().find(m => m.index === window.get_monitor());
        if (!monitor) return;
        if (!maximized || !validRect(record.normal)) {
            record.normal = plainRect(window.get_frame_rect());
        } else if (validRect(record.normalWork)) {
            record.normal = {...record.normal,
                x: record.normal.x + monitor.work.x - record.normalWork.x,
                y: record.normal.y + monitor.work.y - record.normalWork.y};
        }
        record.normalWork = monitor.work;
        if (!Array.isArray(this._saved[record.key])) this._saved[record.key] = [];
        this._saved[record.key][record.slot] = {rect: record.normal, work: monitor.work,
            monitor: monitor.id, maximized, updated: Date.now()};
        this._queueSave();
    }

    _queueSave() {
        if (this._saveTimer) return;
        this._saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 750, () => {
            this._saveTimer = 0;
            this._save();
            return GLib.SOURCE_REMOVE;
        });
    }

    _save() {
        const entries = Object.entries(this._saved).sort((a, b) =>
            Math.max(...b[1].map(r => r?.updated || 0)) - Math.max(...a[1].map(r => r?.updated || 0)));
        this._saved = Object.fromEntries(entries.slice(0, 200));
        this._settings.set_string('saved-window-layouts', JSON.stringify(this._saved));
    }

    _untrack(window) {
        const record = this._windows.get(window);
        if (!record) return;
        record.closed = true;
        if (record.timer) GLib.Source.remove(record.timer);
        for (const id of record.signals) window.disconnect(id);
        this._windows.delete(window);
    }

    _forget(window) {
        const id = this._pending.get(window);
        if (id) window.disconnect(id);
        this._pending.delete(window);
    }

    _clear() {
        for (const window of this._pending.keys()) this._forget(window);
        for (const window of this._windows.keys()) this._untrack(window);
    }

    destroy() {
        global.display.disconnect(this._createdId);
        global.window_manager.disconnect(this._mapId);
        this._settings.disconnect(this._settingsId);
        this._settings.disconnect(this._layoutsId);
        // Shutdown may already be unmanaging windows. Flush saved snapshots
        // only, without making native calls on windows being torn down.
        this._clear();
        if (this._saveTimer) {
            GLib.Source.remove(this._saveTimer);
            this._saveTimer = 0;
            this._save();
        }
    }
}
