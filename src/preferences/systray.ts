import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import type {PreferenceContext} from './controls.js';
import {SYSTEM_ICONS} from '../compat/systemIconOptions.js';

export function populate(context: PreferenceContext, tray: Adw.PreferencesPage): void {
    const {settings, window, group, toggle, spin, combo} = context;
    const trayLayout = group(tray, 'Icons and applets',
        'Sizes apply to application tray icons, clock and system controls. Right-click the taskbar and choose Edit taskbar to move applets.');
    toggle(trayLayout, 'tray-show-passive', 'Show inactive tray icons', 'Keep apps visible when they report no current activity');
    toggle(trayLayout, 'tray-collapse-enabled', 'Collapse application tray', 'Show a toggle instead of the icons when the limit is exceeded');
    spin(trayLayout, 'tray-visible-limit', 'Icon limit', 'Collapse when there are more visible app icons than this', 'tray-collapse-enabled');
    spin(trayLayout, 'tray-icon-size', 'Taskbar icon size');
    spin(trayLayout, 'tray-popup-icon-size', 'Popup icon size', 'Icon size inside the collapsed application tray');
    spin(trayLayout, 'tray-text-size', 'Text size');
    spin(trayLayout, 'tray-spacing', 'Space between application tray icons');
    spin(trayLayout, 'applet-padding', 'Applet button padding', 'Left and right padding for clock/notifications and system controls');
    spin(trayLayout, 'applet-spacing', 'Space between applet blocks');
    const clockButton = group(tray, 'Clock button');
    combo(clockButton, 'clock-layout', 'Layout', ['two-line', 'single-line'], ['Two lines', 'Single line'],
        'Display the time and short date stacked or side by side');
    const systemIcons = group(tray, 'System button icons',
        'Choose which status icons may appear. GNOME still controls when each is relevant. If none are visible, a settings icon keeps the button accessible.');
    for (const [key, , title] of SYSTEM_ICONS) {
        const row = new Adw.SwitchRow({title, active: !settings.get_strv('system-hidden-icons').includes(key)});
        row.connect('notify::active', () => {
            const hidden = new Set(settings.get_strv('system-hidden-icons'));
            if (row.active) hidden.delete(key); else hidden.add(key);
            settings.set_strv('system-hidden-icons', [...hidden]);
        });
        const id = settings.connect('changed::system-hidden-icons', () => {
            row.active = !settings.get_strv('system-hidden-icons').includes(key);
        });
        window.connect('close-request', () => { settings.disconnect(id); return false; });
        systemIcons.add(row);
    }
    const resetOrder = new Adw.ActionRow({title: 'Restore default applet order',
        subtitle: 'Application tray, sharing indicators, system controls, then clock'});
    const reset = new Gtk.Button({label: 'Reset order', valign: Gtk.Align.CENTER});
    reset.connect('clicked', () => settings.reset('applet-order'));
    resetOrder.add_suffix(reset);
    trayLayout.add(resetOrder);
    const exceptions = group(tray, 'Always visible icons', 'Keep selected app icons on the taskbar when the tray is collapsed. Apps appear here after their tray icon has been detected.');
    let exceptionRows: Adw.SwitchRow[] = [];
    const updateExceptions = () => {
        exceptionRows.forEach(row => exceptions.remove(row));
        exceptionRows = [];
        let known = {};
        try { known = JSON.parse(settings.get_string('tray-known-items')); } catch {}
        const selected = settings.get_strv('tray-always-visible');
        for (const [key, name] of Object.entries(known)) {
            const row = new Adw.SwitchRow({title: String(name), active: selected.includes(key)});
            row.connect('notify::active', () => {
                const values = new Set(settings.get_strv('tray-always-visible'));
                if (row.active) values.add(key); else values.delete(key);
                settings.set_strv('tray-always-visible', [...values]);
            });
            exceptions.add(row);
            exceptionRows.push(row);
        }
    };
    const knownId = settings.connect('changed::tray-known-items', updateExceptions);
    window.connect('close-request', () => { settings.disconnect(knownId); return false; });
    updateExceptions();
}
