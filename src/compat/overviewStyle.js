import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {validColor} from './colors.js';
import {watchThemeColors, surfaceColor, surfaceText} from './themeColors.js';

// Scope every selector to the borrowed overview, and unload on disable.
export class OverviewStyle {
    constructor(settings) {
        this._settings = settings;
        this._controls = Main.overview._overview.controls;
        this._controls.add_style_class_name('luna-taskbar-overview');
        this._file = Gio.File.new_for_path(GLib.build_filenamev([
            GLib.get_user_runtime_dir(), `luna-taskbar-overview-${GLib.uuid_string_random()}.css`]));
        this._context = St.ThemeContext.get_for_stage(global.stage);
        this._themeId = this._context.connect('notify::theme', () => this._update());
        this._settingsId = settings.connect('changed', (_settings, key) => {
            if (['panel-color-override', 'panel-color', 'overview-panel-opacity', 'panel-corner-radius', 'indicator-color'].includes(key))
                this._update();
        });
        this._releaseThemeColors = watchThemeColors(() => this._update());
        this._update();
    }

    _update() {
        const s = this._settings;
        const opacity = s.get_int('overview-panel-opacity') / 100;
        const surface = surfaceColor(s, 'panel', 'panel', opacity);
        const text = surfaceText('panel');
        const radius = s.get_int('panel-corner-radius');
        const smallRadius = Math.min(radius, 8);
        const accent = validColor(s.get_string('indicator-color'));
        const css = `
.luna-taskbar-overview { color: ${text}; }
.luna-taskbar-overview .search-entry {
    width: 30em; padding: 10px 14px; margin-top: 16px; margin-bottom: 12px;
    border-radius: ${radius}px; background-color: ${surface};
    border: 1px solid rgba(255,255,255,0.18); box-shadow: none;
    color: ${text}; transition-duration: 0ms;
}
.luna-taskbar-overview .search-entry:hover { border-color: rgba(255,255,255,0.35); }
.luna-taskbar-overview .search-entry:focus { border-color: ${accent}; background-color: ${surface}; box-shadow: none; }
.luna-taskbar-overview #searchResultsContent { max-width: 960px; }
.luna-taskbar-overview .search-section { spacing: 10px; }
.luna-taskbar-overview .search-section .search-section-separator { height: 4px; }
.luna-taskbar-overview .search-section-content {
    background-color: ${surface}; border: 1px solid rgba(255,255,255,0.16);
    border-radius: ${radius}px; padding: 8px; margin: 0 8px; box-shadow: none;
}
.luna-taskbar-overview .search-provider-icon,
.luna-taskbar-overview .list-search-result,
.luna-taskbar-overview .overview-tile,
.luna-taskbar-overview .grid-search-result {
    background-color: transparent; border-radius: ${smallRadius}px;
    border: 1px solid transparent; padding: 8px; transition-duration: 0ms;
}
.luna-taskbar-overview .search-provider-icon:hover,
.luna-taskbar-overview .list-search-result:hover,
.luna-taskbar-overview .overview-tile:hover,
.luna-taskbar-overview .grid-search-result:hover { background-color: rgba(255,255,255,0.12); }
.luna-taskbar-overview .search-provider-icon:focus,
.luna-taskbar-overview .list-search-result:focus,
.luna-taskbar-overview .list-search-result:selected,
.luna-taskbar-overview .overview-tile:focus,
.luna-taskbar-overview .overview-tile:selected,
.luna-taskbar-overview .grid-search-result:focus,
.luna-taskbar-overview .grid-search-result:selected {
    border-color: ${accent}; background-color: rgba(255,255,255,0.16); box-shadow: none !important;
}
.luna-taskbar-overview .list-search-results { spacing: 2px; }
.luna-taskbar-overview .list-search-result .list-search-result-description { color: ${text}; }
.luna-taskbar-overview .grid-search-results { spacing: 16px; }
.luna-taskbar-overview .search-provider-icon .list-search-provider-content { spacing: 8px; }
.luna-taskbar-overview .workspace-background { border-radius: ${radius}px; }
.luna-taskbar-overview .workspace-thumbnail { border-radius: ${smallRadius}px; }
.luna-taskbar-overview .workspace-thumbnail-indicator { border-color: ${accent}; border-radius: ${smallRadius}px; }
.luna-taskbar-overview StScrollBar { padding: 2px; }
.luna-taskbar-overview StScrollBar StButton#vhandle {
    background-color: rgba(255,255,255,0.28); border-radius: 3px;
}
`;
        this._theme?.unload_stylesheet(this._file);
        this._file.replace_contents(css, null, false, Gio.FileCreateFlags.PRIVATE, null);
        this._theme = this._context.get_theme();
        this._theme.load_stylesheet(this._file);
    }

    destroy() {
        this._releaseThemeColors();
        this._settings.disconnect(this._settingsId);
        this._context.disconnect(this._themeId);
        this._controls.remove_style_class_name('luna-taskbar-overview');
        this._theme.unload_stylesheet(this._file);
        this._file.delete(null);
    }
}
