import St from 'gi://St';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import {RoundedSurface} from './roundedSurface.js';

// Overview's animated shade must not enter the taskbar's framebuffer blur.
// Render the same wallpaper region directly during that transition instead.
export class OverviewTaskbarBackdrop {
    constructor(bar) {
        this.active = false;
        this.actor = new St.Widget({reactive: false, visible: false, clip_to_allocation: true});
        this._wallpaper = new St.Widget({reactive: false});
        this.actor.add_child(this._wallpaper);
        this._rounded = new RoundedSurface();
        this.actor.add_effect_with_name('luna-taskbar-overview-rounded', this._rounded);
        bar.insert_child_at_index(this.actor, 0);
    }

    sync(monitor, radius, blurEnabled) {
        const key = `${monitor.index}:${monitor.width}:${monitor.height}`;
        if (key !== this._monitorKey) {
            this._manager?.destroy();
            this._monitorKey = key;
            this._manager = new Background.BackgroundManager({container: this._wallpaper,
                monitorIndex: monitor.index, controlPosition: false, vignette: false});
            // The manager may emit before the replacement background actor is
            // in the container. Defer effect discovery until that update has
            // completed so a newly selected wallpaper is blurred too.
            this._manager.connect('changed', () => this.refresh());
        }
        this._monitor = monitor;
        this._radius = radius;
        this._blurEnabled = blurEnabled;
        this.actor.visible = this.active;
        this._syncEffects();
        if (this._geometry) this.updateGeometry(this._geometry);
    }

    refresh() {
        if (this._syncIdle)
            return;
        this._syncIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._syncIdle = 0;
            this._syncEffects();
            this.actor.queue_redraw();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncEffects() {
        // BackgroundManager can briefly keep old and new actors during a
        // wallpaper fade. Both must use the same independent blur settings.
        for (const actor of this._wallpaper.get_children()) {
            let effect = actor.get_effect('luna-taskbar-overview-wallpaper');
            if (!effect) {
                effect = new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR});
                actor.add_effect_with_name('luna-taskbar-overview-wallpaper', effect);
            }
            effect.radius = this._radius ?? 0;
            effect.brightness = 0.85;
            effect.enabled = this.active && this._blurEnabled;
        }
    }

    updateGeometry(geometry) {
        this._geometry = geometry;
        this.actor.set_size(geometry.width, geometry.height);
        this._rounded.update(geometry.width, geometry.height, geometry.corners);
        if (this._monitor)
            this._wallpaper.set_position(this._monitor.x - geometry.x, this._monitor.y - geometry.y);
    }

    destroy() {
        if (this._syncIdle)
            GLib.Source.remove(this._syncIdle);
        this._syncIdle = 0;
        this._manager?.destroy();
        this._manager = null;
        this.actor.destroy();
    }
}
