import {_} from '../i18n.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as MessageList from 'resource:///org/gnome/shell/ui/messageList.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {PopupAnimation} from 'resource:///org/gnome/shell/ui/boxpointer.js';
import {PopupBackdrop} from './popupBackdrop.js';
import {NotificationOrder} from './notificationOrder.js';

export class SystemPanel {
    constructor(records, manager, settings) {
        this._records = records;
        this._manager = manager;
        this._settings = settings;
        this._borrowed = [];
        this._surfaces = [];
        this.date = Main.panel.statusArea.dateMenu;
        this.quick = Main.panel.statusArea.quickSettings;
        this.menu = this.quick.menu;
        this._originalBinStyle = this.menu._boxPointer.bin.get_style();
        this._originalPointerStyle = this.menu._boxPointer.get_style();
        this._originalBoxStyle = this.menu.box.get_style();
        this.menu.close();
        this.date.menu.close();
        for (const record of records.values()) {
            if (![this.date, this.quick].includes(record.indicator)) continue;
            record.backdrop?.destroy();
            record.backdrop = null;
        }
        this.menu.actor.add_style_class_name('luna-taskbar-control-center');
        this.columns = new St.BoxLayout({style_class: 'luna-taskbar-center-columns'});
        this.left = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.END, x_expand: true});
        this.right = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'luna-taskbar-center-right', x_expand: true, y_align: Clutter.ActorAlign.END});
        this.columns.add_child(this.left);
        this.columns.add_child(this.right);
        this.media = this._card(_('Now Playing'), this.left);
        this.media.hide();
        this.weather = this._card(null, this.left);
        this.weather.hide();
        this.controls = this._card(_('Quick Settings'), this.left);
        this.notifications = this._card(_('Notifications'), this.right);
        this.notifications.add_style_class_name('luna-taskbar-notifications');
        this.notifications.clip_to_allocation = true;
        this._placeholderVisible = this.date._messageList._placeholder.visible;
        this.calendar = this._card(null, this.right);
        this._move(this.menu._grid, this.controls);
        this._move(this.date._messageList, this.notifications);
        const heading = this._notificationHeading = this.notifications.get_first_child();
        const header = new St.BoxLayout({style_class: 'luna-taskbar-center-header'});
        this.notifications.remove_child(heading);
        header.add_child(heading);
        heading.x_expand = true;
        this.notifications.insert_child_at_index(header, 0);
        this._notificationControls = this.date._messageList._clearButton.get_parent();
        this._notificationControlsVisible = this._notificationControls.visible;
        this._notificationControls.hide();
        this._move(this.date._messageList._clearButton, header);
        this._clearExpanded = this.date._messageList._clearButton.x_expand;
        this.date._messageList._clearButton.x_expand = false;
        this._move(this.date._date, this.calendar);
        this._move(this.date._calendar, this.calendar);
        this._calendarVisible = this.date._calendar.visible;
        this.calendar.remove_child(this.date._date);
        this.calendarHeader = new St.BoxLayout({style_class: 'luna-taskbar-center-header'});
        this.calendarHeader.add_child(this.date._date);
        this.calendarHeader.add_child(new St.Widget({x_expand: true}));
        this._calendarCollapseIcon = new St.Icon({icon_name: 'pan-up-symbolic', icon_size: 16});
        this._calendarCollapseButton = new St.Button({
            style_class: 'button luna-taskbar-calendar-collapse', can_focus: true,
            child: this._calendarCollapseIcon,
        });
        this._calendarCollapseButton.connect('clicked', () =>
            this._settings.set_boolean('calendar-collapsed', !this._settings.get_boolean('calendar-collapsed')));
        this.calendarHeader.add_child(this._calendarCollapseButton);
        this.calendar.insert_child_at_index(this.calendarHeader, 0);
        this._syncCalendarCollapse();
        this._calendarExpand = this.date._calendar.x_expand;
        this.date._calendar.x_expand = true;
        const expandDays = () => {
            for (const child of this.date._calendar.get_children()) child.x_expand = true;
        };
        this._calendarAddedId = this.date._calendar.connect('child-added', expandDays);
        this._calendarChildren = new Map(this.date._calendar.get_children().map(child => [child, child.x_expand]));
        expandDays();
        this._controlAllocationId = this.controls.connect('notify::allocation', () => {
            this.menu._grid.notify(_('x'));
            this.menu._grid.notify(_('y'));
        });
        this.menu.box.add_child(this.columns);
        for (const card of [this.media, this.weather, this.controls, this.notifications, this.calendar]) {
            const backdrop = new PopupBackdrop({actor: card}, settings);
            Main.uiGroup.set_child_below_sibling(backdrop.surface, this.menu.actor);
            backdrop._syncNow = backdrop._sync.bind(backdrop);
            backdrop._sync = () => this._queueSurfaces();
            this._surfaces.push(backdrop);
        }
        this._submenuMethods = new Map();
        const registerSubmenu = item => {
            const submenu = item.menu;
            if (!submenu || this._submenuMethods.has(submenu)) return;
            const original = {open: submenu.open, close: submenu.close};
            this._submenuMethods.set(submenu, original);
            submenu.open = () => original.open.call(submenu, PopupAnimation.NONE);
            submenu.close = () => original.close.call(submenu, PopupAnimation.NONE);
        };
        for (const item of this.menu._grid.get_children()) registerSubmenu(item);
        this._submenuAddedId = this.menu._grid.connect('child-added', (_grid, item) => registerSubmenu(item));
        this._setupMedia();
        this._notificationOrder = new NotificationOrder(this._mediaView);
        this._nativeDim = this.menu._setDimmed;
        this._gridOpacity = this.menu._grid.opacity;
        this.menu._setDimmed = dim => {
            this.menu._boxPointer.remove_transition('@effects.dim.brightness');
            this.menu._dimEffect.enabled = false;
            this.menu._grid.opacity = dim ? 170 : 255;
        };
        this._quickOpen = this.menu.open;
        this._quickClose = this.menu.close;
        this._quickToggle = this.menu.toggle;
        this._animationSignals = ['notify::translation-x', 'notify::opacity'].map(signal =>
            this.menu.actor.connect(signal, () => this._queueSurfaces()));
        this.menu.open = (section = 'system') => {
            if (!this._bounds()) return;
            const separate = this._settings.get_boolean('separate-applet-panels');
            if (this.menu.isOpen && !this._closing && (!separate || this._activeSection === section)) return;
            this.menu._activeMenu?.close(PopupAnimation.NONE);
            this._activeSection = section;
            this._position();
            this._closing = false;
            this.menu.actor.remove_all_transitions();
            const animated = St.Settings.get().enable_animations;
            this.menu.actor.translation_x = 0;
            this.menu.actor.opacity = 255;
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            const cards = [this.calendar, this.controls, this.weather, this.media, this.notifications];
            for (const card of cards) {
                card.remove_all_transitions();
                card.translation_x = animated && card.visible && card.get_parent().visible ? 18 * scale : 0;
                card.translation_y = animated && card.visible && card.get_parent().visible ? 6 * scale : 0;
                card.opacity = animated && card.visible && card.get_parent().visible ? 0 : 255;
            }
            this._quickOpen.call(this.menu, PopupAnimation.NONE);
            cards.filter(card => card.visible && card.get_parent().visible).forEach((card, index) => {
                card.ease({translation_x: 0, translation_y: 0, opacity: 255,
                    delay: animated ? index * 28 : 0, duration: animated ? 180 : 0,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            });
            this._syncHighlight();
        };
        this.menu.toggle = (section = 'system') => {
            const same = !this._settings.get_boolean('separate-applet-panels') || this._activeSection === section;
            if (this.menu.isOpen && !this._closing && same) this.menu.close();
            else this.menu.open(section);
        };
        this._handleAppletPress = manager.handleAppletPress;
        manager.handleAppletPress = actor => {
            if (this.menu.isOpen && this._settings.get_boolean('separate-applet-panels') && actor) {
                if (this.date.contains(actor)) { this.menu.toggle('calendar'); return true; }
                if (this.quick.contains(actor)) { this.menu.toggle('system'); return true; }
            }
            return this._handleAppletPress?.(actor) ?? false;
        };
        this.menu.close = () => {
            if (!this.menu.isOpen || this._closing) return;
            this._closing = true;
            for (const surface of this._surfaces) surface.menu.actor.remove_all_transitions();
            this.menu.actor.remove_all_transitions();
            const finish = () => {
                for (const surface of this._surfaces) surface.surface.hide();
                this._quickClose.call(this.menu, PopupAnimation.NONE);
                this._closing = false;
                this.menu.actor.translation_x = 0;
                this.menu.actor.opacity = 255;
            };
            if (!St.Settings.get().enable_animations) { finish(); return; }
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            const cards = [this.notifications, this.media, this.weather, this.controls, this.calendar]
                .filter(card => card.visible && card.get_parent().visible);
            if (!cards.length) { finish(); return; }
            cards.forEach((card, index) => {
                card.ease({translation_x: 18 * scale, translation_y: 6 * scale, opacity: 0,
                    delay: index * 20, duration: 105, mode: Clutter.AnimationMode.EASE_IN_CUBIC,
                    ...(index === cards.length - 1 ? {onComplete: finish} : {})});
            });
        };
        this._outsideId = this.menu.actor.connect('captured-event', (_stage, event) => {
            if (!this.menu.isOpen || ![Clutter.EventType.BUTTON_PRESS, Clutter.EventType.TOUCH_BEGIN].includes(event.type()))
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = event.get_coords();
            const inside = actor => {
                if (!actor?.mapped) return false;
                const [ax, ay] = actor.get_transformed_position();
                const [aw, ah] = actor.get_transformed_size();
                return x >= ax && x < ax + aw && y >= ay && y < ay + ah;
            };
            if ([this.media, this.weather, this.controls, this.notifications, this.calendar, this.menu._activeMenu?.actor].some(inside))
                return Clutter.EVENT_PROPAGATE;
            this.menu.close();
            return Clutter.EVENT_STOP;
        });
        this._dateMethods = {};
        for (const method of ['open', 'toggle', 'close']) {
            this._dateMethods[method] = this.date.menu[method];
            this.date.menu[method] = () => this.menu[method]('calendar');
        }
        this._findMenu = manager._findMenuForSource;
        manager._findMenuForSource = actor => actor && this.date.contains(actor)
            ? this.menu : this._findMenu.call(manager, actor);
        let bar = this.quick;
        while (bar && bar.name !== 'luna-taskbar') bar = bar.get_parent();
        this._bar = bar;
        if (bar) {
            this._highlight = new St.Widget({style_class: 'luna-taskbar-system-active-group',
                reactive: false, visible: false, x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.START});
            bar.insert_child_below(this._highlight, bar.get_last_child());
        }
        this._highlightIds = [this.date, this.quick].map(button =>
            [button, button.connect('notify::allocation', () => this._syncHighlight())]);
        this._openId = this.menu.connect('open-state-changed', (_menu, open) => {
            for (const button of [this.date, this.quick]) {
                if (open) button.add_style_class_name('luna-taskbar-applet-open');
                else button.remove_style_class_name('luna-taskbar-applet-open');
            }
            this._syncHighlight();
            if (open) {
                const today = new Date();
                this.date._calendar.setDate(today);
                this.date._date.setDate(today);
                this.date._eventsItem.setDate(today);
                this._position();
                let frames = 0;
                if (this._settleId) GLib.Source.remove(this._settleId);
                this._settleId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                    this._syncSurfaces();
                    if (++frames < 25 && this.menu.isOpen) return GLib.SOURCE_CONTINUE;
                    this._settleId = 0;
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
        this._settingsId = settings.connect('changed', (_settings, key) => {
            if (key === 'calendar-collapsed') this._syncCalendarCollapse();
            this._position();
        });
        this._monitorId = Main.layoutManager.connect('monitors-changed', () => this.menu.close());
        const pointer = this.menu._boxPointer;
        this._reposition = pointer._reposition;
        pointer._reposition = box => {
            const bounds = this._bounds();
            if (!bounds) return;
            this._reposition.call(pointer, box);
            const {x, y} = bounds;
            let parent = pointer.get_parent();
            while (parent) {
                const [ok, px, py] = parent.transform_stage_point(x, y);
                if (ok) { box.set_origin(px, py); break; }
                parent = parent.get_parent();
            }
        };
        this._notificationSignals = new Map();
        this._sourceAddedId = Main.messageTray.connect('source-added', (_tray, source) => {
            this._watchNotifications(source);
            this._queueNotificationSize();
        });
        this._sourceRemovedId = Main.messageTray.connect('source-removed', (_tray, source) => {
            const id = this._notificationSignals.get(source);
            if (id) source.disconnect(id);
            this._notificationSignals.delete(source);
            this._queueNotificationSize();
        });
        for (const source of Main.messageTray.getSources()) this._watchNotifications(source);
        this._notificationExpandedId = this._mediaView.connect('notify::expanded-group', () => this._queueNotificationSize());
        this._notificationAllocationId = this._mediaView.connect('notify::allocation', () => this._queueNotificationSize());
        this._position();
    }

    _watchNotifications(source) {
        if (this._notificationSignals.has(source)) return;
        this._notificationSignals.set(source, source.connect('notify::count', () => this._queueNotificationSize()));
    }

    _syncCalendarCollapse() {
        const collapsed = this._settings.get_boolean('calendar-collapsed');
        this.date._calendar.visible = !collapsed;
        this._calendarCollapseIcon.icon_name = collapsed ? 'pan-down-symbolic' : 'pan-up-symbolic';
        this._calendarCollapseButton.accessible_name = collapsed ? _('Show full calendar') : _('Minimize calendar');
    }

    _queueNotificationSize() {
        if (this._notificationResize) return;
        let frames = 0;
        this._notificationResize = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => {
            this._sizeNotifications();
            if (++frames < 16) return GLib.SOURCE_CONTINUE;
            this._notificationResize = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _sizeNotifications() {
        const bounds = this._bounds();
        if (!bounds) return;
        const {width, height, scale} = bounds;
        const columnWidth = this._settings.get_boolean('separate-applet-panels') ? width : (width - 12 * scale) / 2;
        const calendarHeight = this.calendar.get_preferred_height(columnWidth)[1];
        const weatherHeight = this.weather.visible && this.weather.get_parent() === this.right
            ? this.weather.get_preferred_height(columnWidth)[1] + 12 * scale : 0;
        const available = Math.max(80 * scale, height - calendarHeight - weatherHeight - 12 * scale);
        const count = Main.messageTray.getSources().reduce((sum, source) => sum + source.count, 0);
        // Measure the full notification content, then include the actual chrome of
        // every ancestor. ScrollView's preferred height can shrink to its viewport.
        const cardNode = this.notifications.get_theme_node();
        const innerWidth = cardNode.adjust_for_width(columnWidth);
        let contentHeight = this._mediaView.get_preferred_height(innerWidth)[1];
        // GNOME includes scroll overshoot above/below an expanded group. Account
        // for its full scroll extent so a fitting group does not gain a scrollbar.
        if (this._mediaView.expandedGroup)
            contentHeight = Math.max(contentHeight, this._mediaView._scrollViewAdjustment?.upper ?? 0);
        let child = this._mediaView;
        for (let parent = child.get_parent(); parent; child = parent, parent = parent.get_parent()) {
            const node = parent.get_theme_node();
            const siblings = parent.get_children().filter(actor => actor.visible && actor !== child);
            if (parent instanceof St.BoxLayout) {
                contentHeight += siblings.reduce((sum, actor) => sum + actor.get_preferred_height(innerWidth)[1], 0);
                contentHeight += siblings.length * node.get_length('spacing');
            } else if (!(parent instanceof St.ScrollView)) {
                contentHeight = Math.max(contentHeight, ...siblings.map(actor => actor.get_preferred_height(innerWidth)[1]));
            }
            contentHeight = node.adjust_preferred_height(contentHeight, contentHeight)[1];
            if (parent === this.notifications) break;
        }
        const headerHeight = this.notifications.get_first_child().get_preferred_height(columnWidth - 28 * scale)[1];
        const emptyHeight = this.date._messageList._placeholder.get_preferred_height(columnWidth - 28 * scale)[1];
        const emptyMinimum = Math.max(160 * scale, headerHeight + emptyHeight + 48 * scale);
        const compactEmpty = !count && available < emptyMinimum;
        this.date._messageList._placeholder.visible = !count && !compactEmpty;
        this._notificationHeading.text = compactEmpty ? _('No notifications') : _('Notifications');
        const desired = count ? Math.max(emptyMinimum + 24 * scale, Math.ceil(contentHeight)) : emptyMinimum;
        const target = Math.min(available, desired);
        if (this.notifications.height !== target) this.notifications.set_height(target);
    }

    _syncCombinedButton() {
        if (this._restoringCombined) return;
        const combined = !this._settings.get_boolean('separate-applet-panels');
        if (combined === !!this._combinedButton) return;
        if (!combined) { this._restoreCombinedButton(); return; }
        const clock = this.date.get_first_child();
        const controls = this.quick.get_first_child();
        this._combinedButton = {clock, controls, visible: this.date.container.visible,
            accessibleName: this.quick.accessible_name};
        this.date.remove_child(clock);
        this.quick.remove_child(controls);
        const contents = new St.BoxLayout({style_class: 'luna-taskbar-combined-applet', x_expand: false});
        contents.add_child(clock);
        contents.add_child(controls);
        this.quick.add_child(contents);
        this.date.container.hide();
        this.quick.accessible_name = _('System controls, notifications and calendar');
    }

    _restoreCombinedButton() {
        if (!this._combinedButton) return;
        this._restoringCombined = true;
        const {clock, controls, accessibleName} = this._combinedButton;
        const contents = this.quick.get_first_child();
        contents.remove_child(clock);
        contents.remove_child(controls);
        this.quick.remove_child(contents);
        this.quick.add_child(controls);
        this.date.add_child(clock);
        contents.destroy();
        this.date.container.show();
        this.date.show();
        this.quick.accessible_name = accessibleName;
        this._combinedButton = null;
        this._restoringCombined = false;
    }

    _syncHighlight() {
        if (!this._highlight) return;
        const parent = this.date.get_parent();
        const children = parent?.get_children() ?? [];
        const adjacent = parent === this.quick.get_parent() &&
            Math.abs(children.indexOf(this.date) - children.indexOf(this.quick)) === 1;
        const separate = this._settings.get_boolean('separate-applet-panels');
        const shared = adjacent && this.menu.isOpen && !separate && !this._combinedButton;
        this._highlight.visible = shared;
        for (const button of [this.date, this.quick]) {
            const active = this.menu.isOpen && (!separate ||
                (button === this.date ? this._activeSection === 'calendar' : this._activeSection !== 'calendar'));
            if (active) button.add_style_class_name('luna-taskbar-applet-open');
            else button.remove_style_class_name('luna-taskbar-applet-open');
            if (shared) button.add_style_class_name('luna-taskbar-system-shared-open');
            else button.remove_style_class_name('luna-taskbar-system-shared-open');
        }
        if (!shared) return;
        const [bx, by] = this._bar.get_transformed_position();
        const [dx] = this.date.get_transformed_position();
        const [qx] = this.quick.get_transformed_position();
        const left = Math.min(dx, qx);
        const right = Math.max(dx + this.date.width, qx + this.quick.width);
        const inset = 3 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._highlight.set_size(right - left, Math.max(1, this._bar.height - 2 * inset));
        this._highlight.translation_x = left - bx;
        this._highlight.translation_y = inset;
    }

    _updatePlayerIcon(player) {
        if (player.source.icon) return;
        const normalize = value => (value ?? '').replace(/\.desktop$/i, '').toLowerCase();
        const desktop = normalize(player._mprisProxy?.DesktopEntry);
        const identity = normalize(player._mprisProxy?.Identity);
        const matches = info => {
            const id = normalize(info.get_id());
            return (desktop && (id === desktop || id.endsWith(`.${desktop}`))) ||
                (identity && normalize(info.get_name()) === identity);
        };
        const apps = Shell.AppSystem.get_default();
        const running = apps.get_running().find(app =>
            (app.get_app_info() && matches(app.get_app_info())) || normalize(app.get_name()) === identity);
        const info = running?.get_app_info() ?? Gio.AppInfo.get_all().find(matches);
        let icon = info?.get_icon() ?? running?.get_icon();
        if (!icon) {
            const theme = new St.IconTheme();
            const name = [desktop, identity].filter(Boolean).find(candidate => theme.has_icon(candidate));
            if (name) icon = new Gio.ThemedIcon({name});
        }
        if (icon) player.source.icon = icon;
    }

    _setupMedia() {
        const view = this.date._messageList._messageView;
        this._mediaView = view;
        this._nativeAddPlayer = view._addPlayer;
        this._nativeRemovePlayer = view._removePlayer;
        this._players = new Map();
        // Remove only the media rows, leaving notification groups and their model intact.
        for (const message of view._playerToMessage.values()) message.get_parent().destroy();
        view._playerToMessage.clear();
        view.notify(_('empty'));
        view.notify(_('can-clear'));
        view._addPlayer = player => {
            if (this._players.has(player)) return;
            const message = new MessageList.MediaMessage(player);
            message.add_style_class_name('luna-taskbar-media-player');
            this._updatePlayerIcon(player);
            player.connectObject('changed', () => this._updatePlayerIcon(player), message);
            this._players.set(player, message);
            this.media.add_child(message);
            this.media.show();
        };
        view._removePlayer = player => {
            this._players.get(player)?.destroy();
            this._players.delete(player);
            this.media.visible = this._players.size > 0;
        };
        for (const player of view._mediaSource.players) view._addPlayer(player);
    }

    _restoreMedia() {
        const view = this._mediaView;
        view._addPlayer = this._nativeAddPlayer;
        view._removePlayer = this._nativeRemovePlayer;
        for (const message of this._players.values()) message.destroy();
        this._players.clear();
        for (const player of view._mediaSource.players) view._addPlayer(player);
    }

    _queueSurfaces() {
        if (this._surfaceLater || this._destroying) return;
        this._surfaceLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._surfaceLater = 0;
            this._syncSurfaces();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncSurfaces() {
        for (const surface of this._surfaces) {
            surface._syncNow();
            surface.surface.opacity = Math.round(surface.menu.actor.opacity * this.menu.actor.opacity / 255);
        }
    }

    _card(title, parent, expand = false) {
        const card = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'luna-taskbar-center-card', x_expand: true, y_expand: expand});
        if (title) card.add_child(new St.Label({text: title, style_class: 'luna-taskbar-center-heading'}));
        parent.add_child(card);
        return card;
    }

    _move(actor, parent) {
        const original = actor.get_parent();
        this._borrowed.push({actor, parent: original, index: original.get_children().indexOf(actor)});
        original.remove_child(actor);
        parent.add_child(actor);
    }

    _bounds() {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const monitor = Main.layoutManager.findMonitorForActor(this.quick) ?? Main.layoutManager.primaryMonitor;
        if (!monitor) return null;
        let bar = this.quick;
        while (bar && bar.name !== 'luna-taskbar') bar = bar.get_parent();
        const edge = this._settings.get_int('panel-edge-gap') * scale;
        const bottom = (bar?.get_transformed_position()[1] ?? monitor.y + monitor.height) -
            this._settings.get_int('panel-taskbar-gap') * scale;
        const width = Math.min((this._settings.get_boolean('separate-applet-panels') ? 374 : 760) * scale, monitor.width - 2 * edge);
        return {x: monitor.x + monitor.width - edge - width, y: monitor.y + edge,
            width, height: Math.max(100 * scale, bottom - monitor.y - edge), scale};
    }

    _position() {
        this._syncCombinedButton();
        const separate = this._settings.get_boolean('separate-applet-panels');
        const place = (column, cards) => {
            for (const card of cards) {
                if (card.get_parent() !== column) {
                    card.get_parent()?.remove_child(card);
                    column.add_child(card);
                }
            }
            cards.forEach((card, index) => column.set_child_at_index(card, index));
        };
        if (separate) {
            place(this.left, [this.media, this.controls]);
            place(this.right, [this.notifications, this.weather, this.calendar]);
        } else {
            place(this.left, [this.media, this.weather, this.calendar]);
            place(this.right, [this.notifications, this.controls]);
        }
        if (this._settings.get_boolean('panel-transparency')) this.menu.actor.add_style_class_name('luna-taskbar-glass');
        else this.menu.actor.remove_style_class_name('luna-taskbar-glass');
        const bounds = this._bounds();
        if (!bounds) return;
        const {width, height, scale} = bounds;
        this.menu._boxPointer.bin.set_style('padding: 0; margin: 0;');
        this.menu.box.set_style(`padding: 0; margin: 0; width: ${width / scale}px; min-width: ${width / scale}px; max-width: ${width / scale}px;`);
        this.menu._boxPointer.set_style('padding: 0; margin: 0; -arrow-rise: 0; -arrow-base: 0; -arrow-border-width: 0; -arrow-background-color: transparent; -arrow-border-color: transparent;');
        this.columns.set_size(width, height);
        this.left.visible = !separate || this._activeSection !== 'calendar';
        this.right.visible = !separate || this._activeSection === 'calendar';
        const columnWidth = separate ? width / scale : (width / scale - 12) / 2;
        this.left.set_style(`width: ${columnWidth}px; min-width: ${columnWidth}px; max-width: ${columnWidth}px; spacing: 12px;`);
        this.right.set_style(`width: ${columnWidth}px; min-width: ${columnWidth}px; max-width: ${columnWidth}px;`);
        // Keep card geometry independent of the content's preferred width while
        // notification rows animate away and the empty placeholder takes over.
        for (const card of [this.media, this.weather, this.controls, this.notifications, this.calendar])
            card.set_width(columnWidth * scale);
        this.notifications.set_style(`min-height: 80px;`);
        this._sizeNotifications();
        this._syncHighlight();
        this.menu._boxPointer.queue_relayout();
    }

    destroy() {
        this._destroying = true;
        this._restoreCombinedButton();
        if (this._surfaceLater) global.compositor.get_laters().remove(this._surfaceLater);
        if (this._notificationResize) GLib.Source.remove(this._notificationResize);
        Main.messageTray.disconnect(this._sourceAddedId);
        Main.messageTray.disconnect(this._sourceRemovedId);
        for (const [source, id] of this._notificationSignals) source.disconnect(id);
        this.menu.actor.remove_all_transitions();
        this._quickClose.call(this.menu, PopupAnimation.NONE);
        this.menu.actor.translation_x = 0;
        this.menu.actor.opacity = 255;
        for (const id of this._animationSignals) this.menu.actor.disconnect(id);
        if (this._settleId) GLib.Source.remove(this._settleId);
        this.menu.disconnect(this._openId);
        for (const [button, id] of this._highlightIds) {
            button.disconnect(id);
            button.remove_style_class_name('luna-taskbar-system-shared-open');
        }
        this._highlight?.destroy();
        this.menu.actor.disconnect(this._outsideId);
        this.menu._setDimmed = this._nativeDim;
        this.menu._grid.opacity = this._gridOpacity;
        this.menu.open = this._quickOpen;
        this.menu.close = this._quickClose;
        this.menu.toggle = this._quickToggle;
        this._manager.handleAppletPress = this._handleAppletPress;
        this._settings.disconnect(this._settingsId);
        Main.layoutManager.disconnect(this._monitorId);
        this.menu._grid.disconnect(this._submenuAddedId);
        for (const [submenu, methods] of this._submenuMethods) {
            submenu.open = methods.open;
            submenu.close = methods.close;
        }
        this._manager._findMenuForSource = this._findMenu;
        for (const [method, original] of Object.entries(this._dateMethods)) this.date.menu[method] = original;
        this.menu._boxPointer._reposition = this._reposition;
        this.menu._boxPointer.set_style(this._originalPointerStyle);
        this.menu._boxPointer.bin.set_style(this._originalBinStyle);
        for (const surface of this._surfaces) {
            surface.menu.actor.remove_all_transitions();
            surface.destroy();
        }
        this.controls.disconnect(this._controlAllocationId);
        this._mediaView.disconnect(this._notificationAllocationId);
        this._mediaView.disconnect(this._notificationExpandedId);
        this._notificationControls.visible = this._notificationControlsVisible;
        this.date._messageList._placeholder.visible = this._placeholderVisible;
        this.date._calendar.disconnect(this._calendarAddedId);
        this.date._calendar.visible = this._calendarVisible;
        this.date._calendar.x_expand = this._calendarExpand;
        for (const child of this.date._calendar.get_children())
            child.x_expand = this._calendarChildren.get(child) ?? false;
        this.date._messageList._clearButton.x_expand = this._clearExpanded;
        for (const {actor, parent, index} of this._borrowed) {
            actor.get_parent().remove_child(actor);
            parent.insert_child_at_index(actor, index);
        }
        this._notificationOrder.destroy();
        this._restoreMedia();
        this.columns.destroy();
        this.menu.box.set_style(this._originalBoxStyle);
        this.menu.actor.remove_style_class_name('luna-taskbar-control-center');
        this.menu.actor.remove_style_class_name('luna-taskbar-glass');
        for (const record of this._records.values()) {
            if ([this.date, this.quick].includes(record.indicator))
                record.backdrop = new PopupBackdrop(record.indicator.menu, this._settings);
        }
    }
}
