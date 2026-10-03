import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

async function screenshot(path) {
    const stream = Gio.File.new_for_path(path).replace(
        null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const shot = new Shell.Screenshot();
    await new Promise((resolve, reject) => shot.screenshot(false, stream, (object, result) => {
        try {
            object.screenshot_finish(result);
            stream.close(null);
            resolve();
        } catch (error) {
            reject(error);
        }
    }));
}

export async function run() {
    await Scripting.sleep(1600);
    Main.overview.hide();
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild')?.stateObj?.runtime;
    if (!runtime)
        throw new Error('Luna Taskbar is not running');
    const directory = GLib.getenv('LUNA_SCREENSHOT_DIR');
    if (!directory)
        throw new Error('Set LUNA_SCREENSHOT_DIR');
    GLib.mkdir_with_parents(directory, 0o755);

    const settings = runtime._settings;
    settings.set_boolean('panel-transparency', true);
    settings.set_int('panel-corner-radius', 20);
    settings.set_int('panel-blur-radius', 24);
    settings.set_int('panel-opacity', 55);
    Main.panel.closeQuickSettings();
    await Scripting.sleep(300);
    await screenshot(`${directory}/popup-closed.png`);

    Main.panel.statusArea.quickSettings.menu.open();
    await Scripting.sleep(700);
    const backdrop = runtime._panelBridge._systemPanel?._surfaces
        .find(surface => surface.surface.visible);
    if (!backdrop?.surface.visible)
        throw new Error('Quick-settings backdrop is not visible');
    const [x, y] = backdrop.surface.get_transformed_position();
    const [width, height] = backdrop.surface.get_transformed_size();
    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    GLib.file_set_contents(`${directory}/popup-bounds.json`, JSON.stringify({
        x, y, width, height, radius: 20 * scale,
    }));
    await screenshot(`${directory}/popup-open.png`);
    print('LUNA_POPUP_MASK_CAPTURE_PASS');
}
