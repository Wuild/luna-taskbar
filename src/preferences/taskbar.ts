import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import type {PreferenceContext} from './controls.js';
import type GLib from 'gi://GLib';
type MonitorSpec = [string, string, string, string];
type DisplayState = [number, Array<[MonitorSpec, unknown[], Record<string, GLib.Variant>]>, Array<[number, number, number, number, boolean, MonitorSpec[], Record<string, GLib.Variant>]>, Record<string, GLib.Variant>];

export function populate(context: PreferenceContext, taskbar: Adw.PreferencesPage): void {
    const {settings, window, group, toggle, spin, combo, color} = context;
    const layout = group(taskbar, 'Layout', 'Sizes use logical pixels and follow your display scaling.');
    spin(layout, 'taskbar-height', 'Thickness', 'Fixed height in logical pixels; content that exceeds it is clipped');
    toggle(layout, 'show-desktop-button', 'Show desktop button', 'At the far-right edge; click again to restore windows');
    spin(layout, 'show-desktop-width', 'Show desktop button width', 'Logical pixels', 'show-desktop-button');
    spin(layout, 'show-desktop-margin', 'Space before Show desktop', 'Logical pixels', 'show-desktop-button');
    combo(layout, 'taskbar-position', 'Position', ['bottom', 'top', 'left', 'right'], ['Bottom', 'Top', 'Left', 'Right']);
    toggle(layout, 'taskbar-floating', 'Floating taskbar');
    spin(layout, 'taskbar-edge-gap', 'Distance from screen edge', 'Logical pixels', 'taskbar-floating');
    spin(layout, 'taskbar-end-gap', 'Inset at both ends', 'Side gaps on horizontal bars; top and bottom gaps on vertical bars', 'taskbar-floating');
    spin(layout, 'taskbar-corner-radius', 'Corner radius', 'Logical pixels; 0 gives square corners');
    const border = group(taskbar, 'Border', 'All edges when floating; only the window-facing edge when attached.');
    toggle(border, 'taskbar-border-enabled', 'Show border');
    spin(border, 'taskbar-border-width', 'Border thickness', 'Logical pixels', 'taskbar-border-enabled');
    color(border, 'taskbar-border-color', 'Border color', '', 'taskbar-border-enabled');
    spin(border, 'taskbar-border-opacity', 'Border opacity', '0% is transparent; 100% is opaque', 'taskbar-border-enabled');
    const workspaces = group(taskbar, 'Workspaces');
    toggle(workspaces, 'show-workspace-switcher', 'Show workspace switcher', 'Numbered buttons with the current workspace highlighted');
    const visibility = group(taskbar, 'Visibility', 'Hidden taskbars reappear when the pointer touches the selected screen edge. Panels and editing keep the taskbar visible.');
    combo(visibility, 'visibility-mode', 'Behavior', ['always', 'auto-hide', 'maximized', 'overlap'],
        ['Always visible', 'Auto-hide', 'Hide for maximized windows', 'Hide when a window overlaps']);
    spin(visibility, 'hide-delay', 'Hide delay', 'Milliseconds before sliding out of view');
    const displays = group(taskbar, 'Displays', 'Clock, system controls and application tray stay together on the main taskbar. Additional taskbars show application buttons.');
    combo(displays, 'monitor-mode', 'Show taskbar on', ['primary', 'all', 'specific'],
        ['Primary display', 'All displays', 'Specific display']);
    const displayChoice = new Adw.ComboRow({title: 'Display', subtitle: 'Loading connected displays…',
        model: Gtk.StringList.new([]), sensitive: false});
    displays.add(displayChoice);
    const localWindows = toggle(displays, 'monitor-local-windows', 'Only show windows on this display', 'Pinned applications remain available on every taskbar');
    let displayCount = 0;
    const updateLocalWindows = () => {
        localWindows.sensitive = settings.get_string('monitor-mode') === 'all' && displayCount > 1;
    };
    updateLocalWindows();
    let displayIds: string[] = [];
    let updatingDisplays = false;
    let closed = false;
    const refreshDisplays = () => Gio.DBus.session.call('org.gnome.Mutter.DisplayConfig',
        '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig', 'GetCurrentState',
        null, null, Gio.DBusCallFlags.NONE, 2000, null, (bus, result) => {
            if (closed)
                return;
            try {
                if (!bus) return;
                const [, monitors, logical] = bus.call_finish(result).deep_unpack() as DisplayState;
                displayCount = logical.length;
                updateLocalWindows();
                const names = logical.map(([, , , , primary, specs]) => {
                    const labels = specs.map(spec => {
                        const monitor = monitors.find(([candidate]) => candidate[0] === spec[0]);
                        const name = monitor?.[2]?.['display-name']?.deep_unpack();
                        return name ? `${name} — ${spec[0]}` : spec[0];
                    });
                    return labels.join(' + ') + (primary ? ' (Primary)' : '');
                });
                displayIds = logical.map(([, , , , , specs]) => specs[0][0]);
                const selectedConnector = settings.get_string('monitor-connector');
                if (selectedConnector && !displayIds.includes(selectedConnector)) {
                    displayIds.push(selectedConnector);
                    names.push(`Disconnected — ${selectedConnector}`);
                }
                updatingDisplays = true;
                displayChoice.model = Gtk.StringList.new(names);
                displayChoice.selected = Math.max(0, displayIds.indexOf(settings.get_string('monitor-connector')));
                displayChoice.sensitive = names.length > 0 && settings.get_string('monitor-mode') === 'specific';
                displayChoice.subtitle = 'Falls back to the primary display when disconnected';
            } catch (error) {
                displayCount = 0;
                updateLocalWindows();
                displayChoice.sensitive = false;
                displayChoice.subtitle = 'Connected displays are currently unavailable';
                console.error(error);
            } finally {
                updatingDisplays = false;
            }
        });
    displayChoice.connect('notify::selected', () => {
        if (!updatingDisplays && displayIds[displayChoice.selected] !== undefined)
            settings.set_string('monitor-connector', displayIds[displayChoice.selected]);
    });
    const displayModeId = settings.connect('changed::monitor-mode', () => {
        updateLocalWindows();
        refreshDisplays();
    });
    const displaySignalId = Gio.DBus.session.signal_subscribe('org.gnome.Mutter.DisplayConfig',
        'org.gnome.Mutter.DisplayConfig', 'MonitorsChanged', '/org/gnome/Mutter/DisplayConfig',
        null, Gio.DBusSignalFlags.NONE, refreshDisplays);
    window.connect('close-request', () => {
        closed = true;
        settings.disconnect(displayModeId);
        Gio.DBus.session.signal_unsubscribe(displaySignalId);
        return false;
    });
    refreshDisplays();
    const barSurface = group(taskbar, 'Taskbar surface');
    toggle(barSurface, 'taskbar-color-override', 'Override theme color', 'Use a custom background color instead of the GNOME Shell theme');
    color(barSurface, 'taskbar-color', 'Background color', 'Opacity is controlled separately below', 'taskbar-color-override');
    toggle(barSurface, 'enable-blur', 'Background blur');
    spin(barSurface, 'taskbar-blur-radius', 'Blur strength', '0 disables blur; higher values soften the background more', 'enable-blur');
    spin(barSurface, 'taskbar-opacity', 'Opacity', '0% is transparent; 100% is opaque');
    const adaptive = group(taskbar, 'Taskbar appearance near windows',
        'Use a separate appearance on each display when windows on the current workspace meet the condition. Overview uses the regular appearance.');
    combo(adaptive, 'window-appearance-mode', 'Change appearance when', ['disabled', 'near', 'maximized', 'either'],
        ['Never', 'A window is near the taskbar', 'A window is maximized', 'Either condition is met']);
    combo(adaptive, 'window-appearance-layout', 'Taskbar layout', ['inherit', 'attached', 'floating'],
        ['Keep normal layout', 'Attach to screen edge', 'Float']);
    spin(adaptive, 'window-appearance-edge-gap', 'Distance from screen edge', 'Used with the Float layout');
    spin(adaptive, 'window-appearance-end-gap', 'Inset at both ends', 'Used with the Float layout');
    spin(adaptive, 'window-appearance-corner-radius', 'Corner radius', 'Used with Attach or Float; Keep normal layout preserves the normal radius');
    spin(adaptive, 'window-appearance-distance', 'Proximity distance', 'Logical pixels from the top of the taskbar; 0 means touching or overlapping');
    toggle(adaptive, 'window-appearance-color-override', 'Override theme color');
    color(adaptive, 'window-appearance-color', 'Background color', '', 'window-appearance-color-override');
    spin(adaptive, 'window-appearance-opacity', 'Opacity', '0% is transparent; 100% is opaque');
    toggle(adaptive, 'window-appearance-blur', 'Background blur');
    spin(adaptive, 'window-appearance-blur-radius', 'Blur strength', '0 disables blur', 'window-appearance-blur');
    const menu = group(taskbar, 'Context menu', 'Edit taskbar and Taskbar settings are always available.');
    for (const [key, title] of [['menu-show-applications', 'Show applications'],
        ['menu-show-desktop', 'Show desktop'], ['menu-show-shortcut', 'Application shortcut']] as const)
        toggle(menu, key, title);
    const installed = Gio.AppInfo.get_all().filter(app => app.should_show() && app.get_id())
        .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));
    const appIds = installed.map(app => app.get_id()!);
    const appNames = installed.map(app => app.get_display_name());
    const selected = settings.get_string('menu-shortcut-app');
    if (!appIds.includes(selected)) {
        appIds.unshift(selected);
        appNames.unshift(`Unavailable: ${selected}`);
    }
    const shortcut = combo(menu, 'menu-shortcut-app', 'Shortcut application', appIds, appNames,
        'Replaces System Monitor; the menu uses the selected app’s name');
    shortcut.enable_search = true;
    settings.bind('menu-show-shortcut', shortcut, 'sensitive', Gio.SettingsBindFlags.GET);

}
