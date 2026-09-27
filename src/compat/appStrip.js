import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import {createHorizontalScroll, revealInScroll} from './horizontalScroll.js';

export class AppStrip {
    constructor(apps, getDrag, repaint) {
        Object.assign(this, {apps, getDrag, repaint});
        this.actor = new St.BoxLayout({x_expand: true, min_width: 0, style_class: 'luna-taskbar-app-strip'});
        this.actor._delegate = this;
        this.scroll = createHorizontalScroll({x_expand: true, min_width: 0});
        this.scroll.set_child(apps);
        this.left = this._arrow('pan-start-symbolic', 'Scroll applications left', -1);
        this.right = this._arrow('pan-end-symbolic', 'Scroll applications right', 1);
        this.actor.add_child(this.left);
        this.actor.add_child(this.scroll);
        this.actor.add_child(this.right);
        this._signals = [
            [this.actor, this.actor.connect('notify::allocation', () => this._sync())],
            [apps, apps.connect('notify::allocation', () => this._sync())],
            [this.scroll.hadjustment, this.scroll.hadjustment.connect('changed', () => this._sync())],
            [this.scroll.hadjustment, this.scroll.hadjustment.connect('notify::value', () => {
                this._sync();
                this.repaint();
            })],
        ];
        for (const signal of ['changed', 'notify::value'])
            this._signals.push([this.scroll.vadjustment, this.scroll.vadjustment.connect(signal, () => { this._sync(); this.repaint(); })]);
    }

    setVertical(vertical) {
        if (this.vertical === vertical) return;
        this.vertical = vertical;
        this.actor.orientation = this.apps.orientation = vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
        this.actor.x_expand = this.scroll.x_expand = !vertical;
        this.actor.y_expand = this.scroll.y_expand = vertical;
        this.actor.min_height = this.scroll.min_height = 0;
        this.scroll._lunaVertical = vertical;
        this.scroll.hscrollbar_policy = vertical ? St.PolicyType.NEVER : St.PolicyType.EXTERNAL;
        this.scroll.vscrollbar_policy = vertical ? St.PolicyType.EXTERNAL : St.PolicyType.NEVER;
        this.left.child.icon_name = vertical ? 'pan-up-symbolic' : 'pan-start-symbolic';
        this.right.child.icon_name = vertical ? 'pan-down-symbolic' : 'pan-end-symbolic';
        this._sync();
    }

    get adjustment() { return this.vertical ? this.scroll.vadjustment : this.scroll.hadjustment; }

    _arrow(icon, label, direction) {
        const button = new St.Button({style_class: 'luna-taskbar-scroll-arrow', accessible_name: label,
            can_focus: true, visible: false, x_expand: false,
            child: new St.Icon({icon_name: icon, icon_size: 12})});
        button.connect('clicked', () => this.advance(direction));
        return button;
    }

    _sync() {
        // Compare against the whole strip, not the narrowed arrow viewport, to
        // avoid arrows keeping themselves visible after the apps fit again.
        const overflow = (this.vertical ? this.apps.get_preferred_height(-1)[1] > this.actor.height + 1 : this.apps.get_preferred_width(-1)[1] > this.actor.width + 1);
        this.left.visible = this.right.visible = overflow;
        const adjustment = this.adjustment;
        const left = overflow && adjustment.value > adjustment.lower + 1;
        const right = overflow && adjustment.value < adjustment.upper - adjustment.page_size - 1;
        for (const [button, available] of [[this.left, left], [this.right, right]]) {
            button.opacity = available ? 255 : 0;
            button.reactive = button.can_focus = available;
        }
        const fade = 12 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.scroll.update_fade_effect(new Clutter.Margin(this.vertical ? {top: left ? fade : 0, bottom: right ? fade : 0} : {left: left ? fade : 0, right: right ? fade : 0}));
    }

    advance(direction) {
        const a = this.adjustment;
        const step = Math.max(1, a.page_size * 0.7);
        const value = Math.max(a.lower, Math.min(a.upper - a.page_size, a.value + direction * step));
        a.ease(value, {duration: 180, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    reveal(button) {
        if (this.getDrag()?.dragging)
            return;
        revealInScroll(this.scroll, button, true);
    }

    beginDrag() {
        if (this._edgeTimer)
            return;
        this._edgeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            const drag = this.getDrag();
            if (!drag?.dragging) {
                this._edgeTimer = 0;
                return GLib.SOURCE_REMOVE;
            }
            const [x, y] = global.get_pointer();
            this._edgeStep(x, y);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _edgeStep(x, y) {
        const drag = this.getDrag();
        if (!drag?.dragging)
            return;
        const [left, top] = this.scroll.get_transformed_position();
        const [stripX, stripY] = this.actor.get_transformed_position();
        if (y < stripY || y > stripY + this.actor.height || x < stripX || x > stripX + this.actor.width)
            return;
        const zone = 24 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const point = this.vertical ? y : x;
        const start = this.vertical ? top : left;
        const extent = this.vertical ? this.scroll.height : this.scroll.width;
        const direction = point < start + zone ? -1 : point > start + extent - zone ? 1 : 0;
        if (!direction)
            return;
        const a = this.adjustment;
        const value = Math.max(a.lower, Math.min(a.upper - a.page_size, a.value + direction * zone / 4));
        if (value === a.value)
            return;
        a.remove_transition('value');
        a.value = value;
        const [ok, localX, localY] = this.apps.transform_stage_point(x, y);
        if (ok)
            drag.handleDragOver(drag._source, null, localX, localY);
    }

    handleDragOver(source) {
        const drag = this.getDrag();
        if (source.owner !== drag)
            return DND.DragMotionResult.NO_DROP;
        const [x, y] = global.get_pointer();
        const [ok, localX, localY] = this.apps.transform_stage_point(x, y);
        return ok ? drag.handleDragOver(source, null, localX, localY) : DND.DragMotionResult.NO_DROP;
    }

    acceptDrop(source) {
        const drag = this.getDrag();
        if (source.owner !== drag)
            return false;
        const [x, y] = global.get_pointer();
        const [ok, localX, localY] = this.apps.transform_stage_point(x, y);
        return ok && drag.acceptDrop(source, null, localX, localY);
    }

    destroy() {
        if (this._edgeTimer)
            GLib.Source.remove(this._edgeTimer);
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this.scroll.vadjustment.remove_transition('value');
        this.scroll.hadjustment.remove_transition('value');
        this.actor._delegate = null;
    }
}
