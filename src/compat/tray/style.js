import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

export class TrayStyle {
    constructor(settings) {
        this._settings = settings;
        this._context = St.ThemeContext.get_for_stage(global.stage);
        this._file = Gio.File.new_for_path(GLib.build_filenamev([
            GLib.get_user_runtime_dir(), `luna-taskbar-tray-${GLib.uuid_string_random()}.css`]));
        this._themeId = this._context.connect('notify::theme', () => this._update());
        this._settingsId = settings.connect('changed', (_s, key) => {
            if (['tray-icon-size', 'tray-text-size', 'tray-popup-icon-size', 'applet-padding'].includes(key)) this._update();
        });
        this._update();
    }
    _update() {
        this._theme?.unload_stylesheet(this._file);
        const icon = this._settings.get_int('tray-icon-size');
        const popupIcon = this._settings.get_int('tray-popup-icon-size');
        const padding = this._settings.get_int('applet-padding');
        const text = this._settings.get_int('tray-text-size');
        this._file.replace_contents(`
.luna-taskbar .luna-taskbar-system .panel-button.luna-taskbar-system-applet { padding: 0; -minimum-hpadding: ${padding}px; -natural-hpadding: ${padding}px; }
.luna-taskbar .luna-taskbar-system StIcon, .luna-taskbar .luna-taskbar-tray StIcon { icon-size: ${icon}px; }
.luna-taskbar-popup .luna-taskbar-tray StIcon { icon-size: ${popupIcon}px; }
.luna-taskbar .luna-taskbar-system StLabel, .luna-taskbar .luna-taskbar-tray StLabel,
.luna-taskbar-popup .luna-taskbar-tray StLabel { font-size: ${text}px; }
.luna-taskbar.luna-taskbar-vertical .luna-taskbar-system .panel-button.luna-taskbar-system-applet { padding: 2px; -minimum-hpadding: 2px; -natural-hpadding: 2px; }
`, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        this._theme = this._context.get_theme();
        this._theme.load_stylesheet(this._file);
    }
    destroy() {
        this._settings.disconnect(this._settingsId);
        this._context.disconnect(this._themeId);
        this._theme?.unload_stylesheet(this._file);
        this._file.delete(null);
    }
}
