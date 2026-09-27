import {_} from '../../i18n.js';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {rememberTrayItem} from './identity.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class LegacyTray {
    constructor(box, logger, settings, nativeMenus) {
        this._box = box;
        this._native = nativeMenus;
        this._logger = logger;
        this._icons = new Map();
        const competing = Main.extensionManager.lookup(
            'appindicatorsupport@rgcjonas.gmail.com');
        if (competing?.state === 1) {
            logger.warn('Luna - Taskbar legacy tray is deferred while AppIndicator is enabled. ' +
                'Disable AppIndicator to test the native Wine/Battle.net tray path.');
            return;
        }
        this._manager = new Shell.TrayManager();
        this._added = this._manager.connect('tray-icon-added', (_manager, icon) => {
            const button = new St.Bin({
                style_class: 'luna-taskbar-tray-button', reactive: true,
                track_hover: true, can_focus: true,
                accessible_name: icon.title || icon.wm_class || _('Tray application'),
                child: icon,
            });
            button._lunaTaskbarTrayKey = `xembed:${icon.wm_class || icon.title || 'application'}`;
            if (settings) rememberTrayItem(settings, button._lunaTaskbarTrayKey, button.accessible_name);
            const resize = () => {
                const size = (settings?.get_int(button._lunaTaskbarInDrawer ? 'tray-popup-icon-size' : 'tray-icon-size') ?? 16) * St.ThemeContext.get_for_stage(global.stage).scale_factor;
                icon.set_size(size, size);
            };
            const theme = St.ThemeContext.get_for_stage(global.stage);
            const scaleId = theme.connect('notify::scale-factor', resize);
            const sizeId = settings?.connect('changed', (_settings, key) => {
                if (['tray-icon-size', 'tray-popup-icon-size'].includes(key)) resize();
            });
            button._lunaTaskbarSetInDrawer = inDrawer => { button._lunaTaskbarInDrawer = inDrawer; resize(); };
            resize();
            button.connect('button-press-event', () => Clutter.EVENT_STOP);
            button.connect('button-release-event', (_actor, event) => {
                logger.log(`XEmbed click: button=${event.get_button()}, app=${icon.wm_class}`);
                const copy = event.copy();
                const open = async () => {
                    await this._native.close(false);
                    if (!this._icons.has(icon)) return;
                    if (copy.get_button() === 3) {
                        const [x, y] = copy.get_coords();
                        this._native.watch(icon.pid, {wine: /wine|steam_app/i.test(icon.wm_class || ''), title: icon.title, point: {x, y}});
                    }
                    else this._native._drawer()?.resumeAfterNativeMenu();
                    icon.click(copy);
                };
                open().catch(error => logger.warn(error.message));
                return Clutter.EVENT_STOP;
            });
            button.connect('key-release-event', (_actor, event) => {
                if ([Clutter.KEY_Return, Clutter.KEY_space].includes(event.get_key_symbol())) {
                    icon.click(event);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            button.connect('destroy', () => {
                theme.disconnect(scaleId);
                if (sizeId) settings.disconnect(sizeId);
            });
            this._icons.set(icon, button);
            box.add_child(button);
        });
        this._removed = this._manager.connect('tray-icon-removed', (_manager, icon) => {
            const button = this._icons.get(icon);
            if (button) {
                button.set_child(null);
                button.destroy();
                this._icons.delete(icon);
            }
        });
        this._manager.manage_screen(box);
    }

    closeMenus() { this._native.close(); }

    destroy() {
        if (!this._manager)
            return;
        this.closeMenus();
        this._manager.disconnect(this._added);
        this._manager.disconnect(this._removed);
        this._manager.unmanage_screen();
        for (const button of this._icons.values()) {
            button.set_child(null);
            button.destroy();
        }
        this._icons.clear();
        this._manager = null;
    }
}
