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
    const liveBlur = () => runtime._blur.enabled && runtime._blur.mode === Shell.BlurMode.BACKGROUND;
    settings.set_boolean('enable-blur', true);
    settings.set_int('taskbar-opacity', 35);
    assert(liveBlur(), 'Desktop uses native backdrop blur');
    for (const edge of ['bottom', 'top', 'left', 'right']) {
        settings.set_string('taskbar-position', edge);
        await Scripting.sleep(300);
        Main.overview.show();
        assert(liveBlur(),
            `${edge}: overview keeps sampling the live framebuffer`);
        await Scripting.sleep(450);
        assert(liveBlur(), `${edge}: Overview retains live blur after opening`);
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
            assert(liveBlur(),
                `${edge}: exit transition keeps sampling the live framebuffer`);
        await Scripting.sleep(450);
        assert(liveBlur(), `${edge}: live blur remains after exit`);
    }
    settings.reset('taskbar-position');
    settings.reset('overview-tint-opacity');
    print('LUNA_OVERVIEW_BACKDROP_PASS');
}
