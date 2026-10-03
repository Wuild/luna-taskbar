import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

function assert(value, message) {
    if (!value)
        throw new Error(message);
}

async function click(pointer, item) {
    const [x, y] = item.get_transformed_position();
    const [width, height] = item.get_transformed_size();
    pointer.notify_absolute_motion(0, x + width / 2, y + height / 2);
    await Scripting.sleep(80);
    const target = global.stage.get_actor_at_pos(
        Clutter.PickMode.REACTIVE, x + width / 2, y + height / 2);
    assert(item.contains(target), `Menu item is not the pointer target: ${target}`);
    pointer.notify_button(0, 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(80);
    pointer.notify_button(0, 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(180);
}

export async function run() {
    await Scripting.sleep(1200);
    Main.overview.hide();

    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild')?.stateObj?.runtime;
    assert(runtime, 'Luna Taskbar is running');
    const pointer = global.stage.context.get_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);

    runtime._taskMenus.openBar(500, 650);
    await Scripting.sleep(150);
    assert(!runtime._taskMenus.menu.actor.has_style_class_name('luna-taskbar-popup'),
        'Taskbar context menu uses native Shell styling');
    const edit = runtime._taskMenus.menu._getMenuItems()
        .find(item => item.label?.text === 'Edit taskbar');
    assert(edit, 'Edit taskbar action exists');
    let editActivated = false;
    edit.connect('activate', () => {
        editActivated = true;
    });
    await click(pointer, edit);
    assert(editActivated, 'Pointer emits the menu item activate signal');
    assert(runtime._appletEditor.active, 'Pointer activation enters taskbar edit mode');
    runtime._appletEditor.stop();

    let settingsOpened = false;
    runtime._taskMenus._openPreferences = () => {
        settingsOpened = true;
    };
    runtime._taskMenus.openBar(500, 650);
    await Scripting.sleep(150);
    const settings = runtime._taskMenus.menu._getMenuItems()
        .find(item => item.label?.text === 'Taskbar settings');
    assert(settings, 'Taskbar settings action exists');
    await click(pointer, settings);
    assert(settingsOpened, 'Pointer activation invokes taskbar settings');

    print('LUNA_TASKBAR_CONTEXT_ACTIONS_PASS');
}
