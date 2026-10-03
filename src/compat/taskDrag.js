import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import {createTaskIcon} from './windowIcons.js';

export class TaskDrag {
    constructor(box, favorites, records, onChange, onBegin, onMotion) {
        Object.assign(this, {box, favorites, records, onChange, onBegin, onMotion});
        this.order = [];
        box._delegate = this;
    }

    sortWindows(windows) {
        const live = new Set(windows);
        this.order = this.order.filter(window => live.has(window));
        for (const window of windows) {
            if (!this.order.includes(window))
                this.order.push(window);
        }
        return [...windows].sort((a, b) => this.order.indexOf(a) - this.order.indexOf(b));
    }

    attach(task, button) {
        const source = {
            owner: this, task, app: task.app, button,
            getDragActor: () => {
                const iconSize = button.child.get_first_child().icon_size;
                const icon = createTaskIcon(task.app, task.window, iconSize);
                const size = iconSize * St.ThemeContext.get_for_stage(global.stage).scale_factor;
                icon.set_size(size, size);
                return icon;
            },
            getDragActorSource: () => button.child.get_first_child(),
        };
        button._delegate = source;
        let previousX;
        button.connect('notify::allocation', () => {
            const vertical = this.box.orientation === Clutter.Orientation.VERTICAL;
            const x = vertical ? button.get_allocation_box().y1 : button.get_allocation_box().x1;
            const delta = previousX === undefined ? 0 : previousX - x;
            previousX = x;
            // The dragged button gets a separate animation whose origin is
            // the released drag actor, not its pre-drag allocation.
            if (button._lunaDropPending)
                return;
            if (!delta || !button.mapped || button.opacity === 0)
                return;
            button[vertical ? 'translation_y' : 'translation_x'] += delta;
            button.ease({[vertical ? 'translation_y' : 'translation_x']: 0, duration: 180,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            button.get_transition('translation-x')?.connect('new-frame', () => this.onMotion());
        });
        const draggable = DND.makeDraggable(button, {restoreOnSuccess: false});
        draggable.connect('drag-begin', () => this._begin(source));
        draggable.connect('drag-end', (_drag, _time, accepted) => {
            // acceptDrop owns successful completion so the source remains
            // hidden until its final allocation is ready. Cancelled drags
            // still restore immediately.
            if (!accepted || !this._dropAccepted) {
                this._finish();
                this.onChange();
            }
        });
        button.connect('destroy', () => {
            if (this._source === source)
                this._finish();
        });
    }

    _begin(source) {
        this._finish();
        this.dragging = true;
        this._source = source;
        this.onBegin();
        this._hidden = [...this.records.values()].filter(record =>
            this._pinned(source.task) ? record.app?.get_id() === source.app.get_id()
                : record.button === source.button).map(record => record.button);
        const vertical = this.box.orientation === Clutter.Orientation.VERTICAL;
        const extent = this._hidden.reduce((sum, button) => sum + (vertical ? button.height : button.width), 0);
        this._placeholder = new St.Widget({
            style_class: 'luna-taskbar-drop-space', width: vertical ? source.button.width : extent, height: vertical ? extent : source.button.height,
        });
        const index = this.box.get_children().indexOf(source.button);
        this.box.insert_child_at_index(this._placeholder, index);
        for (const button of this._hidden) {
            button.opacity = 0;
            button._dragSize = [button.width, button.height];
            button.set_size(0, 0);
            button.clip_to_allocation = true;
        }
        this.onMotion();
    }

    _finish(drop = null) {
        this._placeholder?.destroy();
        this._placeholder = null;
        for (const button of this._hidden ?? []) {
            button.opacity = drop?.source.button === button ? 0 : 255;
            if (button._dragSize) button.set_size(...button._dragSize);
            delete button._dragSize;
            button.clip_to_allocation = false;
        }
        this._hidden = [];
        this._source = this._target = null;
        this._hasTarget = false;
        this._dropAccepted = false;
        this.dragging = false;
        this.onMotion?.();
    }

    _pinned(task) {
        return Boolean(task.app && this.favorites.isFavorite(task.app.get_id()));
    }

    _destination(source, x) {
        if (this._placeholder && x >= this._placeholder.x &&
            x <= this._placeholder.x + this._placeholder.width && this._hasTarget)
            return this._target;
        const pinned = this._pinned(source.task);
        const group = this.box.get_children()
            .map(button => [...this.records.values()].find(record => record.button === button))
            .filter(record => record && this._pinned(record) === pinned);
        if (pinned) {
            const seen = new Set();
            return group.filter(record => {
                const id = record.app.get_id();
                if (id === source.app.get_id() || seen.has(id))
                    return false;
                seen.add(id);
                return true;
            }).find(record => x < (this.box.orientation === Clutter.Orientation.VERTICAL ? record.button.y + record.button.height / 2 : record.button.x + record.button.width / 2));
        }
        return group.filter(record => record.window !== source.task.window)
            .find(record => x < (this.box.orientation === Clutter.Orientation.VERTICAL ? record.button.y + record.button.height / 2 : record.button.x + record.button.width / 2));
    }

    handleDragOver(source, _actor, x, y) {
        if (source.owner !== this)
            return DND.DragMotionResult.NO_DROP;
        const target = this._destination(source, this.box.orientation === Clutter.Orientation.VERTICAL ? y : x);
        this._target = target;
        this._hasTarget = true;
        if (this._placeholder) {
            const children = this.box.get_children().filter(child => child !== this._placeholder);
            let index = target ? children.indexOf(target.button) : children.length;
            if (!target && this._pinned(source.task)) {
                const firstUnpinned = children.find(child => {
                    const record = [...this.records.values()].find(r => r.button === child);
                    return record && !this._pinned(record);
                });
                if (firstUnpinned)
                    index = children.indexOf(firstUnpinned);
            }
            this.box.set_child_at_index(this._placeholder, index);
        }
        this.onMotion();
        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source, actor, x, y) {
        if (source.owner !== this)
            return false;
        const target = this._destination(source, this.box.orientation === Clutter.Orientation.VERTICAL ? y : x);
        const [actorX, actorY] = actor.get_transformed_position();
        const [actorWidth, actorHeight] = actor.get_transformed_size();
        const [targetX, targetY] = this._placeholder.get_transformed_position();
        const [targetWidth, targetHeight] = this._placeholder.get_transformed_size();
        const [pointerX, pointerY] = global.get_pointer();
        const drop = {
            source,
            originX: Number.isFinite(actorX + actorWidth) ? actorX + actorWidth / 2 : pointerX,
            originY: Number.isFinite(actorY + actorHeight) ? actorY + actorHeight / 2 : pointerY,
            targetX: targetX + targetWidth / 2,
            targetY: targetY + targetHeight / 2,
        };
        this._dropAccepted = true;
        source.button._lunaDropPending = true;
        // Defer changes until DND has released the source actor.
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle = 0;
            if (this._pinned(source.task)) {
                const id = source.app.get_id();
                const others = this.favorites.getFavorites().filter(app => app.get_id() !== id);
                const position = target ? others.findIndex(app => app.get_id() === target.app.get_id()) : others.length;
                this.favorites.moveFavoriteToPos(id, Math.max(0, position));
            } else {
                const moving = source.task.windows;
                this.order = this.order.filter(window => !moving.includes(window));
                const position = target ? this.order.indexOf(target.window) : this.order.length;
                this.order.splice(position < 0 ? this.order.length : position, 0, ...moving);
            }
            this._finish(drop);
            this.onChange();
            this._animateDrop(drop);
            return GLib.SOURCE_REMOVE;
        });
        return true;
    }

    _animateDrop(drop) {
        let attempts = 0;
        const vertical = this.box.orientation === Clutter.Orientation.VERTICAL;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            attempts++;
            const button = drop.source.button;
            if (!button.get_parent()) {
                this._animationSources.delete(id);
                return GLib.SOURCE_REMOVE;
            }
            const [x, y] = button.get_transformed_position();
            const [width, height] = button.get_transformed_size();
            const centerX = x + width / 2;
            const centerY = y + height / 2;
            const destination = vertical ? drop.targetY : drop.targetX;
            const current = vertical ? centerY : centerX;
            // Wait for _syncTasks() to replace the destination placeholder.
            // The bounded fallback also handles a no-op drop.
            // Removing the placeholder also removes one box-spacing slot, so
            // the final center may differ by the configured spacing.
            if (Math.abs(current - destination) > 4 && attempts < 12)
                return GLib.SOURCE_CONTINUE;
            this._animationSources.delete(id);
            button.remove_transition('translation-x');
            button.remove_transition('translation-y');
            button.translation_x = drop.originX - centerX;
            button.translation_y = drop.originY - centerY;
            button.opacity = 255;
            button._lunaDropPending = false;
            button.ease({translation_x: 0, translation_y: 0, duration: 180,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => this.onMotion()});
            return GLib.SOURCE_REMOVE;
        });
        this._animationSources ??= new Set();
        this._animationSources.add(id);
    }

    destroy() {
        if (this._idle)
            GLib.Source.remove(this._idle);
        for (const id of this._animationSources ?? [])
            GLib.Source.remove(id);
        this._animationSources?.clear();
        this._finish();
        this.box._delegate = null;
    }
}
