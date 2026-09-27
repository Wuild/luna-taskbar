import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(2500);
    Main.overview.hide();
    await Scripting.sleep(400);
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    const settings = runtime._settings;
    const button = Main.panel.statusArea.ArcMenu;
    const icon = button.menuButtonWidget.getPanelIcon();
    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    async function check(label) {
        await Scripting.sleep(200);
        const size = settings.get_int('launcher-size');
        const padding = settings.get_int('launcher-padding');
        const expected = (size + 10 + 2 * padding) * scale;
        assert(icon.icon_size === size, `${label}: icon size follows Start style`);
        assert(Math.abs(button.width - expected) <= 1, `${label}: button reserves Start padding (${button.width} vs ${expected})`);
        const texture = icon.get_first_child();
        assert(texture && Math.abs(texture.width - size * scale) <= 1, `${label}: icon is not squeezed`);
    }
    await check('Defaults');
    settings.set_int('launcher-size', 30);
    settings.set_int('launcher-padding', 7);
    await check('Custom style');
    const arcWidth = button.width;
    settings.set_string('launcher-menu', 'overview');
    await Scripting.sleep(250);
    assert(Math.abs(runtime._launcher.width - arcWidth) <= 1, 'Overview and ArcMenu use the same Start button width');
    settings.set_string('launcher-menu', 'arcmenu');
    await check('Switch back to ArcMenu');
    for (const key of ['launcher-size', 'launcher-padding', 'launcher-margin']) settings.reset(key);
    await check('Reset defaults');
    icon.icon_size = 16;
    await check('ArcMenu reapplies its own icon size');
    settings.set_string('taskbar-position', 'left');
    await Scripting.sleep(300);
    assert(button.width <= runtime._bar.width + 1, 'Vertical Start button stays within taskbar');
    assert(Math.abs(icon.get_first_child().width - settings.get_int('launcher-size') * scale) <= 1, 'Vertical icon keeps Start size');
    settings.reset('taskbar-position');
    print('LUNA_TASKBAR_ARCMENU_START_STYLE_PASS');
}
