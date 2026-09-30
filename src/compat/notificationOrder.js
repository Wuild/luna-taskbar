import St from 'gi://St';

export class NotificationOrder {
    constructor(view) {
        this._view = view;
        this._groups = new Map();
        this._notes = new Map();
        this._removedNotes = new WeakSet();
        this._addSource = view._addNotificationSource;
        this._move = view._moveMessage;
        view._addNotificationSource = source => {
            this._addSource.call(view, source);
            this._watch(view._notificationSourceToGroup.get(source));
            this.sort();
        };
        view._moveMessage = () => this.sort();
        for (const group of view._notificationSourceToGroup.values()) {
            group.get_parent().remove_all_transitions();
            group.get_parent().set_scale(1, 1);
            this._watch(group);
        }
        this.sort();
    }

    _watch(group) {
        if (!group || this._groups.has(group)) return;
        const move = group._moveMessage;
        const fade = group._updateStackedMessagesFade;
        const contentOpacity = new WeakMap();
        const cardOpacity = new WeakMap();
        const clips = new Map();
        const syncClips = () => {
            let bottom = null;
            for (const wrapper of group.get_children()) {
                const message = wrapper.child;
                if (!clips.has(message)) continue;
                const y = wrapper.y + message.y;
                if (!group.expanded && bottom !== null) {
                    const start = Math.max(0, Math.min(message.height, bottom - y));
                    message.set_clip(0, start, message.width, Math.max(0, message.height - start));
                } else {
                    message.remove_clip();
                }
                // St's allocation includes the CSS bottom margin; only the
                // painted card above should occlude the next backing strip.
                bottom = Math.max(bottom ?? 0, y + message.height - message.get_theme_node().get_margin(St.Side.BOTTOM));
            }
        };
        // Keep the translucent stacked surfaces, but suppress lower cards' text,
        // icons and controls without changing their measured size.
        group._updateStackedMessagesFade = () => {
            fade.call(group);
            const messages = new Set(group._notificationToMessage.values());
            let index = 0;
            for (const wrapper of group.get_children()) {
                const message = wrapper.child;
                if (!messages.has(message)) continue;
                const content = message.child;
                if (!clips.has(message)) {
                    const original = message.has_clip ? message.get_clip() : null;
                    const allocation = message.connect('notify::allocation', syncClips);
                    const wrapperAllocation = wrapper.connect('notify::allocation', syncClips);
                    const destroy = message.connect('destroy', () => clips.delete(message));
                    clips.set(message, {original, allocation, wrapper, wrapperAllocation, destroy});
                }
                if (!contentOpacity.has(content)) contentOpacity.set(content, content.opacity);
                if (!cardOpacity.has(message)) cardOpacity.set(message, message.opacity);
                // GNOME allocates every stacked card. With translucent surfaces
                // even the deepest borders show through the top card. Paint only
                // two backing cards, retaining all allocations for expansion.
                const stacked = !group.expanded && index > 0;
                message.opacity = !group.expanded && index >= 3 ? 0 : 255;
                // Visibility is derived from current expansion/order, never a
                // previously captured opacity that may already be hidden.
                content.opacity = stacked ? 0 : 255;
                index++;
            }
            syncClips();
        };
        group._moveMessage = () => this.sort();
        const added = group.connect('notification-added', () => this.sort());
        const expanded = group.connect('notify::expanded', () => group._updateStackedMessagesFade());
        const mapped = group.connect('notify::mapped', () => {
            if (group.mapped) group._updateStackedMessagesFade();
        });
        const destroyed = group.connect('destroy', () => this._groups.delete(group));
        this._groups.set(group, {move, fade, contentOpacity, cardOpacity, clips, added, expanded, mapped, destroyed});
        group._updateStackedMessagesFade();
    }

    sort() {
        const time = note => note.datetime?.to_unix_usec() ?? 0;
        const latest = new Map();
        for (const group of this._groups.keys()) {
            const entries = [...group._notificationToMessage.entries()]
                .filter(([note]) => !this._removedNotes.has(note))
                .sort(([a], [b]) => time(b) - time(a));
            latest.set(group, entries.length ? time(entries[0][0]) : 0);
            for (const [note] of entries) {
                if (this._notes.has(note)) continue;
                const changed = note.connect('notify::datetime', () => this.sort());
                const destroyed = note.connect('destroy', () => {
                    // Shell keeps the card in its map until its exit animation
                    // finishes. Never reconnect to that disposed notification.
                    this._removedNotes.add(note);
                    note.disconnect(changed);
                    this._notes.delete(note);
                });
                this._notes.set(note, {changed, destroyed});
            }
            const wrappers = entries.map(([, message]) => message.get_parent());
            const current = group.get_children().filter(child => wrappers.includes(child));
            if (wrappers.some((wrapper, index) => current[index] !== wrapper)) {
                wrappers.forEach((wrapper, index) => group.set_child_at_index(wrapper, index));
                group._ensureCoverPosition();
                group._updateStackedMessagesFade();
            }
        }
        this._view.messages.sort((a, b) => (latest.get(b) ?? 0) - (latest.get(a) ?? 0));
        this._view.queue_relayout();
    }

    destroy() {
        this._view._addNotificationSource = this._addSource;
        this._view._moveMessage = this._move;
        for (const [group, {move, fade, contentOpacity, cardOpacity, clips, added, expanded, mapped, destroyed}] of this._groups) {
            group._updateStackedMessagesFade = fade;
            for (const [message, {original, allocation, wrapper, wrapperAllocation, destroy}] of clips) {
                message.disconnect(allocation);
                wrapper.disconnect(wrapperAllocation);
                message.disconnect(destroy);
                if (original) message.set_clip(...original);
                else message.remove_clip();
            }
            for (const message of group._notificationToMessage.values()) {
                const opacity = contentOpacity.get(message.child);
                if (opacity !== undefined) message.child.opacity = opacity;
                const card = cardOpacity.get(message);
                if (card !== undefined) message.opacity = card;
            }
            group._moveMessage = move;
            group.disconnect(added);
            group.disconnect(expanded);
            group.disconnect(mapped);
            group.disconnect(destroyed);
        }
        for (const [note, {changed, destroyed}] of this._notes) {
            note.disconnect(changed);
            note.disconnect(destroyed);
        }
        this._groups.clear();
        this._notes.clear();
    }
}
