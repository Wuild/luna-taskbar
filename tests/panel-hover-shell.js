import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(1600);
    Main.overview.hide(); await Scripting.sleep(300);
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    const pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const move = async actor => {
        const [x,y] = actor.get_transformed_position();
        pointer.notify_absolute_motion(0, x + actor.width / 2, y + actor.height / 2);
        await Scripting.sleep(180);
    };
    const panel = runtime._panelBridge._systemPanel;
    runtime._settings.set_boolean('show-search-button', true);
    panel.menu.open(); await Scripting.sleep(300);
    await move(runtime._searchButton);
    assert(runtime._searchButton.hover, 'Search hovers while system panel owns pointer grab');
    await move(runtime._launcher);
    assert(runtime._launcher.hover && !runtime._searchButton.hover, 'Hover moves between buttons under modal grab');
    assert(panel.menu.isOpen, 'Hover keeps current panel open');
    pointer.notify_absolute_motion(0, 500, 200); await Scripting.sleep(180);
    assert(!runtime._launcher.hover, 'Leaving taskbar clears modal hover');
    panel.menu.close(); await Scripting.sleep(250);
    runtime._searchPanel.open(); await Scripting.sleep(250);
    assert(runtime._searchButton.has_style_class_name('luna-taskbar-start-open'), 'Search stays highlighted while open');
    await move(runtime._launcher);
    assert(runtime._launcher.hover, 'Hover works beneath search dismissal overlay');
    runtime._searchPanel.close(); await Scripting.sleep(100);
    assert(runtime._launcher.hover, 'Natural hover remains under pointer after closing popup');
    assert(!runtime._searchButton.has_style_class_name('luna-taskbar-start-open'), 'Closing search clears active state');
    pointer.notify_absolute_motion(0, 500, 200); await Scripting.sleep(180);
    assert(!runtime._launcher.hover, 'Hover clears after popup closes');
    print('LUNA_PANEL_HOVER_PASS');
}
