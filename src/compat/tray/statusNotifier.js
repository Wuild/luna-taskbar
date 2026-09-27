import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {call} from './dbus.js';
import {TrayItem} from './item.js';
import {parseTrayAddress} from './address.js';

const NAME = 'org.kde.StatusNotifierWatcher';
const PATH = '/StatusNotifierWatcher';
const XML = `<node><interface name="${NAME}">
<method name="RegisterStatusNotifierItem"><arg type="s" direction="in"/></method>
<method name="RegisterStatusNotifierHost"><arg type="s" direction="in"/></method>
<property name="RegisteredStatusNotifierItems" type="as" access="read"/>
<property name="IsStatusNotifierHostRegistered" type="b" access="read"/>
<property name="ProtocolVersion" type="i" access="read"/>
<signal name="StatusNotifierItemRegistered"><arg type="s"/></signal>
<signal name="StatusNotifierItemUnregistered"><arg type="s"/></signal>
<signal name="StatusNotifierHostRegistered"/>
</interface></node>`;

export class StatusNotifierTray {
    constructor(box, logger, settings, beforeNativeAction) {
        this.settings = settings;
        this.beforeNativeAction = beforeNativeAction;
        this.box = box;
        this.logger = logger;
        this.items = new Map();
        this.cancellable = new Gio.Cancellable();
        this.bus = Gio.DBusConnection.new_for_address_sync(
            Gio.dbus_address_get_for_bus_sync(Gio.BusType.SESSION, null),
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
            null, null);
        this._signals = [this.bus.signal_subscribe(NAME, NAME, null, PATH, null, 0,
            (_bus, _sender, _path, _iface, signal, params) => {
                const [id] = params.deepUnpack();
                if (signal === 'StatusNotifierItemRegistered')
                    this._add(id);
                else if (signal === 'StatusNotifierItemUnregistered')
                    this._remove(id);
            })];
        // Export before claiming the name: clients may call immediately when
        // NameOwnerChanged arrives, before our name-acquired callback runs.
        this._export();
        this._owner = Gio.bus_own_name_on_connection(this.bus, NAME,
            Gio.BusNameOwnerFlags.NONE,
            () => {
                this._isOwner = true;
                this._exported?.emit_signal('StatusNotifierHostRegistered', null);
            }, () => { this._isOwner = false; this._follow(); });
        this._watcherWatch = Gio.bus_watch_name_on_connection(this.bus, NAME,
            Gio.BusNameWatcherFlags.NONE, () => this._follow(), () => {});
    }

    get RegisteredStatusNotifierItems() { return [...this.items.keys()]; }
    get IsStatusNotifierHostRegistered() { return true; }
    get ProtocolVersion() { return 0; }

    _report(error) {
        if (!this.cancellable.is_cancelled())
            this.logger.warn(`StatusNotifier: ${error.message}`);
    }

    _export() {
        if (this.cancellable.is_cancelled() || this._exported)
            return;
        this._exported = Gio.DBusExportedObject.wrapJSObject(XML, this);
        this._exported.export(this.bus, PATH);
    }

    async _follow() {
        if (this._isOwner || this.cancellable.is_cancelled())
            return;
        try {
            const [props] = await call(this.bus, NAME, PATH,
                'org.freedesktop.DBus.Properties', 'GetAll',
                new GLib.Variant('(s)', [NAME]), this.cancellable);
            if (this.cancellable.is_cancelled())
                return;
            for (const id of props.RegisteredStatusNotifierItems ?? [])
                this._add(id);
            try {
                await call(this.bus, NAME, PATH, NAME, 'RegisterStatusNotifierHost',
                    new GLib.Variant('(s)', [this.bus.get_unique_name()]), this.cancellable);
            } catch (error) {
                if (Gio.DBusError.get_remote_error(error) !== 'org.freedesktop.DBus.Error.NotSupported')
                    throw error;
            }
        } catch (error) {
            this._report(error);
        }
    }

    RegisterStatusNotifierItemAsync([address], invocation) {
        const id = address.startsWith('/') ? invocation.get_sender() + address
            : address.includes('/') ? address : `${address}/StatusNotifierItem`;
        if (!this._add(id)) {
            invocation.return_dbus_error('org.freedesktop.DBus.Error.InvalidArgs', 'Invalid tray address');
            return;
        }
        invocation.return_value(null);
    }

    RegisterStatusNotifierHostAsync(_args, invocation) {
        invocation.return_value(null);
    }

    _add(id) {
        if (this.cancellable.is_cancelled()) return false;
        const address = parseTrayAddress(id);
        if (!address) return false;
        const {service, path} = address;
        id = address.id;
        if (this.items.has(id)) return true;
        const item = new TrayItem(this.bus, service, path, this.box, this.logger, this.settings, this.beforeNativeAction);
        item.watch = Gio.bus_watch_name_on_connection(this.bus, service,
            Gio.BusNameWatcherFlags.NONE, () => {}, () => this._remove(id));
        this.items.set(id, item);
        if (this._isOwner) this._exported?.emit_signal('StatusNotifierItemRegistered', new GLib.Variant('(s)', [id]));
        if (this._isOwner) this._exported?.emit_property_changed('RegisteredStatusNotifierItems',
            new GLib.Variant('as', this.RegisteredStatusNotifierItems));
        return true;
    }

    _remove(id) {
        id = parseTrayAddress(id)?.id;
        const item = this.items.get(id);
        if (!item)
            return;
        Gio.bus_unwatch_name(item.watch);
        item.destroy();
        this.items.delete(id);
        if (this._isOwner) this._exported?.emit_signal('StatusNotifierItemUnregistered', new GLib.Variant('(s)', [id]));
        if (this._isOwner) this._exported?.emit_property_changed('RegisteredStatusNotifierItems',
            new GLib.Variant('as', this.RegisteredStatusNotifierItems));
    }

    closeMenus() {
        for (const item of this.items.values())
            item.remoteMenu?.menu.close();
    }

    destroy() {
        this.cancellable.cancel();
        Gio.bus_unwatch_name(this._watcherWatch);
        Gio.bus_unown_name(this._owner);
        this._exported?.unexport();
        this._exported = null;
        this._signals.forEach(id => this.bus.signal_unsubscribe(id));
        for (const id of [...this.items.keys()])
            this._remove(id);
        this.bus.close(null, (bus, result) => {
            try { bus.close_finish(result); } catch { /* already closed */ }
        });
    }
}
