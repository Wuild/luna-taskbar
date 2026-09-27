import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export async function run() {
    await Scripting.sleep(2000);
    Main.overview.hide();
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    const settings = runtime._settings;
    settings.set_boolean('taskbar-floating', true);
    settings.set_int('taskbar-corner-radius', 23);
    settings.set_int('taskbar-height', 46);
    settings.set_boolean('enable-blur', false);
    const directory = GLib.getenv('LUNA_SCREENSHOT_DIR');
    if (!directory) throw new Error('Set LUNA_SCREENSHOT_DIR to save clipping evidence');
    const screenshot = async name => {
        const stream = Gio.File.new_for_path(`${directory}/${name}.png`).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        const shot = new Shell.Screenshot();
        await new Promise((resolve, reject) => shot.screenshot(false, stream, (object, result) => {
            try { object.screenshot_finish(result); stream.close(null); resolve(); } catch (error) { reject(error); }
        }));
    };
    const bounds = [];
    for (const edge of ['bottom', 'top', 'left', 'right']) {
        settings.set_string('taskbar-position', edge);
        runtime._content.opacity = 0;
        await Scripting.sleep(400);
        const bar = runtime._bar;
        bounds.push({shader: runtime._roundedContent._key, target: runtime._layoutTransition.target, content: [runtime._content.width, runtime._content.height], edge, x: bar.x, y: bar.y, width: bar.width, height: bar.height, radius: 23});
        await screenshot(`rounded-${edge}-before`);
        runtime._content.set_style('background-color: #ff00ff;');
        runtime._content.opacity = 255;
        await Scripting.sleep(150);
        await screenshot(`rounded-${edge}-after`);
        if (edge === 'bottom') {
            const paint = runtime._layoutTransition._paint;
            try {
                for (const radius of [1, 0.49, 0.25, 0.01, 0]) {
                    runtime._layoutTransition._paint = geometry => paint({...geometry, corners: radius});
                    runtime._layoutTransition._paint(runtime._layoutTransition.current);
                    await Scripting.sleep(80);
                    await screenshot(`rounded-radius-${radius}`);
                }
            } finally {
                runtime._layoutTransition._paint = paint;
            }
        }
    }
    GLib.file_set_contents(`${directory}/rounded-bounds.json`, JSON.stringify(bounds));
    print('LUNA_ROUNDED_CAPTURE_PASS');
}
