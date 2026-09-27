import {styleStartButton} from '../start-menu/buttonStyle.js';
import {anchorTaskbarMenu} from './taskbarMenuAnchor.js';
import {SystemPanel} from './systemPanel.js';
import {SystemButtonIcons} from './systemButton.js';
import {rememberTrayItem} from './tray/identity.js';
import {PopupBackdrop} from './popupBackdrop.js';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ClickMenuManager} from './menuManager.js';

export class PanelBridge {
    constructor(tray, system, settings, launcher, onArcMenuChanged, onArcMenuOpenChanged) {
        this._onArcMenuChanged = onArcMenuChanged;
        this._onArcMenuOpenChanged = onArcMenuOpenChanged;
        this._launcher = launcher;
        this._settings = settings;
        this._tray = tray;
        this._system = system;
        this._quickIndicators = Main.panel.statusArea.quickSettings?._indicators;
        this._quickOrientation = this._quickIndicators?.orientation;
        this._records = new Map();
        this._menuManager = new ClickMenuManager(system);
        this._sources = [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox];
        this._sourceSignals = this._sources.map(box =>
            [box, box.connect('child-added', () => this._queueSync())]);
        this._launcherSettingId = settings.connect('changed::launcher-menu', () => this._queueSync());
        this._startStyleId = settings.connect('changed', () => this._styleStartButtons());
        this._panelVisible = Main.panel.visible;
        Main.panel.hide();
        this._sync();
        this._configureCalendar();
        this._systemIcons = new SystemButtonIcons(Main.panel.statusArea.quickSettings, settings);
        this._unifiedId = settings.connect('changed::unified-system-panel', () => this._syncSystemPanel());
        this._syncSystemPanel();
    }

    setEdge(edge) {
        const side = St.Side[edge.toUpperCase()];
        if (this._edgeSide === side) return;
        this._edgeSide = side;
        const vertical = edge === 'left' || edge === 'right';
        for (const record of this._records.values()) {
            record.actor.y_expand = vertical ? false : record.yExpand;
            record.indicator.menu?._boxPointer?.updateArrowSide(side);
            for (const {menu} of record.arcMenus ?? []) menu._boxPointer.updateArrowSide(side);
        }
    }

    _configureCalendar() {
        const calendar = Main.panel.statusArea.dateMenu._calendar;
        const originalWeekStart = calendar._getWeekStartDay;
        calendar._getWeekStartDay = () => {
            const selected = this._settings.get_string('calendar-week-start');
            return selected === 'monday' ? 1 : selected === 'sunday' ? 0 : originalWeekStart.call(calendar);
        };
        const update = () => {
            calendar._weekStart = calendar._getWeekStartDay();
            calendar._useWeekdate = this._settings.get_boolean('calendar-week-numbers');
            calendar._buildHeader();
            calendar._rebuildCalendar();
            calendar._update();
        };
        const settingsId = this._settings.connect('changed', (_settings, key) => {
            if (key.startsWith('calendar-')) update();
        });
        const nativeId = calendar._settings.connect('changed', update);
        update();
        this._restoreCalendar = () => {
            this._settings.disconnect(settingsId);
            calendar._settings.disconnect(nativeId);
            calendar._getWeekStartDay = originalWeekStart;
            calendar._onSettingsChange();
        };
    }

    _syncSystemPanel() {
        this.weatherApplet?.detach();
        this._systemPanel?.destroy();
        this._systemPanel = null;
        if (this._settings.get_boolean('unified-system-panel'))
            this._systemPanel = new SystemPanel(this._records, this._menuManager, this._settings);
        this.weatherApplet?.place();
    }

    _queueSync() {
        if (this._idle)
            return;
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sync() {
        const positions = new Map();
        for (const parent of this._sources)
            parent.get_children().forEach((actor, index) => positions.set(actor, {parent, index}));
        for (const record of this._records.values()) {
            if (record.actor.get_parent())
                positions.set(record.actor, {parent: record.parent, index: record.index});
        }
        for (const [role, indicator] of Object.entries(Main.panel.statusArea)) {
            if (!indicator || role === 'activities')
                continue;
            // Luna - Taskbar owns modern tray rendering; preserve the existing legacy
            // path only while a competing XEmbed owner is still enabled.
            if (role.startsWith('appindicator-') && !role.startsWith('appindicator-legacy:'))
                continue;
            const actor = indicator.container;
            if (!positions.has(actor))
                continue;
            let record = this._records.get(actor);
            if (!record) {
                record = {role, actor, indicator, ...positions.get(actor),
                    expand: actor.x_expand, expandSet: actor.x_expand_set, yExpand: actor.y_expand, yExpandSet: actor.y_expand_set};
                // Native panel buttons request expansion. Their taskbar containers
                // must stay at natural width, leaving spare space to the app strip.
                actor.x_expand = false;
                if ([St.Side.LEFT, St.Side.RIGHT].includes(this._edgeSide)) actor.y_expand = false;
                record.destroyId = actor.connect('destroy', () => {
                    this._records.delete(actor);
                    if (role === 'ArcMenu') this._onArcMenuChanged(false);
                });
                record.menuId = indicator.connect('menu-set', () => this._orientMenu(record));
                this._records.set(actor, record);
                if (['dateMenu', 'quickSettings'].includes(role))
                    indicator.add_style_class_name('luna-taskbar-system-applet');
                if (role === 'dateMenu') this._stackClock(record);

            }
            indicator.menu?.close();
            actor.get_parent().remove_child(actor);
            const useArcMenu = role === 'ArcMenu' && this._settings.get_string('launcher-menu') === 'arcmenu';
            const destination = useArcMenu ? this._launcher.get_parent() : ['dateMenu', 'quickSettings', 'screenSharing', 'screenRecording'].includes(role)
                ? this._system : this._tray;
            if (role.startsWith('appindicator-legacy:')) {
                actor._lunaTaskbarTrayKey = `xembed:${indicator._icon?.wm_class || role.slice('appindicator-legacy:'.length)}`;
                rememberTrayItem(this._settings, actor._lunaTaskbarTrayKey, actor.accessible_name || role);
            }
            destination.add_child(actor);
            if (useArcMenu)
                destination.set_child_at_index(actor, destination.get_children().indexOf(this._launcher));
            if (role === 'ArcMenu') {
                this._onArcMenuChanged(useArcMenu);
                this._orientArcMenu(record);
            }
            if (role === 'dateMenu')
                destination.set_child_above_sibling(actor, null);
            this._orientMenu(record);
        }
    }

    _orientArcMenu(record) {
        if (!record.arcMenus) {
            const icon = record.indicator.menuButtonWidget?.getPanelIcon();
            if (icon) {
                record.arcIcon = {icon, size: icon.icon_size, style: icon.get_style(), buttonStyle: record.indicator.get_style()};
                record.arcIcon.id = icon.connect('notify::icon-size', () => this._styleStartButtons());
                record.arcStyleId = record.indicator.connect('notify::style', () => this._styleStartButtons());
            }
            record.arcMenus = [record.indicator.arcMenu, record.indicator.arcMenuContextMenu]
                .filter(menu => menu?._boxPointer).map(menu => {
                    const side = menu._boxPointer._userArrowSide;
                    const id = menu.connect('open-state-changed', () => {
                        menu._boxPointer.updateArrowSide(this._edgeSide ?? St.Side.BOTTOM);
                        this._syncArcMenuHighlight(record);
                        this._onArcMenuOpenChanged?.();
                    });
                    const restoreAnchor = anchorTaskbarMenu(menu, record.indicator, this._settings);
                    const backdrop = new PopupBackdrop(menu, this._settings);
                    return {menu, side, id, restoreAnchor, backdrop};
                });
        }
        this._styleStartButtons();
        this._syncArcMenuHighlight(record);
        for (const {menu} of record.arcMenus)
            menu._boxPointer.updateArrowSide(this._edgeSide ?? St.Side.BOTTOM);
    }

    _styleStartButtons() {
        if (this._stylingStart) return;
        this._stylingStart = true;
        try {
            for (const record of this._records.values()) {
                if (!record.arcIcon) continue;
                if (this._settings.get_string('launcher-menu') === 'arcmenu')
                    styleStartButton(this._settings, record.indicator, record.arcIcon.icon);
                else {
                    record.indicator.set_style(record.arcIcon.buttonStyle);
                    record.arcIcon.icon.set_style(record.arcIcon.style);
                    record.arcIcon.icon.icon_size = record.arcIcon.size;
                }
            }
        } finally { this._stylingStart = false; }
    }

    _syncArcMenuHighlight(record) {
        const active = record.arcMenus?.some(({menu}) => menu.isOpen);
        if (active) record.indicator.add_style_class_name('luna-taskbar-start-open');
        else record.indicator.remove_style_class_name('luna-taskbar-start-open');
    }

    _stackClock(record) {
        const {indicator} = record;
        const original = indicator._clockDisplay;
        if (!original || !indicator._clock) return;
        const parent = original.get_parent();
        const stack = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'luna-taskbar-clock-stack', y_align: Clutter.ActorAlign.CENTER});
        const date = new St.Label({x_align: Clutter.ActorAlign.CENTER});
        const time = new St.Label({x_align: Clutter.ActorAlign.CENTER});
        stack.add_child(time);
        stack.add_child(date);
        indicator.add_style_class_name('luna-taskbar-clock-button');
        const wasVisible = original.visible;
        const oldLabel = indicator.label_actor;
        original.hide();
        parent.insert_child_at_index(stack, parent.get_children().indexOf(original));
        indicator.label_actor = stack;
        const preferences = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        const update = () => {
            const vertical = ['left', 'right'].includes(this._settings.get_string('taskbar-position'));
            const single = !vertical && this._settings.get_string('clock-layout') === 'single-line';
            stack.orientation = single ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL;
            stack.set_style(`font-size: ${(vertical ? Math.min(11, this._settings.get_int('tray-text-size')) : this._settings.get_int('tray-text-size'))}px; font-weight: normal; spacing: ${single ? 8 : 0}px;`);
            const now = GLib.DateTime.new_now_local();
            date.text = now.format(vertical ? '%d/%m' : '%-d %b %Y');
            for (const label of [date, time]) label.set_style(vertical ? 'font-size: 10px;' : null);
            const seconds = preferences.get_boolean('clock-show-seconds');
            const twelveHour = preferences.get_string('clock-format') === '12h';
            time.text = now.format(twelveHour
                ? (vertical ? '%I:%M\n%p' : seconds ? '%-I:%M:%S %p' : '%-I:%M %p')
                : (seconds ? '%H:%M:%S' : '%H:%M'));
            stack.accessible_name = `${date.text}, ${time.text}`;
        };
        const clockId = indicator._clock.connect('notify::clock', update);
        const settingsId = preferences.connect('changed', update);
        const textSizeId = this._settings.connect('changed', (_settings, key) => {
            if (['tray-text-size', 'clock-layout', 'taskbar-position'].includes(key)) update();
        });
        update();
        record.restoreClock = () => {
            indicator._clock.disconnect(clockId);
            preferences.disconnect(settingsId);
            this._settings.disconnect(textSizeId);
            indicator.remove_style_class_name('luna-taskbar-clock-button');
            indicator.label_actor = oldLabel;
            stack.destroy();
            original.visible = wasVisible;
        };
    }

    _orientMenu(record) {
        const menu = record.indicator.menu;
        if (menu?.actor && record.managedMenu !== menu) {
            // The panel owns its status actors; only borrow menu management.
            if (record.openStateId)
                record.managedMenu.disconnect(record.openStateId);
            const updateOpenState = () => {
                if (menu.isOpen)
                    record.indicator.add_style_class_name('luna-taskbar-applet-open');
                else
                    record.indicator.remove_style_class_name('luna-taskbar-applet-open');
            };
            record.openStateId = menu.connect('open-state-changed', updateOpenState);
            updateOpenState();
            record.backdrop?.destroy();
            record.backdrop = record.arcMenus?.some(entry => entry.menu === menu) ? null : new PopupBackdrop(menu, this._settings);
            Main.panel.menuManager.removeMenu(menu);
            this._menuManager.addMenu(menu);
            record.managedMenu = menu;
        }
        const pointer = record.indicator.menu?._boxPointer;
        if (!pointer || record.pointer === pointer)
            return;
        record.pointer = pointer;
        record.arrowSide = pointer._userArrowSide;
        pointer.updateArrowSide(this._edgeSide ?? St.Side.BOTTOM);
    }

    closeMenus() {
        for (const record of this._records.values()) {
            record.indicator.menu?.close();
            record.indicator.arcMenu?.close();
            record.indicator.arcMenuContextMenu?.close();
        }
    }

    destroy() {
        if (this._quickIndicators) this._quickIndicators.orientation = this._quickOrientation;
        this._systemIcons?.destroy();
        this._settings.disconnect(this._unifiedId);
        this._systemPanel?.destroy();
        this._systemPanel = null;
        this._restoreCalendar?.();
        if (this._idle)
            GLib.Source.remove(this._idle);
        for (const [source, id] of this._sourceSignals)
            source.disconnect(id);
        this._settings.disconnect(this._launcherSettingId);
        this._settings.disconnect(this._startStyleId);
        this._onArcMenuChanged(false);
        const records = [...this._records.values()].sort((a, b) => a.index - b.index);
        for (const record of records) {
            const {actor, indicator, parent, index} = record;
            actor.disconnect(record.destroyId);
            indicator.disconnect(record.menuId);
            indicator.menu?.close();
            if (record.openStateId)
                record.managedMenu.disconnect(record.openStateId);
            indicator.remove_style_class_name('luna-taskbar-applet-open');
            indicator.remove_style_class_name('luna-taskbar-system-applet');
            if (record.managedMenu && record.managedMenu === indicator.menu) {
                indicator.menu.actor.remove_style_class_name('luna-taskbar-popup');
                this._menuManager.removeMenu(indicator.menu);
                Main.panel.menuManager.addMenu(indicator.menu);
            }
            record.backdrop?.destroy();
            if (record.arcIcon) {
                record.arcIcon.icon.disconnect(record.arcIcon.id);
                indicator.disconnect(record.arcStyleId);
                indicator.set_style(record.arcIcon.buttonStyle);
                record.arcIcon.icon.set_style(record.arcIcon.style);
                record.arcIcon.icon.icon_size = record.arcIcon.size;
            }
            for (const {menu, side, id, restoreAnchor, backdrop} of record.arcMenus ?? []) {
                backdrop.destroy();
                restoreAnchor();
                menu.close();
                menu.disconnect(id);
                menu._boxPointer.updateArrowSide(side);
            }
            indicator.remove_style_class_name('luna-taskbar-start-open');
            actor.remove_style_class_name('luna-taskbar-system');
            actor.x_expand = record.expand;
            actor.x_expand_set = record.expandSet;
            actor.y_expand = record.yExpand;
            actor.y_expand_set = record.yExpandSet;
            record.restoreClock?.();
            record.pointer?.updateArrowSide(record.arrowSide);
            // Another extension may have already taken ownership again.
            if (actor.get_parent() === this._tray || actor.get_parent() === this._system ||
                actor.get_parent() === this._launcher.get_parent()) {
                actor.get_parent().remove_child(actor);
                parent.insert_child_at_index(actor, index);
            }
        }
        this._records.clear();
        Main.panel.visible = this._panelVisible;
    }
}
