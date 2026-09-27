import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, appletPanels: Adw.PreferencesPage): void {
    const {settings, group, toggle, spin, combo, color} = context;
    const panelBehavior = group(appletPanels, 'Behavior');
    toggle(panelBehavior, 'unified-system-panel', 'Luna - Taskbar applet panels', 'Use Luna - Taskbar’s styled calendar, notifications, media and system controls');
    const separatePanels = toggle(panelBehavior, 'separate-applet-panels', 'Separate applet panels',
        'Clock opens notifications and calendar; system button opens Quick Settings and Now Playing. Turn off to open both columns together.');
    settings.bind('unified-system-panel', separatePanels, 'sensitive', Gio.SettingsBindFlags.GET);
    const weather = group(appletPanels, 'Weather', 'Current conditions and a three-day forecast from Open-Meteo. Weather appears above Calendar with separate panels, or above Quick Settings with grouped panels. A separate weather button opens its own panel.');
    toggle(weather, 'show-weather', 'Show weather applet');
    toggle(weather, 'weather-slim', 'Slim mode', 'Show current conditions without the three-day forecast');
    const weatherButton = toggle(weather, 'weather-separate-button', 'Separate weather button', 'Open weather in its own panel instead of the system panel');
    settings.bind('show-weather', weatherButton, 'sensitive', Gio.SettingsBindFlags.GET);
    for (const [key, title] of [['weather-city', 'City'], ['weather-country', 'Country code (optional, e.g. SE)']] as const) {
        const row = new Adw.EntryRow({title});
        settings.bind(key, row, 'text', Gio.SettingsBindFlags.DEFAULT);
        weather.add(row);
    }
    combo(weather, 'weather-units', 'Temperature units', ['celsius', 'fahrenheit'], ['Celsius', 'Fahrenheit']);
    const calendar = group(appletPanels, 'Calendar');
    toggle(calendar, 'calendar-week-numbers', 'Show week numbers');
    combo(calendar, 'calendar-week-start', 'First day of the week', ['system', 'monday', 'sunday'],
        ['System default', 'Monday', 'Sunday']);
    const panelSurface = group(appletPanels, 'Appearance', 'Shared with taskbar context menus and window previews.');
    toggle(panelSurface, 'panel-color-override', 'Override theme color', 'Use a custom background for panels and menus');
    color(panelSurface, 'panel-color', 'Background color', 'Applets, context menus and window previews', 'panel-color-override');
    toggle(panelSurface, 'panel-transparency', 'Transparency and blur', 'Turn off for opaque panels');
    spin(panelSurface, 'panel-blur-radius', 'Blur strength', '0 disables blur', 'panel-transparency');
    spin(panelSurface, 'panel-opacity', 'Opacity', '0% is transparent; 100% is opaque', 'panel-transparency');
    spin(panelSurface, 'panel-corner-radius', 'Corner radius');
    const panels = group(appletPanels, 'Placement', 'Shared with taskbar context menus and window previews.');
    spin(panels, 'panel-edge-gap', 'Screen-edge spacing');
    spin(panels, 'panel-taskbar-gap', 'Space above taskbar');

}
