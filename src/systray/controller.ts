import type St from 'gi://St';
import type {TaskbarSettings} from '../settings/settings.js';
import type {TrayDrawer} from '../compat/trayDrawer.js';
import type {TrayItem} from '../compat/tray/item.js';
import {Lifecycle} from '../core/lifecycle.js';
import {NativeTrayMenus} from '../compat/tray/nativeMenu.js';
import {TrayStyle} from '../compat/tray/style.js';
import {LegacyTray} from '../compat/tray/legacy.js';
import {StatusNotifierTray} from '../compat/tray/statusNotifier.js';

export interface TrayLogger {
    warn(message: string): void;
    log(message: string): void;
}

export class Tray {
    private readonly lifetime = new Lifecycle();
    private readonly _style: TrayStyle;
    private readonly _native: NativeTrayMenus;
    private _legacy?: LegacyTray;
    _modern?: StatusNotifierTray;
    constructor(box: St.BoxLayout, logger: TrayLogger, settings: TaskbarSettings,
        getDrawer: () => TrayDrawer | null) {
        this._style = new TrayStyle(settings);
        this._native = new NativeTrayMenus(getDrawer, logger);
        this.lifetime.add(() => this._style.destroy());
        this.lifetime.add(() => this._native.destroy());
        // Failure in one protocol must not prevent the taskbar or other tray.
        try {
            this._legacy = new LegacyTray(box, logger, settings, this._native);
            this.lifetime.add(() => this._legacy?.destroy());
        } catch (error) {
            logger.warn(`Legacy tray: ${error instanceof Error ? error.message : String(error)}`);
        }
        try {
            this._modern = new StatusNotifierTray(box, logger, settings,
                (item: TrayItem, method: string, point: {x: number; y: number}) =>
                    this._native.prepare(item, method, point));
            this.lifetime.add(() => this._modern?.destroy());
        } catch (error) {
            logger.warn(`StatusNotifier tray: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    closeMenus() { this._native.close(); this._modern?.closeMenus(); this._legacy?.closeMenus(); }

    destroy() {
        this.lifetime.destroy();
    }
}
