import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(1800);
    Main.overview.hide();
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    const switcher = runtime._workspaceSwitcher;
    const manager = global.workspace_manager;
    new Gio.Settings({schema_id:'org.gnome.mutter'}).set_boolean('dynamic-workspaces', false);
    new Gio.Settings({schema_id:'org.gnome.desktop.wm.preferences'}).set_int('num-workspaces', 4);
    runtime._settings.set_boolean('show-workspace-switcher', true);
    runtime._settings.set_boolean('taskbar-scroll-workspaces', true);
    await Scripting.sleep(400);
    const order = () => runtime._content.get_children();
    const tray = runtime._trayDrawer.actor;
    assert(order().indexOf(switcher.actor) + 1 === order().indexOf(tray), 'Default workspace applet sits immediately before the tray');
    const originalOrder = runtime._settings.get_strv('applet-order');
    runtime._settings.set_strv('applet-order', originalOrder.filter(id => id !== 'workspaces'));
    assert(order().indexOf(switcher.actor) + 1 === order().indexOf(tray), 'Older layouts insert workspaces before the tray');
    runtime._settings.set_strv('applet-order', ['workspaces', ...originalOrder.filter(id => id !== 'workspaces')]);
    assert(order()[0] === switcher.actor, 'Explicit custom workspace placement is preserved');
    runtime._settings.reset('applet-order');
    const check = () => {
        const buttons = switcher.actor.get_children();
        assert(buttons.length === manager.n_workspaces, 'Workspace count stays in sync');
        assert(buttons.filter(button => button.checked).length === 1, 'Exactly one workspace remains selected');
        assert(buttons[manager.get_active_workspace_index()].checked, 'Selected workspace matches the active workspace');
        assert(buttons[manager.get_active_workspace_index()].has_style_pseudo_class('checked'), 'Persistent selected style is applied');
    };
    const pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    for (const index of [1, 3, 0, 2]) {
        const button = switcher.actor.get_children()[index];
        const [x,y] = button.get_transformed_position();
        pointer.notify_absolute_motion(0, x + button.width / 2, y + button.height / 2);
        await Scripting.sleep(60);
        pointer.notify_button(0, 1, Clutter.ButtonState.PRESSED);
        await Scripting.sleep(40);
        pointer.notify_button(0, 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(350);
        assert(manager.get_active_workspace_index() === index, 'Pointer click switches workspace');
        pointer.notify_absolute_motion(0, 100, 100);
        await Scripting.sleep(160);
        check();
    }
    manager.get_workspace_by_index(1).activate(global.get_current_time());
    await Scripting.sleep(350); check();
    manager.reorder_workspace(manager.get_active_workspace(), 2);
    await Scripting.sleep(200); check();
    switcher.move(1); await Scripting.sleep(350); check();
    new Gio.Settings({schema_id:'org.gnome.desktop.wm.preferences'}).set_int('num-workspaces', 2);
    await Scripting.sleep(400); check();
    runtime._settings.set_string('taskbar-position','left');
    await Scripting.sleep(400); check();
    assert(switcher.actor.orientation === Clutter.Orientation.VERTICAL, 'Vertical layout follows the bar');
    runtime._settings.set_string('taskbar-position','bottom');
    new Gio.Settings({schema_id:'org.gnome.desktop.wm.preferences'}).set_int('num-workspaces', 4);
    await Scripting.sleep(400);
    manager.get_workspace_by_index(1).activate(global.get_current_time());
    await Scripting.sleep(400); check();
    const directory=GLib.getenv('LUNA_SCREENSHOT_DIR');
    if (directory) {
        const stream=Gio.File.new_for_path(`${directory}/workspace-switcher.png`).replace(null,false,Gio.FileCreateFlags.NONE,null);
        await new Shell.Screenshot().screenshot(false,stream);stream.close(null);
    }
    print('LUNA_WORKSPACE_SWITCHER_PASS');
}
