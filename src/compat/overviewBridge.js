import {OverviewStyle} from './overviewStyle.js';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class OverviewBridge {
    constructor(settings, taskbar) {
        this._taskbar = taskbar;
        this._settings = settings;
        this._style = new OverviewStyle(settings);
        this._effects = new Map();
        this._signals = [];
        this._wallpaperGroup = new Meta.BackgroundGroup();
        Main.layoutManager.overviewGroup.insert_child_at_index(this._wallpaperGroup, 0);
        this._backgrounds = [];
        this._tints = [];
        this._rebuildWallpapers();
        this._dash = Main.overview.dash;
        this._dashVisible = this._dash.visible;
        this._dashHeight = this._dash.height;
        if (Main.layoutManager._startingUp && !Main.sessionMode.isGreeter) {
            this._startupAnimation = Main.layoutManager._startupAnimationSession;
            this._desktopStartup = async () => {};
            Main.layoutManager._startupAnimationSession = this._desktopStartup;
            this._connect(Main.layoutManager, 'startup-complete', () => {
                this._restoreStartup();
                Main.overview.hide();
            });
        }
        this._overlayOriginal = GObject.signal_handler_find(global.display, {signalId: 'overlay-key'});
        if (this._overlayOriginal)
            GObject.signal_handler_block(global.display, this._overlayOriginal);
        this._a11y = new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.keyboard'});
        this._lastSuper = 0;
        this._connect(global.display, 'overlay-key', () => {
            if (Main.extensionManager.lookup('arcmenu@arcmenu.com')?.state === 1) {
                this._lastSuper = 0;
                return;
            }
            if (this._a11y.get_boolean('stickykeys-enable')) return;
            const now = GLib.get_monotonic_time() / 1000;
            const doublePress = this._lastSuper > 0 && now - this._lastSuper < 500;
            this._lastSuper = doublePress ? 0 : now;
            if (doublePress) {
                Main.overview.showApps();
                this._dash.showAppsButton.checked = true;
            }
            else
                Main.overview.toggle();
        });
        this._dash.hide();
        this._reserveTaskbar();
        for (const property of ['height', 'y'])
            this._connect(taskbar, `notify::${property}`, () => this._reserveTaskbar());
        this._connect(settings, 'changed::taskbar-position', () => this._reserveTaskbar());
        this._connect(settings, 'changed::overview-taskbar-gap', () => this._reserveTaskbar());
        this._connect(this._dash, 'notify::visible', () => this._dash.hide());
        for (const signal of ['showing', 'shown', 'hidden'])
            this._connect(Main.overview, signal, () => this._queue());
        for (const signal of ['showing', 'shown'])
            this._connect(Main.overview, signal, () => this._focusOverview());
        this._connect(global.display, 'notify::focus-window', () => {
            if (!Main.overview.visible || this._focusIdle) return;
            this._focusIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._focusIdle = 0;
                this._focusOverview();
                return GLib.SOURCE_REMOVE;
            });
        });
        this._connect(Main.layoutManager, 'monitors-changed', () => {
            this._rebuildWallpapers();
            this._queue();
        });
        this._connect(global.workspace_manager, 'notify::n-workspaces', () => this._queue());
        this._connect(settings, 'changed::overview-tint-opacity', () => this._queue());
        this._connect(settings, 'changed::overview-blur', () => this._queue());
        this._connect(settings, 'changed::overview-blur-radius', () => this._queue());
        this._connect(St.ThemeContext.get_for_stage(global.stage), 'notify::scale-factor', () => { this._reserveTaskbar(); this._queue(); });
        this._queue();
    }

    _focusOverview() {
        if (!Main.overview.visible || !Main.overview._shown || Main.overview._inXdndDrag ||
            Main.actionMode !== Shell.ActionMode.OVERVIEW) return;
        if (global.display.get_focus_window())
            global.display.unset_input_focus(global.get_current_time());
        const focus = global.stage.get_key_focus();
        if (!focus || !Main.layoutManager.overviewGroup.contains(focus))
            Main.overview._overview.searchEntry.grab_key_focus();
    }

    _reserveTaskbar() {
        // ControlsManagerLayout explicitly measures the dash even while hidden.
        // Keep that reserved area for Luna - Taskbar instead of collapsing it to zero.
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const monitor = Main.layoutManager.findMonitorForActor(this._taskbar);
        const reserved = this._settings.get_string('taskbar-position') === 'bottom' && monitor
            ? monitor.y + monitor.height - this._taskbar.y : 0;
        this._dash.set_height(reserved + this._settings.get_int('overview-taskbar-gap') * scale);
        Main.overview._overview.controls.queue_relayout();
    }

    _restoreStartup() {
        if (this._startupAnimation &&
            Main.layoutManager._startupAnimationSession === this._desktopStartup)
            Main.layoutManager._startupAnimationSession = this._startupAnimation;
        this._startupAnimation = null;
    }

    _rebuildWallpapers() {
        for (const tint of this._tints)
            tint.destroy();
        this._tints = [];
        for (const manager of this._backgrounds)
            manager.destroy();
        this._backgrounds = Main.layoutManager.monitors.map((_monitor, monitorIndex) => {
            const manager = new Background.BackgroundManager({
                container: this._wallpaperGroup, monitorIndex,
                layoutManager: Main.layoutManager, vignette: false,
            });
            manager.connect('changed', () => this._queue());
            return manager;
        });
        // This shade is independent of blur, and stays below all overview UI.
        this._tints = Main.layoutManager.monitors.map(monitor => {
            const tint = new St.Widget({reactive: false, x: monitor.x, y: monitor.y,
                width: monitor.width, height: monitor.height});
            this._wallpaperGroup.add_child(tint);
            return tint;
        });
        this._queue();
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _queue() {
        if (this._idle)
            return;
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sync() {
        const opacity = this._settings.get_int('overview-tint-opacity') / 100;
        for (const tint of this._tints) {
            tint.set_style(`background-color: rgba(0, 0, 0, ${opacity});`);
            this._wallpaperGroup.set_child_above_sibling(tint, null);
        }
        const radius = this._settings.get_int('overview-blur-radius') *
            St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const enabled = Main.overview.visible && this._settings.get_boolean('overview-blur') && radius > 0;
        const visit = actor => {
            if (!actor)
                return;
            if (actor instanceof Meta.BackgroundActor && !this._effects.has(actor)) {
                const effect = new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR,
                    radius,
                    brightness: 0.85, enabled});
                actor.add_effect_with_name('luna-taskbar-overview-blur', effect);
                const destroyId = actor.connect('destroy', () => this._effects.delete(actor));
                this._effects.set(actor, {effect, destroyId});
            }
            for (const child of actor.get_children())
                visit(child);
        };
        // Only the dedicated full-screen wallpaper gets blurred. Workspace
        // thumbnails and the desktop's own actors retain their sharp rendering.
        visit(this._wallpaperGroup);
        for (const {effect} of this._effects.values()) {
            effect.radius = radius;
            effect.enabled = enabled;
        }
    }

    destroy() {
        if (this._focusIdle) GLib.Source.remove(this._focusIdle);
        if (this._overlayOriginal && GObject.signal_handler_is_connected(global.display, this._overlayOriginal))
            GObject.signal_handler_unblock(global.display, this._overlayOriginal);
        this._style.destroy();
        this._restoreStartup();
        if (this._idle)
            GLib.Source.remove(this._idle);
        for (const [object, id] of this._signals)
            object.disconnect(id);
        for (const [actor, {effect, destroyId}] of this._effects) {
            actor.disconnect(destroyId);
            actor.remove_effect(effect);
        }
        this._effects.clear();
        for (const manager of this._backgrounds)
            manager.destroy();
        this._wallpaperGroup.destroy();
        this._dash.set_height(-1);
        this._dash.visible = this._dashVisible;
    }
}
