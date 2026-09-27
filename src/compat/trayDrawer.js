import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import {PopupBackdrop} from './popupBackdrop.js';
import {createHorizontalScroll} from './horizontalScroll.js';

export class TrayDrawer {
    constructor(box, settings, manager) {
        Object.assign(this, {box, settings, manager});
        this._children = new Map();
        const parent = box.get_parent();
        const index = parent.get_children().indexOf(box);
        parent.remove_child(box);
        this.actor = new St.BoxLayout({x_expand: false, style_class: 'luna-taskbar-tray-holder'});
        parent.insert_child_at_index(this.actor, index);
        this.actor.add_child(box);
        this.overflowBox = new St.BoxLayout({style_class: 'luna-taskbar-tray'});
        this.button = new St.Button({can_focus: true, visible: false, style_class: 'luna-taskbar-tray-toggle',
            child: new St.Icon({icon_name: 'view-more-symbolic', icon_size: 16})});
        settings.bind('tray-icon-size', this.button.child, 'icon-size', Gio.SettingsBindFlags.GET);
        this.actor.add_child(this.button);
        this.menu = new PopupMenu.PopupMenu(this.button, 0.5, St.Side.BOTTOM);
        Main.uiGroup.add_child(this.menu.actor);
        this.menu.actor.hide();
        this._backdrop = new PopupBackdrop(this.menu, settings);
        this._scroll = createHorizontalScroll({min_width: 0});
        this._scroll.set_child(this.overflowBox);
        const row = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
            style_class: 'luna-taskbar-tray-drawer-row'});
        row.add_child(this._scroll);
        this.menu.addMenuItem(row);
        manager.addMenu(this.menu);
        this.button.connect('clicked', () => this.menu.toggle());
        this.menu.connect('open-state-changed', (_menu, open) => {
            this.button.child.icon_name = open ? 'pan-down-symbolic' : 'view-more-symbolic';
            if (open) {
                this.button.add_style_class_name('luna-taskbar-applet-open');
                this._sizePopup();
            } else {
                this.button.remove_style_class_name('luna-taskbar-applet-open');
            }
        });
        this._signals = [
            [box, box.connect('child-added', () => this._queue())],
            [box, box.connect('child-removed', () => this._queue())],
            [this.overflowBox, this.overflowBox.connect('child-added', () => this._queue())],
            [this.overflowBox, this.overflowBox.connect('child-removed', () => this._queue())],
            [settings, settings.connect('changed', (_settings, key) => {
                if (key.startsWith('tray-') || key === 'panel-edge-gap')
                    this._queue();
            })],
            [Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => this._queue())],
        ];
        this.actor.connect('destroy', () => {
            this._actorGone = true;
            this._stop();
        });
        this._sync();
    }

    _queue() {
        if (this._stopped || this._idle)
            return;
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sizePopup() {
        const monitor = Main.layoutManager.findMonitorForActor(this.button);
        if (!monitor)
            return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const width = Math.min(this.overflowBox.get_preferred_width(-1)[1],
            Math.max(32 * scale, monitor.width - (2 * this.settings.get_int('panel-edge-gap') + 40) * scale));
        this._scroll.set_size(width, Math.max(32 * scale, this.overflowBox.get_preferred_height(-1)[1]));
    }

    _sync() {
        this.overflowBox.set_style(`spacing: ${this.settings.get_int('tray-spacing')}px;`);
        const children = [...this._children.keys(), ...this.box.get_children(), ...this.overflowBox.get_children()]
            .filter((child, index, all) => all.indexOf(child) === index && [this.box, this.overflowBox].includes(child.get_parent()));
        for (const [child, ids] of this._children) {
            if (!children.includes(child)) {
                ids.forEach(id => child.disconnect(id));
                this._children.delete(child);
            }
        }
        for (const child of children) {
            if (!this._children.has(child)) {
                const visibleId = child.connect('notify::visible', () => this._queue());
                const destroyId = child.connect('destroy', () => {
                    this._children.delete(child);
                    this._queue();
                });
                this._children.set(child, [visibleId, destroyId]);
            }
        }
        const exceptions = new Set(this.settings.get_strv('tray-always-visible'));
        const visible = children.filter(child => child.visible);
        const collapsed = this.settings.get_boolean('tray-collapse-enabled') &&
            visible.length > this.settings.get_int('tray-visible-limit');
        for (const child of children) {
            const destination = collapsed && !exceptions.has(child._lunaTaskbarTrayKey) ? this.overflowBox : this.box;
            if (child.get_parent() !== destination) {
                child.get_parent().remove_child(child);
                destination.add_child(child);
            }
            child._lunaTaskbarSetInDrawer?.(destination === this.overflowBox);
        }
        this.collapsed = collapsed;
        const hiddenCount = this.overflowBox.get_children().filter(child => child.visible).length;
        this.button.accessible_name = `Application tray — ${hiddenCount} hidden icons`;
        this.button.visible = hiddenCount > 0;
        if (!hiddenCount) this.close();
        if (this.menu.isOpen) this._sizePopup();
    }

    suspendForNativeMenu() {
        if (!this.menu.isOpen || this._nativeSuspended) return;
        this._nativeSuspended = true;
        // Release only the input grab; keep the drawer and icons visible.
        this.manager.removeMenu(this.menu);
        if (this.manager.activeMenu === this.menu) this.manager.activeMenu = null;
    }

    placeBelowNativeMenu(window) {
        if (!this._nativeSuspended) return;
        const actor = window.get_compositor_private();
        const windowParent = actor?.get_parent();
        if (!windowParent) return;
        const parent = windowParent === global.top_window_group ? Main.uiGroup : windowParent;
        const sibling = windowParent === global.top_window_group ? global.top_window_group : actor;
        if (!this._nativeStack) {
            this._nativeStack = [this._backdrop.surface, this.menu.actor].map(child => ({
                child, parent: child.get_parent(), index: child.get_parent().get_children().indexOf(child),
            }));
            this._nativeWindow = window;
            this._restackId = global.display.connect('restacked', () => this.placeBelowNativeMenu(this._nativeWindow));
        }
        for (const child of [this._backdrop.surface, this.menu.actor]) {
            if (child.get_parent() !== parent) {
                child.get_parent().remove_child(child);
                parent.add_child(child);
            }
            parent.set_child_below_sibling(child, sibling);
        }
    }

    _restoreNativeStack() {
        if (this._restackId) global.display.disconnect(this._restackId);
        this._restackId = 0;
        this._nativeWindow = null;
        for (const {child, parent, index} of (this._nativeStack ?? []).sort((a, b) => a.index - b.index)) {
            child.get_parent()?.remove_child(child);
            parent.insert_child_at_index(child, Math.min(index, parent.get_n_children()));
        }
        this._nativeStack = null;
    }

    resumeAfterNativeMenu() {
        if (!this._nativeSuspended || this._stopped) return;
        this._nativeSuspended = false;
        this._restoreNativeStack();
        this.manager.addMenu(this.menu);
        if (this.menu.isOpen) this.manager._onMenuOpenState(this.menu, true);
    }

    close() {
        this.resumeAfterNativeMenu();
        this.menu.close(BoxPointer.PopupAnimation.NONE);
    }

    _stop() {
        if (this._stopped)
            return;
        this._stopped = true;
        if (this._idle)
            GLib.Source.remove(this._idle);
        for (const [object, id] of this._signals)
            object.disconnect(id);
        for (const [child, ids] of this._children)
            ids.forEach(id => child.disconnect(id));
        this._children.clear();
    }

    destroy() {
        if (this._actorGone)
            return;
        this.close();
        this._stop();
        this.manager.removeMenu(this.menu);
        for (const child of this.overflowBox.get_children()) {
            this.overflowBox.remove_child(child);
            this.box.add_child(child);
            child._lunaTaskbarSetInDrawer?.(false);
        }
        this.box.get_parent()?.remove_child(this.box);
        const parent = this.actor.get_parent();
        parent.insert_child_at_index(this.box, parent.get_children().indexOf(this.actor));
        this._backdrop.destroy();
        this.menu.destroy();
        this.actor.destroy();
    }
}
