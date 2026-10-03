import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

function assert(value, message) {
    if (!value)
        throw new Error(message);
}

export async function run() {
    await Scripting.sleep(1200);
    Main.overview.hide();

    const extension = Main.extensionManager.lookup('luna-taskbar@wuild');
    const runtime = extension?.stateObj?.runtime;
    assert(runtime, 'Luna Taskbar is running');

    runtime._settings.set_boolean('unified-system-panel', false);
    const previousOrder = runtime._settings.get_strv('applet-order');
    const applet = new St.Button({accessible_name: 'Test third-party applet'});
    const record = {role: 'testThirdPartyApplet', actor: applet, indicator: {}, isTray: false};
    runtime._panelBridge._records.set(applet, record);
    runtime._systemBox.add_child(applet);

    runtime._settings.set_strv('applet-order', [
        'showDesktop', 'dateMenu', 'testThirdPartyApplet', 'quickSettings',
        ...previousOrder.filter(id => ![
            'showDesktop', 'dateMenu', 'testThirdPartyApplet', 'quickSettings',
        ].includes(id)),
    ]);
    await Scripting.sleep(300);

    const children = runtime._content.get_children();
    const appletIndex = children.indexOf(applet);
    const systemIndex = children.indexOf(Main.panel.statusArea.quickSettings.container);
    const timeIndex = children.indexOf(Main.panel.statusArea.dateMenu.container);
    const desktopIndex = children.indexOf(runtime._showDesktopButton);
    assert(appletIndex >= 0 && appletIndex < systemIndex,
        'Late third-party applet is left of system controls');
    assert(systemIndex < timeIndex, 'System controls are left of time');
    assert(timeIndex < desktopIndex && desktopIndex === children.length - 1,
        'Time is left of terminal Show Desktop button');

    const saved = runtime._settings.get_strv('applet-order');
    assert(saved.indexOf('testThirdPartyApplet') < saved.indexOf('quickSettings'),
        'Constrained applet order is persisted');
    assert(saved.indexOf('quickSettings') < saved.indexOf('dateMenu'),
        'Constrained system/time order is persisted');
    assert(saved.at(-1) === 'showDesktop', 'Show Desktop persists as the final block');

    runtime._panelBridge._records.delete(applet);
    applet.destroy();
    runtime._settings.set_strv('applet-order', previousOrder);
    print('LUNA_TASKBAR_EDGE_ORDER_PASS');
}
