import {_} from './i18n.js';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {TaskbarSettings} from './settings/settings.js';
import {SettingsNavigation} from './preferences/navigation.js';
import {createControls} from './preferences/controls.js';
import {populate as taskbar} from './preferences/taskbar.js';
import {populate as interactions} from './preferences/interactions.js';
import {populate as appbar} from './preferences/appbar.js';
import {populate as startMenu} from './preferences/start-menu.js';
import {populate as search} from './preferences/search.js';
import {populate as systray} from './preferences/systray.js';
import {populate as panels} from './preferences/panels.js';
import {populate as general} from './preferences/general.js';

export default class LunaTaskbarPreferences extends ExtensionPreferences {
    override async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const settings = new TaskbarSettings(this.getSettings());
        const context = createControls(window, settings);
        const navigation = new SettingsNavigation(window);
        // Kept for the preferences smoke harness; UI code does not depend on this property.
        Object.assign(window, {_settingsNavigation: navigation});
        window.title = _('Luna - Taskbar');
        const pages = [
            [_('Taskbar'), 'preferences-desktop-display-symbolic', taskbar],
            [_('Interactions'), 'input-mouse-symbolic', interactions],
            [_('App Bar'), 'view-app-grid-symbolic', appbar],
            [_('Start Menu'), 'start-here-symbolic', startMenu],
            [_('Search and Overview'), 'system-search-symbolic', search],
            [_('System Tray'), 'preferences-system-symbolic', systray],
            [_('Panels'), 'view-grid-symbolic', panels],
            [_('General'), 'preferences-system-symbolic', general],
        ] as const;
        for (const [title, icon_name, populate] of pages) {
            const page = new Adw.PreferencesPage({title, icon_name});
            populate(context, page);
            navigation.add(page);
        }
    }
}

export function resetAllSettings(settings: Gio.Settings): void {
    new TaskbarSettings(settings).resetAll();
}
