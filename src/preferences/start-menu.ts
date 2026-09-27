import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import {watchArcMenu} from './arcmenu.js';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, launchers: Adw.PreferencesPage): void {
    const {settings, window, group, spin, combo} = context;
    const launcher = group(launchers, 'Launcher');
    const provider = combo(launcher, 'launcher-menu', 'Start menu', ['overview', 'arcmenu'],
        ['GNOME Overview', 'ArcMenu'], 'ArcMenu appears beside a separate Overview button.');
    const style = group(launchers, 'Start button style', 'Used by ArcMenu, or by Overview when it acts as the Start button.');
    spin(style, 'launcher-size', 'Icon size');
    spin(style, 'launcher-padding', 'Button padding');
    spin(style, 'launcher-margin', 'Button margin');
    const appearance = group(launchers, 'Start button icon');
    const arcAppearance = group(launchers, 'ArcMenu button', 'These controls use ArcMenu’s own settings.');
    let arcSettings: Gio.Settings | null = null;
    const more = new Adw.ButtonRow({title: 'Open ArcMenu settings',
        start_icon_name: 'preferences-system-symbolic'});
    more.connect('activated', () => Gio.DBus.session.call('org.gnome.Shell', '/org/gnome/Shell',
        'org.gnome.Shell.Extensions', 'OpenExtensionPrefs',
        new GLib.Variant('(ssa{sv})', ['arcmenu@arcmenu.com', '', {}]), null,
        Gio.DBusCallFlags.NONE, -1, null, (bus, result) => {
            try { bus!.call_finish(result); } catch (error) { console.error(error); }
        }));
    arcAppearance.add(more);
    watchArcMenu(window, (active, path) => {
        provider.visible = active;
        appearance.visible = !active;
        arcAppearance.visible = active;
        if (!active || !path || arcSettings) return;
        try {
            const source = Gio.SettingsSchemaSource.new_from_directory(`${path}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
            const schema = source.lookup('org.gnome.shell.extensions.arcmenu', false);
            if (!schema) return;
            arcSettings = new Gio.Settings({settings_schema: schema});
            for (const [key, title] of [['menu-button-icon', 'ArcMenu icon name or path'], ['menu-button-text', 'ArcMenu button text']]) {
                if (!schema.has_key(key)) continue;
                const row = new Adw.EntryRow({title});
                arcSettings.bind(key, row, 'text', Gio.SettingsBindFlags.DEFAULT);
                arcAppearance.add(row);
            }
            if (schema.has_key('menu-button-appearance')) {
                const values = ['Icon', 'Text', 'Icon_Text', 'Text_Icon', 'None'];
                const row = new Adw.ComboRow({title: 'ArcMenu button appearance',
                    model: Gtk.StringList.new(['Icon', 'Text', 'Icon and text', 'Text and icon', 'Hidden']),
                    selected: Math.max(0, values.indexOf(arcSettings.get_string('menu-button-appearance')))});
                row.connect('notify::selected', () => arcSettings!.set_string('menu-button-appearance', values[row.selected]!));
                const id = arcSettings.connect('changed::menu-button-appearance', () => {
                    row.selected = Math.max(0, values.indexOf(arcSettings!.get_string('menu-button-appearance')));
                });
                window.connect('close-request', () => { arcSettings!.disconnect(id); return false; });
                arcAppearance.add(row);
            }
        } catch (error) { console.error(error); }
    });
    combo(appearance, 'launcher-icon', 'Icon style', ['distro', 'grid', 'custom'],
        ['Distribution logo', 'Application grid', 'Custom icon name']);
    const custom = new Adw.EntryRow({title: 'Custom icon name'});
    settings.bind('custom-launcher-icon', custom, 'text', Gio.SettingsBindFlags.DEFAULT);
    appearance.add(custom);
    const updateCustom = () => { custom.visible = settings.get_string('launcher-icon') === 'custom'; };
    const customId = settings.connect('changed::launcher-icon', updateCustom);
    window.connect('close-request', () => { settings.disconnect(customId); return false; });
    updateCustom();
}
