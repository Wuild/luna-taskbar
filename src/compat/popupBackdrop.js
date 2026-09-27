import {watchThemeColors, surfaceColor, surfaceText} from './themeColors.js';
import {BackdropRepaint} from './backdropRepaint.js';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// A separate surface behind the popup samples the desktop, leaving all menu
// text and controls sharp. BoxPointer itself renders through an offscreen
// framebuffer, so the backdrop must be its sibling, not an effect on its bin.
export class PopupBackdrop {
    constructor(menu, settings = null) {
        this.menu = menu;
        this._settings = settings;
        // QuickSettings wraps its BoxPointer in a deliberately zero-sized actor.
        // Measure the visible panel, but stack beneath the outer menu container.
        this._panel = menu._boxPointer ?? menu.actor;
        this._originalStyle = this._panel.get_style();
        if (menu._boxPointer) {
            const pointer = menu._boxPointer;
            this._originalReposition = pointer._reposition;
            this._reposition = box => {
                this._originalReposition.call(pointer, box);
                const monitor = Main.layoutManager.findMonitorForActor(pointer._sourceActor);
                let parent = pointer.get_parent();
                if (!monitor || !parent)
                    return;
                const gap = (settings?.get_int('panel-edge-gap') ?? 12) *
                    St.ThemeContext.get_for_stage(global.stage).scale_factor;
                let taskbar = pointer._sourceActor;
                while (taskbar && taskbar.name !== 'luna-taskbar') taskbar = taskbar.get_parent();
                const taskbarTop = taskbar?.get_transformed_position()[1];
                const bottomGap = (settings?.get_int('panel-taskbar-gap') ?? 6) *
                    St.ThemeContext.get_for_stage(global.stage).scale_factor;
                while (parent) {
                    const [okLeft, left, top] = parent.transform_stage_point(monitor.x + gap, monitor.y + gap);
                    const [okRight, right] = parent.transform_stage_point(monitor.x + monitor.width - gap, monitor.y);
                    if (okLeft && okRight) {
                        let y = box.y1;
                        let x = box.x1;
                        if (taskbarTop !== undefined && pointer._userArrowSide === St.Side.BOTTOM) {
                            const [ok, , bottom] = parent.transform_stage_point(monitor.x, taskbarTop - bottomGap);
                            if (ok) y = bottom - box.get_height();
                        }
                        if (taskbar && taskbarTop !== undefined) {
                            const [barX, barY] = taskbar.get_transformed_position();
                            const edge = taskbar._lunaEdge || 'bottom';
                            if (edge === 'top') y = parent.transform_stage_point(barX, barY + taskbar.height + bottomGap)[2];
                            if (edge === 'left') x = parent.transform_stage_point(barX + taskbar.width + bottomGap, barY)[1];
                            if (edge === 'right') x = parent.transform_stage_point(barX - bottomGap, barY)[1] - box.get_width();
                        }
                        const bottom = parent.transform_stage_point(monitor.x, monitor.y + monitor.height - gap)[2];
                        box.set_origin(Math.max(left, Math.min(x, right - box.get_width())), Math.max(top, Math.min(y, bottom - box.get_height())));
                        break;
                    }
                    parent = parent.get_parent();
                }
            };
            pointer._reposition = this._reposition;
        }
        this.surface = new St.Widget({style_class: 'luna-taskbar-popup-surface', visible: false,
            reactive: false});
        this.surface.connect('destroy', () => {
            this._surfaceGone = true;
            this.destroy();
        });
        this.blur = new Shell.BlurEffect({mode: Shell.BlurMode.BACKGROUND,
            radius: 12, brightness: 0.85});
        this.surface.add_effect_with_name('luna-taskbar-popup-backdrop', this.blur);
        this._repaint = new BackdropRepaint(menu.actor, this.blur);
        for (const actor of new Set([menu.actor, this._panel]))
            actor.add_style_class_name('luna-taskbar-popup');
        Main.uiGroup.add_child(this.surface);
        this._signals = [];
        const sync = () => this._sync();
        for (const actor of new Set([menu.actor, this._panel])) {
            for (const signal of ['notify::allocation', 'notify::mapped', 'notify::visible',
                'notify::opacity', 'notify::translation-x', 'notify::translation-y',
                'notify::scale-x', 'notify::scale-y'])
                this._signals.push([actor, actor.connect(signal, sync)]);
        }
        this._destroyId = menu.actor.connect('destroy', () => this.destroy());
        if (settings) {
            const update = () => {
                const transparent = settings.get_boolean('panel-transparency');
                for (const actor of new Set([menu.actor, this._panel])) {
                    if (transparent) actor.add_style_class_name('luna-taskbar-glass');
                    else actor.remove_style_class_name('luna-taskbar-glass');
                }
                const radius = settings.get_int('panel-blur-radius');
                this.blur.enabled = transparent && radius > 0;
                this.blur.radius = radius * St.ThemeContext.get_for_stage(global.stage).scale_factor;
                const opacity = transparent ? settings.get_int('panel-opacity') / 100 : 1;
                const corners = settings.get_int('panel-corner-radius');
                this.surface.set_style(`background-color: ${surfaceColor(settings, 'panel', 'panel', opacity)}; border-radius: ${corners}px;`);
                const gap = menu._boxPointer ? `-boxpointer-gap: ${settings.get_int('panel-taskbar-gap')}px;` : '';
                this._panel.set_style(`${this._originalStyle ?? ''}; ${gap} color: ${surfaceText('panel')};`);
                this._panel.queue_relayout();
                if (transparent)
                    this.surface.remove_style_class_name('opaque');
                else
                    this.surface.add_style_class_name('opaque');
            };
            for (const key of ['panel-color-override', 'panel-color', 'panel-transparency', 'panel-blur-radius', 'panel-opacity', 'panel-edge-gap', 'panel-taskbar-gap', 'panel-corner-radius'])
                this._signals.push([settings, settings.connect(`changed::${key}`, update)]);
            this._releaseThemeColors = watchThemeColors(update);
            update();
        }
        this._sync();
    }

    _sync() {
        if (!this.surface)
            return;
        const actor = this._panel;
        this.surface.visible = this.menu.actor.visible && actor.visible && actor.mapped;
        if (!this.surface.visible)
            return;
        const [x, y] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
            this.surface.hide();
            return;
        }
        this.surface.set_position(x, y);
        this.surface.set_size(width, height);
        this.surface.opacity = actor.opacity;
        this.blur.radius = (this._settings?.get_int('panel-blur-radius') ?? 12) *
            St.ThemeContext.get_for_stage(global.stage).scale_factor;
        if (this.menu.actor.get_parent() === Main.uiGroup)
            Main.uiGroup.set_child_below_sibling(this.surface, this.menu.actor);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];
        this.menu.actor.disconnect(this._destroyId);
        for (const actor of new Set([this.menu.actor, this._panel]))
            actor.remove_style_class_name('luna-taskbar-popup');
        for (const actor of new Set([this.menu.actor, this._panel]))
            actor.remove_style_class_name('luna-taskbar-glass');
        if (this._originalReposition && this._panel._reposition === this._reposition)
            this._panel._reposition = this._originalReposition;
        this._panel.set_style(this._originalStyle);
        this._releaseThemeColors?.();
        this._repaint.destroy();
        if (!this._surfaceGone) this.surface.destroy();
        this.surface = null;
    }
}
