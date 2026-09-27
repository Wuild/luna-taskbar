import {_} from '../i18n.js';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, appletPanels: Adw.PreferencesPage): void {
    const {settings, group, toggle, spin, combo, color} = context;
    const panelBehavior = group(appletPanels, _('Behavior'));
    toggle(panelBehavior, 'unified-system-panel', _('Luna - Taskbar applet panels'), _('Use Luna - Taskbar’s styled calendar, notifications, media and system controls'));
    const separatePanels = toggle(panelBehavior, 'separate-applet-panels', _('Separate applet panels'),
        _('Clock opens notifications and calendar; system button opens Quick Settings and Now Playing. Turn off to open both columns together.'));
    settings.bind('unified-system-panel', separatePanels, 'sensitive', Gio.SettingsBindFlags.GET);
    const weather = group(appletPanels, _('Weather'), _('Current conditions and a three-day forecast from Open-Meteo. Weather appears above Calendar with separate panels, or above Quick Settings with grouped panels. A separate weather button opens its own panel.'));
    toggle(weather, 'show-weather', _('Show weather applet'));
    toggle(weather, 'weather-slim', _('Slim mode'), _('Show current conditions without the three-day forecast'));
    const weatherButton = toggle(weather, 'weather-separate-button', _('Separate weather button'), _('Open weather in its own panel instead of the system panel'));
    settings.bind('show-weather', weatherButton, 'sensitive', Gio.SettingsBindFlags.GET);
    for (const [key, title] of [['weather-city', _('City')], ['weather-country', _('Country code (optional, e.g. SE)')]] as const) {
        const row = new Adw.EntryRow({title});
        settings.bind(key, row, 'text', Gio.SettingsBindFlags.DEFAULT);
        weather.add(row);
    }
    combo(weather, 'weather-units', _('Temperature units'), ['celsius', 'fahrenheit'], [_('Celsius'), _('Fahrenheit')]);
    const calendar = group(appletPanels, _('Calendar'));
    toggle(calendar, 'calendar-week-numbers', _('Show week numbers'));
    combo(calendar, 'calendar-week-start', _('First day of the week'), ['system', 'monday', 'sunday'],
        [_('System default'), _('Monday'), _('Sunday')]);
    const panelSurface = group(appletPanels, _('Appearance'), _('Shared with taskbar context menus and window previews.'));
    toggle(panelSurface, 'panel-color-override', _('Override theme color'), _('Use a custom background for panels and menus'));
    color(panelSurface, 'panel-color', _('Background color'), _('Applets, context menus and window previews'), 'panel-color-override');
    toggle(panelSurface, 'panel-transparency', _('Transparency and blur'), _('Turn off for opaque panels'));
    spin(panelSurface, 'panel-blur-radius', _('Blur strength'), _('0 disables blur'), 'panel-transparency');
    spin(panelSurface, 'panel-opacity', _('Opacity'), _('0% is transparent; 100% is opaque'), 'panel-transparency');
    spin(panelSurface, 'panel-corner-radius', _('Corner radius'));
    const panels = group(appletPanels, _('Placement'), _('Shared with taskbar context menus and window previews.'));
    spin(panels, 'panel-edge-gap', _('Screen-edge spacing'));
    spin(panels, 'panel-taskbar-gap', _('Space above taskbar'));

}
