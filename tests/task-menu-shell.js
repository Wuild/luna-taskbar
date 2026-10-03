import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

function assert(value, message) { if (!value) throw new Error(message); }

export async function run() {
    await Scripting.sleep(1500);
    Main.overview.hide();
    const extension = Main.extensionManager.lookup('luna-taskbar@wuild');
    assert(extension?.state === 1, `Taskbar enabled: ${extension?.error}`);
    const bar = extension.stateObj.runtime;
    const appSystem = Shell.AppSystem.get_default();
    const appInfo = appSystem.get_installed().find(candidate => candidate.list_actions().length > 0);
    const app = appInfo && appSystem.lookup_app(appInfo.get_id());
    assert(appInfo && app, 'Installed application with desktop actions is available');
    const actionNames = appInfo.list_actions().map(action => appInfo.get_action_name(action));
    const window = {
        minimized: false,
        is_maximized: () => false,
        can_minimize: () => true,
        can_maximize: () => true,
    };
    bar._taskMenus.openTask({app, window, windows: [window]}, bar._launcher);
    await Scripting.sleep(150);
    const labels = bar._taskMenus.menu._getMenuItems().map(item => item.label?.text).filter(Boolean);
    assert(actionNames.some(name => labels.includes(name)),
        'Application-provided desktop action appears in taskbar context menu');
    assert(!labels.some(label => ['Focus window', 'Restore window', 'Minimize',
        'Maximize', 'Restore size', 'Close window'].includes(label)),
    'Taskbar does not inject custom window-management items');
    bar._taskMenus.close();
    print('LUNA_TASK_MENU_PASS');
}
