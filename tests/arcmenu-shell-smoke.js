import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(2000);
    Main.overview.hide();
    await Scripting.sleep(300);
    const extension = Main.extensionManager.lookup('luna-taskbar@wuild');
    const arc = Main.extensionManager.lookup('arcmenu@arcmenu.com');
    assert(extension?.state === 1 && arc?.state === 1, 'Both extensions enabled');
    let runtime = extension.stateObj.runtime;
    const settings = runtime._settings;
    const button = Main.panel.statusArea.ArcMenu;
    Main.overview.show();
    await Scripting.sleep(350);
    assert(runtime._launcher.has_style_class_name('luna-taskbar-start-open'), 'Overview button stays highlighted while open');
    Main.overview.hide();
    await Scripting.sleep(350);
    assert(!runtime._launcher.has_style_class_name('luna-taskbar-start-open'), 'Overview button clears its open highlight');
    const arcRecord = [...runtime._panelBridge._records.values()].find(record => record.role === 'ArcMenu');
    const arcSurface = arcRecord.arcMenus.find(entry => entry.menu === button.arcMenu).backdrop;
    settings.set_boolean('panel-transparency', true);
    settings.set_int('panel-blur-radius', 24);
    settings.set_int('panel-opacity', 65);
    button.arcMenu.open();
    await Scripting.sleep(250);
    assert(arcSurface.surface.visible && arcSurface.blur.enabled, 'ArcMenu shares panel backdrop');
    assert(arcSurface.surface.get_style().includes('0.65'), 'ArcMenu shares panel opacity');
    settings.set_boolean('panel-transparency', false);
    assert(!arcSurface.blur.enabled, 'ArcMenu can be opaque');
    button.arcMenu.close();
    for (const key of ['panel-transparency', 'panel-blur-radius', 'panel-opacity']) settings.reset(key);
    const startIcon = button.menuButtonWidget.getPanelIcon();
    settings.set_int('launcher-size', 27);
    settings.set_int('launcher-padding', 3);
    settings.set_int('launcher-margin', 2);
    assert(startIcon.icon_size === 27, 'ArcMenu uses Start button icon size');
    assert(button.get_style().includes('padding: 3px') && button.get_style().includes('margin: 0 2px'),
        'ArcMenu uses Start button spacing');
    assert(runtime._startMenu.icon.icon_size !== 27, 'Separate Overview keeps Search/Overview sizing');
    const startStyle = button.get_style();
    settings.set_string('launcher-menu', 'overview');
    await Scripting.sleep(100);
    assert(runtime._startMenu.icon.icon_size === 27 && runtime._launcher.get_style() === startStyle,
        'Overview inherits the same Start button style when acting as Start');
    settings.set_string('launcher-menu', 'arcmenu');
    await Scripting.sleep(100);
    for (const key of ['launcher-size', 'launcher-padding', 'launcher-margin']) settings.reset(key);
    const shellSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    const animations = shellSettings.get_boolean('enable-animations');
    shellSettings.set_boolean('enable-animations', true);
    await Scripting.sleep(50);
    settings.set_boolean('taskbar-floating', true);
    await Scripting.sleep(350);
    const floatingX = runtime._bar.x;
    settings.set_boolean('taskbar-floating', false);
    assert(runtime._layoutTransition._timeline, 'Attached layout starts an animation');
    await Scripting.sleep(80);
    assert(runtime._bar.x > 0 && runtime._bar.x < floatingX, 'Layout has intermediate positions');
    settings.set_boolean('taskbar-floating', true);
    await Scripting.sleep(350);
    assert(runtime._bar.x === floatingX && !runtime._layoutTransition._timeline,
        'Interrupted transition settles at the latest layout');
    shellSettings.set_boolean('enable-animations', false);
    await Scripting.sleep(50);
    settings.set_boolean('taskbar-floating', false);
    assert(runtime._bar.x === 0 && !runtime._layoutTransition._timeline, 'Reduced motion applies layout immediately');
    shellSettings.set_boolean('enable-animations', animations);
    await Scripting.sleep(50);

    for (const size of [15, 16, 24, 25]) {
        settings.set_int('search-icon-size', size);
        assert(runtime._startMenu.icon.icon_size === runtime._searchButton.child.icon_size,
            'Search and Overview share icon sizing');
        assert(runtime._launcher.get_style() === runtime._searchButton.get_style(),
            'Search and Overview share button geometry');
    }
    settings.reset('search-icon-size');
    const source = GLib.getenv('LUNA_TEST_ROOT') ||
        JSON.parse(GLib.getenv('LUNA_DEVKIT_PROJECTS'))['luna-taskbar@wuild'];
    const {IconArtwork} = await import(`file://${source}/dist/compat/iconArtwork.js`);
    for (const name of ['view-paged-symbolic', 'audio-volume-high-symbolic', 'preferences-system-symbolic']) {
        const icon = new St.Icon({icon_name: name});
        Main.uiGroup.add_child(icon);
        const artwork = new IconArtwork(icon);
        const uri = icon.gicon.get_file().get_uri();
        for (const size of [14, 15, 16, 17, 23, 24, 25, 26, 32]) {
            icon.icon_size = size;
            await Scripting.sleep(60);
            assert(icon.gicon.get_file().get_uri() === uri, `${name}: stable artwork at ${size}px`);
            assert(icon.is_symbolic, `${name}: symbolic recoloring preserved`);
            const [, width, height] = icon.get_first_child().get_content().get_preferred_size();
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            assert(width === size * scale && height === size * scale,
                `${name}: exact rendered dimensions at ${size}px: ${width}x${height}`);
        }
        icon.icon_name = 'network-wireless-signal-excellent-symbolic';
        assert(icon.gicon.get_file().get_uri() !== uri, 'Dynamic status icon updates');
        artwork.destroy();
        assert(icon.gicon instanceof Gio.ThemedIcon, 'Borrowed icon restored on teardown');
        icon.destroy();
    }
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
    launcher.set_environ(global.create_app_launch_context(0, -1).get_environment());
    launcher.setenv('GDK_BACKEND', 'wayland', true);
    const child = launcher.spawnv(['python3', `${source}/tests/arcmenu-fullscreen.py`]);
    try {
        for (let i = 0; i < 50 && !global.display.get_monitor_in_fullscreen(0); i++)
            await Scripting.sleep(100);
        assert(global.display.get_monitor_in_fullscreen(0), 'Test window is fullscreen');
        settings.set_boolean('taskbar-floating', true);
        settings.set_int('taskbar-edge-gap', 12);
        settings.set_int('taskbar-end-gap', 20);
        settings.set_int('taskbar-corner-radius', 16);
        settings.set_boolean('show-desktop-button', true);
        settings.set_boolean('taskbar-border-enabled', true);
        settings.set_int('taskbar-border-width', 2);
        extension.stateObj.disable();
        extension.stateObj.enable();
        runtime = extension.stateObj.runtime;
        await Scripting.sleep(500);
        const monitor = Main.layoutManager.primaryMonitor;
        for (const edge of ['bottom', 'top', 'left', 'right']) {
            settings.set_string('taskbar-position', edge);
            settings.set_string('visibility-mode', 'always');
            await Scripting.sleep(350);
            const bar = runtime._bar;
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            const vertical = edge === 'left' || edge === 'right';
            assert((vertical ? bar.width : bar.height) === settings.get_int('taskbar-height') * scale, 'Edge thickness');
            assert((vertical ? bar.height : bar.width) === (vertical ? monitor.height : monitor.width) - 40 * scale, 'Floating end gaps');
            global.display.emit('overlay-key');
            await Scripting.sleep(250);
            assert(button.has_style_class_name('luna-taskbar-start-open'), 'ArcMenu button stays highlighted while open');
            assert(button.arcMenu.isOpen && bar.visible && bar.opacity === 255, `ArcMenu reveals ${edge} taskbar`);
            assert(runtime._roundedContent.enabled, 'All taskbar content uses rounded clipping');
            const desktop = runtime._showDesktopButton;
            const [dx, dy] = desktop.get_transformed_position();
            const [dw, dh] = desktop.get_transformed_size();
            const endGap = vertical ? bar.y + bar.height - dy - dh : bar.x + bar.width - dx - dw;
            assert(Math.abs(endGap) <= 1, `Show Desktop reaches the ${edge} taskbar end: ${endGap}`);
            assert(Math.abs((vertical ? dh : dw) - 16 * scale) <= 1, 'Show Desktop cap stays compact');
            const hit = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,
                vertical ? dx + dw / 2 : dx + dw - 2, vertical ? dy + dh - 2 : dy + dh / 2);
            assert(hit === desktop || desktop.contains(hit), 'Entire rounded cap is clickable');
            const [dividerX, dividerY] = desktop.child.get_transformed_position();
            assert(Math.abs(vertical ? dividerY - dy : dividerX - dx) <= 1,
                `Show Desktop ${edge} divider aligns with the inner clickable edge`);
            const [dividerWidth, dividerHeight] = desktop.child.get_transformed_size();
            assert(Math.abs(vertical ? dividerWidth - bar.width : dividerHeight - bar.height) <= 1,
                `Show Desktop ${edge} separator keeps its length`);
            desktop.add_style_pseudo_class('hover');

            assert(button.arcMenu._boxPointer._userArrowSide === St.Side[edge.toUpperCase()], `ArcMenu faces inward at ${edge}`);
            const [menuX, menuY] = button.arcMenu.actor.get_transformed_position();
            const [menuWidth, menuHeight] = button.arcMenu.actor.get_transformed_size();
            const popupGap = edge === 'bottom' ? bar.y - menuY - menuHeight
                : edge === 'top' ? menuY - bar.y - bar.height
                : edge === 'left' ? menuX - bar.x - bar.width : bar.x - menuX - menuWidth;
            assert(Math.abs(popupGap - settings.get_int('panel-taskbar-gap') * scale) <= 1,
                `ArcMenu ${edge} stays next to the taskbar: ${popupGap}`);
            if (GLib.getenv('LUNA_SCREENSHOT_DIR')) {
                const stream = Gio.File.new_for_path(`${GLib.getenv('LUNA_SCREENSHOT_DIR')}/luna-${edge}.png`)
                    .replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                const screenshot = new Shell.Screenshot();
                await new Promise((resolve, reject) => screenshot.screenshot(false, stream, (object, result) => {
                    try { object.screenshot_finish(result); stream.close(null); resolve(); } catch (error) { reject(error); }
                }));
            }
            button.arcMenu.close();
            assert(!button.has_style_class_name('luna-taskbar-start-open'), 'ArcMenu button clears its open highlight');
            Main.overview.show();
            await Scripting.sleep(350);
            assert(bar.visible && bar.opacity === 255 && bar.translation_x === 0 && bar.translation_y === 0,
                `Overview reveals ${edge} taskbar after ArcMenu over fullscreen`);
            const [bx, by] = runtime._launcher.get_transformed_position();
            const [bw, bh] = runtime._launcher.get_transformed_size();
            const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, bx + bw / 2, by + bh / 2);
            assert(picked === runtime._launcher || runtime._launcher.contains(picked),
                `Overview ${edge} taskbar button is visible and clickable above the backdrop`);
            Main.overview.hide();
            await Scripting.sleep(350);
            const work = Main.layoutManager.getWorkAreaForMonitor(0);
            const expected = (settings.get_int('taskbar-height') + 24) * scale;
            assert(vertical ? work.width === monitor.width - expected : work.height === monitor.height - expected,
                `Floating ${edge} reserves bar and both gaps: ${JSON.stringify(work)}`);
            for (const side of [St.Side.TOP, St.Side.RIGHT, St.Side.BOTTOM, St.Side.LEFT])
                assert(runtime._background.get_theme_node().get_border_width(side) === 2 * scale,
                    `Floating ${edge} borders every side`);
            settings.set_boolean('taskbar-floating', false);
            await Scripting.sleep(350);
            const inward = {bottom: St.Side.TOP, top: St.Side.BOTTOM, left: St.Side.RIGHT, right: St.Side.LEFT}[edge];
            for (const side of [St.Side.TOP, St.Side.RIGHT, St.Side.BOTTOM, St.Side.LEFT])
                assert(runtime._background.get_theme_node().get_border_width(side) === (side === inward ? 2 * scale : 0),
                    `Attached ${edge} borders only the window-facing side`);
            settings.set_boolean('taskbar-floating', true);
            await Scripting.sleep(350);
        }
        settings.set_string('taskbar-position', 'bottom');
        settings.set_string('window-appearance-mode', 'maximized');
        settings.set_string('window-appearance-layout', 'attached');
        const testWindow = global.get_window_actors().map(actor => actor.meta_window)
            .find(window => window.get_title() === 'ArcMenu fullscreen regression');
        testWindow.unmake_fullscreen();
        settings.set_string('window-appearance-mode', 'disabled');
        for (const edge of ['bottom', 'top', 'left', 'right']) {
            settings.set_string('taskbar-position', edge);
            await Scripting.sleep(350);
            testWindow.maximize();
            await Scripting.sleep(500);
            const frame = testWindow.get_frame_rect();
            const work = Main.layoutManager.getWorkAreaForMonitor(0);
            assert(frame.x === work.x && frame.y === work.y && frame.width === work.width && frame.height === work.height,
                `Maximized window respects floating ${edge}: frame=${JSON.stringify(frame)}, work=${JSON.stringify(work)}`);
            const bar = runtime._bar;
            const gap = edge === 'bottom' ? bar.y - frame.y - frame.height
                : edge === 'top' ? frame.y - bar.y - bar.height
                : edge === 'left' ? frame.x - bar.x - bar.width : bar.x - frame.x - frame.width;
            assert(gap === 12 * St.ThemeContext.get_for_stage(global.stage).scale_factor,
                `Maximized window has matching floating ${edge} gap: ${gap}`);
            testWindow.unmaximize();
            await Scripting.sleep(200);
        }
        settings.set_string('taskbar-position', 'bottom');
        settings.set_string('window-appearance-mode', 'maximized');
        testWindow.maximize();
        await Scripting.sleep(500);
        assert(runtime._windowAppearanceActive && runtime._bar.width === monitor.width, 'Maximized window attaches floating bar');
        const attachedFrame = testWindow.get_frame_rect();
        assert(attachedFrame.y + attachedFrame.height === runtime._bar.y,
            'Attached maximized layout removes the window-side gap');
        testWindow.unmaximize();
        await Scripting.sleep(500);
        assert(!runtime._windowAppearanceActive && runtime._bar.width < monitor.width, 'Restoring window restores floating layout');
        settings.set_string('window-appearance-mode', 'disabled');
        settings.set_boolean('taskbar-floating', false);
        testWindow.make_fullscreen();
        await Scripting.sleep(300);
        for (const mode of ['always', 'auto-hide', 'maximized', 'overlap']) {
            settings.set_string('visibility-mode', mode);
            await Scripting.sleep(200);
            global.display.emit('overlay-key');
            await Scripting.sleep(350);
            assert(button.arcMenu.isOpen, `Super opens ArcMenu in ${mode}`);
            assert(!Main.overview.visible, `Super does not open Overview in ${mode}`);
            assert(runtime._bar.visible && runtime._bar.opacity === 255 && runtime._bar.translation_y === 0,
                `Taskbar revealed over fullscreen in ${mode}`);
            assert(runtime._visibility._trackFullscreen === false, 'Chrome stays visible over fullscreen');
            button.arcMenu.close();
            await Scripting.sleep(200);
            assert(runtime._visibility._trackFullscreen === true, 'Fullscreen hiding restored on close');
        }
    } finally {
        child.force_exit();
        settings.resetAll();
    }
    async function checkPreferences(active) {
        const prefsLauncher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
        prefsLauncher.set_environ(global.create_app_launch_context(0, -1).get_environment());
        prefsLauncher.setenv('GDK_BACKEND', 'wayland', true);
        prefsLauncher.setenv('GI_TYPELIB_PATH', '/usr/lib64/gnome-shell/girepository-1.0', true);
        prefsLauncher.setenv('LD_LIBRARY_PATH', '/usr/lib64/gnome-shell', true);
        prefsLauncher.setenv('LUNA_EXPECT_ARCMENU', active ? '1' : '0', true);
        const process = prefsLauncher.spawnv(['gjs', '-m', `${source}/tests/taskbar-prefs-smoke.js`]);
        await new Promise((resolve, reject) => process.wait_check_async(null, (p, result) => {
            try { p.wait_check_finish(result); resolve(); } catch (error) { reject(error); }
        }));
    }
    await checkPreferences(true);
    await Main.extensionManager.disableExtension('arcmenu@arcmenu.com');
    await Scripting.sleep(400);
    await checkPreferences(false);
    global.display.emit('overlay-key');
    await Scripting.sleep(300);
    assert(Main.overview.visible, 'Super restores Overview when ArcMenu is disabled');
    Main.overview.hide();
    await Main.extensionManager.enableExtension('arcmenu@arcmenu.com');
    await Scripting.sleep(400);
    global.display.emit('overlay-key');
    await Scripting.sleep(300);
    assert(Main.panel.statusArea.ArcMenu.arcMenu.isOpen && !Main.overview.visible,
        'Super opens only ArcMenu after re-enable');
    Main.panel.statusArea.ArcMenu.arcMenu.close();
    const editor = runtime._appletEditor;
    const visibleBlocks = editor.records().filter(record => record.actor.visible).map(record => record.id);
    editor.start();
    for (const id of visibleBlocks)
        assert(editor._entries.some(entry => entry.id === id), `Editable block: ${id}`);
    assert(editor._entries.length === visibleBlocks.length, 'Hidden buttons do not occupy edit layout');
    assert(editor._done.get_parent() !== runtime._content && editor._toolbar.mapped,
        'Editing controls float outside the taskbar layout');
    const appbar = editor._entries.find(entry => entry.id === 'appbar');
    await Scripting.sleep(100);
    assert(appbar.button.x_expand && appbar.button.width > runtime._content.width / 3,
        'Editing app bar fills available horizontal space');
    editor._begin(appbar);
    assert(editor._gap.x_expand && !appbar.button.x_expand, 'Drag placeholder retains expanding space');
    assert(editor.acceptDrop(appbar, appbar.button, 10000), 'App bar accepts a drop at the far right');
    editor._finishDrag();
    editor.stop();
    settings.set_string('taskbar-position', 'left');
    await Scripting.sleep(350);
    for (const record of editor.records()) {
        if (!record.actor.visible || record.id === 'showDesktop') continue;
        const [x] = record.actor.get_transformed_position();
        assert(Math.abs(x + record.actor.width / 2 - runtime._bar.x - runtime._bar.width / 2) <= 1,
            `${record.id}: centered on vertical taskbar`);
    }
    editor.start();
    await Scripting.sleep(100);
    const verticalAppbar = editor._entries.find(entry => entry.id === 'appbar');
    assert(verticalAppbar.button.y_expand && verticalAppbar.button.height > runtime._content.height / 3,
        'Editing app bar fills available vertical space');
    editor.stop();
    settings.set_string('taskbar-position', 'bottom');
    await Scripting.sleep(350);
    const saved = settings.get_strv('applet-order');
    assert(saved.indexOf('appbar') > saved.indexOf('quickSettings'), 'App bar saved beyond system controls');
    assert(runtime._appStrip.actor.get_parent() === runtime._content, 'App bar remains attached');
    const order = () => editor.records().sort((a, b) =>
        runtime._content.get_children().indexOf(a.actor) - runtime._content.get_children().indexOf(b.actor))
        .map(record => record.id);
    const before = order();
    runtime._panelBridge._sync();
    await Scripting.sleep(200);
    assert(JSON.stringify(order()) === JSON.stringify(before), 'Panel updates preserve the full taskbar order');
    await Main.extensionManager.disableExtension('arcmenu@arcmenu.com');
    await Scripting.sleep(200);
    assert(settings.get_strv('applet-order').includes('ArcMenu'), 'Absent ArcMenu keeps its saved position');
    await Main.extensionManager.enableExtension('arcmenu@arcmenu.com');
    await Scripting.sleep(400);
    assert(JSON.stringify(order()) === JSON.stringify(before), 'ArcMenu returns to its saved position');
    extension.stateObj.disable();
    extension.stateObj.enable();
    await Scripting.sleep(400);
    const reloaded = extension.stateObj.runtime;
    assert(reloaded._content.get_children().indexOf(reloaded._appStrip.actor) >
        reloaded._content.get_children().indexOf(Main.panel.statusArea.quickSettings.container),
        'Full taskbar order survives extension restart');
    reloaded._settings.reset('applet-order');
    print('LUNA_DEVKIT_INTEGRATION_PASS');
    print('LUNA_TASKBAR_ARCMENU_PASS');
}
