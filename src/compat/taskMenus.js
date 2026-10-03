import {_} from '../i18n.js';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WindowMenu from 'resource:///org/gnome/shell/ui/windowMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {ClickMenuManager} from './menuManager.js';

class TaskAppMenu extends AppMenu.AppMenu {
    _updateFavoriteItem() {
        super._updateFavoriteItem();
        if (this._app && this._toggleFavoriteItem.visible)
            this._toggleFavoriteItem.label.text = this._appFavorites.isFavorite(this._app.get_id())
                ? _('Unpin from taskbar') : _('Pin to taskbar');
    }
}

export class TaskMenus {
    constructor(bar, settings, onOpen, openPreferences, showDesktop, editTaskbar) {
        this._editTaskbar = editTaskbar;
        this._settings = settings;
        this._showDesktop = showDesktop;
        this._openPreferences = openPreferences;
        this._onOpen = onOpen;
        this._manager = new ClickMenuManager(bar);
        this._anchor = new St.Widget({width: 1, height: 1, opacity: 0});
        Main.uiGroup.add_child(this._anchor);
    }

    _install(menu, source) {
        this.menu = menu;
        this._source = source;
        this._sourceId = source.connect('destroy', () => this.close());
        this._openStateId = menu.connect('open-state-changed', () => {
            if (source === this._anchor) return;
            if (menu.isOpen) source.add_style_class_name('luna-taskbar-context-open');
            else source.remove_style_class_name('luna-taskbar-context-open');
        });
        if (!menu.actor.get_parent())
            Main.uiGroup.add_child(menu.actor);
        menu.actor.hide();
        this._manager.addMenu(menu);
        this._onOpen();
        // Allocate the invisible anchor before BoxPointer computes its position.
        // A reused anchor otherwise retains its previous allocation for one frame.
        if (source === this._anchor)
            source.allocate(new Clutter.ActorBox({x1: source.x, y1: source.y,
                x2: source.x + 1, y2: source.y + 1}));
        menu.open({animate: false});
        menu.actor.opacity = 0;
        menu.actor.connectObject('notify::allocation', () => {
            if (menu.actor.has_allocation()) {
                menu.actor.disconnectObject(menu);
                menu.actor.opacity = 255;
            }
        }, menu);
    }

    openTask(task, button) {
        this.close();
        const {app} = task;
        const menu = app
            ? new TaskAppMenu(button, St.Side.BOTTOM, {favoritesSection: true, showSingleWindows: true})
            : new PopupMenu.PopupMenu(button, 0.5, St.Side.BOTTOM);
        if (app)
            menu.setApp(app);
        this._install(menu, button);
    }

    openWindow(window, x, y) {
        this.close();
        this._anchor.set_position(x, y);
        const menu = new WindowMenu.WindowMenu(window, this._anchor);
        menu._boxPointer.updateArrowSide(St.Side.BOTTOM);
        this._window = window;
        this._windowId = window.connect('unmanaged', () => this.close());
        this._install(menu, this._anchor);
    }

    openBar(x, y) {
        this.close();
        this._anchor.set_position(x, y);
        const menu = new PopupMenu.PopupMenu(this._anchor, 0, St.Side.BOTTOM);
        if (this._settings.get_boolean('menu-show-applications'))
            menu.addAction(_('Show applications'), () => Main.overview.showApps());
        if (this._settings.get_boolean('menu-show-desktop'))
            menu.addAction(_('Show desktop'), this._showDesktop);
        const shortcut = Shell.AppSystem.get_default().lookup_app(this._settings.get_string('menu-shortcut-app'));
        if (this._settings.get_boolean('menu-show-shortcut') && shortcut)
            menu.addAction(shortcut.get_name(), () => shortcut.activate());
        if (menu.numMenuItems > 0)
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addAction(_('Edit taskbar'), this._editTaskbar);
        menu.addAction(_('Taskbar settings'), this._openPreferences);
        this._install(menu, this._anchor);
    }

    close() {
        if (!this.menu)
            return;
        if (this._window) {
            this._window.disconnect(this._windowId);
            this._window = null;
            this._windowId = 0;
        }
        this._source.disconnect(this._sourceId);
        this._source.remove_style_class_name('luna-taskbar-context-open');
        this._source = null;
        this.menu.disconnect(this._openStateId);
        this._openStateId = 0;
        this.menu.close({animate: false});
        this._manager.removeMenu(this.menu);
        this.menu.destroy();
        this.menu = null;
    }

    destroy() {
        this.close();
        this._anchor.destroy();
    }
}
