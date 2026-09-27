import {_} from '../i18n.js';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import {watchArcMenu} from './arcmenu.js';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, launchers: Adw.PreferencesPage): void {
    const {settings, window, group, spin, combo} = context;
    const launcher = group(launchers, _('Launcher'));
    const provider = combo(launcher, 'launcher-menu', _('Start menu'), ['overview', 'arcmenu'],
        [_('GNOME Overview'), _('ArcMenu')], _('ArcMenu appears beside a separate Overview button.'));
    const style = group(launchers, _('Start button style'), _('Used by ArcMenu, or by Overview when it acts as the Start button.'));
    spin(style, 'launcher-size', _('Icon size'));
    spin(style, 'launcher-padding', _('Button padding'));
    spin(style, 'launcher-margin', _('Button margin'));
    const appearance = group(launchers, _('Start button icon'));
    const arcAppearance = group(launchers, _('ArcMenu button'), _('These controls use ArcMenu’s own settings.'));
    let arcSettings: Gio.Settings | null = null;
    const more = new Adw.ButtonRow({title: _('Open ArcMenu settings'),
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
            for (const [key, title] of [['menu-button-icon', _('ArcMenu icon name or path')], ['menu-button-text', _('ArcMenu button text')]]) {
                if (!schema.has_key(key)) continue;
                const row = new Adw.EntryRow({title});
                arcSettings.bind(key, row, 'text', Gio.SettingsBindFlags.DEFAULT);
                arcAppearance.add(row);
            }
            if (schema.has_key('menu-button-appearance')) {
                const values = [_('Icon'), _('Text'), _('Icon_Text'), _('Text_Icon'), _('None')];
                const row = new Adw.ComboRow({title: _('ArcMenu button appearance'),
                    model: Gtk.StringList.new([_('Icon'), _('Text'), _('Icon and text'), _('Text and icon'), _('Hidden')]),
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
    combo(appearance, 'launcher-icon', _('Icon style'), ['distro', 'grid', 'custom'],
        [_('Distribution logo'), _('Application grid'), _('Custom icon name')]);
    const custom = new Adw.EntryRow({title: _('Custom icon name')});
    settings.bind('custom-launcher-icon', custom, 'text', Gio.SettingsBindFlags.DEFAULT);
    appearance.add(custom);
    const updateCustom = () => { custom.visible = settings.get_string('launcher-icon') === 'custom'; };
    const customId = settings.connect('changed::launcher-icon', updateCustom);
    window.connect('close-request', () => { settings.disconnect(customId); return false; });
    updateCustom();
}
