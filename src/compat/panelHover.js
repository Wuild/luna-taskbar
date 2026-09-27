import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Modal popups redirect crossing events away from the taskbar. Mirror only
// hover state; leave grabs, clicks, keyboard focus and menu switching untouched.
export class PanelHover {
    constructor(bar, active, overlay) {
        this.bar = bar;
        this.active = active;
        this.overlay = overlay;
        this.hovered = new Map();
        this.sources = new Map();
        const watch = actor => {
            if (this.sources.has(actor)) return;
            const eventId = actor.connect('captured-event', (_actor, event) => {
                if ([Clutter.EventType.MOTION, Clutter.EventType.ENTER, Clutter.EventType.LEAVE].includes(event.type()) && !this.pending && (this.active() || this.hovered.size))
                    this.pending = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                        this.pending = 0; this.sync(); return GLib.SOURCE_REMOVE;
                    });
                return Clutter.EVENT_PROPAGATE;
            });
            const destroyId = actor.connect('destroy', () => this.sources.delete(actor));
            this.sources.set(actor, [eventId, destroyId]);
        };
        watch(global.stage);
        for (const actor of Main.uiGroup.get_children()) watch(actor);
        this.addedId = Main.uiGroup.connect('child-added', (_group, actor) => watch(actor));
    }

    sync() {
        const next = new Set();
        const active = this.active();
        if (active && this.bar.mapped) {
            const [x, y] = global.get_pointer();
            let actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
            // Search has a full-screen dismissal actor above the taskbar.
            if (actor === this.overlay()) {
                const hit = node => {
                    if (!node.mapped) return null;
                    const [ax, ay] = node.get_transformed_position();
                    const [w, h] = node.get_transformed_size();
                    if (x < ax || y < ay || x >= ax + w || y >= ay + h) return null;
                    for (const child of node.get_children().reverse()) {
                        const found = hit(child);
                        if (found) return found;
                    }
                    return node.reactive ? node : null;
                };
                actor = hit(this.bar);
            }
            if (actor && this.bar.contains(actor)) {
                for (let node = actor; node && node !== this.bar; node = node.get_parent()) {
                    if (node instanceof St.Widget && node.reactive && node.track_hover)
                        next.add(node);
                }
            }
        }
        for (const [actor, id] of this.hovered) {
            if (next.has(actor)) continue;
            actor.disconnect(id);
            if (active) actor.set_hover(false);
            else actor.sync_hover();
            this.hovered.delete(actor);
        }
        for (const actor of next) {
            if (!this.hovered.has(actor))
                this.hovered.set(actor, actor.connect('destroy', () => this.hovered.delete(actor)));
            actor.set_hover(true);
        }
    }
    destroy() {
        Main.uiGroup.disconnect(this.addedId);
        if (this.pending) GLib.Source.remove(this.pending);
        for (const [actor, ids] of this.sources) ids.forEach(id => actor.disconnect(id));
        this.sources.clear();
        for (const [actor, id] of this.hovered) { actor.disconnect(id); actor.set_hover(false); }
        this.hovered.clear();
    }
}
