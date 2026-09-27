import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// GNOME's restore effect scales the client buffer (including its shadows),
// which can briefly paint onto an adjacent monitor. Bound only that effect;
// ordinary windows, dragging, and intentional monitor moves remain unclipped.
export class WindowAnimationBounds {
    constructor() {
        this._records = new Map();
        this._signals = [
            [global.window_manager, global.window_manager.connect('size-change', (_wm, actor, change) => {
                this._clear(actor);
                if (change !== Meta.SizeChange.UNMAXIMIZE || Main.layoutManager.monitors.length < 2 ||
                    !actor.__animationInfo) return;
                const monitor = Main.layoutManager.monitors[actor.meta_window.get_monitor()];
                if (!monitor) return;
                const record = {monitor: {...monitor}, info: actor.__animationInfo, clips: new Map()};
                record.cloneDestroyId = record.info.clone.connect('destroy', () => {
                    record.cloneDestroyed = true;
                    record.clips.delete(record.info.clone);
                });
                record.destroyId = actor.connect('destroy', () => this._clear(actor, true));
                this._records.set(actor, record);
                if (!this._paintId)
                    this._paintId = global.stage.connect('before-paint', () => this._update());
            })],
            [global.display, global.display.connect('grab-op-begin', () => this._clearAll())],
            [Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => this._clearAll())],
        ];
    }

    _update() {
        for (const [actor, record] of this._records) {
            if (actor.__animationInfo !== record.info) {
                this._clear(actor);
                continue;
            }
            const m = record.monitor;
            const frame = actor.meta_window.get_frame_rect();
            // A restored window may intentionally span displays.
            if (frame.x < m.x || frame.y < m.y || frame.x + frame.width > m.x + m.width ||
                frame.y + frame.height > m.y + m.height) {
                this._clear(actor);
                continue;
            }
            for (const target of [actor, record.info.clone]) {
                if (!target?.get_parent()) continue;
                const [ok1, x1, y1] = target.transform_stage_point(m.x, m.y);
                const [ok2, x2, y2] = target.transform_stage_point(m.x + m.width, m.y + m.height);
                if (!ok1 || !ok2 || x2 <= x1 || y2 <= y1) continue;
                if (!record.clips.has(target))
                    record.clips.set(target, target.has_clip ? target.get_clip() : null);
                const original = record.clips.get(target);
                const left = original ? Math.max(x1, original[0]) : x1;
                const top = original ? Math.max(y1, original[1]) : y1;
                const right = original ? Math.min(x2, original[0] + original[2]) : x2;
                const bottom = original ? Math.min(y2, original[1] + original[3]) : y2;
                target.set_clip(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
            }
        }
    }

    _clear(actor, destroyed = false) {
        const record = this._records.get(actor);
        if (!record) return;
        this._records.delete(actor);
        if (!destroyed) actor.disconnect(record.destroyId);
        if (!record.cloneDestroyed) record.info.clone.disconnect(record.cloneDestroyId);
        for (const [target, clip] of record.clips) {
            // Shell owns and destroys the animation clone on completion.
            if ((target === actor && destroyed) ||
                (target !== actor && actor.__animationInfo !== record.info)) continue;
            if (clip) target.set_clip(...clip);
            else target.remove_clip();
        }
        if (!this._records.size && this._paintId) {
            global.stage.disconnect(this._paintId);
            this._paintId = 0;
        }
    }

    _clearAll() {
        for (const actor of this._records.keys()) this._clear(actor);
    }

    destroy() {
        this._clearAll();
        for (const [object, id] of this._signals) object.disconnect(id);
        this._signals = [];
    }
}
