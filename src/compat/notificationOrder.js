export class NotificationOrder {
    constructor(view) {
        this._view = view;
        this._groups = new Map();
        this._notes = new Map();
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
        group._moveMessage = () => this.sort();
        const added = group.connect('notification-added', () => this.sort());
        const destroyed = group.connect('destroy', () => this._groups.delete(group));
        this._groups.set(group, {move, added, destroyed});
    }

    sort() {
        const time = note => note.datetime?.to_unix_usec() ?? 0;
        const latest = new Map();
        for (const group of this._groups.keys()) {
            const entries = [...group._notificationToMessage.entries()]
                .sort(([a], [b]) => time(b) - time(a));
            latest.set(group, entries.length ? time(entries[0][0]) : 0);
            for (const [note] of entries) {
                if (this._notes.has(note)) continue;
                const changed = note.connect('notify::datetime', () => this.sort());
                const destroyed = note.connect('destroy', () => {
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
        for (const [group, {move, added, destroyed}] of this._groups) {
            group._moveMessage = move;
            group.disconnect(added);
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
