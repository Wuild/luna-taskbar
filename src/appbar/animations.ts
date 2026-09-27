import {easeActor} from '../core/animation.js';
import type {TaskbarSettings} from '../settings/settings.js';
import type {KeysOfType} from '../settings/keys.js';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

// Animate icon content so drag sorting retains control of button geometry.
export class AppAnimations {
    constructor(private readonly settings: TaskbarSettings) {}

    duration(key: KeysOfType<boolean>) {
        return this.settings.get_boolean(key) && St.Settings.get().enable_animations
            ? this.settings.get_int('app-animation-duration') : 0;
    }

    hover(button: St.Button, hovered: boolean) {
        const icon = button.child?.get_first_child();
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

    appear(button: St.Button) {
        const duration = this.duration('app-appear-animation');
        if (!duration) return;
        button.opacity = 0;
        easeActor(button, {opacity: 255, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    launch(button: St.Button) {
        const duration = this.duration('app-launch-animation');
        if (!duration) return;
        const icon = button.child?.get_first_child();
        if (!icon) return;
        icon.set_pivot_point(0.5, 0.5);
        easeActor(icon, {scale_x: 0.82, scale_y: 0.82, duration: duration / 2,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.hover(button, button.hover)});
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
