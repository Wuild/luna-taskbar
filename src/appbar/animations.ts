import {easeActor} from '../core/animation.js';
import type {TaskbarSettings} from '../settings/settings.js';
import type {KeysOfType} from '../settings/keys.js';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';

// Animate icon content so drag sorting retains control of button geometry.
export class AppAnimations {
    constructor(private readonly settings: TaskbarSettings) {}

    duration(key: KeysOfType<boolean>) {
        return this.settings.get_boolean(key) && St.Settings.get().enable_animations
            ? this.settings.get_int('app-animation-duration') : 0;
    }

    hover(button: St.Widget, hovered: boolean, icon = button.get_first_child()?.get_first_child()) {
        if (!icon) return;
        const effect = this.settings.get_string('app-hover-animation');
        const duration = St.Settings.get().enable_animations
            ? this.settings.get_int('app-animation-duration') : 0;
        icon.set_pivot_point(0.5, 0.5);
        easeActor(icon, {scale_x: hovered && effect === 'zoom' ? 1.08 : 1,
            scale_y: hovered && effect === 'zoom' ? 1.08 : 1,
            translation_y: hovered && effect === 'lift' ? -2 : 0,
            duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    // Capture presses before menu handlers can consume them. Check pointer
    // state while held because modal menu grabs can consume release events.
    bindButton(button: St.Widget, icon: Clutter.Actor): () => void {
        const trackHover = button.track_hover;
        const [pivotX, pivotY] = icon.get_pivot_point();
        const original = {scale_x: icon.scale_x, scale_y: icon.scale_y,
            translation_y: icon.translation_y};
        let pressed = false;
        let releaseId = 0;
        let disposed = false;
        const release = () => {
            if (releaseId) GLib.Source.remove(releaseId);
            releaseId = 0;
            if (!pressed) return;
            pressed = false;
            this.hover(button, button.hover, icon);
        };
        button.track_hover = true;
        const hoverId = button.connect('notify::hover', () => {
            if (!pressed) this.hover(button, button.hover, icon);
        });
        const pressId = button.connect('captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.BUTTON_PRESS || event.get_button() !== 1 || pressed)
                return Clutter.EVENT_PROPAGATE;
            const duration = this.duration('app-launch-animation');
            if (!duration) return Clutter.EVENT_PROPAGATE;
            pressed = true;
            icon.set_pivot_point(0.5, 0.5);
            easeActor(icon, {scale_x: 0.82, scale_y: 0.82, duration: duration / 2,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            releaseId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                if (global.get_pointer()[2] & Clutter.ModifierType.BUTTON1_MASK)
                    return GLib.SOURCE_CONTINUE;
                releaseId = 0;
                release();
                return GLib.SOURCE_REMOVE;
            });
            return Clutter.EVENT_PROPAGATE;
        });
        const mappedId = button.connect('notify::mapped', () => {
            if (!button.mapped) release();
        });
        const destroyId = button.connect('destroy', () => {
            if (releaseId) GLib.Source.remove(releaseId);
            releaseId = 0;
            disposed = true;
        });
        return () => {
            if (disposed) return;
            disposed = true;
            if (releaseId) GLib.Source.remove(releaseId);
            releaseId = 0;
            for (const id of [hoverId, pressId, mappedId, destroyId]) button.disconnect(id);
            button.track_hover = trackHover;
            for (const property of ['scale-x', 'scale-y', 'translation-y'])
                icon.remove_transition(property);
            icon.set_pivot_point(pivotX, pivotY);
            Object.assign(icon, original);
        };
    }

    appear(button: St.Button) {
        const duration = this.duration('app-appear-animation');
        if (!duration) return;
        button.opacity = 0;
        easeActor(button, {opacity: 255, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    close(button: St.Button) {
        const duration = this.duration('app-close-animation');
        if (!duration) { button.destroy(); return; }
        button.reactive = false;
        button.can_focus = false;
        easeActor(button, {opacity: 0, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => button.destroy()});
    }
}
