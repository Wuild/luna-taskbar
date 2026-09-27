import Gio from 'gi://Gio';
import St from 'gi://St';

export class IconArtwork {
    constructor(root, popup) {
        this._nodes = new Map();
        this._theme = new St.IconTheme();
        this._themeId = this._theme.connect('changed', () => {
            for (const record of this._nodes.values()) record.refresh?.();
        });
        this._add(root);
        if (popup) this._add(popup);
    }

    _resolve(gicon) {
        if (!(gicon instanceof Gio.ThemedIcon)) return gicon;
        const symbolic = gicon.get_names().some(name => name.endsWith('-symbolic'));
        let info = this._theme.lookup_by_gicon(gicon, symbolic ? 16 : 48, 0);
        if (info?.get_filename() && !/\.svg(?:z)?$/i.test(info.get_filename()))
            info = this._theme.lookup_by_gicon(gicon, 256, 0) ?? info;
        const filename = info?.get_filename();
        if (!filename) return gicon;
        let resource = filename.startsWith('resource://');
        if (!resource && !Gio.File.new_for_path(filename).query_exists(null)) {
            try { Gio.resources_get_info(filename, 0); resource = true; } catch { return gicon; }
        }
        const file = resource
            ? Gio.File.new_for_uri(filename.startsWith('resource://') ? filename : `resource://${filename}`) : Gio.File.new_for_path(filename);
        return new Gio.FileIcon({file});
    }

    _add(actor) {
        if (this._nodes.has(actor)) return;
        const record = {signals: []};
        this._nodes.set(actor, record);
        if (actor instanceof St.Icon) {
            record.source = actor.gicon;
            record.fallback = actor.fallback_gicon;
            let updating = false;
            record.refresh = () => {
                updating = true;
                record.applied = this._resolve(record.source);
                record.appliedFallback = this._resolve(record.fallback);
                actor.gicon = record.applied;
                actor.fallback_gicon = record.appliedFallback;
                updating = false;
            };
            for (const [property, field] of [['gicon', 'source'], ['fallback-gicon', 'fallback']]) {
                record.signals.push(actor.connect(`notify::${property}`, () => {
                    if (updating) return;
                    const current = property === 'gicon' ? actor.gicon : actor.fallback_gicon;
                    const applied = property === 'gicon' ? record.applied : record.appliedFallback;
                    if (current === applied || (current && applied && current.equal(applied))) return;
                    record[field] = current;
                    record.refresh();
                }));
            }
            record.refresh();
        } else {
            record.signals.push(actor.connect('child-added', (_parent, child) => this._add(child)));
            record.signals.push(actor.connect('child-removed', (_parent, child) => this._remove(child)));
            for (const child of actor.get_children()) this._add(child);
        }
    }

    _remove(actor) {
        const record = this._nodes.get(actor);
        if (!record) return;
        this._nodes.delete(actor);
        for (const id of record.signals) actor.disconnect(id);
        if (actor instanceof St.Icon) {
            actor.gicon = record.source;
            actor.fallback_gicon = record.fallback;
        } else {
            for (const child of actor.get_children()) this._remove(child);
        }
    }

    destroy() {
        this._theme.disconnect(this._themeId);
        for (const actor of [...this._nodes.keys()]) this._remove(actor);
    }
}
