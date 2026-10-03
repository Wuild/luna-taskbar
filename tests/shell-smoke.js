import St from 'gi://St';
import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(1000);
    const extension = Main.extensionManager.lookup('luna-taskbar@wuild');
    assert(extension?.state === 1, 'LunaTaskbar enabled');
    const bar = extension.stateObj.runtime;
    bar._settings.set_boolean('unified-system-panel', false);
    Main.overview.hide();
    await Scripting.sleep(700);
    assert(bar._bar.visible && bar._bar.height > 0, 'Taskbar visible and allocated');
    assert(bar._content.get_last_child() === bar._showDesktopButton, 'Show desktop is at the far right');
    const taskbarIndex = actor => bar._content.get_children().indexOf(actor);
    assert(taskbarIndex(Main.panel.statusArea.quickSettings.container) <
        taskbarIndex(Main.panel.statusArea.dateMenu.container),
    'System controls are left of the calendar');
    assert(taskbarIndex(Main.panel.statusArea.dateMenu.container) <
        taskbarIndex(bar._showDesktopButton),
    'Calendar is left of Show desktop');
    assert(bar._taskScroll.hscrollbar_policy === St.PolicyType.EXTERNAL,
        'Taskbar overflow scrolls without visible scrollbars');
    assert(bar._preview._backdrop.blur.mode === Shell.BlurMode.BACKGROUND,
        'Previews have a separate native backdrop');
    assert(bar._blur.mode === Shell.BlurMode.BACKGROUND, 'Native backdrop blur');
    if (Gio.File.new_for_path('/usr/share/pixmaps/chatgpt.png').query_exists(null)) {
        const {createTaskIcon} = await import(`${Gio.File.new_for_path(bar.path).get_uri()}/compat/windowIcons.js`);
        const chatgptIcon = createTaskIcon(null, {get_gtk_application_id: () => null, get_wm_class: () => 'Chatgpt'});
        assert(chatgptIcon.gicon instanceof Gio.FileIcon && chatgptIcon.gicon.get_file().get_basename() === 'chatgpt.png',
            'ChatGPT WM_CLASS resolves to its installed desktop icon');
        chatgptIcon.destroy();
    }

    assert(Clutter.get_debug_flags()[1] & Clutter.DrawDebugFlag.DISABLE_CLIPPED_REDRAWS,
        'Visible native blur prevents stale partial framebuffer sampling');
    assert(!(Clutter.get_debug_flags()[1] & Clutter.DrawDebugFlag.CONTINUOUS_REDRAW),
        'Blur repair does not force continuous idle rendering');
    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    const divider = bar._showDesktopButton.child;
    assert(divider.mapped && divider.width >= scale && divider.height >= 16 * scale,
        'Show desktop has a visible allocated divider');
    assert(divider.x <= scale, 'Show desktop divider sits at the left edge');
    assert(Math.abs(divider.height - bar._bar.height) <= 1, 'Show desktop divider spans the full taskbar height');
    const checkDesktopWidth = () => {
        const limit = (bar._settings.get_int('show-desktop-width') +
            bar._settings.get_int('show-desktop-margin')) * scale;
        assert(bar._showDesktopButton.width <= limit + 1,
            'Show desktop does not absorb spare taskbar space');
        const [x] = bar._showDesktopButton.get_transformed_position();
        assert(Math.abs(x + bar._showDesktopButton.width - (bar._bar.x + bar._bar.width)) <= 1,
            'Compact Show desktop button reaches the display edge');
    };
    checkDesktopWidth();
    bar._settings.set_int('show-desktop-width', 16);
    await Scripting.sleep(150);
    checkDesktopWidth();
    assert(bar._showDesktopButton.width >= 16 * scale, 'Configured Show desktop width is respected');
    bar._settings.reset('show-desktop-width');
    bar._settings.set_int('taskbar-blur-radius', 48);
    bar._settings.set_int('taskbar-opacity', 75);
    assert(bar._blur.radius === 48 * scale && bar._background.style.includes('0.75'),
        'Taskbar blur strength and opacity apply live');
    bar._settings.reset('taskbar-blur-radius');
    bar._settings.reset('taskbar-opacity');
    bar._settings.set_boolean('taskbar-color-override', true);
    bar._settings.set_string('taskbar-color', '#123456');
    assert(bar._background.style.includes('18, 52, 86'), 'Custom taskbar color applies immediately');
    bar._settings.reset('taskbar-color');
    bar._settings.reset('taskbar-color-override');
    bar._settings.set_string('window-appearance-mode', 'maximized');
    bar._settings.set_boolean('window-appearance-color-override', true);
    bar._settings.set_string('window-appearance-color', '#112233');
    bar._settings.set_int('window-appearance-opacity', 95);
    bar._settings.set_int('window-appearance-blur-radius', 24);
    bar._updateSurface([{minimized: false, skip_taskbar: false, is_override_redirect: () => false,
        get_monitor: () => bar._monitor().index, is_maximized: () => true,
        get_frame_rect: () => ({x: 0, y: 0, width: 100, height: 100})}]);
    assert(bar._windowAppearanceActive && bar._background.style.includes('17, 34, 51, 0.95') &&
        bar._blur.radius === 24 * scale, 'Alternate taskbar color, opacity and blur apply together');
    bar._updateSurface([]);
    assert(!bar._windowAppearanceActive && bar._blur.radius === 12 * scale,
        'Regular appearance returns when no windows match');
    for (const key of ['mode', 'color', 'color-override', 'opacity', 'blur-radius'])
        bar._settings.reset(`window-appearance-${key}`);
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    const themeFixture = Gio.File.new_for_path(`${GLib.get_user_runtime_dir()}/luna-taskbar-theme-test.css`);
    themeFixture.replace_contents('#panel { background-color: #2468ac; color: #102030; } .popup-menu-content { background-color: #abcdef; color: #203040; }', null, false, 0, null);
    theme.load_stylesheet(themeFixture);
    await Scripting.sleep(300);
    assert(bar._background.style.includes('36, 104, 172'), 'Taskbar follows active theme color by default');
    assert(bar._preview._backdrop.surface.style.includes('171, 205, 239'), 'Panels and previews follow theme color by default');
    bar._settings.set_string('taskbar-color', '#123456');
    assert(bar._background.style.includes('36, 104, 172'), 'Saved custom color does not force an override');
    bar._settings.set_boolean('taskbar-color-override', true);
    assert(bar._background.style.includes('18, 52, 86'), 'Explicit override uses saved color');
    bar._settings.set_boolean('taskbar-color-override', false);
    assert(bar._background.style.includes('36, 104, 172') && bar._settings.get_string('taskbar-color') === '#123456',
        'Turning override off restores theme and retains the custom color');
    bar._settings.reset('taskbar-color');
    theme.unload_stylesheet(themeFixture);
    themeFixture.delete(null);
    await Scripting.sleep(300);
    bar._settings.set_string('indicator-color-mode', 'custom');
    bar._settings.set_string('indicator-color', '#ee8844');
    for (const {indicator} of bar._buttons.values())
        assert(indicator.get_first_child().style.includes('#ee8844'), 'Custom indicator color applies');
    const sampleIcon = new St.Icon({icon_name: 'folder'});
    bar._iconColors.get(sampleIcon);
    await Scripting.sleep(250);
    assert(/^#[0-9a-f]{6}$/i.test(bar._iconColors.get(sampleIcon) ?? ''),
        'Dominant color is extracted from a real themed icon');
    sampleIcon.destroy();
    bar._settings.reset('indicator-color-mode');
    bar._settings.reset('indicator-color');
    assert(Main.panel.statusArea.dateMenu.container.get_parent() === bar._content, 'Calendar on right');
    assert(Main.panel.statusArea.quickSettings.container.get_parent() === bar._content, 'System controls on right');
    assert(Main.panel.statusArea.screenSharing.container.get_parent() === bar._content,
        'Stop-sharing control is independently ordered outside the application tray');
    assert(![...bar._panelBridge._records.values()].some(record => record.label?.text === 'Stop sharing'),
        'Sharing control retains its native icon without an added text label');
    Main.panel.toggleQuickSettings();
    await Scripting.sleep(250);
    assert(Main.panel.statusArea.quickSettings.menu.isOpen, 'Quick settings opens');
    const quickPanel = Main.panel.statusArea.quickSettings.menu._boxPointer;
    const [panelX, panelY] = quickPanel.get_transformed_position();
    const quickGap = bar._bar.y - (panelY + quickPanel.get_transformed_size()[1]);
    assert(Math.abs(quickGap - 6 * scale) <= 1, `System panel gap is six pixels: ${quickGap}`);
    const [panelWidth] = quickPanel.get_transformed_size();
    const panelMonitor = Main.layoutManager.findMonitorForActor(Main.panel.statusArea.quickSettings);
    assert(panelX >= panelMonitor.x + 12 * scale - 1 &&
        panelX + panelWidth <= panelMonitor.x + panelMonitor.width - 12 * scale + 1,
        `System panel respects both screen-edge gaps: x=${panelX}, width=${panelWidth}, monitor=${JSON.stringify(panelMonitor)}`);
    assert(Main.panel.statusArea.quickSettings.has_style_class_name('luna-taskbar-applet-open'),
        'Applet stays highlighted while its panel is open');
    assert(Main.panel.statusArea.quickSettings.menu._boxPointer._userArrowSide === St.Side.BOTTOM, 'Menu opens upwards');
    const pointerDevice = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const clockButton = Main.panel.statusArea.dateMenu;
    const [clockX, clockY] = clockButton.get_transformed_position();
    const [clockWidth, clockHeight] = clockButton.get_transformed_size();
    pointerDevice.notify_absolute_motion(0, clockX + clockWidth / 2, clockY + clockHeight / 2);
    await Scripting.sleep(100);
    assert(Main.panel.statusArea.quickSettings.menu.isOpen && !clockButton.menu.isOpen,
        'Hovering another applet does not switch panels');
    pointerDevice.notify_button(0, 1, Clutter.ButtonState.PRESSED);
    pointerDevice.notify_button(0, 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(250);
    assert(clockButton.menu.isOpen && !Main.panel.statusArea.quickSettings.menu.isOpen,
        'A single click switches directly from system controls to calendar');
    const calendarPanel = clockButton.menu._boxPointer;
    const calendarGap = bar._bar.y - (calendarPanel.get_transformed_position()[1] + calendarPanel.get_transformed_size()[1]);
    assert(Math.abs(calendarGap - quickGap) <= 1, `Calendar and system panel gaps match: ${calendarGap}/${quickGap}`);

    const quickButton = Main.panel.statusArea.quickSettings;
    const [quickX, quickY] = quickButton.get_transformed_position();
    const [quickWidth, quickHeight] = quickButton.get_transformed_size();
    pointerDevice.notify_absolute_motion(0, quickX + quickWidth / 2, quickY + quickHeight / 2);
    await Scripting.sleep(100);
    pointerDevice.notify_button(0, 1, Clutter.ButtonState.PRESSED);
    pointerDevice.notify_button(0, 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(250);
    assert(quickButton.menu.isOpen && !clockButton.menu.isOpen,
        'Single-click panel switching works in both directions');
    pointerDevice.notify_absolute_motion(0, 100, 100);
    const quickBackdrop = [...bar._panelBridge._records.values()]
        .find(record => record.indicator === Main.panel.statusArea.quickSettings).backdrop;
    assert(quickBackdrop._panel === Main.panel.statusArea.quickSettings.menu._boxPointer,
        'System backdrop tracks the visible panel rather than its zero-sized wrapper');
    assert(quickBackdrop.surface.get_parent() === Main.uiGroup, 'Separate popup backdrop installed');
    assert(quickBackdrop.blur.mode === Shell.BlurMode.BACKGROUND, 'Popup has native backdrop blur');
    assert(quickBackdrop._roundedSurface.enabled && quickBackdrop._roundedSurface._key,
        'Popup backdrop blur is clipped by the rounded surface mask');
    bar._settings.set_int('panel-blur-radius', 44);
    bar._settings.set_int('panel-opacity', 70);
    assert(quickBackdrop.blur.radius === 44 * scale && quickBackdrop.surface.style.includes('0.7'),
        'Panel blur strength and opacity apply live');
    bar._settings.reset('panel-blur-radius');
    bar._settings.reset('panel-opacity');
    bar._settings.set_boolean('panel-transparency', false);
    assert(!quickBackdrop.blur.enabled && quickBackdrop.surface.has_style_class_name('opaque'),
        'Panel transparency opt-out applies opaque surface and disables blur');
    assert(!bar._preview._backdrop.blur.enabled, 'Preview follows panel transparency opt-out');
    bar._settings.set_boolean('panel-transparency', true);
    Main.panel.closeQuickSettings();
    assert(!Main.panel.statusArea.quickSettings.has_style_class_name('luna-taskbar-applet-open'),
        'Applet highlight clears when its panel closes');
    Main.overview.show();
    await Scripting.sleep(500);
    assert(!Main.overview.dash.visible && bar._bar.visible, 'Taskbar replaces overview dash');
    const controls = Main.overview._overview.controls;
    assert(controls.has_style_class_name('luna-taskbar-overview'), 'Overview uses scoped LunaTaskbar styling');
    bar._settings.set_boolean('panel-color-override', true);
    bar._settings.set_string('panel-color', '#123456');
    const entryColor = controls.searchEntry.get_theme_node().get_background_color();
    assert(entryColor.red === 18 && entryColor.green === 52 && entryColor.blue === 86,
        'Overview search surface follows the chosen panel color');
    bar._settings.reset('panel-color');
    bar._settings.reset('panel-color-override');
    bar._settings.set_boolean('panel-transparency', false);
    bar._settings.set_int('overview-panel-opacity', 20);
    assert(Math.abs(controls.searchEntry.get_theme_node().get_background_color().alpha - 51) <= 1,
        'Overview panels remain translucent independently of applet opacity');
    bar._settings.set_int('overview-panel-opacity', 100);
    assert(controls.searchEntry.get_theme_node().get_background_color().alpha === 255,
        'Overview panels can explicitly be made opaque');
    bar._settings.reset('overview-panel-opacity');
    bar._settings.reset('panel-transparency');
    const workspaceBox = controls.layout_manager._workspacesDisplay.get_allocation_box();
    assert(workspaceBox.y2 <= bar._bar.y - 12 * scale + 1,
        'Overview workspace area remains above taskbar and its gap');
    assert(bar._overviewBridge._backgrounds.length === Main.layoutManager.monitors.length,
        'Overview has desktop wallpaper for each monitor');
    assert(bar._overviewBridge._effects.size > 0, 'Overview wallpaper blur attached');
    for (const actor of bar._overviewBridge._effects.keys())
        assert(bar._overviewBridge._wallpaperGroup.contains(actor),
            'Overview blur never affects workspace preview actors');
    bar._settings.set_boolean('overview-blur', false);
    bar._settings.set_int('overview-tint-opacity', 40);
    await Scripting.sleep(100);
    assert([...bar._overviewBridge._effects.values()].every(({effect}) => !effect.enabled),
        'Overview wallpaper blur can be disabled');
    assert(bar._overviewBridge._tints.length === Main.layoutManager.monitors.length &&
        bar._overviewBridge._tints.every(tint => tint.mapped && tint.style.includes('0.4')),
        'Overview remains shaded on each monitor when blur is off');
    bar._settings.reset('overview-blur');
    bar._settings.reset('overview-tint-opacity');
    Main.overview.hide();
    await Scripting.sleep(300);
    bar._launcher.emit('clicked', 1);
    assert(Main.overview.visible, 'Launcher opens overview immediately on the first click');
    await Scripting.sleep(500);
    bar._launcher.emit('clicked', 1);
    await Scripting.sleep(300);
    assert(!Main.overview.visible, 'Second launcher click closes overview');
    assert(!Main.overview.dash.showAppsButton.checked, 'Launcher never opens the app grid');
    const source = [...bar._buttons.values()][0]?.button._delegate;
    if (source) {
        bar._taskDrag._begin(source);
        await Scripting.sleep(100);
        assert(source.button.opacity === 0, 'Dragged source hidden');
        assert(bar._taskDrag._placeholder.width > 0, 'Drag placeholder reserves space');
        bar._taskDrag.handleDragOver(source, null, bar._apps.width);
        await Scripting.sleep(200);
        bar._taskDrag._finish();
        assert(source.button.opacity === 255 && !bar._taskDrag._placeholder, 'Drag cancellation restores source');
    }
    bar._settings.set_int('app-icon-size', 40);
    assert(bar._bar.height === bar._settings.get_int('taskbar-height') * scale, 'Larger icons do not change fixed taskbar height');
    for (const {button} of bar._buttons.values())
        assert(button.child.get_first_child().icon_size <= 40, 'App icon preference fits within the button');
    bar._settings.reset('app-icon-size');
    assert(bar._launcher.child.icon_size === 28, 'Larger launcher icon');
    bar._settings.set_boolean('show-search-button', true);
    assert(bar._searchButton.visible, 'Optional search button becomes visible');
    bar._searchButton.emit('clicked', 1);
    await Scripting.sleep(150);
    assert(bar._searchPanel.actor.visible && !Main.overview.visible, 'Search opens independently of overview');
    bar._searchPanel.entry.set_text('files');
    await Scripting.sleep(700);
    assert(bar._searchPanel._rows.length > 0, 'Standalone search finds installed applications');
    assert(bar._searchPanel.entry.height === 38 * scale, 'Search entry uses a compact fixed height');
    const searchRow = bar._searchPanel._rows[0];
    const resultInset = searchRow.child.get_transformed_position()[0] - searchRow.get_transformed_position()[0];
    assert(resultInset >= 0 && resultInset <= 12 * scale, `Search result content aligns to the left: ${resultInset}`);
    const originalSearchSize = bar._settings.get_int('search-icon-size');
    bar._settings.set_int('search-icon-size', 20);
    assert(bar._searchButton.child.icon_size === 20, 'Search has independently adjustable icon size');
    const appButton = [...bar._buttons.values()][0]?.button;
    if (appButton)
        assert(bar._searchButton.get_style() === appButton.get_style(),
            'Search shares application button width, padding and margins');
    bar._settings.set_int('search-icon-size', originalSearchSize);
    bar._searchPanel.close();
    assert(!bar._searchPanel.actor.visible && !bar._searchPanel._grab, 'Search releases its modal grab');
    bar._settings.reset('show-search-button');

    bar._taskMenus.openBar(500, 660);
    assert(bar._taskMenus.menu.isOpen, 'Bar context menu opens');
    assert(bar._taskMenus.menu._getMenuItems().some(item => item.label?.text === 'Luna - Taskbar settings'),
        'Bar context menu exposes settings');
    const labels = bar._taskMenus.menu._getMenuItems().map(item => item.label?.text);
    assert(labels.includes('Edit taskbar') && !labels.includes('Window previews') && !labels.includes('Background blur'),
        'Context menu contains editing action without appearance switches');
    await Scripting.sleep(150);
    bar._taskMenus.close();
    const shortcutApp = Shell.AppSystem.get_default().lookup_app(Shell.AppSystem.get_default().get_installed()[0].get_id());
    const previousShortcut = bar._settings.get_string('menu-shortcut-app');
    bar._settings.set_string('menu-shortcut-app', shortcutApp.get_id());
    bar._taskMenus.openBar(500, 660);
    await Scripting.sleep(150);
    assert(bar._taskMenus.menu._getMenuItems().some(item => item.label?.text === shortcutApp.get_name()),
        'Context menu uses the selected application name');
    bar._taskMenus.close();
    bar._settings.set_string('menu-shortcut-app', previousShortcut);
    bar._settings.set_boolean('enable-blur', false);
    assert(!bar._blur.enabled, 'Blur preference applies immediately');
    bar._settings.set_boolean('enable-blur', true);
    const app = Shell.AppSystem.get_default().lookup_app(Shell.AppSystem.get_default().get_installed()[0].get_id());
    assert(app, 'Installed app for context menu');
    const notificationSource = new MessageTray.Source({title: 'LunaTaskbar badge test'});
    notificationSource.app = app;
    Main.messageTray.add(notificationSource);
    const notification = new MessageTray.Notification({source: notificationSource,
        title: 'Badge test', body: 'Test notification count', acknowledged: true});
    notificationSource.addNotification(notification);
    assert(bar._badges.getCount(app) === 1, 'Notification count associated with application');
    notification.destroy();
    assert(bar._badges.getCount(app) === 0, 'Badge count clears when notification is removed');
    const badgeBus = Gio.DBusConnection.new_for_address_sync(GLib.getenv('DBUS_SESSION_BUS_ADDRESS'),
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, null, null);
    const badgeUpdate = properties => badgeBus.emit_signal(null, '/com/canonical/unity/launcherentry',
        'com.canonical.Unity.LauncherEntry', 'Update', new GLib.Variant('(sa{sv})', [`application://${app.get_id()}`, properties]));
    badgeUpdate({count: new GLib.Variant('x', 12), 'count-visible': new GLib.Variant('b', true)});
    await Scripting.sleep(100);
    assert(bar._badges.getCount(app) === 12, 'Application launcher badges arrive over DBus');
    badgeUpdate({urgent: new GLib.Variant('b', true)});
    await Scripting.sleep(100);
    assert(bar._badges.getCount(app) === 12 && bar._badges.getState(app).urgent,
        'Partial launcher updates retain the unread count and set attention');
    badgeUpdate({count: new GLib.Variant('x', 0), urgent: new GLib.Variant('b', false)});
    await Scripting.sleep(100);
    assert(bar._badges.getCount(app) === 0 && !bar._badges.getState(app).urgent,
        'Application clearing removes the badge and attention');
    badgeUpdate({count: new GLib.Variant('x', 5)});
    await Scripting.sleep(100);
    badgeBus.close_sync(null);
    await Scripting.sleep(100);
    assert(bar._badges.getCount(app) === 0, 'Exited launcher publishers leave no stale badge');

    for (const {button, indicator} of bar._buttons.values()) {
        assert(button.child.layout_manager instanceof Clutter.BinLayout &&
            button.child.get_first_child().y_align === Clutter.ActorAlign.CENTER &&
            indicator.y_align === Clutter.ActorAlign.END,
        'Icon centers independently from bottom-aligned running indicators');
    }
    bar._settings.set_int('taskbar-height', 32);
    bar._settings.set_int('app-icon-size', 48);
    bar._settings.set_int('app-padding', 12);
    await Scripting.sleep(150);
    assert(bar._bar.height === 32 * scale && bar._bar.clip_to_allocation,
        'Taskbar height stays fixed and clips oversized content');
    for (const key of ['taskbar-height', 'app-icon-size', 'app-padding']) bar._settings.reset(key);
    await Scripting.sleep(150);
    const layoutTask = bar._createTask({app, window: null, windows: []});
    bar._apps.add_child(layoutTask.button);
    bar._styleTask(layoutTask.button);
    await Scripting.sleep(100);
    assert(!layoutTask.button.x_expand && layoutTask.button.width < 100 * scale,
        'Application button cannot absorb unused taskbar width');
    bar._settings.set_int('app-button-width', 64);
    bar._styleTask(layoutTask.button);
    await Scripting.sleep(100);
    assert(layoutTask.button.width >= 64 * scale && layoutTask.button.width < 90 * scale,
        'Application button respects configured bounded width');
    const boundingWidth = layoutTask.button.width;
    for (const padding of [0, 8, 16]) {
        bar._settings.set_int('app-padding', padding);
        bar._settings.set_int('taskbar-height', 32);
        bar._settings.set_int('app-icon-size', 48);
        bar._styleTask(layoutTask.button);
        await Scripting.sleep(100);
        const icon = layoutTask.button.child.get_first_child();
        const [bx, by] = layoutTask.button.get_transformed_position();
        const [ix, iy] = icon.get_transformed_position();
        assert(Math.abs(layoutTask.button.width - boundingWidth) <= 1,
            'Padding preserves outer button width');
        assert(layoutTask.button.height === 32 * scale,
            'Padding preserves fixed button height');
        assert(iy >= by && iy + icon.height <= by + layoutTask.button.height + 1 &&
            ix >= bx && ix + icon.width <= bx + layoutTask.button.width + 1,
            'Padded icon remains inside button bounds');
        assert(Math.abs(iy + icon.height / 2 - by - layoutTask.button.height / 2) <= 1,
            'Padded icon stays vertically centered');
    }
    for (const key of ['app-padding', 'taskbar-height', 'app-icon-size'])
        bar._settings.reset(key);
    bar._settings.reset('app-button-width');
    bar._styleTask(layoutTask.button);
    await Scripting.sleep(100);
    const contentHeight = layoutTask.button.child.height;
    assert(contentHeight > 10 &&
        Math.abs(layoutTask.indicator.y + layoutTask.indicator.height - contentHeight) <= 1,
        'Running indicator is allocated at the bottom of the button content');
    const layoutIcon = layoutTask.button.child.get_first_child();
    bar._settings.set_int('app-animation-duration', 80);
    bar._animations.hover(layoutTask.button, true);
    await Scripting.sleep(120);
    assert(layoutIcon.translation_y === -2, 'Hover animation lifts the icon without moving its button');
    bar._animations.hover(layoutTask.button, false);
    await Scripting.sleep(120);
    assert(layoutIcon.translation_y === 0 && layoutIcon.scale_x === 1, 'Hover animation returns to rest');
    bar._settings.reset('app-animation-duration');

    assert(Math.abs(layoutIcon.y + layoutIcon.height / 2 - contentHeight / 2) <= 1,
        'App icon is vertically centered in allocated button content');
    bar._preview._button = layoutTask.button;
    bar._preview.actor.show();
    bar._preview.hideLater();
    bar._preview.schedule({window: null}, bar._launcher);
    assert(!bar._preview.actor.visible && !bar._preview._hideSource,
        'Hovering a different app without windows dismisses the previous preview');
    layoutTask.button.destroy();
    bar._taskMenus.openTask({app, window: null}, bar._launcher);
    assert(bar._taskMenus.menu.isOpen, 'Application context menu opens');
    await Scripting.sleep(150);
    bar._taskMenus.close();
    const actionAppInfo = Shell.AppSystem.get_default().get_installed()
        .find(candidate => candidate.list_actions().length > 0);
    const actionApp = actionAppInfo && Shell.AppSystem.get_default().lookup_app(actionAppInfo.get_id());
    assert(actionAppInfo && actionApp, 'Installed application with desktop actions is available');
    const actionNames = actionAppInfo.list_actions()
        .map(action => actionAppInfo.get_action_name(action));
    bar._taskMenus.openTask({app: actionApp, window: null}, bar._launcher);
    const actionLabels = bar._taskMenus.menu._getMenuItems().map(item => item.label?.text).filter(Boolean);
    assert(actionNames.some(name => actionLabels.includes(name)),
        'Application-provided desktop actions appear in the taskbar context menu');
    bar._taskMenus.close();
    const itemXml = `<node><interface name="org.kde.StatusNotifierItem">
        <property name="Id" type="s" access="read"/>
        <property name="Title" type="s" access="read"/>
        <property name="Status" type="s" access="read"/>
        <property name="IconName" type="s" access="read"/>
        <property name="Menu" type="o" access="read"/>
        </interface></node>`;
    let clicked = false;
    let menuActionId = 1;
    const menuXml = `<node><interface name="com.canonical.dbusmenu">
        <method name="AboutToShow"><arg type="i" direction="in"/><arg type="b" direction="out"/></method>
        <method name="GetLayout"><arg type="i" direction="in"/><arg type="i" direction="in"/>
        <arg type="as" direction="in"/><arg type="u" direction="out"/><arg type="(ia{sv}av)" direction="out"/></method>
        <method name="Event"><arg type="i" direction="in"/><arg type="s" direction="in"/>
        <arg type="v" direction="in"/><arg type="u" direction="in"/></method>
        </interface></node>`;
    const fakeItem = Gio.DBusExportedObject.wrapJSObject(itemXml, {
        Id: 'luna-taskbar-smoke', Title: 'LunaTaskbar tray test', Status: 'Active',
        IconName: 'dialog-information', Menu: '/LunaTaskbarTestMenu',
    });
    const fakeMenu = Gio.DBusExportedObject.wrapJSObject(menuXml, {
        AboutToShow: () => false,
        GetLayout: () => [1, [0, {}, [new GLib.Variant('(ia{sv}av)',
            [menuActionId, {label: new GLib.Variant('s', 'Test action')}, []])]]],
        Event: (id, event) => { clicked = id === menuActionId && event === 'clicked'; },
    });
    fakeItem.export(Gio.DBus.session, '/LunaTaskbarTestItem');
    fakeMenu.export(Gio.DBus.session, '/LunaTaskbarTestMenu');
    try {
        await new Promise((resolve, reject) => Gio.DBus.session.call(
            'org.kde.StatusNotifierWatcher', '/StatusNotifierWatcher',
            'org.kde.StatusNotifierWatcher', 'RegisterStatusNotifierItem',
            new GLib.Variant('(s)', ['/LunaTaskbarTestItem']), null, 0, 2500, null,
            (bus, result) => { try { bus.call_finish(result); resolve(); } catch (e) { reject(e); } }));
        await Scripting.sleep(500);
        const id = `${Gio.DBus.session.get_unique_name()}/LunaTaskbarTestItem`;
        const trayItem = bar._tray._modern.items.get(id);
        assert(trayItem?.button.visible, 'StatusNotifier registration creates visible icon');
        bar._settings.set_int('tray-icon-size', 24);
        assert(trayItem.icon.icon_size === 24, 'Application tray icon follows configured size');
        assert(bar._trayDrawer.button.child.icon_size === 24, 'Tray toggle follows configured size');
        const overflowFixtures = Array.from({length: 6}, () => new St.Button({child: new St.Icon({icon_name: 'folder'})}));
        overflowFixtures.forEach(button => bar._trayBox.add_child(button));
        bar._settings.set_int('tray-popup-icon-size', 32);
        await Scripting.sleep(150);
        assert(trayItem.button.get_parent() === bar._trayDrawer.overflowBox && trayItem.icon.icon_size === 32,
            'Collapsed application icon uses the separate popup size');
        bar._settings.set_int('tray-icon-size', 28);
        assert(trayItem.icon.icon_size === 32 && bar._trayDrawer.button.child.icon_size === 28,
            'Taskbar icon changes leave popup icon size unchanged');
        bar._settings.set_boolean('tray-collapse-enabled', false);
        await Scripting.sleep(150);
        assert(trayItem.icon.icon_size === 28, 'Returning an icon to the taskbar restores taskbar size');
        overflowFixtures.forEach(button => button.destroy());
        bar._settings.reset('tray-collapse-enabled');
        bar._settings.reset('tray-popup-icon-size');
        bar._settings.reset('tray-icon-size');
        const owner = bar._tray._modern;
        const originalRegisterHost = owner.RegisterStatusNotifierHostAsync;
        const appIndicatorId = id.replace('/', '@/');
        Object.defineProperty(owner, 'RegisteredStatusNotifierItems', {
            configurable: true, get: () => [appIndicatorId],
        });
        owner.RegisterStatusNotifierHostAsync = (_args, invocation) =>
            invocation.return_dbus_error('org.freedesktop.DBus.Error.NotSupported', 'Additional hosts unsupported');
        const {StatusNotifierTray} = await import(extension.dir.get_child('compat/tray/statusNotifier.js').get_uri());
        const followerBox = new St.BoxLayout();
        const warnings = [];
        const follower = new StatusNotifierTray(followerBox, {log() {}, warn: message => warnings.push(message)}, bar._settings);
        try {
            await Scripting.sleep(500);
            assert(follower.items.get(id)?.button.visible,
                'Existing AppIndicator icons are imported when LunaTaskbar starts later');
            assert(warnings.length === 0, 'Expected additional-host rejection is tolerated');
            follower._add(id);
            assert(follower.items.size === 1, 'Different address formats do not duplicate icons');
            follower._remove(appIndicatorId);
            assert(follower.items.size === 0, 'AppIndicator-format unregister removes canonical item');
        } finally {
            follower.destroy();
            followerBox.destroy();
            delete owner.RegisteredStatusNotifierItems;
            owner.RegisterStatusNotifierHostAsync = originalRegisterHost;
        }

        await trayItem.remoteMenu.toggle();
        assert(trayItem.remoteMenu.menu.isOpen, 'Remote tray menu opens');
        const action = trayItem.remoteMenu.menu._getMenuItems()[0];
        assert(action.label.text === 'Test action', 'Remote menu label decoded');
        menuActionId = 42;
        await Scripting.sleep(250);
        const menuPointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const [actionX, actionY] = action.get_transformed_position();
        menuPointer.notify_absolute_motion(0, actionX + action.width / 2, actionY + action.height / 2);
        await Scripting.sleep(60);
        menuPointer.notify_button(0, 1, Clutter.ButtonState.PRESSED);
        menuPointer.notify_button(0, 1, Clutter.ButtonState.RELEASED);
        await Scripting.sleep(250);
        assert(clicked, 'Remote menu click reaches application');
        bar._tray._modern._remove(id);
    } finally {
        fakeMenu.unexport();
        fakeItem.unexport();
    }
    if (GLib.getenv('LUNA_TASKBAR_WINDOW_SMOKE') === '1')
        await checkWindows(bar);
    const editor = bar._appletEditor;
    const previousOrder = bar._settings.get_strv('applet-order');
    editor.start();
    await Scripting.sleep(100);
    assert(editor.active && editor._done.visible, 'Edit mode exposes Done');
    const clock = editor._entries.find(entry => entry.id === 'dateMenu');
    assert(clock && !clock.actor.visible && clock.button.visible,
        'Edit handle replaces clock without opening its panel');
    editor._begin(clock);
    assert(clock.button.opacity === 0 && editor._gap.width > 0,
        'Applet drag hides its source and reserves a visible drop gap');
    await Scripting.sleep(100);
    editor.handleDragOver(clock, null, -1);
    assert(editor.acceptDrop(clock, null, -1), 'Constrained applet drop accepted');
    editor._finishDrag();
    editor.stop();
    const constrained = bar._settings.get_strv('applet-order');
    assert(constrained.indexOf('quickSettings') < constrained.indexOf('dateMenu') &&
        constrained.indexOf('dateMenu') < constrained.indexOf('showDesktop'),
    'System controls, calendar, and Show desktop retain their edge order');
    assert(bar._content.get_last_child() === bar._showDesktopButton && clock.actor.visible,
        'Clock restores while Show desktop remains at the edge');
    editor.start();
    assert(editor._entries.at(-1).id === 'showDesktop' &&
        editor._entries.at(-2).id === 'dateMenu' &&
        editor._entries.at(-3).id === 'quickSettings',
    'Reopening edit mode retains the constrained edge order');
    editor.stop();
    bar._settings.set_strv('applet-order', previousOrder);
    bar._settings.set_string('monitor-mode', 'all');
    await Scripting.sleep(250);
    assert(bar._secondaryBars.length === Main.layoutManager.monitors.length - 1,
        'All-displays mode creates one taskbar per monitor');
    for (const secondary of bar._secondaryBars) {
        assert(secondary._bar.mapped && secondary._bar.x === secondary._monitor().x,
            'Secondary taskbar is allocated on its own display');
        assert(secondary._panelBridge._records.size === 0,
            'Secondary taskbars do not duplicate system controls');
    }
    const connected = global.backend.get_monitor_manager().get_monitors();
    const connector = connected[connected.length - 1].get_connector();
    bar._settings.set_string('monitor-connector', connector);
    bar._settings.set_string('monitor-mode', 'specific');
    await Scripting.sleep(150);
    assert(bar._monitor().index === global.backend.get_monitor_manager().get_monitor_for_connector(connector),
        'Specific-display selection follows its connector');
    bar._settings.reset('monitor-connector');
    bar._settings.set_string('monitor-mode', 'primary');
    assert(bar._secondaryBars.length === 0, 'Primary-only mode removes secondary taskbars');
    bar._settings.set_int('hide-delay', 0);
    bar._settings.set_string('visibility-mode', 'auto-hide');
    for (let attempt = 0; attempt < 20 && (!bar._visibility._hidden || bar._bar.opacity !== 0); attempt++)
        await Scripting.sleep(100);
    assert(bar._visibility._hidden && bar._bar.opacity === 0, 'Auto-hide hides an idle taskbar');
    assert(!bar._visibility._reserve, 'Auto-hide releases reserved desktop space');
    bar._settings.set_string('visibility-mode', 'always');
    bar._settings.reset('hide-delay');
    for (let attempt = 0; attempt < 20 && (bar._visibility._hidden || bar._bar.opacity !== 255); attempt++)
        await Scripting.sleep(100);
    assert(!bar._visibility._hidden && bar._bar.opacity === 255, `Always-visible mode restores taskbar: hidden=${bar._visibility._hidden}, opacity=${bar._bar.opacity}`);
    const groupedTask = [...bar._buttons.values()][0];
    if (groupedTask) {
        const originalWindows = groupedTask.windows;
        try {
            for (const count of [3, 4, 8]) {
                groupedTask.windows = Array.from({length: count}, (_v, index) => ({
                    appears_focused: index === count - 1, minimized: false,
                }));
                bar._updateIndicators();
                await Scripting.sleep(100);
                const row = groupedTask.indicator;
                assert(row.get_n_children() === 3, 'Large groups use three running segments');
                assert(row.width <= 28 * scale + 1, 'Grouped indicators stay within their width budget');
                assert(row.get_last_child().x + row.get_last_child().width <= row.width + 1,
                    'Final grouped indicator is not clipped');
            }
        } finally {
            groupedTask.windows = originalWindows;
            bar._updateIndicators();
        }
    }

    const tooltipTask = [...bar._buttons.values()].find(task => task.app);
    if (tooltipTask) {
        bar._settings.set_boolean('show-previews', false);
        bar._appStrip.reveal(tooltipTask.button);
        await Scripting.sleep(200);
        const [tooltipX, tooltipY] = tooltipTask.button.get_transformed_position();
        pointerDevice.notify_absolute_motion(0, tooltipX + tooltipTask.button.width / 2,
            tooltipY + tooltipTask.button.height / 2);
        await Scripting.sleep(650);
        assert(bar._tooltip.actor.visible && bar._tooltip.actor.text === tooltipTask.app.get_name(),
            'Hovering an app shows its name when previews are disabled');
        pointerDevice.notify_absolute_motion(0, 100, 100);
        await Scripting.sleep(100);
        assert(!bar._tooltip.actor.visible, 'Tooltip disappears on pointer leave');
        bar._settings.reset('show-previews');
    }
    const drawer = bar._trayDrawer;
    const trayFixtures = Array.from({length: 6}, (_value, index) => {
        const button = new St.Button({child: new St.Icon({icon_name: 'folder', icon_size: 16})});
        button._lunaTaskbarTrayKey = `test:sortable-${index}`;
        return button;
    });
    trayFixtures.forEach(button => bar._trayBox.add_child(button));
    await Scripting.sleep(150);
    assert(drawer.collapsed && drawer.button.visible && trayFixtures.every(button => button.get_parent() === drawer.overflowBox),
        'Tray icons collapse into a toggle above the configured limit');
    drawer.button.emit('clicked', 1);
    await Scripting.sleep(200);
    assert(drawer.menu.isOpen && drawer.overflowBox.mapped, 'Tray toggle opens the original interactive icons');
    assert(drawer.overflowBox._delegate.acceptDrop(trayFixtures[5]._delegate, null, -1, -1),
        'Tray popup accepts an icon reorder');
    await Scripting.sleep(150);
    assert(drawer.overflowBox.get_children()[0] === trayFixtures[5] &&
        bar._settings.get_strv('tray-icon-order')[0] === 'test:sortable-5',
        'Tray popup order is applied and persisted');
    assert(bar._trayBox._delegate.acceptDrop(trayFixtures[4]._delegate, null, 10000, 10000),
        'Tray taskbar accepts an icon from the popup');
    await Scripting.sleep(150);
    assert(trayFixtures[4].get_parent() === bar._trayBox &&
        bar._settings.get_strv('tray-always-visible').includes('test:sortable-4'),
        'Dragging out of the popup makes an icon always visible');
    assert(drawer.button._delegate.acceptDrop(trayFixtures[4]._delegate, null, 0, 0),
        'Tray popup button accepts an inline icon');
    await Scripting.sleep(150);
    assert(trayFixtures[4].get_parent() === drawer.overflowBox &&
        !bar._settings.get_strv('tray-always-visible').includes('test:sortable-4'),
        'Dropping on the popup button returns an icon to the popup');
    drawer.suspendForNativeMenu();
    assert(drawer.menu.isOpen && drawer._nativeSuspended && drawer.manager.activeMenu !== drawer.menu,
        'Native menus release the drawer input grab without hiding it');
    drawer.resumeAfterNativeMenu();
    assert(drawer.menu.isOpen && !drawer._nativeSuspended && drawer.manager.activeMenu === drawer.menu,
        'Drawer regains input after a native menu closes');
    trayFixtures[0]._lunaTaskbarTrayKey = 'test:always-visible';
    bar._settings.set_strv('tray-always-visible', ['test:always-visible']);
    await Scripting.sleep(150);
    assert(trayFixtures[0].get_parent() === bar._trayBox &&
        trayFixtures.slice(1).every(button => button.get_parent() === drawer.overflowBox),
        'Only the selected exception remains inline');
    bar._settings.reset('tray-always-visible');
    await Scripting.sleep(150);

    drawer.button.emit('clicked', 1);
    assert(!drawer.menu.isOpen, 'Tray toggle closes the popup');
    bar._settings.set_boolean('tray-collapse-enabled', false);
    await Scripting.sleep(150);
    assert(!drawer.collapsed && bar._trayBox.get_parent() === drawer.actor,
        'Disabling tray collapse restores inline icons');
    bar._settings.reset('tray-collapse-enabled');
    bar._settings.reset('tray-icon-order');
    trayFixtures.forEach(button => button.destroy());
    await Scripting.sleep(150);
    assert(!drawer.collapsed && !drawer.button.visible, 'Tray expands again when the icon count falls below the limit');
    const fixedTrayX = bar._systemBox.get_transformed_position()[0];
    const overflowButtons = Array.from({length: 40}, () => new St.Button({style: 'width: 48px; height: 32px;'}));
    overflowButtons.forEach(button => bar._apps.add_child(button));
    await Scripting.sleep(200);
    const strip = bar._appStrip;
    const adjustment = bar._taskScroll.hadjustment;
    assert(strip.left.visible && strip.right.visible && adjustment.upper > adjustment.page_size,
        'Overflow reveals arrows and a scrollable app viewport');
    assert(Math.abs(bar._systemBox.get_transformed_position()[0] - fixedTrayX) <= 1,
        'Overflow leaves system tray fixed in place');
    strip.advance(1);
    await Scripting.sleep(300);
    assert(adjustment.value > 0, 'Right chevron advances through apps');
    strip.reveal(overflowButtons[overflowButtons.length - 1]);
    await Scripting.sleep(300);
    const [lastX] = overflowButtons[overflowButtons.length - 1].get_transformed_position();
    const [viewportX] = strip.scroll.get_transformed_position();
    assert(lastX + overflowButtons[overflowButtons.length - 1].width <= viewportX + strip.scroll.width + 1,
        'Revealing the last app brings it inside the viewport');
    adjustment.value = 0;
    const dragSource = [...bar._buttons.values()][0]?.button._delegate;
    if (dragSource) {
        bar._taskDrag._begin(dragSource);
        await Scripting.sleep(100);
        const [edgeX, edgeY] = strip.scroll.get_transformed_position();
        strip._edgeStep(edgeX + strip.scroll.width - 2, edgeY + strip.scroll.height / 2);
        assert(adjustment.value > 0, 'Dragging near the right edge scrolls toward hidden apps');
        bar._taskDrag._finish();
    }
    overflowButtons.forEach(button => button.destroy());
    await Scripting.sleep(200);
    assert(!strip.left.visible && !strip.right.visible,
        'Overflow arrows disappear when all apps fit again');
    bar._settings.set_int('launcher-padding', 8);
    bar._settings.set_int('launcher-margin', 4);
    bar._settings.set_int('tray-icon-size', 24);
    bar._settings.set_int('tray-text-size', 14);
    await Scripting.sleep(150);
    assert(bar._launcher.get_theme_node().get_padding(St.Side.LEFT) === 8 * scale,
        'Launcher padding setting applies');
    assert(bar._trayDrawer.button.child.get_theme_node().get_length('icon-size') === 24 * scale,
        'Tray icon size applies to system tray controls');
    for (const key of ['launcher-padding', 'launcher-margin', 'tray-icon-size', 'tray-text-size'])
        bar._settings.reset(key);
    Main.overview.hide();
    await Scripting.sleep(400);
    bar._overviewBridge._lastSuper = 0;
    global.display.emit('overlay-key');
    await Scripting.sleep(320);
    assert(Main.overview.visible, 'Single Super opens overview without waiting for another press');
    global.display.emit('overlay-key');
    await Scripting.sleep(400);
    assert(Main.overview.dash.showAppsButton.checked, 'Double Super opens the application grid');
    Main.overview.hide();
    await Scripting.sleep(400);
    const nativePanelVisible = bar._panelBridge._panelVisible;
    bar.disable();
    assert(!(Clutter.get_debug_flags()[1] & Clutter.DrawDebugFlag.DISABLE_CLIPPED_REDRAWS),
        'Disabling LunaTaskbar restores normal compositor damage tracking');
    assert(Main.panel.visible === nativePanelVisible, 'Panel visibility restored');
    assert(!Main.overview._overview.controls.has_style_class_name('luna-taskbar-overview'), 'Overview styling restored on disable');
    assert(Main.panel.statusArea.dateMenu.container.get_parent() === Main.panel._centerBox, 'Calendar restored');
    bar.enable();
    await Scripting.sleep(250);
    assert(bar._bar.get_parent(), 'Can re-enable cleanly');
    print('LUNA_TASKBAR_SHELL_SMOKE_PASS');
}

export async function checkWindows(bar) {
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
    launcher.set_environ(global.create_app_launch_context(0, -1).get_environment());
    launcher.setenv('GDK_BACKEND', 'x11', true);
    launcher.setenv('LUNA_TASKBAR_AUTO_TEST', '1', true);
    const fixture = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('legacy-tray.py').get_path();
    const process = launcher.spawnv(['python3', fixture]);
    try {
        let record;
        for (let attempt = 0; attempt < 40; attempt++) {
            record = [...bar._buttons.values()].find(task => task.window?.get_title() === 'LunaTaskbar preview fixture');
            if (record) break;
            await Scripting.sleep(250);
        }
        assert(record, 'Fixture window reaches taskbar');
        bar._preview.show(record, record.button);
        await Scripting.sleep(150);
        assert(bar._preview.actor.visible, 'Live preview opens');
        const scroll = bar._preview.actor.get_first_child();
        const header = scroll.get_child().get_first_child().get_first_child();
        assert(bar._preview.actor.get_n_children() === 1, 'Preview has no redundant application header');
        assert(header.has_style_class_name('luna-taskbar-preview-header') && header.get_first_child() instanceof St.Icon,
            'Each window header includes its application icon');
        assert(header.get_child_at_index(1).text === 'LunaTaskbar preview fixture', 'Window preview uses the window title');

        assert(bar._preview.actor.y + bar._preview.actor.height <= bar._bar.y - 1,
            'Preview sits completely above the taskbar');
        bar._preview.hide();
        bar._taskMenus.openTask(record, record.button);
        await Scripting.sleep(150);
        assert(bar._taskMenus.menu.isOpen, 'Window context menu opens');
        const taskMenuLabels = bar._taskMenus.menu._getMenuItems().map(item => item.label?.text).filter(Boolean);
        assert(!taskMenuLabels.some(label => ['Focus window', 'Restore window', 'Minimize',
            'Maximize', 'Restore size', 'Close window'].includes(label)),
        'Taskbar does not inject custom window-management items into the native app menu');
        bar._taskMenus.close();
        const legacy = bar._tray._legacy;
        const icon = [...legacy._icons.keys()].find(candidate => candidate.pid === Number(process.get_identifier()));
        assert(icon, 'Legacy icon embedded');
        const native = bar._tray._native;
        native.watch(icon.pid);
        process.send_signal(10);
        await Scripting.sleep(500);
        assert(native._popups.size > 0, 'Native menu tracked');
        const popups = [...native._popups.keys()];
        await native.close();
        await Scripting.sleep(400);
        assert(!global.get_window_actors().some(actor => popups.includes(actor.meta_window) && actor.mapped), 'Native menu dismissed');
        for (let attempt = 0; attempt < 3; attempt++) {
            const point = {x: 1100 - attempt * 250, y: 650};
            native.watch(icon.pid, {wine: true, title: 'Wine-shaped popup fixture', point});
            process.send_signal(12);
            await Scripting.sleep(300);
            assert(native._popups.size === 1, 'Normal undecorated Wine-shaped popup is tracked on every reopen');
            const tracked = [...native._popups.keys()][0];
            const rect = tracked.get_frame_rect();
            assert(Math.abs(rect.x - point.x) <= 1 || Math.abs(rect.x + rect.width - point.x) <= 1,
                'Wine popup anchors horizontally at the recorded click');
            assert(rect.y <= point.y && rect.y + rect.height <= bar._bar.y + 1,
                'Wine popup stays above the taskbar');
            const device = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
            device.notify_absolute_motion(0, 20, 20);
            device.notify_button(0, 1, Clutter.ButtonState.PRESSED);
            await Scripting.sleep(60);
            device.notify_button(0, 1, Clutter.ButtonState.RELEASED);
            await Scripting.sleep(300);
            assert(!global.display.list_all_windows().includes(tracked) || !tracked.get_compositor_private()?.mapped,
                'An outside click dismisses a Wine-shaped popup');
            assert(record.window.get_compositor_private()?.mapped, 'Popup dismissal leaves the main application open');
        }

    } finally {
        process.force_exit();
    }
}
