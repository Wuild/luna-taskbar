import {_, formatText, ngettext} from '../i18n.js';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import {PopupBackdrop} from './popupBackdrop.js';
import {surfaceText, watchThemeColors} from './themeColors.js';

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
        this._grid = new Clutter.GridLayout({column_homogeneous: true, row_homogeneous: true});
        this.overflowBox = new St.Widget({style_class: 'luna-taskbar-tray', layout_manager: this._grid});
        const updateIconColor = () => this.overflowBox.set_style(`color: ${surfaceText('taskbar')};`);
        this._releaseThemeColors = watchThemeColors(updateIconColor);
        updateIconColor();
        this.button = new St.Button({can_focus: true, visible: false, style_class: 'luna-taskbar-tray-toggle',
            child: new St.Icon({icon_name: 'view-more-symbolic', icon_size: 16})});
        this._dropDelegates = new Map([
            [this.actor, this._dropDelegate(this.actor)],
            [box, this._dropDelegate(box)],
            [this.overflowBox, this._dropDelegate(this.overflowBox)],
            [this.button, this._dropDelegate(this.button)],
        ]);
        for (const [target, delegate] of this._dropDelegates) target._delegate = delegate;
        this.button.child._delegate = this._dropDelegates.get(this.button);
        settings.bind('tray-icon-size', this.button.child, 'icon-size', Gio.SettingsBindFlags.GET);
        this.actor.add_child(this.button);
        this.menu = new PopupMenu.PopupMenu(this.button, 0.5, St.Side.BOTTOM);
        Main.uiGroup.add_child(this.menu.actor);
        this.menu.actor.hide();
        this.menu.actor.add_style_class_name('luna-taskbar-tray-popup');
        this._backdrop = new PopupBackdrop(this.menu, settings);
        this._viewport = new St.Bin({child: this.overflowBox});
        const row = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
            style_class: 'luna-taskbar-tray-drawer-row'});
        row.add_child(this._viewport);
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
        const children = this.overflowBox.get_children().filter(child =>
            child.visible && child !== this._dragSource?.button);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const spacing = this.settings.get_int('tray-spacing') * scale;
        this._grid.column_spacing = spacing;
        this._grid.row_spacing = spacing;
        const cell = this._popupCell(children);
        const availableWidth = Math.max(cell,
            monitor.width - (2 * this.settings.get_int('panel-edge-gap') + 64) * scale);
        // Keep short trays on one row and cap longer rows at three icons. The
        // previous square-root packing unexpectedly made three icons a 2x2
        // grid even when there was ample horizontal space.
        const calculatedColumns = Math.max(1, Math.min(3, children.length,
            Math.floor((availableWidth + spacing) / (cell + spacing))));
        const columns = this._dragColumns ?? calculatedColumns;
        this._columns = calculatedColumns;
        // Hidden actors retain GridLayout coordinates. Reset them too so stale
        // rows/columns cannot leave blank space after icons disappear.
        for (const child of this.overflowBox.get_children()) {
            const meta = this._grid.get_child_meta(this.overflowBox, child);
            meta.left_attach = 0;
            meta.top_attach = 0;
        }
        children.forEach((child, index) => {
            const meta = this._grid.get_child_meta(this.overflowBox, child);
            meta.left_attach = index % columns;
            meta.top_attach = Math.floor(index / columns);
        });
        const rows = Math.ceil(children.length / columns);
        let width = columns * cell + (columns - 1) * spacing;
        let height = rows * cell + Math.max(0, rows - 1) * spacing;
        if (this._dragPopupSize)
            [width, height] = this._dragPopupSize;
        // Actor width/height still expose the previous allocation until the
        // next frame. Keep the dimensions we actually requested so drag
        // freezes never squeeze a new column count into a stale old width.
        this._popupSize = [width, height];
        this.overflowBox.set_size(...this._popupSize);
        this._viewport.set_size(...this._popupSize);
        this.overflowBox.queue_relayout();
        this._viewport.queue_relayout();
        this.menu.actor.queue_relayout();
        this.menu._boxPointer?.queue_relayout();
    }

    _popupCell(children = null) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const candidates = (children ?? this.overflowBox.get_children()).filter(child =>
            child.visible && child !== this._placeholder && child !== this._dragSource?.button);
        return Math.max(32 * scale, ...candidates.map(child => Math.max(
            child.get_preferred_width(-1)[1], child.get_preferred_height(-1)[1])));
    }

    _queuePopupSize() {
        if (this._stopped || this._sizeIdle)
            return;
        this._sizeIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._sizeIdle = 0;
            if (this.menu.isOpen) this._sizePopup();
            return GLib.SOURCE_REMOVE;
        });
    }

    _attachDrag(child) {
        if (child._lunaTaskbarTrayDragOwner === this)
            return;
        const source = {
            owner: this,
            button: child,
            getDragActor: () => {
                const original = child.get_child?.();
                const icon = original instanceof St.Icon
                    ? new St.Icon({gicon: original.gicon, fallback_gicon: original.fallback_gicon,
                        icon_size: original.icon_size})
                    : new St.Icon({icon_name: 'application-x-executable-symbolic',
                        icon_size: this.settings.get_int(source.button.get_parent() === this.overflowBox
                            ? 'tray-popup-icon-size' : 'tray-icon-size')});
                icon.set_style(`color: ${surfaceText('taskbar')};`);
                const ghost = new St.Bin({style_class: 'luna-taskbar-tray-drag-ghost', child: icon});
                ghost.set_size(Math.max(24, child.width), Math.max(24, child.height));
                return ghost;
            },
            getDragActorSource: () => child,
            handleDragOver: (dragSource, _dragActor, x, y) => {
                const parent = child.get_parent();
                return this.handleDragOver(dragSource, parent, child.x + x, child.y + y);
            },
            acceptDrop: (dragSource, _dragActor, x, y) => {
                const parent = child.get_parent();
                return this.acceptDrop(dragSource, parent, child.x + x, child.y + y);
            },
        };
        child._lunaTaskbarTrayDragOwner = this;
        child._lunaTaskbarTrayDragSource = source;
        child._delegate = source;
        const draggable = DND.makeDraggable(child, {restoreOnSuccess: false});
        draggable.connect('drag-begin', () => this._beginDrag(source));
        draggable.connect('drag-end', () => this._finishDrag());
    }

    _dropDelegate(target) {
        return {
            owner: this,
            handleDragOver: (source, _dragActor, x, y) => this.handleDragOver(source, target, x, y),
            acceptDrop: (source, _dragActor, x, y) => this.acceptDrop(source, target, x, y),
        };
    }

    _beginDrag(source) {
        this._finishDrag();
        if (this.menu.isOpen) {
            this._sizePopup();
            this._dragPopupSize = [...this._popupSize];
            this._dragColumns = this._columns;
        }
        this._dragSource = source;
        this._dragOrigin = source.button.get_parent();
        this._dragSize = [source.button.width, source.button.height];
        this._placeholder = new St.Bin({style_class: 'luna-taskbar-drop-space luna-taskbar-tray-drop-space',
            width: source.button.width, height: source.button.height,
            child: new St.Icon({icon_name: 'list-drag-handle-symbolic', icon_size: 12})});
        const index = this._dragOrigin.get_children().indexOf(source.button);
        this._dragOrigin.insert_child_at_index(this._placeholder, index);
        source.button.opacity = 0;
        source.button.set_size(0, 0);
        source.button.clip_to_allocation = true;
        this.actor.add_style_class_name('luna-taskbar-tray-dragging');
        this.menu.actor.add_style_class_name('luna-taskbar-tray-dragging');
        this.suspendForNativeMenu();
        if (this._dragOrigin === this.overflowBox) this._sizePopup();
    }

    _finishDrag() {
        if (this._openTimeout) GLib.Source.remove(this._openTimeout);
        this._openTimeout = 0;
        // Apply an accepted move while the real source remains hidden. This
        // avoids one frame at its old position between DND release and idle sync.
        if (this._dropAccepted && this._dragSource)
            this._sync();
        this._placeholder?.destroy();
        this._placeholder = null;
        if (this._dragSource) {
            const button = this._dragSource.button;
            button.opacity = 255;
            if (button.get_parent() === this._dragOrigin && this._dragSize)
                // A no-op or reorder must restore the exact allocation it had
                // before set_size(0, 0), otherwise its padding/alignment changes
                // merely from starting and stopping a drag.
                button.set_size(...this._dragSize);
            else
                // When crossing containers, do not carry the old taskbar or
                // popup allocation into the destination layout.
                button.set_size(-1, -1);
            button.clip_to_allocation = false;
        }
        this._dragSource = null;
        this._dragOrigin = null;
        this._dragSize = null;
        this._dragPopupSize = null;
        this._dragColumns = null;
        this._dropDestination = null;
        this._dropBefore = null;
        this._dropAccepted = false;
        this.actor.remove_style_class_name('luna-taskbar-tray-dragging');
        this.menu.actor.remove_style_class_name('luna-taskbar-tray-dragging');
        this.resumeAfterNativeMenu();
        this._queue();
        this._queuePopupSize();
    }

    _ordered(children) {
        const order = this.settings.get_strv('tray-icon-order');
        const rank = child => {
            const index = order.indexOf(child._lunaTaskbarTrayKey);
            return index < 0 ? order.length + children.indexOf(child) : index;
        };
        return [...children].sort((a, b) => rank(a) - rank(b));
    }

    _applyOrder(container) {
        for (const [index, child] of this._ordered(container.get_children()).entries())
            container.set_child_at_index(child, index);
    }

    _dropTarget(container, x, y, source) {
        const children = container.get_children().filter(child =>
            child !== source.button && child.visible && child._lunaTaskbarTrayKey);
        if (container === this.box) {
            const vertical = container.orientation === Clutter.Orientation.VERTICAL;
            const point = vertical ? y : x;
            return children.find(child => point < (vertical ? child.y + child.height / 2 : child.x + child.width / 2));
        }
        // Treat every grid row like a horizontal sortable list. Crossing an
        // icon's horizontal midpoint inserts after it, so the neighboring
        // icons move out of the way while the pointer is still hovering it.
        // Comparing Y only chooses the row; it must not make the entire upper
        // half of a cell insert before that cell regardless of pointer X.
        for (const child of children) {
            if (y < child.y)
                return child;
            if (y < child.y + child.height && x < child.x + child.width / 2)
                return child;
        }
        return null;
    }

    _destination(actor, source) {
        if (actor === this.button)
            return (source === this._dragSource ? this._dragOrigin : source.button.get_parent()) === this.overflowBox
                ? this.box : this.overflowBox;
        if ([this.actor, this.box].includes(actor))
            return this.box;
        return this.overflowBox;
    }

    _movePlaceholder(destination, before) {
        if (!this._placeholder)
            return;
        const previous = this._placeholder.get_parent();
        if (destination === this.overflowBox) {
            const cell = this._popupCell();
            this._placeholder.set_size(cell, cell);
        } else if (this._dragSize) {
            this._placeholder.set_size(...this._dragSize);
        }
        if (this._placeholder.get_parent() !== destination) {
            this._placeholder.get_parent()?.remove_child(this._placeholder);
            destination.add_child(this._placeholder);
        }
        const children = destination.get_children().filter(child => child !== this._placeholder);
        const index = before ? children.indexOf(before) : children.length;
        destination.set_child_at_index(this._placeholder, index < 0 ? children.length : index);
        const crossedPopupBoundary = previous !== destination &&
            [previous, destination].includes(this.overflowBox);
        if (crossedPopupBoundary) {
            // The placeholder is an occupied grid cell. Once it crosses the
            // popup boundary the tentative item count changes, so keeping the
            // old column count/width would stretch the remaining occupied
            // columns. Recalculate the complete grid at the boundary, then
            // freeze those matching dimensions while sorting within it.
            this._dragPopupSize = null;
            this._dragColumns = null;
            this._sizePopup();
            this._dragPopupSize = [...this._popupSize];
            this._dragColumns = this._columns;
        } else if (destination === this.overflowBox || this._dragOrigin === this.overflowBox) {
            this._sizePopup();
        }
        this._queuePopupSize();
    }

    _openPopupForDrag() {
        if (this.menu.isOpen || this._openTimeout || this._dragOrigin !== this.box)
            return;
        this._openTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._openTimeout = 0;
            if (!this._dragSource || this._dragOrigin !== this.box)
                return GLib.SOURCE_REMOVE;
            this._dragPopupSize = null;
            this._dragColumns = null;
            this.menu.open(BoxPointer.PopupAnimation.NONE);
            this._sizePopup();
            this._dragPopupSize = [...this._popupSize];
            this._dragColumns = this._columns;
            this.suspendForNativeMenu();
            return GLib.SOURCE_REMOVE;
        });
    }

    handleDragOver(source, actor, x, y) {
        if (source.owner !== this || !source.button._lunaTaskbarTrayKey)
            return DND.DragMotionResult.NO_DROP;
        const destination = this._destination(actor, source);
        this._dropDestination = destination;
        this._dropBefore = actor === this.button ? null : this._dropTarget(destination, x, y, source);
        if (actor === this.button && this._dragOrigin === this.box && !this.menu.isOpen) {
            this._openPopupForDrag();
        } else {
            if (this._openTimeout) GLib.Source.remove(this._openTimeout);
            this._openTimeout = 0;
            this._movePlaceholder(destination, this._dropBefore);
        }
        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source, actor, x, y) {
        if (source.owner !== this || !source.button._lunaTaskbarTrayKey)
            return false;
        const destination = this._destination(actor, source);
        const before = actor === this.button ? null : this._dropTarget(destination, x, y, source);
        const key = source.button._lunaTaskbarTrayKey;
        const exceptions = new Set(this.settings.get_strv('tray-always-visible'));
        if (destination === this.box) exceptions.add(key); else exceptions.delete(key);

        const all = this._ordered([...this.box.get_children(), ...this.overflowBox.get_children()]);
        const inline = all.filter(child => child !== source.button && exceptions.has(child._lunaTaskbarTrayKey));
        const overflow = all.filter(child => child !== source.button && !exceptions.has(child._lunaTaskbarTrayKey));
        const group = destination === this.box ? inline : overflow;
        const position = before ? group.indexOf(before) : group.length;
        group.splice(position < 0 ? group.length : position, 0, source.button);
        const live = [...inline, ...overflow].map(child => child._lunaTaskbarTrayKey).filter(Boolean);
        const saved = this.settings.get_strv('tray-icon-order');
        this.settings.set_strv('tray-icon-order', [...live, ...saved.filter(item => !live.includes(item))]);
        this.settings.set_strv('tray-always-visible', [...exceptions]);
        this._dropAccepted = true;
        return true;
    }

    _sync() {
        const children = [...this._children.keys(), ...this.box.get_children(), ...this.overflowBox.get_children()]
            .filter((child, index, all) => child !== this._placeholder &&
                all.indexOf(child) === index && [this.box, this.overflowBox].includes(child.get_parent()));
        for (const [child, ids] of this._children) {
            if (!children.includes(child)) {
                ids.forEach(id => child.disconnect(id));
                this._children.delete(child);
            }
        }
        for (const child of children) {
            if (!this._children.has(child)) {
                this._attachDrag(child);
                const visibleId = child.connect('notify::visible', () => this._queue());
                const destroyId = child.connect('destroy', () => {
                    if (this._dragSource?.button === child) this._finishDrag();
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
        this._applyOrder(this.box);
        this._applyOrder(this.overflowBox);
        this.collapsed = collapsed;
        const hiddenCount = this.overflowBox.get_children().filter(child => child.visible).length;
        this.button.accessible_name = formatText(ngettext('Application tray — %d hidden icon', 'Application tray — %d hidden icons', hiddenCount), hiddenCount);
        this.button.visible = hiddenCount > 0;
        if (!hiddenCount) this.close();
        if (this.menu.isOpen) {
            this._sizePopup();
            this._queuePopupSize();
        }
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
        if (this._sizeIdle)
            GLib.Source.remove(this._sizeIdle);
        if (this._openTimeout)
            GLib.Source.remove(this._openTimeout);
        this._sizeIdle = 0;
        this._openTimeout = 0;
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
        this._finishDrag();
        this._stop();
        this.manager.removeMenu(this.menu);
        this._releaseThemeColors?.();
        this._releaseThemeColors = null;
        for (const [target, delegate] of this._dropDelegates) {
            if (target._delegate === delegate) target._delegate = null;
        }
        if (this.button.child._delegate === this._dropDelegates.get(this.button))
            this.button.child._delegate = null;
        this._dropDelegates.clear();
        for (const child of [...this.box.get_children(), ...this.overflowBox.get_children()]) {
            if (child._lunaTaskbarTrayDragOwner !== this) continue;
            if (child._delegate === child._lunaTaskbarTrayDragSource) child._delegate = null;
            delete child._lunaTaskbarTrayDragOwner;
            delete child._lunaTaskbarTrayDragSource;
        }
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
