import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {badgeAppId, mergeLauncherBadge, combinedBadge} from './badgeState.js';

let unityUsers = 0;
let unityOwner = 0;

export class NotificationBadges {
    constructor(onChange) {
        this._onChange = onChange;
        this._sources = new Map();
        this._counts = new Map();
        this._launcher = new Map();
        this._bus = Gio.DBus.session;
        this._launcherSignal = this._bus.signal_subscribe(null, 'com.canonical.Unity.LauncherEntry',
            'Update', null, null, Gio.DBusSignalFlags.NONE, (_bus, sender, _path, _iface, _signal, parameters) => {
                const [uri, properties] = parameters.recursiveUnpack();
                const id = badgeAppId(uri);
                if (!id || !properties || typeof properties !== 'object') return;
                let entries = this._launcher.get(sender);
                if (!entries) { entries = new Map(); this._launcher.set(sender, entries); }
                entries.set(id, mergeLauncherBadge(entries.get(id), properties));
                this._onChange();
            });
        this._ownerSignal = this._bus.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus',
            'NameOwnerChanged', '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (_bus, _sender, _path, _iface, _signal, parameters) => {
                const [name, , owner] = parameters.deepUnpack();
                if (!owner && this._launcher.delete(name)) this._onChange();
            });
        if (unityUsers++ === 0)
            unityOwner = this._bus.own_name('com.canonical.Unity', Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT, null, null);
        this._added = Main.messageTray.connect('source-added', (_tray, source) => this._add(source));
        this._removed = Main.messageTray.connect('source-removed', (_tray, source) => this._remove(source));
        for (const source of Main.messageTray.getSources()) this._add(source);
    }

    _add(source) {
        if (this._sources.has(source)) return;
        this._sources.set(source, [
            source.connect('notify::count', () => this._sync()),
            source.connect('destroy', () => this._remove(source)),
        ]);
        this._sync();
    }

    _remove(source) {
        for (const id of this._sources.get(source) ?? []) source.disconnect(id);
        this._sources.delete(source);
        this._sync();
    }

    _sync() {
        this._counts.clear();
        for (const source of this._sources.keys()) {
            const app = source.app ?? source._app;
            const id = badgeAppId(app?.get_id() ?? source._appId ?? source.policy?.id);
            if (!id) continue;
            const state = this._counts.get(id) ?? {count: 0, urgent: false};
            state.count += source.count || 0;
            state.urgent ||= source.constructor.name === 'WindowAttentionSource' ||
                source.notifications?.some(notification => notification.urgency > MessageTray.Urgency.NORMAL);
            this._counts.set(id, state);
        }
        this._onChange();
    }

    getState(app) {
        const ids = new Set([app?.get_id(), app?.get_app_info?.()?.get_startup_wm_class?.()]
            .map(badgeAppId).filter(Boolean));
        const system = {count: 0, urgent: false};
        for (const id of ids) {
            const state = this._counts.get(id);
            if (state) { system.count = Math.max(system.count, state.count); system.urgent ||= state.urgent; }
        }
        const launchers = [...this._launcher.values()].flatMap(entries =>
            [...ids].map(id => entries.get(id)).filter(Boolean));
        return combinedBadge(system, launchers);
    }

    getCount(app) { return this.getState(app).count; }

    destroy() {
        Main.messageTray.disconnect(this._added);
        Main.messageTray.disconnect(this._removed);
        this._bus.signal_unsubscribe(this._launcherSignal);
        this._bus.signal_unsubscribe(this._ownerSignal);
        if (--unityUsers === 0 && unityOwner) {
            this._bus.unown_name(unityOwner);
            unityOwner = 0;
        }
        for (const [source, ids] of this._sources) ids.forEach(id => source.disconnect(id));
        this._sources.clear();
        this._counts.clear();
        this._launcher.clear();
    }
}
