import {_, formatText} from '../i18n.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

// Edit with labelled handles so clicks cannot activate the underlying applets.
export class AppletEditor {
    constructor(box, settings, records, closeMenus, repaint, sources = []) {
        Object.assign(this, {box, settings, records, closeMenus, repaint});
        this._settingsId = settings.connect('changed::applet-order', () => this.applyOrder());
        const queue = () => {
            if (!this._idle && !this._applying)
                this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    this._idle = 0;
                    if (!this.active) this.applyOrder();
                    return GLib.SOURCE_REMOVE;
                });
        };
        this._addedSignals = [box, ...sources].map(source =>
            [source, source.connect('child-added', queue)]);
        this.applyOrder();
    }

    applyOrder() {
        if (this.active)
            return;
        const records = this.records();
        const stored = this.settings.get_strv('applet-order');
        const saved = stored.includes('appbar') ? stored
            : ['ArcMenu', 'overview', 'search', 'appbar', ...stored, 'showDesktop'];
        if (!saved.includes('workspaces')) {
            const tray = saved.indexOf('tray');
            saved.splice(tray < 0 ? saved.indexOf('appbar') + 1 : tray, 0, 'workspaces');
        }
        if (!saved.includes('weather')) {
            const before = saved.findIndex(id => ['dateMenu', 'quickSettings', 'showDesktop'].includes(id));
            saved.splice(before < 0 ? saved.length : before, 0, 'weather');
        }
        const ordered = [...records].sort((a, b) => {
            const rank = record => saved.includes(record.id) ? saved.indexOf(record.id) : saved.length + records.indexOf(record);
            return rank(a) - rank(b);
        });
        this._applying = true;
        for (const [index, {actor, system}] of ordered.entries()) {
            if (system) actor.add_style_class_name('luna-taskbar-system');
            if (actor.get_parent() !== this.box) {
                actor.get_parent()?.remove_child(actor);
                this.box.add_child(actor);
            }
            this.box.set_child_at_index(actor, index);
        }
        this._applying = false;
    }

    start() {
        if (this.active)
            return;
        this.applyOrder();
        this.closeMenus();
        this.active = true;
        this.box._delegate = this;
        const records = this.records();
        this._entries = this.box.get_children().map(actor => records.find(record => record.actor === actor)).filter(entry => entry?.actor.visible);
        for (const entry of this._entries) {
            entry.visible = entry.actor.visible;
            entry.actor.hide();
            entry.visibleId = entry.actor.connect('notify::visible', () => {
                if (this.active && entry.actor.visible) entry.actor.hide();
            });
            const vertical = this.box.orientation === Clutter.Orientation.VERTICAL;
            const icons = {ArcMenu: 'view-app-grid-symbolic', overview: 'view-paged-symbolic', search: 'edit-find-symbolic',
                workspaces: 'view-paged-symbolic', appbar: 'view-grid-symbolic', tray: 'view-more-symbolic', dateMenu: 'org.gnome.clocks-symbolic',
                quickSettings: 'preferences-system-symbolic', showDesktop: 'computer-symbolic'};
            const content = new St.BoxLayout({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
                style_class: 'luna-taskbar-edit-handle-content'});
            content.add_child(new St.Icon({icon_name: icons[entry.id] ?? 'application-x-addon-symbolic', icon_size: 16}));
            if (entry.id === 'appbar' && !vertical)
                content.add_child(new St.Label({text: _('Applications'), y_align: Clutter.ActorAlign.CENTER}));
            const button = new St.Button({child: content, style_class: 'luna-taskbar-edit-handle',
                x_expand: entry.actor.x_expand, y_expand: entry.actor.y_expand,
                x_align: Clutter.ActorAlign.FILL, can_focus: true, track_hover: true,
                accessible_name: formatText(_("Move %s; use arrow keys"), entry.label)});
            const describe = () => { if (this._selection) this._selection.text = entry.label; };
            button.connect('notify::hover', describe);
            button.connect('key-focus-in', describe);
            const minimum = 32 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
            entry.handleWidth = vertical ? this.box.get_parent().width : !entry.actor.x_expand ? Math.max(minimum, entry.actor.width) : -1;
            entry.handleHeight = vertical && !entry.actor.y_expand ? Math.max(minimum, entry.actor.height) : -1;
            button.set_size(entry.handleWidth, entry.handleHeight);
            button.set_style('padding: 0; margin: 0;');
            entry.button = button;
            entry.destroyId = entry.actor.connect('destroy', () => {
                if (this._source === entry)
                    this._finishDrag();
                this._entries = this._entries.filter(candidate => candidate !== entry);
                button.destroy();
            });
            entry.owner = this;
            entry.getDragActor = () => new St.Label({text: entry.label, style_class: 'luna-taskbar-edit-handle'});
            entry.getDragActorSource = () => button;
            button._delegate = entry;
            this.box.add_child(button);
            let previousX;
            button.connect('notify::allocation', () => {
                const vertical = this.box.orientation === Clutter.Orientation.VERTICAL;
                const x = vertical ? button.get_allocation_box().y1 : button.get_allocation_box().x1;
                const delta = previousX === undefined ? 0 : previousX - x;
                previousX = x;
                if (delta && button.opacity && button.mapped) {
                    button[vertical ? 'translation_y' : 'translation_x'] += delta;
                    button.ease({[vertical ? 'translation_y' : 'translation_x']: 0, duration: 180, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
                    this.repaint();
                }
            });
            const drag = DND.makeDraggable(button, {restoreOnSuccess: false});
            drag.connect('drag-begin', () => this._begin(entry));
            drag.connect('drag-end', () => this._finishDrag());
            button.connect('key-press-event', (_actor, event) => {
                let key = event.get_key_symbol();
                if (key === Clutter.KEY_Up) key = Clutter.KEY_Left;
                if (key === Clutter.KEY_Down) key = Clutter.KEY_Right;
                if (![Clutter.KEY_Left, Clutter.KEY_Right].includes(key))
                    return Clutter.EVENT_PROPAGATE;
                const index = this._entries.indexOf(entry);
                const next = Math.max(0, Math.min(this._entries.length - 1, index + (key === Clutter.KEY_Left ? -1 : 1)));
                this._entries.splice(index, 1);
                this._entries.splice(next, 0, entry);
                this._syncHandles();
                this._save();
                return Clutter.EVENT_STOP;
            });
        }
        this._done = new St.Button({label: _('Done'), can_focus: true, style_class: 'luna-taskbar-edit-done'});
        this._done.connect('clicked', () => this.stop());
        this._toolbar = new St.BoxLayout({style_class: 'luna-taskbar-edit-toolbar', reactive: true});
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'luna-taskbar-edit-description'});
        text.add_child(new St.Label({text: _('Arrange your taskbar'), style_class: 'luna-taskbar-edit-title'}));
        this._selection = new St.Label({text: _('Drag a button to move it'), style_class: 'luna-taskbar-edit-selection'});
        text.add_child(this._selection);
        text.add_child(new St.Label({text: _('Arrow keys to move · Esc to finish'), style_class: 'luna-taskbar-edit-hint'}));
        this._toolbar.add_child(text);
        this._toolbar.add_child(this._done);
        Main.layoutManager.addChrome(this._toolbar, {affectsStruts: false, trackFullscreen: true});
        const place = () => {
            const [x, y] = this.box.get_parent().get_transformed_position();
            const [width, height] = this.box.get_parent().get_transformed_size();
            const monitor = Main.layoutManager.findMonitorForActor(this.box) ?? Main.layoutManager.primaryMonitor;
            const [, tw] = this._toolbar.get_preferred_width(-1);
            const [, th] = this._toolbar.get_preferred_height(tw);
            const edge = this.settings.get_string('taskbar-position');
            let tx = x + (width - tw) / 2, ty = edge === 'top' ? y + height + 16 : y - th - 16;
            if (edge === 'left' || edge === 'right') {
                tx = edge === 'left' ? x + width + 16 : x - tw - 16;
                ty = y + (height - th) / 2;
            }
            this._toolbar.set_position(Math.round(Math.max(monitor.x + 12, Math.min(tx, monitor.x + monitor.width - tw - 12))),
                Math.round(Math.max(monitor.y + 12, Math.min(ty, monitor.y + monitor.height - th - 12))));
        };
        this._toolbarId = this.box.connect('notify::allocation', place);
        place();
        this._keyId = global.stage.connect('captured-event', (_stage, event) => {
            if (event.type() === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape) {
                // DND handles Escape first while dragging; finish editing afterwards.
                if (!this._stopIdle)
                    this._stopIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                        this._stopIdle = 0;
                        this.stop();
                        return GLib.SOURCE_REMOVE;
                    });
                return this._source ? Clutter.EVENT_PROPAGATE : Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._entries[0]?.button.grab_key_focus();
    }

    _syncHandles() {
        for (const entry of this._entries)
            this.box.set_child_above_sibling(entry.button, null);

    }

    _save() {
        // Retain IDs of temporarily absent applets for their next appearance.
        const ids = this._entries.map(entry => entry.id);
        this.settings.set_strv('applet-order', [...ids,
            ...this.settings.get_strv('applet-order').filter(id => !ids.includes(id))]);
    }

    _begin(entry) {
        this._source = entry;
        this._target = this._entries[this._entries.indexOf(entry) + 1];
        this._gap = new St.Widget({style_class: 'luna-taskbar-drop-space', width: entry.button.width,
            height: entry.button.height, x_expand: entry.button.x_expand, y_expand: entry.button.y_expand});
        this.box.insert_child_at_index(this._gap, this.box.get_children().indexOf(entry.button));
        entry.button.x_expand = entry.button.y_expand = false;
        entry.button.opacity = 0;
        entry.button.set_size(0, 0);
        entry.button.clip_to_allocation = true;
        this.repaint();
    }

    handleDragOver(source, _actor, x, y) {
        if (!this.active || source.owner !== this)
            return DND.DragMotionResult.NO_DROP;
        if (this.box.orientation === Clutter.Orientation.VERTICAL) x = y;
        if (this._gap && this.box.orientation !== Clutter.Orientation.VERTICAL && x >= this._gap.x && x <= this._gap.x + this._gap.width)
            return DND.DragMotionResult.MOVE_DROP;
        this._target = this._entries.find(entry => entry !== source && x < (this.box.orientation === Clutter.Orientation.VERTICAL ? entry.button.y + entry.button.height / 2 : entry.button.x + entry.button.width / 2));
        if (this._target) this.box.set_child_below_sibling(this._gap, this._target.button);
        else this.box.set_child_above_sibling(this._gap, null);
        this.repaint();
        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source, actor, x, y) {
        if (!this.active || source.owner !== this)
            return false;
        this.handleDragOver(source, actor, x, y);
        this._entries = this._entries.filter(entry => entry !== source);
        const index = this._target ? this._entries.indexOf(this._target) : this._entries.length;
        this._entries.splice(index, 0, source);
        this._save();
        return true;
    }

    _finishDrag() {
        if (this._source) {
            this._source.button.x_expand = this._source.actor.x_expand;
            this._source.button.y_expand = this._source.actor.y_expand;
            this._source.button.opacity = 255;
            this._source.button.set_size(this._source.handleWidth, this._source.handleHeight);
            this._source.button.clip_to_allocation = false;
        }
        this._source = this._target = null;
        this._gap?.destroy();
        this._gap = null;
        if (this.active)
            this._syncHandles();
        this.repaint();
    }

    stop() {
        if (!this.active)
            return;
        this._finishDrag();
        this.active = false;
        global.stage.disconnect(this._keyId);
        this.box._delegate = null;
        for (const entry of this._entries) {
            entry.actor.disconnect(entry.destroyId);
            entry.actor.disconnect(entry.visibleId);
            entry.button.destroy();
            entry.actor.visible = entry.visible;
        }
        this._entries = [];
        this.box.disconnect(this._toolbarId);
        Main.layoutManager.removeChrome(this._toolbar);
        this._toolbar.destroy();
        this._toolbar = this._selection = null;
        this._done = null;
        this.applyOrder();
    }

    destroy() {
        if (this._stopIdle)
            GLib.Source.remove(this._stopIdle);
        if (this._idle)
            GLib.Source.remove(this._idle);
        this.stop();
        this.settings.disconnect(this._settingsId);
        for (const [source, id] of this._addedSignals) source.disconnect(id);
    }
}
