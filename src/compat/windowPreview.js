import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {PopupBackdrop} from './popupBackdrop.js';
import {createHorizontalScroll, revealInScroll} from './horizontalScroll.js';
import {createTaskIcon} from './windowIcons.js';

export class WindowPreview {
    constructor(taskbar, settings, openWindowMenu) {
        this._openWindowMenu = openWindowMenu;
        this._taskbar = taskbar;
        this._settings = settings;
        this._settingsId = settings.connect('changed', (_settings, key) => {
            if ((key.startsWith('preview-') || key.startsWith('panel-')) && this.actor.visible)
                this.showMany(this._tasks, this._button);
        });
        this._connections = [];
        this.actor = new St.BoxLayout({
            style_class: 'luna-taskbar-preview', orientation: Clutter.Orientation.VERTICAL,
            reactive: true, track_hover: true, visible: false,
        });
        Main.layoutManager.addTopChrome(this.actor);
        this._backdrop = new PopupBackdrop({actor: this.actor}, settings);
        this.actor.connect('notify::allocation', () => this._position());
        this.actor.connect('enter-event', () => {
            this._cancel('show');
            this._pendingButton = null;
            this._cancel('hide');
            if (this._closing)
                this._animateIn();
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('leave-event', () => {
            this.hideLater();
            return Clutter.EVENT_PROPAGATE;
        });
        this._pressId = global.stage.connect('captured-event', (_stage, event) => {
            if (this.actor.visible && event.type() === Clutter.EventType.BUTTON_PRESS &&
                !this.actor.contains(global.stage.get_event_actor(event)))
                this.hide();
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('destroy', () => this._disconnectExternal());
    }

    _disconnectExternal() {
        if (!this._settingsId)
            return;
        this._settings.disconnect(this._settingsId);
        this._settingsId = 0;
        global.stage.disconnect(this._pressId);
        this._cancel('show');
        this._cancel('hide');
    }

    _cancel(name) {
        const key = `_${name}Source`;
        if (this[key])
            GLib.Source.remove(this[key]);
        this[key] = 0;
    }

    schedule(task, button) {
        this._cancel('show');
        this._cancel('hide');
        this._pendingButton = null;
        if (this._closing)
            this._animateIn();
        if (this._button === button && this.actor.visible) {
            return;
        }
        if (!this._canShow() || (!task.window && !this.actor.visible))
            return;
        // Keep the current preview while crossing neighboring buttons on the
        // way to it. A deliberate hover commits the switch after the grace period.
        const delay = this.actor.visible
            ? Math.max(this._settings.get_int('preview-show-delay'), this._settings.get_int('preview-hide-delay'))
            : this._settings.get_int('preview-show-delay');
        this._pendingButton = button;
        this._showSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._showSource = 0;
            this._pendingButton = null;
            if (button.hover && button.mapped && this._canShow()) {
                if (task.window)
                    this.show(task, button);
                else
                    this.hide(true);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _canShow() {
        // Overview itself owns a modal grab. Allow that grab, while still
        // suppressing hover previews beneath menus and other modal dialogs.
        return Main.modalCount === 0 ||
            (Main.modalCount === 1 && Main.overview.visible && Main.overview._modal &&
                Main.actionMode === Shell.ActionMode.OVERVIEW);
    }

    hideLater() {
        this._cancel('show');
        this._cancel('hide');
        this._pendingButton = null;
        this._hideSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._settings.get_int('preview-hide-delay'), () => {
            this._hideSource = 0;
            // Crossing events can arrive from child actors or in a different
            // order when moving between the button and preview.
            const [x, y] = global.get_pointer();
            const target = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
            if (!target || (!this.actor.contains(target) && !this._button?.contains(target)))
                this.hide(true);
            return GLib.SOURCE_REMOVE;
        });
    }

    forget(button) {
        if (this._button === button)
            this.hide();
        else if (this._pendingButton === button)
            this.hideLater();
    }

    show(task, button) {
        this.showMany(task.windows?.length
            ? task.windows.map(window => ({app: task.app, window})) : [task], button);
    }

    _card({window, app}) {
        const source = window.get_compositor_private();
        if (!source)
            return null;
        const card = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'luna-taskbar-preview-card', reactive: true, track_hover: true});
        card.connect('captured-event', (_actor, event) => {
            const rightClick = event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === 3;
            const keyboardMenu = event.type() === Clutter.EventType.KEY_PRESS &&
                (event.get_key_symbol() === Clutter.KEY_Menu ||
                 (event.get_key_symbol() === Clutter.KEY_F10 && (event.get_state() & Clutter.ModifierType.SHIFT_MASK)));
            if (!rightClick && !keyboardMenu)
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = rightClick ? event.get_coords() : card.get_transformed_position();
            this._openWindowMenu(window, x, y);
            return Clutter.EVENT_STOP;
        });
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const header = new St.BoxLayout({style_class: 'luna-taskbar-preview-header'});
        const title = new St.Label({text: window.get_title() || app?.get_name() || 'Window',
            x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        title.set_width((this._settings.get_int('preview-width') - 76) * scale);
        const close = new St.Button({style_class: 'luna-taskbar-preview-close', can_focus: true,
            accessible_name: 'Close window',
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 16})});
        close.connect('clicked', () => window.delete(global.get_current_time()));
        header.add_child(createTaskIcon(app, window, 20));
        header.add_child(title);
        header.add_child(close);
        card.add_child(header);
        const previewWidth = this._settings.get_int('preview-width') * scale;
        const ratioSetting = this._settings.get_string('preview-aspect-ratio');
        const ratios = {'16:10': 1.6, '16:9': 16 / 9, '4:3': 4 / 3};
        const aspect = ratios[ratioSetting] ??
            Math.max(0.5, Math.min(3, source.width / Math.max(1, source.height)));
        const thumbnail = new St.Widget({width: previewWidth, height: Math.round(previewWidth / aspect),
            clip_to_allocation: true});
        const clone = new Clutter.Clone({source});
        thumbnail.add_child(clone);
        const resize = () => {
            const w = source.width;
            const h = source.height;
            if (![w, h, thumbnail.width, thumbnail.height].every(Number.isFinite) || w <= 0 || h <= 0)
                return;
            const ratio = Math.min(thumbnail.width / w, thumbnail.height / h);
            clone.set_size(w, h);
            clone.set_scale(ratio, ratio);
            clone.set_position((thumbnail.width - w * ratio) / 2,
                (thumbnail.height - h * ratio) / 2);
        };
        resize();
        // Minimized windows usually retain their last compositor texture.
        if (source.width <= 0 || source.height <= 0) {
            const fallback = createTaskIcon(app, null, 64);
            fallback.set_position((thumbnail.width - 64 * scale) / 2,
                (thumbnail.height - 64 * scale) / 2);
            thumbnail.add_child(fallback);
        }
        const activate = new St.Button({child: thumbnail, can_focus: true,
            style_class: 'luna-taskbar-preview-activate',
            accessible_name: `Activate ${title.text}`});
        for (const button of [activate, close])
            button.connect('key-focus-in', () => {
                if (this._scroll)
                    revealInScroll(this._scroll, card);
            });
        activate.connect('clicked', () => {
            this.hide();
            Main.activateWindow(window);
        });
        card.add_child(activate);
        this._connections.push(
            [source, source.connect('notify::allocation', resize)],
            [window, window.connect('notify::title', () => { title.text = window.get_title() || 'Window'; })],
            [window, window.connect('unmanaged', () => this._windowClosed(window))]);
        return card;
    }

    _windowClosed(window) {
        const [x, y] = global.get_pointer();
        const target = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
        const hovered = this.actor.hover || (target && this.actor.contains(target));
        const remaining = (this._tasks ?? []).filter(task => task.window !== window);
        if (hovered && remaining.length && this._button?.mapped)
            this.showMany(remaining, this._button);
        else
            this.hide();
    }

    showMany(tasks, button) {
        this.hide();
        if (!button.mapped)
            return;
        this._button = button;
        this._tasks = tasks;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const row = new St.BoxLayout({style_class: 'luna-taskbar-preview-row',
            style: `spacing: ${this._settings.get_int('preview-card-spacing')}px;`});
        this.actor.set_style(`padding: ${this._settings.get_int('preview-padding')}px;`);
        for (const task of tasks) {
            const card = this._card(task);
            if (card)
                row.add_child(card);
        }
        if (!row.get_n_children()) {
            row.destroy();
            return;
        }
        const scroll = createHorizontalScroll();
        this._scroll = scroll;
        scroll.set_child(row);
        this.actor.add_child(scroll);
        const monitor = Main.layoutManager.findMonitorForActor(button);
        if (!monitor) {
            this.hide();
            return;
        }
        this._monitor = monitor;
        // Measure the complete row after showing it. Include the panel's theme
        // padding/borders exactly once, and constrain the scroll viewport itself.
        this.actor.set_size(-1, -1);
        const offset = this._animationOffset();
        this.actor.opacity = St.Settings.get().enable_animations ? 0 : 255;
        this.actor.translation_x = offset.x;
        this.actor.translation_y = offset.y;
        this.actor.show();
        const naturalWidth = row.get_preferred_width(-1)[1];
        const theme = this.actor.get_theme_node();
        const chromeWidth = theme.adjust_preferred_width(0, 0)[1];
        const viewportWidth = Math.min(naturalWidth,
            Math.max(1, monitor.width - 2 * this._settings.get_int('panel-edge-gap') * scale - chromeWidth));
        const viewportHeight = row.get_preferred_height(naturalWidth)[1];
        scroll.set_size(viewportWidth, viewportHeight);
        this.actor.set_width(viewportWidth + chromeWidth);
        this.actor.set_height(-1);
        this._position(true);
        this._animateIn();
    }

    _animationOffset() {
        const distance = 12 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const edge = this._settings.get_string('taskbar-position');
        return {x: edge === 'left' ? -distance : edge === 'right' ? distance : 0,
            y: edge === 'top' ? -distance : edge === 'bottom' ? distance : 0};
    }

    _animateIn() {
        this._closing = false;
        this.actor.remove_all_transitions();
        this.actor.ease({opacity: 255, translation_x: 0, translation_y: 0,
            duration: St.Settings.get().enable_animations ? 180 : 0,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
    }

    _position(measure = false) {
        if (!this._button || !this._monitor || !this.actor.visible)
            return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const monitor = this._monitor;
        const width = measure ? this.actor.get_preferred_width(-1)[1] : this.actor.width;
        const height = measure ? this.actor.get_preferred_height(width)[1] : this.actor.height;
        if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0)
            return;
        const [buttonX, buttonY] = this._button.get_transformed_position();
        const [barLeft, barTop] = this._taskbar.get_transformed_position();
        if (![buttonX, barTop].every(Number.isFinite)) return;
        const edgeGap = this._settings.get_int('panel-edge-gap') * scale;
        let x = Math.max(monitor.x + edgeGap,
            Math.min(buttonX + this._button.width / 2 - width / 2,
                monitor.x + monitor.width - width - edgeGap));
        const gap = this._settings.get_int('panel-taskbar-gap') * scale;
        const edge = this._settings.get_string('taskbar-position');
        let y = barTop - height - gap;
        if (edge === 'top') y = barTop + this._taskbar.height + gap;
        if (edge === 'left' || edge === 'right') {
            x = edge === 'left' ? barLeft + this._taskbar.width + gap : barLeft - width - gap;
            y = buttonY + this._button.height / 2 - height / 2;
        }
        x = Math.max(monitor.x + edgeGap, Math.min(x, monitor.x + monitor.width - width - edgeGap));
        y = Math.max(monitor.y + edgeGap, Math.min(y, monitor.y + monitor.height - height - edgeGap));
        if (this.actor.x !== x || this.actor.y !== y)
            this.actor.set_position(x, y);
    }

    hide(animate = false) {
        this._cancel('show');
        this._cancel('hide');
        if (animate && this.actor.visible && St.Settings.get().enable_animations) {
            if (this._closing)
                return;
            this._closing = true;
            this.actor.remove_all_transitions();
            const offset = this._animationOffset();
            this.actor.ease({opacity: 0, translation_x: offset.x, translation_y: offset.y,
                duration: 120, mode: Clutter.AnimationMode.EASE_IN_CUBIC,
                onComplete: () => { if (this._closing) this.hide(); }});
            return;
        }
        this._closing = false;
        this.actor.remove_all_transitions();
        for (const [object, id] of this._connections)
            object.disconnect(id);
        this._connections = [];
        this._pendingButton = this._button = this._monitor = null;
        this.actor.hide();
        this.actor.opacity = 255;
        this.actor.translation_x = this.actor.translation_y = 0;
        this._tasks = null;
        this._scroll = null;
        this.actor.destroy_all_children();
    }

    destroy() {
        this._disconnectExternal();
        this.hide();
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }
}
