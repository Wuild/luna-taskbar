import {PopupBackdrop} from '../popupBackdrop.js';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {call} from './dbus.js';
import {resolveMenuAction} from './actions.js';

const IFACE = 'com.canonical.dbusmenu';

export class RemoteMenu {
    constructor(bus, service, path, button, cancellable, logger, settings) {
        Object.assign(this, {bus, service, path, cancellable, logger});
        this.menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.BOTTOM);
        this.menu.actor.add_style_class_name('luna-taskbar-popup');
        Main.uiGroup.add_child(this.menu.actor);
        this.menu.actor.hide();
        this._backdrop = new PopupBackdrop(this.menu, settings);
        this.manager = new PopupMenu.PopupMenuManager(button);
        this.manager.addMenu(this.menu);
        // Load a fresh snapshot on each opening. Rebuilding rows underneath a
        // pointer press can destroy the target before its release is delivered.
        // Activation resolves current IDs and enabled state against a new layout.

    }

    _call(method, params) {
        return call(this.bus, this.service, this.path, IFACE, method, params, this.cancellable);
    }

    _report(error) {
        if (!this.cancellable.is_cancelled() && !this._destroyed)
            this.logger.warn(`Tray menu: ${error.message}`);
    }

    async toggle() {
        if (this.menu.isOpen) {
            this.menu.close();
            return;
        }
        try {
            await this._call('AboutToShow', new GLib.Variant('(i)', [0]));
        } catch {
            // Static menus may not implement AboutToShow.
        }
        await this._load();
        if (!this._destroyed)
            this.menu.open();
    }

    async _load() {
        const generation = this._generation = (this._generation ?? 0) + 1;
        const [, layout] = await this._call('GetLayout',
            new GLib.Variant('(iias)', [0, -1, []]));
        if (this._destroyed || generation !== this._generation)
            return;
        this.menu.removeAll();
        this._append(this.menu, layout[2], 0);
    }

    _append(menu, children, depth, route = []) {
        if (depth > 8)
            return;
        for (const [index, [id, props, descendants]] of children.slice(0, 200).entries()) {
            const itemRoute = [...route, {label: props.label, index}];
            if (props.visible === false)
                continue;
            if (props.type === 'separator') {
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                continue;
            }
            const label = (props.label || '').replace(/_([^_])/g, '$1').replace(/__/g, '_');
            let item;
            if (props['children-display'] === 'submenu' || descendants.length) {
                item = new PopupMenu.PopupSubMenuMenuItem(label);
                this._append(item.menu, descendants, depth + 1, itemRoute);
                item.menu.connect('open-state-changed', (_menu, open) => {
                    if (!open)
                        return;
                    this._loadSubmenu(item, itemRoute, depth)
                        .catch(error => this._report(error));
                });
            } else {
                item = new PopupMenu.PopupMenuItem(label);
                item.connect('activate', () => {
                    this._activate(itemRoute, global.get_current_time())
                        .catch(error => this._report(error));
                });
            }
            item.setSensitive(props.enabled !== false);
            if (props['toggle-state'] === 1)
                item.setOrnament(props['toggle-type'] === 'radio'
                    ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.CHECK);
            menu.addMenuItem(item);
        }
    }

    async _loadSubmenu(item, route, depth) {
        let [, layout] = await this._call('GetLayout', new GLib.Variant('(iias)', [0, -1, []]));
        const submenu = resolveMenuAction(layout, route);
        if (!submenu || this._destroyed || !item.menu.isOpen) return;
        try { await this._call('AboutToShow', new GLib.Variant('(i)', [submenu[0]])); }
        catch { /* Optional for static submenus. */ }
        [, layout] = await this._call('GetLayout', new GLib.Variant('(iias)', [0, -1, []]));
        const fresh = resolveMenuAction(layout, route);
        if (!fresh || this._destroyed || !item.menu.isOpen) return;
        item.menu.removeAll();
        this._append(item.menu, fresh[2], depth + 1, route);
    }

    async _activate(route, timestamp) {
        const [, layout] = await this._call('GetLayout', new GLib.Variant('(iias)', [0, -1, []]));
        if (this._destroyed || this.cancellable.is_cancelled()) return;
        const action = resolveMenuAction(layout, route);
        if (!action) return;
        this.logger.log(`Tray menu action: service=${this.service}, id=${action[0]}`);
        await this._call('Event', new GLib.Variant('(isvu)',
            [action[0], 'clicked', new GLib.Variant('i', 0), timestamp]));
    }

    destroy() {
        this._destroyed = true;
        this.manager.removeMenu(this.menu);
        this.menu.destroy();
    }
}
