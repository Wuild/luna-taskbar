import St from 'gi://St';

import {SYSTEM_ICONS} from './systemIconOptions.js';

export class SystemButtonIcons {
    constructor(button, settings) {
        this._box = button._indicators;
        this._settings = settings;
        this._records = [];
        for (const [key, field] of SYSTEM_ICONS) {
            const actor = button[field];
            if (!actor || actor.get_parent() !== this._box) continue;
            const index = this._box.get_children().indexOf(actor);
            this._box.remove_child(actor);
            const wrapper = new St.Bin({child: actor, x_expand: false});
            this._box.insert_child_at_index(wrapper, index);
            const signal = actor.connect('notify::visible', () => this._update());
            this._records.push({key, actor, wrapper, signal});
        }
        this._fallback = new St.Icon({icon_name: 'preferences-system-symbolic',
            style_class: 'system-status-icon', visible: false});
        this._box.add_child(this._fallback);
        this._settingId = settings.connect('changed::system-hidden-icons', () => this._update());
        this._update();
    }
    _update() {
        const hidden = new Set(this._settings.get_strv('system-hidden-icons'));
        for (const {key, actor, wrapper} of this._records) wrapper.visible = !hidden.has(key) && actor.visible;
        this._syncFallback();
    }
    _syncFallback() {
        if (!this._fallback) return;
        this._fallback.visible = !this._box.get_children().some(actor => {
            if (actor === this._fallback || !actor.visible) return false;
            const record = this._records.find(item => item.wrapper === actor);
            return !record || record.actor.visible;
        });
    }
    destroy() {
        this._settings.disconnect(this._settingId);
        this._fallback.destroy();
        for (const {actor, wrapper, signal} of this._records) {
            actor.disconnect(signal);
            const index = this._box.get_children().indexOf(wrapper);
            wrapper.set_child(null);
            this._box.remove_child(wrapper);
            this._box.insert_child_at_index(actor, index);
            wrapper.destroy();
        }
    }
}
