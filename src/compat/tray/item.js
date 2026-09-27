import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import St from 'gi://St';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {activateTrayItem, hasRemoteMenu} from './actions.js';
import {call} from './dbus.js';
import {trayIdentity, rememberTrayItem} from './identity.js';
import {RemoteMenu} from './remoteMenu.js';

const IFACE = 'org.kde.StatusNotifierItem';

export class TrayItem {
    constructor(bus, service, path, box, logger, settings, beforeNativeAction) {
        Object.assign(this, {bus, service, path, logger, settings});
        this.cancellable = new Gio.Cancellable();
        this.icon = new St.Icon({icon_name: 'application-x-executable', icon_size: settings?.get_int('tray-icon-size') ?? 16});
        this.button = new St.Button({
            style_class: 'luna-taskbar-tray-button', can_focus: true,
            child: this.icon, button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO | St.ButtonMask.THREE,
        });
        const resize = () => {
            this.icon.icon_size = settings?.get_int(this._inDrawer ? 'tray-popup-icon-size' : 'tray-icon-size') ?? 16;
        };
        this.button._lunaTaskbarSetInDrawer = inDrawer => { this._inDrawer = inDrawer; resize(); };
        const sizeId = settings?.connect('changed', (_settings, key) => {
            if (key === 'tray-show-passive' && this.props)
                this.button.visible = this.props.Status !== 'Passive' || settings.get_boolean('tray-show-passive');
            if (['tray-icon-size', 'tray-popup-icon-size'].includes(key)) resize();
        });
        this.button.connect('destroy', () => { if (sizeId) settings.disconnect(sizeId); });
        box.add_child(this.button);
        this.button.connect('clicked', (_actor, button) => {
            if (this._activating) return;
            this._activating = true;
            logger.log(`StatusNotifier click: button=${button}, service=${service}`);
            const [x, y] = global.get_pointer();
            activateTrayItem({button, props: this.props, remoteMenu: this.remoteMenu,
                invoke: async method => {
                    if (await beforeNativeAction?.(this, method, {x, y}) === false) return;
                    return call(bus, service, path, IFACE, method,
                        new GLib.Variant('(ii)', [Math.round(x), Math.round(y)]), this.cancellable);
                },
                isCancelled: () => this.cancellable.is_cancelled(),
                restoreWindow: () => this._restoreWindow(),
            }).catch(error => this._report(error)).finally(() => { this._activating = false; });
        });
        this.button.connect('scroll-event', (_actor, event) => {
            const direction = event.get_scroll_direction();
            const horizontal = [Clutter.ScrollDirection.LEFT, Clutter.ScrollDirection.RIGHT].includes(direction);
            let delta = [Clutter.ScrollDirection.UP, Clutter.ScrollDirection.LEFT].includes(direction) ? 120 : -120;
            if (direction === Clutter.ScrollDirection.SMOOTH) {
                const [, dy] = event.get_scroll_delta();
                delta = Math.round(-dy * 120);
            }
            call(bus, service, path, IFACE, 'Scroll',
                new GLib.Variant('(is)', [delta, horizontal ? 'horizontal' : 'vertical']), this.cancellable)
                .catch(error => this._report(error));
            return Clutter.EVENT_STOP;
        });
        this.subscription = bus.signal_subscribe(service, null, null, path, null, 0,
            () => this.refresh());
        this.refresh();
    }

    async _restoreWindow() {
        const windows = global.display.list_all_windows().filter(window =>
            window.get_window_type() === Meta.WindowType.NORMAL && !window.skip_taskbar);
        let matches;
        if (this.props?.Id?.startsWith('wine-')) {
            const title = this.props.Title;
            matches = title ? windows.filter(window => window.get_client_type() === Meta.WindowClientType.X11 &&
                window.get_title() === title) : [];
            if (matches.length !== 1) return;
        } else {
            const [pid] = await call(this.bus, 'org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'GetConnectionUnixProcessID',
                new GLib.Variant('(s)', [this.service]), this.cancellable);
            if (this.cancellable.is_cancelled()) return;
            matches = global.display.list_all_windows().filter(window => window.get_pid() === pid &&
                window.get_window_type() === Meta.WindowType.NORMAL && !window.skip_taskbar);
            matches.sort((a, b) => b.get_user_time() - a.get_user_time());
        }
        if (matches.length) Main.activateWindow(matches[0]);
    }

    _report(error) {
        if (!this.cancellable.is_cancelled())
            this.logger.warn(`Tray ${this.service}: ${error.message}`);
    }

    async refresh() {
        const generation = this._generation = (this._generation ?? 0) + 1;
        try {
            const [props] = await call(this.bus, this.service, this.path,
                'org.freedesktop.DBus.Properties', 'GetAll', new GLib.Variant('(s)', [IFACE]), this.cancellable);
            if (this.cancellable.is_cancelled() || generation !== this._generation)
                return;
            this.props = props;
            if (!this.button._lunaTaskbarTrayKey) {
                const key = await trayIdentity(this);
                if (this.cancellable.is_cancelled() || generation !== this._generation) return;
                this.button._lunaTaskbarTrayKey = key;
                rememberTrayItem(this.settings, key, props.Title || key.replace(/^[^:]+:/, ''));
            }
            this.button.visible = props.Status !== 'Passive' || (this.settings?.get_boolean('tray-show-passive') ?? true);
            this.button.accessible_name = props.Title || props.Id || this.service;
            const attention = props.Status === 'NeedsAttention';
            const name = attention && props.AttentionIconName ? props.AttentionIconName : props.IconName;
            const theme = new St.IconTheme();
            let file = null;
            if (name?.startsWith('/'))
                file = Gio.File.new_for_path(name);
            else if (name && props.IconThemePath) {
                for (const suffix of ['', '.png', '.svg', '.xpm']) {
                    const candidate = Gio.File.new_for_path(GLib.build_filenamev([props.IconThemePath, name + suffix]));
                    if (candidate.query_exists(null)) {
                        file = candidate;
                        break;
                    }
                }
            }
            this.icon.gicon = null;
            if (file?.query_exists(null))
                this.icon.gicon = new Gio.FileIcon({file});
            else if (name && theme.has_icon(name))
                this.icon.icon_name = name;
            else {
                this.icon.icon_name = 'application-x-executable';
                const pixmaps = (attention && props.AttentionIconPixmap?.length
                    ? props.AttentionIconPixmap : props.IconPixmap) ?? [];
                const candidate = pixmaps.filter(([w, h, bytes]) => w > 0 && h > 0 &&
                    w <= 512 && h <= 512 && bytes.length === w * h * 4)
                    .sort((a, b) => Math.abs(a[0] - 24) - Math.abs(b[0] - 24))[0];
                if (candidate) {
                    const [w, h, argb] = candidate;
                    const rgba = new Uint8Array(argb.length);
                    for (let i = 0; i < argb.length; i += 4)
                        rgba.set([argb[i + 1], argb[i + 2], argb[i + 3], argb[i]], i);
                    const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(new GLib.Bytes(rgba),
                        GdkPixbuf.Colorspace.RGB, true, 8, w, h, w * 4);
                    const [ok, bytes] = pixbuf.save_to_bufferv('png', [], []);
                    if (ok)
                        this.icon.gicon = new Gio.BytesIcon({bytes: new GLib.Bytes(bytes)});
                }
            }
            if (this._menuPath !== props.Menu) {
                this.remoteMenu?.destroy();
                this.remoteMenu = null;
                this._menuPath = props.Menu;
                if (hasRemoteMenu(props.Menu))
                    this.remoteMenu = new RemoteMenu(this.bus, this.service, props.Menu,
                        this.button, this.cancellable, this.logger, this.settings);
            }
        } catch (error) {
            this._report(error);
        }
    }

    destroy() {
        this.cancellable.cancel();
        this.bus.signal_unsubscribe(this.subscription);
        this.remoteMenu?.destroy();
        this.button.destroy();
    }
}
