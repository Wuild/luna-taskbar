import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
async function drag(pointer, source, target, inspect = null) {
    const [sx, sy] = source.get_transformed_position();
    const [sw, sh] = source.get_transformed_size();
    const [tx, ty] = target.get_transformed_position();
    const [tw, th] = target.get_transformed_size();
    const fromX = sx + sw / 2, fromY = sy + sh / 2;
    const toX = tx + tw / 2, toY = ty + th / 2;
    pointer.notify_absolute_motion(0, fromX, fromY);
    await Scripting.sleep(80);
    pointer.notify_button(0, 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(80);
    for (let step = 1; step <= 15; step++) {
        pointer.notify_absolute_motion(0, fromX + (toX - fromX) * step / 15,
            fromY + (toY - fromY) * step / 15);
        await Scripting.sleep(25);
    }
    const state = inspect?.();
    pointer.notify_button(0, 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(350);
    return state;
}
async function dragIntoPopup(pointer, source, toggle, target, drawer) {
    const expectedCell = drawer._popupCell();
    const expectedAllocatedWidth = target.width;
    const [sx, sy] = source.get_transformed_position();
    const [sw, sh] = source.get_transformed_size();
    const [bx, by] = toggle.get_transformed_position();
    const [bw, bh] = toggle.get_transformed_size();
    const fromX = sx + sw / 2, fromY = sy + sh / 2;
    const buttonX = bx + bw / 2, buttonY = by + bh / 2;
    pointer.notify_absolute_motion(0, fromX, fromY);
    await Scripting.sleep(80);
    pointer.notify_button(0, 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(80);
    for (let step = 1; step <= 15; step++) {
        pointer.notify_absolute_motion(0, fromX + (buttonX - fromX) * step / 15,
            fromY + (buttonY - fromY) * step / 15);
        await Scripting.sleep(25);
    }
    await Scripting.sleep(400);
    const opened = drawer.menu.isOpen;
    const [tx, ty] = target.get_transformed_position();
    const [tw, th] = target.get_transformed_size();
    for (let step = 1; step <= 10; step++) {
        pointer.notify_absolute_motion(0, buttonX + (tx + tw / 2 - buttonX) * step / 10,
            buttonY + (ty + th / 2 - buttonY) * step / 10);
        await Scripting.sleep(25);
    }
    await Scripting.sleep(100);
    const cell = drawer._popupCell();
    const placeholderFits = Math.abs(drawer._placeholder.width - cell) <= 1 &&
        Math.abs(drawer._placeholder.height - cell) <= 1;
    const existingCellStable = target.width === expectedAllocatedWidth;
    pointer.notify_button(0, 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(350);
    return {opened, placeholderFits, existingCellStable,
        settledCell: drawer._popupCell(), expectedCell,
        plainViewport: drawer._viewport instanceof St.Bin};
}
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
    const icons = Array.from({length: 9}, (_value, index) => {
        const icon = new St.Button({style_class: 'luna-taskbar-tray-button',
            child: new St.Icon({icon_name: 'folder', icon_size: 24})});
        icon._lunaTaskbarTrayKey = `test:grid-${index}`;
        return icon;
    });
    icons.forEach(icon => bar._trayBox.add_child(icon));
    await Scripting.sleep(300);
    drawer.menu.open();
    await Scripting.sleep(400);
    assert(drawer.menu.isOpen, 'Drawer opens');
    assert(drawer.overflowBox.get_theme_node().get_foreground_color().to_string() ===
        bar._trayBox.get_theme_node().get_foreground_color().to_string(),
        'Popup symbolic tray icons use the taskbar foreground color');
    assert(weather.container.get_parent() === bar._content, 'Weather extension is an independent taskbar applet');
    weather.menu.open();
    await Scripting.sleep(300);
    assert(weather.menu.isOpen && weather.container.mapped, 'Weather stays open with a visible source after tray closes');
    assert(!drawer.menu.isOpen, 'Weather replaces the collapsed tray popup');
    weather.menu.close();
    drawer.menu.open();
    await Scripting.sleep(300);
    icons.slice(3).forEach(icon => icon.hide());
    await Scripting.sleep(200);
    assert(drawer._columns === 3 && icons.slice(0, 3).every(icon => icon.y === icons[0].y),
        'Three popup icons remain together on one row');
    const threeIconCellWidth = icons[0].width;
    drawer._beginDrag(icons[2]._delegate);
    drawer._movePlaceholder(bar._trayBox, null);
    await Scripting.sleep(100);
    assert(drawer._columns === 2 && icons[0].width === threeIconCellWidth &&
        icons[1].width === threeIconCellWidth,
    'Moving the placeholder out changes column count without stretching remaining cells');
    drawer._finishDrag();
    await Scripting.sleep(100);
    icons.slice(3).forEach(icon => icon.show());
    await Scripting.sleep(200);
    const visible = drawer.overflowBox.get_children().filter(icon => icon.visible);
    const columns = Math.min(3, visible.length);
    assert(visible[0].y === visible[1].y && visible[columns].y > visible[0].y &&
        visible[0].x === visible[columns].x, 'Icons wrap into aligned grid rows');
    const stableLayout = [drawer._viewport.width, drawer._viewport.height,
        drawer._popupCell(), icons[0].width, icons[0].height];
    drawer._beginDrag(icons[0]._delegate);
    drawer._finishDrag();
    await Scripting.sleep(200);
    assert(stableLayout.every((value, index) => value === [drawer._viewport.width,
        drawer._viewport.height, drawer._popupCell(), icons[0].width, icons[0].height][index]),
    'Starting and stopping a popup drag preserves cell size, padding, and alignment');
    const pointer = Clutter.get_default_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const movedLive = await drag(pointer, icons[8], icons[0], () =>
        drawer._placeholder.get_parent() === drawer.overflowBox &&
        drawer.overflowBox.get_children().indexOf(drawer._placeholder) === 1);
    assert(movedLive, 'Hovering an icon moves the placeholder and neighboring icons immediately');
    assert(drawer.overflowBox.get_children()[1] === icons[8] &&
        bar._settings.get_strv('tray-icon-order')[1] === 'test:grid-8',
        'Dragging visibly rearranges popup icons and persists the sort');
    const expandedHeight = drawer.menu.actor.height;
    await drag(pointer, icons[7], drawer.button);
    assert(icons[7].get_parent() === bar._trayBox &&
        bar._settings.get_strv('tray-always-visible').includes('test:grid-7'),
        'Dragging a popup icon to the toggle makes it always visible');
    drawer.button._delegate.acceptDrop(icons[6]._delegate, null, 0, 0);
    drawer.button._delegate.acceptDrop(icons[5]._delegate, null, 0, 0);
    await Scripting.sleep(250);
    assert(drawer.menu.actor.height < expandedHeight,
        'Popup recalculates its size as icons are dragged out');
    drawer.button._delegate.acceptDrop(icons[5]._delegate, null, 0, 0);
    drawer.button._delegate.acceptDrop(icons[6]._delegate, null, 0, 0);
    await Scripting.sleep(250);
    assert(drawer.menu.actor.height === expandedHeight,
        'Popup recalculates its size as icons are dragged back in');
    assert(bar._trayBox._delegate !== drawer.overflowBox._delegate &&
        drawer.button._delegate !== drawer.overflowBox._delegate,
        'Each tray drop zone has a dedicated destination delegate');
    const temporarilyHidden = [icons[2], icons[3], icons[4], icons[5], icons[6], icons[8]];
    temporarilyHidden.forEach(icon => icon.hide());
    await Scripting.sleep(200);
    assert(drawer._columns === 2, 'Two-icon popup is ready for a 2-to-3-column drag');
    drawer.close();
    await Scripting.sleep(150);
    const popupDrag = await dragIntoPopup(pointer, icons[7], drawer.button, icons[0], drawer);
    assert(popupDrag.opened,
        'Hovering the popup toggle during an inline drag opens the popup');
    assert(popupDrag.placeholderFits && popupDrag.existingCellStable && popupDrag.plainViewport,
        'Adding a third column preserves cell widths in the plain popup viewport');
    assert(popupDrag.settledCell === popupDrag.expectedCell,
        'Dropped icon releases its taskbar size request without inflating the settled popup');
    assert(icons[7].get_parent() === drawer.overflowBox &&
        !bar._settings.get_strv('tray-always-visible').includes('test:grid-7'),
        'Dragging onward into the opened popup returns the inline icon');
    temporarilyHidden.forEach(icon => icon.show());
    await Scripting.sleep(200);
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
    bar._settings.reset('tray-icon-order');
    print('LUNA_TRAY_GRID_PASS');
}
