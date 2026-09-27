import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
async function screenshot(name) {
    const stream = Gio.File.new_for_path(`/tmp/luna-overview-${name}.png`).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const shot = new Shell.Screenshot();
    await new Promise((resolve, reject) => shot.screenshot(false, stream, (object, result) => {
        try { object.screenshot_finish(result); stream.close(null); resolve(); } catch (error) { reject(error); }
    }));
}
export async function run() {
    await Scripting.sleep(2000);
    Main.overview.hide();
    await Scripting.sleep(400);
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    const settings = runtime._settings;
    const desktop = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    desktop.set_string('picture-options', 'none');
    desktop.set_string('primary-color', '#80a0c0');
    desktop.set_string('color-shading-type', 'solid');
    await Scripting.sleep(400);
    assert(!runtime._overviewBackdrop.actor.visible && runtime._blur.enabled, 'Desktop uses native backdrop blur');
    for (const edge of ['bottom', 'top', 'left', 'right']) {
        settings.set_string('taskbar-position', edge);
        await Scripting.sleep(300);
        Main.overview.show();
        assert(runtime._overviewBackdrop.active && !runtime._blur.enabled, `${edge}: overview never samples animated framebuffer`);
        await Scripting.sleep(450);
        const backdrop = runtime._overviewBackdrop;
        assert(backdrop.actor.mapped, `${edge}: wallpaper backdrop is mapped`);
        assert(backdrop.actor.width === runtime._bar.width && backdrop.actor.height === runtime._bar.height, `${edge}: backdrop fits taskbar`);
        assert(runtime._bar.get_children().indexOf(backdrop.actor) < runtime._bar.get_children().indexOf(runtime._background), `${edge}: wallpaper stays behind tint and buttons`);
        for (const actor of backdrop._wallpaper.get_children()) {
            const effect = actor.get_effect('luna-taskbar-overview-wallpaper');
            assert(effect?.enabled && effect.mode === Shell.BlurMode.ACTOR, `${edge}: wallpaper uses isolated actor blur`);
        }
        if (edge === 'bottom') {
            settings.set_int('overview-tint-opacity', 0);
            await Scripting.sleep(200);
            await screenshot('undimmed');
            settings.set_int('overview-tint-opacity', 80);
            await Scripting.sleep(200);
            await screenshot('dimmed');
            Gio.File.new_for_path('/tmp/luna-overview-samples.json').replace_contents(JSON.stringify({
                bar: [Math.round(runtime._bar.x + runtime._bar.width * .65), Math.round(runtime._bar.y + runtime._bar.height / 2)],
                outside: [10, 300],
            }), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        }
        Main.overview.hide();
        if (Main.overview.animationInProgress)
            assert(backdrop.active && !runtime._blur.enabled, `${edge}: exit transition retains stable backdrop`);
        await Scripting.sleep(450);
        assert(!backdrop.actor.visible && runtime._blur.enabled, `${edge}: native blur restored after exit`);
    }
    settings.reset('taskbar-position');
    settings.reset('overview-tint-opacity');
    print('LUNA_OVERVIEW_BACKDROP_PASS');
}
