import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(2500);
    Main.overview.hide();
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    const settings = runtime._settings;
    settings.set_string('app-hover-animation', 'zoom');
    settings.set_int('app-animation-duration', 120);
    settings.set_boolean('app-launch-animation', true);
    settings.set_string('app-click-action', 'none');
    settings.set_boolean('show-search-button', true);
    settings.set_boolean('show-previews', false);
    new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}).set_boolean('enable-animations', true);
    await Scripting.sleep(500);
    const arc = Main.panel.statusArea.ArcMenu;
    assert(arc, 'ArcMenu must be enabled');
    const app = [...runtime._buttons.values()][0];
    assert(app, 'An app button must be present');
    const pointer = Clutter.get_default_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    for (const [name, button, icon] of [
        ['Start', arc, arc.menuButtonWidget.getPanelIcon()],
        ['Overview', runtime._launcher, runtime._startMenu.icon],
        ['Search', runtime._searchButton, runtime._searchButton.child],
        ['App', app.button, app.button.child.get_first_child()],
    ]) {
        const [x, y] = button.get_transformed_position();
        pointer.notify_absolute_motion(0, x + button.width / 2, y + button.height / 2);
        await Scripting.sleep(250);
        assert(Math.abs(icon.scale_x - 1.08) < 0.01, `${name}: hover zoom`);
        pointer.notify_button(0, 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(400);
        assert(Math.abs(icon.scale_x - 0.82) < 0.01, `${name}: remains pushed while held (${icon.scale_x})`);
        pointer.notify_button(0, 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(300);
        assert(Math.abs(icon.scale_x - (button.hover ? 1.08 : 1)) < 0.01, `${name}: returns on release (${icon.scale_x}, hover ${button.hover})`);
        arc.arcMenu.close();
        Main.overview.hide();
        runtime._searchPanel.close();
        await Scripting.sleep(400);
        // Release outside the button must also clear the pushed state.
        pointer.notify_absolute_motion(0, x + button.width / 2, y + button.height / 2);
        await Scripting.sleep(200);
        pointer.notify_button(0, 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(200);
        pointer.notify_absolute_motion(0, 600, 200);
        await Scripting.sleep(200);
        pointer.notify_button(0, 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(300);
        assert(Math.abs(icon.scale_x - (button.hover ? 1.08 : 1)) < 0.01, `${name}: returns after release outside`);
        arc.arcMenu.close();
        Main.overview.hide();
        runtime._searchPanel.close();
        await Scripting.sleep(400);
    }
    print('LUNA_BUTTON_ANIMATIONS_PASS');
}
