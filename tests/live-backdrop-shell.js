import Gio from 'gi://Gio';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export async function run() {
    await Scripting.sleep(2000);
    Main.overview.hide();
    await Scripting.sleep(500);
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    const settings = runtime._settings;
    settings.set_int('taskbar-corner-radius', 16);
    settings.set_int('taskbar-opacity', 15);
    settings.set_boolean('enable-blur', true);
    const wallpaper = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    wallpaper.set_string('picture-options', 'none');
    wallpaper.set_string('color-shading-type', 'solid');
    wallpaper.set_string('primary-color', '#102030');
    const capture = async name => {
        await Scripting.sleep(1500);
        const stream = Gio.File.new_for_path(`/tmp/luna-live-${name}.png`).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        await new Shell.Screenshot().screenshot(false, stream);
        stream.close(null);
    };
    await capture('before');
    // No taskbar settings or window geometry changes from this point onward.
    wallpaper.set_string('primary-color', '#e0c080');
    await capture('wallpaper');
    const bar = runtime._bar;
    const patch = new St.Widget({x: bar.x, y: bar.y - 30, width: bar.width, height: bar.height + 60,
        style: 'background-color: #3070f0;'});
    bar.get_parent().insert_child_below(patch, bar);
    await capture('covered');
    patch.destroy();
    await capture('removed');
    settings.set_int('taskbar-corner-radius', 0);
    await capture('square');
    Gio.File.new_for_path('/tmp/luna-live-point.json').replace_contents(
        JSON.stringify([Math.round(bar.x + bar.width * .65), Math.round(bar.y + bar.height / 2)]),
        null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    print('LUNA_LIVE_BACKDROP_PASS');
}
