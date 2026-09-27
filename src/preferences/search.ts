import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {watchArcMenu} from './arcmenu.js';
import Gdk from 'gi://Gdk?version=4.0';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, searchPage: Adw.PreferencesPage): void {
    const {settings, window, group, toggle, spin} = context;
    const search = group(searchPage, 'Search button and shortcut');
    toggle(search, 'search-panel-enabled', 'Enable search panel', 'Turn off to hide the search button and disable its keyboard shortcut');
    toggle(search, 'show-search-button', 'Search button', 'Open a standalone search panel beside Start');
    spin(search, 'search-icon-size', 'Button icon size', 'Shared by Search and Overview');
    spin(search, 'search-button-width', 'Button width');
    spin(search, 'search-button-padding', 'Button padding');
    spin(search, 'search-button-margin', 'Button margin');
    const shortcutRow = new Adw.ActionRow({title: 'Search keyboard shortcut',
        subtitle: 'Works with the button hidden. Choose a combination not already used by GNOME. Escape cancels; Backspace clears.'});
    const shortcutButton = new Gtk.Button({valign: Gtk.Align.CENTER});
    const updateShortcut = () => {
        const accelerator = settings.get_strv('search-shortcut')[0];
        const [valid, key, modifiers] = Gtk.accelerator_parse(accelerator || '');
        shortcutButton.label = valid && modifiers !== null ? Gtk.accelerator_get_label(key, modifiers) : 'Disabled';
    };
    updateShortcut();
    const shortcutId = settings.connect('changed::search-shortcut', updateShortcut);
    window.connect('close-request', () => { settings.disconnect(shortcutId); return false; });
    shortcutButton.connect('clicked', () => {
        const dialog = new Gtk.Window({title: 'Search shortcut', transient_for: window,
            modal: true, default_width: 380, default_height: 140});
        const label = new Gtk.Label({label: 'Press a shortcut…\nEscape to cancel · Backspace to disable',
            margin_top: 24, margin_bottom: 24, margin_start: 24, margin_end: 24});
        dialog.set_child(label);
        const controller = new Gtk.EventControllerKey();
        controller.connect('key-pressed', (_controller, key, _code, state) => {
            if (key === Gdk.KEY_Escape) { dialog.close(); return true; }
            if (key === Gdk.KEY_BackSpace) {
                settings.set_strv('search-shortcut', []);
                dialog.close(); return true;
            }
            const modifiers = state & Gtk.accelerator_get_default_mod_mask();
            if (!modifiers || !Gtk.accelerator_valid(key, modifiers)) return true;
            settings.set_strv('search-shortcut', [Gtk.accelerator_name(key, modifiers)]);
            dialog.close();
            return true;
        });
        dialog.add_controller(controller);
        dialog.present();
    });
    shortcutRow.add_suffix(shortcutButton);
    shortcutRow.activatable_widget = shortcutButton;
    search.add(shortcutRow);
    const overviewButton = group(searchPage, 'Overview button');
    toggle(overviewButton, 'show-overview-button', 'Show Overview button');
    const overviewIcon = new Adw.EntryRow({title: 'Overview icon'});
    settings.bind('overview-button-icon', overviewIcon, 'text', Gio.SettingsBindFlags.DEFAULT);
    overviewButton.add(overviewIcon);
    const overview = group(searchPage, 'Overview appearance');
    spin(overview, 'overview-panel-opacity', 'Search panel opacity', 'Search field and result panels; 0% is transparent, 100% is opaque');
    toggle(overview, 'overview-blur', 'Blur wallpaper');
    spin(overview, 'overview-tint-opacity', 'Wallpaper dimming', 'Opacity (%); also applies when blur is off');
    spin(overview, 'overview-blur-radius', 'Blur strength', 'Only the wallpaper is blurred', 'overview-blur');
    spin(overview, 'overview-taskbar-gap', 'Space above taskbar');

    watchArcMenu(window, active => { overviewButton.visible = overview.visible = active; });
}
