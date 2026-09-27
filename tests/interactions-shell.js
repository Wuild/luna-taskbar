import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(1500);
    Main.overview.hide();
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    const settings = runtime._settings;
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
    launcher.set_environ(global.create_app_launch_context(0, -1).get_environment());
    launcher.setenv('GDK_BACKEND', 'wayland', true);
    const child = launcher.spawnv(['python3', `${GLib.getenv('LUNA_TEST_ROOT')}/tests/preview-windows.py`]);
    try {
        let task;
        for (let i = 0; i < 40; i++) {
            await Scripting.sleep(250);
            task = [...runtime._buttons.values()].find(t => t.windows.length === 5 && t.window?.get_title().startsWith('Preview regression'));
            if (task) break;
        }
        assert(task, 'Grouped application found');
        await Scripting.sleep(600);
        settings.set_string('app-click-action', 'cycle');
        const ordered = [...task.windows].sort((a,b) => a.get_stable_sequence() - b.get_stable_sequence());
        Main.activateWindow(ordered[0]); await Scripting.sleep(250);
        assert(ordered[0].has_focus(), 'Initial window focus');
        task.button.emit('clicked', 1); await Scripting.sleep(250);
        assert(ordered[1].has_focus(), `Click cycles to next window: focused ${ordered.findIndex(w => w.has_focus())}, setting ${settings.get_string('app-click-action')}`);
        Main.activateWindow(ordered[4]); await Scripting.sleep(250);
        task.button.emit('clicked', 1); await Scripting.sleep(250);
        assert(ordered[0].has_focus(), 'Click cycle wraps in stable order');
        settings.set_string('app-middle-click-action', 'minimize');
        task.button.emit('clicked', 2); await Scripting.sleep(200);
        assert(ordered.every(w => w.minimized), 'Middle click minimizes group');
        settings.set_string('app-click-action', 'toggle-group');
        task.button.emit('clicked', 1); await Scripting.sleep(200);
        assert(ordered.every(w => !w.minimized), 'Toggle restores group');
        settings.set_string('app-click-action', 'default');
        task.button.emit('clicked', 1); await Scripting.sleep(200);
        assert(runtime._preview.actor.visible, 'Default shows grouped previews');
        const preview = runtime._preview;
        const previewPointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        previewPointer.notify_absolute_motion(0, 1, 1);
        settings.set_int('preview-hide-delay', 500);
        await Scripting.sleep(250);
        preview.hideLater();
        await Scripting.sleep(250);
        assert(preview.actor.visible && !preview._closing, 'Preview remains open during the grace period');
        const [px, py] = preview.actor.get_transformed_position();
        previewPointer.notify_absolute_motion(0, px + preview.actor.width / 2, py + preview.actor.height / 2);
        await Scripting.sleep(650);
        assert(preview.actor.visible, 'Entering the preview cancels dismissal');
        previewPointer.notify_absolute_motion(0, 1, 1);
        await Scripting.sleep(850);
        assert(!preview.actor.visible, 'Preview finishes dismissing after leaving');
        preview.show(task, task.button);
        await Scripting.sleep(250);
        assert(preview.actor.opacity === 255 && preview.actor.translation_y === 0,
            'Opening animation reaches its final appearance');
        preview.hide(true);
        preview.schedule(task, task.button);
        await Scripting.sleep(250);
        assert(preview.actor.visible && preview.actor.opacity === 255 && !preview._closing,
            'Returning to the button reverses dismissal');
        const neighbor = runtime._launcher;
        const [nx, ny] = neighbor.get_transformed_position();
        const hoverNeighbor = () => previewPointer.notify_absolute_motion(0,
            nx + neighbor.width / 2, ny + neighbor.height / 2);
        hoverNeighbor();
        await Scripting.sleep(50);
        preview.schedule(task, neighbor);
        await Scripting.sleep(120);
        assert(preview.actor.visible && preview._button === task.button,
            'Crossing a neighboring button preserves the grouped preview');
        const [previewX, previewY] = preview.actor.get_transformed_position();
        previewPointer.notify_absolute_motion(0, previewX + preview.actor.width / 2,
            previewY + preview.actor.height / 2);
        await Scripting.sleep(650);
        assert(preview.actor.visible && preview._button === task.button && !preview._pendingButton,
            'Reaching the original preview cancels the neighboring app switch');
        hoverNeighbor();
        await Scripting.sleep(50);
        preview.schedule(task, neighbor);
        await Scripting.sleep(750);
        assert(preview.actor.visible && preview._button === neighbor,
            'A deliberate neighboring hover switches previews');
        preview.show(task, task.button);
        preview.schedule({window: null}, neighbor);
        await Scripting.sleep(120);
        assert(preview.actor.visible && preview._button === task.button,
            'A pinned app without windows also gets a grace period');
        await Scripting.sleep(650);
        assert(!preview.actor.visible, 'Lingering over a pinned app dismisses the old preview');
        runtime._preview.hide();
        settings.reset('app-right-click-action');
        task.button.emit('clicked', 3);
        assert(runtime._taskMenus.menu?.isOpen, 'Right click opens the application context menu');
        assert(task.button.has_style_class_name('luna-taskbar-context-open'), 'Context menu keeps its taskbar button active');
        runtime._taskMenus.menu.close();
        assert(!task.button.has_style_class_name('luna-taskbar-context-open'), 'Menu dismissal clears its button highlight');
        task.button.emit('clicked', 3);
        assert(task.button.has_style_class_name('luna-taskbar-context-open'), 'Reopened menu restores its button highlight');
        runtime._taskMenus.close();
        assert(!task.button.has_style_class_name('luna-taskbar-context-open'), 'Explicit menu cleanup clears its button highlight');
        settings.set_string('app-right-click-action', 'none');
        task.button.emit('clicked', 3);
        assert(!runtime._taskMenus.menu?.isOpen, 'Right click can be disabled');
        settings.set_boolean('show-previews', false);
        settings.set_boolean('taskbar-scroll-workspaces', true);
        settings.set_string('app-scroll-action', 'cycle');
        Main.activateWindow(ordered[0]); await Scripting.sleep(300);
        const pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const [x,y] = task.button.get_transformed_position();
        pointer.notify_absolute_motion(0, x + task.button.width / 2, y + task.button.height / 2);
        await Scripting.sleep(100);
        const workspace = global.workspace_manager.get_active_workspace_index();
        pointer.notify_discrete_scroll(0, Clutter.ScrollDirection.DOWN, Clutter.ScrollSource.WHEEL);
        await Scripting.sleep(300);
        assert(ordered[1].has_focus(), 'Wheel cycles app windows');
        assert(global.workspace_manager.get_active_workspace_index() === workspace, 'App wheel does not also change workspace');
        settings.set_string('app-scroll-action', 'none');
        pointer.notify_discrete_scroll(0, Clutter.ScrollDirection.DOWN, Clutter.ScrollSource.WHEEL);
        await Scripting.sleep(300);
        assert(ordered[1].has_focus() && global.workspace_manager.get_active_workspace_index() === workspace, 'Disabled wheel is consumed');
        print('LUNA_APP_INTERACTIONS_SHELL_PASS');
    } finally { child.force_exit(); }
}
