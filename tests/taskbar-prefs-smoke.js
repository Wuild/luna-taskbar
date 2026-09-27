import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
Adw.init();
const path = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('dist').get_path();
const {default: Preferences} = await import(`file://${path}/prefs.js`);
const metadata = JSON.parse(new TextDecoder().decode(Gio.File.new_for_path(`${path}/metadata.json`).load_contents(null)[1]));
Object.assign(metadata, {path, dir: Gio.File.new_for_path(path)});
const prefs = new Preferences(metadata);
const window = new Adw.PreferencesWindow();
await prefs.fillPreferencesWindow(window);
const navigation = window._settingsNavigation;
if (navigation.pages.length !== 8) throw new Error('Expected eight taskbar categories');
navigation.filter('preview hover');
if (!navigation.resultRows.length) throw new Error('Settings search missing preview controls');
navigation.resultRows[0].emit('activated');
if (navigation.stack.visible_child.title !== 'Interactions') throw new Error('Settings search navigation');
window.present();
const loop = new GLib.MainLoop(null, false);
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 700, () => {
    const expectedArcMenu = GLib.getenv('LUNA_EXPECT_ARCMENU');
    if (expectedArcMenu !== null) {
        navigation.filter('ArcMenu icon name or path');
        const arcControls = navigation.resultRows.some(row => row.title === 'ArcMenu icon name or path');
        if (arcControls !== (expectedArcMenu === '1')) {
            printerr('ArcMenu button controls must follow extension availability');
            imports.system.exit(1);
        }
        navigation.filter('Overview icon');
        const found = navigation.resultRows.some(row => row.title === 'Overview icon');
        if (found !== (expectedArcMenu === '1')) {
            printerr(`ArcMenu preferences visibility mismatch: ${found}, expected ${expectedArcMenu}`);
            imports.system.exit(1);
        }
    }
    window.close();
    print('LUNA_TASKBAR_PREFS_PASS');
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
