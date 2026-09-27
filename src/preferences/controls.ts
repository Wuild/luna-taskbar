import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk?version=4.0';
import {TaskbarSettings} from '../settings/settings.js';
import {settingDefinitions, type KeysOfType, type SettingsValues} from '../settings/keys.js';
type FreeStringKey = {[K in KeysOfType<string>]: string extends SettingsValues[K] ? K : never}[KeysOfType<string>];
function numericRange(key: KeysOfType<number>): readonly [number, number] {
    const definition = settingDefinitions[key];
    return 'range' in definition ? definition.range : [-2147483648, 2147483647];
}

export function createControls(window: Adw.PreferencesWindow, settings: TaskbarSettings) {
    const group = (parent: Adw.PreferencesPage, title: string, description = '') => {
        const result = new Adw.PreferencesGroup({title, description});
        parent.add(result);
        return result;
    };
    const toggle = (parent: Adw.PreferencesGroup, key: KeysOfType<boolean>, title: string, subtitle = '') => {
        const row = new Adw.SwitchRow({title, subtitle});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        parent.add(row);
        return row;
    };
    const spin = (parent: Adw.PreferencesGroup, key: KeysOfType<number>, title: string, subtitle = 'Logical pixels', sensitiveKey: KeysOfType<boolean> | null = null) => {
        const [lower, upper] = numericRange(key);
        const row = new Adw.SpinRow({title, subtitle,
            adjustment: new Gtk.Adjustment({lower, upper, step_increment: 1, page_increment: 5})});
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        if (sensitiveKey)
            settings.bind(sensitiveKey, row, 'sensitive', Gio.SettingsBindFlags.GET);
        parent.add(row);
    };
    const combo = <K extends KeysOfType<string>>(parent: Adw.PreferencesGroup, key: K, title: string, values: readonly SettingsValues[K][], labels: string[], subtitle = '') => {
        const row = new Adw.ComboRow({title, subtitle, model: Gtk.StringList.new(labels),
            selected: Math.max(0, values.indexOf(settings.get_string(key)))});
        row.connect('notify::selected', () => {
            if (values[row.selected] !== undefined)
                settings.set_string(key, values[row.selected]);
        });
        const changedId = settings.connect(`changed::${key}`, () => {
            row.selected = Math.max(0, values.indexOf(settings.get_string(key)));
        });
        window.connect('close-request', () => { settings.disconnect(changedId); return false; });
        parent.add(row);
        return row;
    };
    const color = (parent: Adw.PreferencesGroup, key: FreeStringKey, title: string, subtitle = '', overrideKey: KeysOfType<boolean> | null = null) => {
        const row = new Adw.ActionRow({title, subtitle});
        const button = new Gtk.ColorDialogButton({valign: Gtk.Align.CENTER,
            dialog: new Gtk.ColorDialog({title, with_alpha: false})});
        const update = () => {
            const rgba = new Gdk.RGBA();
            rgba.parse(settings.get_string(key));
            button.rgba = rgba;
        };
        update();
        button.connect('notify::rgba', () => {
            const rgba = button.rgba;
            const hex = '#' + [rgba.red, rgba.green, rgba.blue].map(c =>
                Math.round(c * 255).toString(16).padStart(2, '0')).join('');
            if (settings.get_string(key) !== hex)
                settings.set_string(key, hex);
        });
        const id = settings.connect(`changed::${key}`, update);
        window.connect('close-request', () => { settings.disconnect(id); return false; });
        if (overrideKey) settings.bind(overrideKey, row, 'sensitive', Gio.SettingsBindFlags.GET);
        row.add_suffix(button);
        row.activatable_widget = button;
        parent.add(row);
    };
    return {window, settings, group, toggle, spin, combo, color};
}
export type PreferenceContext = ReturnType<typeof createControls>;
