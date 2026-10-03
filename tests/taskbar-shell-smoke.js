import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(1500);
    assert(!Main.extensionManager.lookup('lunabar@wuild'), 'Runs without LunaBar installed');
    const extension = Main.extensionManager.lookup('luna-taskbar@wuild');
    assert(extension?.state === 1, `Taskbar enabled: ${extension?.error}`);
    assert(extension.metadata.name === 'Luna - Taskbar', 'New product name');
    const bar = extension.stateObj.runtime;
    Main.overview.hide();
    await Scripting.sleep(500);
    assert(bar._bar.mapped && bar._bar.height > 0, 'Taskbar mapped');
    assert(!bar._desktopIcons, 'Desktop companion is outside taskbar scope');
    assert(bar._launcher.get_parent() === bar._content, 'Start menu connected');
    assert(bar._appStrip.actor.get_parent() === bar._content, 'App bar connected');
    assert(bar._tray && bar._trayDrawer, 'Tray connected');
    assert(bar._panelBridge._systemPanel, 'System panels connected');
    const settings = bar._settings;
    settings.set_int('taskbar-start-padding', 17);
    settings.set_int('taskbar-end-padding', 23);
    for (const edge of ['bottom', 'left']) {
        settings.set_string('taskbar-position', edge);
        await Scripting.sleep(250);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const node = bar._content.get_theme_node();
        assert(node.get_padding(edge === 'left' ? St.Side.TOP : St.Side.LEFT) === 17 * scale, 'Start spacing follows orientation');
        assert(node.get_padding(edge === 'left' ? St.Side.BOTTOM : St.Side.RIGHT) === 23 * scale, 'End spacing follows orientation');
    }
    for (const key of ['taskbar-start-padding', 'taskbar-end-padding', 'taskbar-position']) settings.reset(key);
    console.log('LUNA_TASKBAR_PADDING_PASS');
    for (let i = 0; i < 3; i++) {
        settings.set_boolean('separate-applet-panels', false);
        await Scripting.sleep(100);
        const combinedPanel = bar._panelBridge._systemPanel;
        assert(!combinedPanel.date.container.visible, 'Combined hides separate clock');
        assert(combinedPanel.columns.get_children()[0] === combinedPanel.left &&
            combinedPanel.columns.get_children()[1] === combinedPanel.right,
            'Combined panel keeps its left-to-right column order');
        const expectedLeft = [combinedPanel.media, combinedPanel.weather, combinedPanel.calendar];
        const expectedRight = [combinedPanel.notifications, combinedPanel.controls];
        assert(combinedPanel.left.get_children().every((card, index) => card === expectedLeft[index]) &&
            combinedPanel.right.get_children().every((card, index) => card === expectedRight[index]),
            'Combined panel groups calendar content left and notifications above system controls right');
        const combinedContents = combinedPanel.quick.get_first_child();
        assert(combinedContents.get_children()[0] === combinedPanel._combinedButton.clock &&
            combinedContents.get_children()[1] === combinedPanel._combinedButton.controls,
            'Combined taskbar button places the clock before system controls');
        settings.set_boolean('separate-applet-panels', true);
        await Scripting.sleep(100);
        assert(bar._panelBridge._systemPanel.date.container.visible && bar._panelBridge._systemPanel.date.container.mapped, 'Separate restores visible clock in taskbar');
        assert(bar._panelBridge._systemPanel.date.get_first_child(), 'Clock contents restored');
    }
    const weather = bar._weather;
    assert(weather && !weather.actor.visible, 'Weather is optional and off by default');
    settings.set_boolean('show-weather', true);
    await Scripting.sleep(100);
    let panel = bar._panelBridge._systemPanel;
    assert(!weather.actor.visible && panel.weather.visible && weather.body.get_parent() === panel.weather, 'Weather defaults to grouped panel without button');
    settings.set_boolean('separate-applet-panels', false);
    const cards = panel.left.get_children();
    assert(cards.indexOf(panel.weather) === cards.indexOf(panel.media) + 1 &&
        cards.indexOf(panel.calendar) === cards.indexOf(panel.weather) + 1,
        'Weather sits between Now Playing and Calendar in the combined left column');
    assert(panel.right.get_children()[0] === panel.notifications && panel.right.get_children()[1] === panel.controls,
        'Combined right column puts notifications above Quick Settings');
    weather.render({name: 'Stockholm', country_code: 'SE'}, {
        current: {temperature_2m: 18, apparent_temperature: 17, weather_code: 2, is_day: 1, wind_speed_10m: 8},
        daily: {time: ['2026-09-27', '2026-09-28', '2026-09-29'], weather_code: [2,3,61], temperature_2m_max: [18,17,16], temperature_2m_min: [10,9,8]},
    });
    assert(weather.degrees.text === '18°' && weather.forecast.get_n_children() === 3, 'Weather current and forecast');
    panel.menu.open();
    await Scripting.sleep(350);
    const fullHeight = weather.body.height;
    const groupedWeatherColor = weather.current.get_theme_node().get_foreground_color().to_string();
    settings.set_boolean('weather-slim', true);
    assert(!weather.forecast.visible && weather.hero.visible, 'Slim weather keeps conditions and hides forecast');
    await Scripting.sleep(200);
    assert(weather.body.height < fullHeight, `Slim weather reduces card height: ${weather.body.height} < ${fullHeight}`);
    settings.set_boolean('weather-slim', false);
    assert(weather.forecast.visible, 'Full weather restores forecast without refreshing');
    panel.menu.close();
    await Scripting.sleep(200);
    settings.set_boolean('separate-applet-panels', true);
    const rightCards = panel.right.get_children();
    assert(rightCards.indexOf(panel.weather) + 1 === rightCards.indexOf(panel.calendar), 'Separate panels put weather directly above calendar');
    panel.date.menu.open();
    await Scripting.sleep(500);
    assert(panel.weather.mapped, 'Weather visible in calendar panel');
    const stream = Gio.File.new_for_path('/tmp/luna-weather-calendar.png').replace(null, false, Gio.FileCreateFlags.NONE, null);
    const screenshot = new Shell.Screenshot();
    await new Promise((resolve, reject) => screenshot.screenshot(false, stream, (object, result) => {
        try { object.screenshot_finish(result); stream.close(null); resolve(); } catch (error) { reject(error); }
    }));
    panel.menu.close();
    await Scripting.sleep(200);
    settings.set_boolean('weather-separate-button', true);
    assert(weather.actor.visible && !panel.weather.visible && weather.body.get_parent() === weather.item, 'Separate button moves weather out of grouped panel');
    weather.menu.open();
    await Scripting.sleep(200);
    assert(weather.menu.isOpen && weather.backdrop.surface.visible, 'Weather panel and backdrop open');
    assert(weather.current.get_theme_node().get_foreground_color().to_string() === groupedWeatherColor, 'Standalone weather uses the same foreground as grouped weather');
    const weatherStream = Gio.File.new_for_path('/tmp/luna-weather-standalone.png').replace(null, false, Gio.FileCreateFlags.NONE, null);
    await new Promise((resolve, reject) => screenshot.screenshot(false, weatherStream, (object, result) => {
        try { object.screenshot_finish(result); weatherStream.close(null); resolve(); } catch (error) { reject(error); }
    }));
    weather.menu.close();
    settings.set_boolean('weather-separate-button', false);
    assert(!weather.actor.visible && weather.body.get_parent() === panel.weather && weather.degrees.text === '18°', 'Returning to grouped panel retains data');
    settings.set_boolean('unified-system-panel', false);
    assert(weather.body.get_parent() === weather.item, 'Weather detached before system panel teardown');
    settings.set_boolean('unified-system-panel', true);
    panel = bar._panelBridge._systemPanel;
    assert(weather.body.get_parent() === panel.weather && weather.degrees.text === '18°', 'Weather reattached after system panel recreation');
    settings.set_boolean('show-weather', false);
    assert(!weather.actor.visible && !panel.weather.visible, 'Disabling weather hides both placements');
    print('LUNA_INTERACTIONS_PANELS_PASS');
    settings.set_int('taskbar-height', 60);
    await Scripting.sleep(400);
    assert(bar._bar.height === 60, 'Taskbar geometry updates');
    settings.set_int('launcher-size', 34);
    assert(bar._startMenu.icon.icon_size === 34, 'Typed launcher updates');
    settings.set_boolean('show-overview-button', false);
    assert(!bar._launcher.visible, 'Launcher visibility updates');
    settings.set_boolean('show-overview-button', true);
    settings.set_boolean('calendar-week-numbers', true);
    assert(bar._panelBridge._systemPanel.date._calendar._useWeekdate, 'Panel setting updates');
    panel = bar._panelBridge._systemPanel;
    panel._calendarCollapseButton.emit('clicked', 1);
    assert(settings.get_boolean('calendar-collapsed') && !panel.date._calendar.visible && panel.calendarHeader.visible,
        'Calendar header button minimizes the calendar grid');
    panel._calendarCollapseButton.emit('clicked', 1);
    assert(!settings.get_boolean('calendar-collapsed') && panel.date._calendar.visible,
        'Calendar header button restores the full calendar');
    const icon = new St.Icon({icon_name: 'folder', icon_size: 24});
    const content = new St.BoxLayout();
    content.add_child(icon);
    const button = new St.Button({child: content});
    Main.uiGroup.add_child(button);
    button.set_position(100, 100);
    settings.set_string('app-hover-animation', 'zoom');
    settings.set_int('app-animation-duration', 160);
    await Scripting.sleep(100);
    bar._animations.hover(button, true);
    await Scripting.sleep(220);
    assert(Math.abs(icon.scale_x - 1.08) < 0.001, 'Typed hover animation reaches its target');
    bar._animations.hover(button, false);
    await Scripting.sleep(220);
    assert(Math.abs(icon.scale_x - 1) < 0.001, 'Typed hover animation restores scale');
    button.destroy();
    settings.set_int('hide-delay', 0);
    settings.set_string('visibility-mode', 'auto-hide');
    await Scripting.sleep(450);
    assert(bar._bar.opacity === 0, 'Typed visibility hides taskbar');
    settings.set_string('visibility-mode', 'always');
    await Scripting.sleep(450);
    assert(bar._bar.opacity === 255, 'Typed visibility restores taskbar');
    settings.resetAll();

    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
    launcher.set_environ(global.create_app_launch_context(0, -1).get_environment());
    launcher.setenv('GDK_BACKEND', 'wayland', true);
    launcher.setenv('GSETTINGS_BACKEND', 'memory', true);
    launcher.setenv('GTK_A11Y', 'none', true);
    launcher.setenv('GI_TYPELIB_PATH', '/usr/lib64/gnome-shell/girepository-1.0', true);
    launcher.setenv('LD_LIBRARY_PATH', '/usr/lib64/gnome-shell', true);
    const process = launcher.spawnv(['gjs', '-m', `${GLib.getenv('LUNA_TEST_ROOT')}/tests/taskbar-prefs-smoke.js`]);
    await new Promise((resolve, reject) => process.wait_check_async(null, (p, result) => {
        try { p.wait_check_finish(result); resolve(); } catch (error) { reject(error); }
    }));
    extension.stateObj.disable();
    assert(extension.stateObj.runtime === null, 'Runtime released');
    extension.stateObj.enable();
    await Scripting.sleep(250);
    assert(extension.stateObj.runtime._bar.mapped, 'Clean re-enable');
    print('LUNA_TASKBAR_SHELL_PASS');
}
