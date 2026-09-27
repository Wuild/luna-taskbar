import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(1800);
    Main.overview.hide();
    const bar = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    bar._settings.set_int('tray-visible-limit', 1);
    const drawer = bar._trayDrawer;
    const weather = new PanelMenu.Button(0.5, 'Test weather');
    weather.add_child(new St.Icon({icon_name: 'weather-clear-symbolic', icon_size: 16}));
    weather.menu.addMenuItem(new PopupMenu.PopupMenuItem('Weather forecast'));
    Main.panel.addToStatusArea('test-weather', weather);
    const icons = Array.from({length: 9}, () => new St.Button({
        style_class: 'luna-taskbar-tray-button', child: new St.Icon({icon_name: 'folder', icon_size: 24})}));
    icons.forEach(icon => bar._trayBox.add_child(icon));
    await Scripting.sleep(300);
    drawer.menu.open();
    await Scripting.sleep(400);
    assert(drawer.menu.isOpen, 'Drawer opens');
    assert(weather.container.get_parent() === bar._content, 'Weather extension is an independent taskbar applet');
    weather.menu.open();
    await Scripting.sleep(300);
    assert(weather.menu.isOpen && weather.container.mapped, 'Weather stays open with a visible source after tray closes');
    assert(!drawer.menu.isOpen, 'Weather replaces the collapsed tray popup');
    weather.menu.close();
    drawer.menu.open();
    await Scripting.sleep(300);
    const visible = drawer.overflowBox.get_children().filter(icon => icon.visible);
    const columns = Math.ceil(Math.sqrt(visible.length));
    assert(visible[0].y === visible[1].y && visible[columns].y > visible[0].y &&
        visible[0].x === visible[columns].x, 'Icons wrap into aligned grid rows');
    const width = drawer.menu.actor.width;
    const height = drawer.menu.actor.height;
    icons.slice(2).forEach(icon => icon.hide());
    await Scripting.sleep(300);
    assert(drawer.menu.actor.width < width && drawer.menu.actor.height < height,
        `Popup shrinks with visible icons: ${width}x${height} -> ${drawer.menu.actor.width}x${drawer.menu.actor.height}`);
    assert(drawer.menu.actor.width < 200, 'Small tray overrides theme menu minimum width');
    const remaining = drawer.overflowBox.get_children().filter(icon => icon.visible);
    console.log(`TRAY_SIZE ${drawer.menu.actor.width}x${drawer.menu.actor.height} grid=${drawer.overflowBox.width}x${drawer.overflowBox.height} firstY=${remaining[0].y}`);
    assert(remaining.length === 2 && remaining.every(icon => icon.y === 0), 'Two remaining icons occupy the first row');
    assert(drawer.overflowBox.height <= Math.max(...remaining.map(icon => icon.height)), 'Grid has no empty rows');
    icons.slice(2).forEach(icon => icon.show());
    await Scripting.sleep(300);
    assert(drawer.menu.actor.width === width, 'Popup grows when icons return');
    drawer.close();
    weather.destroy();
    icons.forEach(icon => icon.destroy());
    bar._settings.reset('tray-visible-limit');
    print('LUNA_TRAY_GRID_PASS');
}
