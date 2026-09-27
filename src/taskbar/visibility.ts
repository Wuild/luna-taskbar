import {reserveGeometry, type Rectangle} from './geometry.js';
import {easeActor} from '../core/animation.js';
import type Meta from 'gi://Meta';
import type {TaskbarSettings} from '../settings/settings.js';
export interface Monitor {index: number; x: number; y: number; width: number; height: number;}
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class TaskbarVisibility {
    private _destroyId: number;
    private _reservation: St.Widget;
    private _timer = 0;
    private _actorGone = false;
    private _destroyed = false;
    private _reserve: boolean | undefined;
    private _trackFullscreen: boolean | undefined;
    private _hidden: boolean | undefined;
    private _fullscreenActive = false;
    private _hideAt = 0;
    constructor(private readonly bar: St.Widget,
        private readonly settings: TaskbarSettings,
        private readonly monitor: () => Monitor | null | undefined,
        private readonly keepOpen: () => boolean,
        private readonly closeMenus: () => void,
        private readonly updateAppearance: (windows: Meta.Window[]) => Rectangle | undefined,
        private readonly forceVisible: () => boolean = () => false) {
        this._reservation = new St.Widget({reactive: false, opacity: 0});
        // DND uses PickMode.ALL, which includes transparent, nonreactive actors.
        // This actor reserves work area only; it must never cover drop targets.
        Shell.util_set_hidden_from_pick(this._reservation, true);
        Main.layoutManager.addChrome(this._reservation, {affectsStruts: true, trackFullscreen: false});
        this._destroyId = bar.connect('destroy', () => {
            this._actorGone = true;
            this.destroy();
        });
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this.sync();
            return GLib.SOURCE_CONTINUE;
        });
        this.sync();
    }

    sync() {
        if (this._destroyed) return;
        const monitor = this.monitor();
        if (!monitor) {
            this.bar.hide();
            return;
        }
        const forced = this.forceVisible();
        const mode = this.settings.get_string('visibility-mode');
        const reserve = mode === 'always';
        const trackFullscreen = !Main.overview.visible && !forced;
        if (reserve !== this._reserve || trackFullscreen !== this._trackFullscreen) {
            this._reserve = reserve;
            this._trackFullscreen = trackFullscreen;
            Main.layoutManager.untrackChrome(this.bar);
            Main.layoutManager.trackChrome(this.bar, {affectsStruts: false, trackFullscreen});
        }
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const [x, y] = global.get_pointer();
        const position = this.settings.get_string('taskbar-position');
        const inMonitor = x >= monitor.x && x < monitor.x + monitor.width && y >= monitor.y && y < monitor.y + monitor.height;
        const edge = inMonitor && (position === 'bottom' ? y >= monitor.y + monitor.height - 2 * scale
            : position === 'top' ? y < monitor.y + 2 * scale
            : position === 'left' ? x < monitor.x + 2 * scale : x >= monitor.x + monitor.width - 2 * scale);
        const overBar = !this._hidden && x >= this.bar.x && x < this.bar.x + this.bar.width &&
            y >= this.bar.y && y < this.bar.y + this.bar.height;
        const fullscreen = global.display.get_monitor_in_fullscreen(monitor.index);
        const windows = global.workspace_manager.get_active_workspace().list_windows()
            .filter(window => !window.minimized && !window.skip_taskbar && window.get_monitor() === monitor.index);
        const geometry = this.updateAppearance?.(windows) ?? this.bar;
        const reservation = reserveGeometry(monitor, geometry, position);
        this._reservation.set_position(reservation.x, reservation.y);
        this._reservation.set_size(reservation.width, reservation.height);
        this._reservation.visible = reserve;
        const travelX = position === 'left' ? monitor.x - this.bar.x - this.bar.width
            : position === 'right' ? monitor.x + monitor.width - this.bar.x : 0;
        const travelY = position === 'top' ? monitor.y - this.bar.y - this.bar.height
            : position === 'bottom' ? monitor.y + monitor.height - this.bar.y : 0;
        if (fullscreen && !Main.overview.visible && !forced) {
            if (!this._fullscreenActive) {
                this._fullscreenActive = true;
                this.closeMenus();
                this.bar.remove_all_transitions();
            }
            return;
        }
        const leavingFullscreen = this._fullscreenActive;
        this._fullscreenActive = false;
        const blocked = mode === 'auto-hide' ||
            (mode === 'maximized' && windows.some(window => window.is_maximized())) ||
            (mode === 'overlap' && windows.some(window => {
                const r = window.get_frame_rect();
                return r.y + r.height > this.bar.y && r.y < this.bar.y + this.bar.height &&
                    r.x < this.bar.x + this.bar.width && r.x + r.width > this.bar.x;
            }));
        const show = forced || Main.overview.visible || this.keepOpen() || edge || overBar || !blocked;
        const now = GLib.get_monotonic_time();
        if (show) {
            this._hideAt = 0;
        } else if (!this._hideAt) {
            this._hideAt = now + this.settings.get_int('hide-delay') * 1000;
        }
        const hidden = !show && now >= this._hideAt;
        if (forced || Main.overview.visible) {
            this._hidden = false;
            this.bar.remove_all_transitions();
            this.bar.show();
            this.bar.reactive = true;
            this.bar.translation_x = 0;
            this.bar.translation_y = 0;
            this.bar.opacity = 255;
            const parent = this.bar.get_parent();
            const overview = Main.layoutManager.overviewGroup;
            const above = overview.get_parent() === parent ? overview : global.window_group;
            if (parent && above.get_parent() === parent)
                parent.set_child_above_sibling(this.bar, above);
            return;
        }
        if (hidden === this._hidden && !leavingFullscreen)
            return;
        this._hidden = hidden;
        if (hidden)
            this.closeMenus();
        this.bar.visible = true;
        this.bar.reactive = !hidden;
        if (leavingFullscreen) {
            this.bar.remove_all_transitions();
            this.bar.translation_x = hidden ? travelX : 0;
            this.bar.translation_y = hidden ? travelY : 0;
            this.bar.opacity = hidden ? 0 : 255;
            return;
        }
        easeActor(this.bar, {translation_x: hidden ? travelX : 0, translation_y: hidden ? travelY : 0,
            opacity: hidden ? 0 : 255, duration: 160, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this.bar.disconnect(this._destroyId);
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = 0;
        Main.layoutManager.removeChrome(this._reservation);
        this._reservation.destroy();
        if (this._actorGone) return;
        this.bar.remove_all_transitions();
        this.bar.translation_x = 0;
        this.bar.translation_y = 0;
        this.bar.opacity = 255;
    }
}
