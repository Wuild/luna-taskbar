import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(1800);
    Main.overview.hide();
    const bar = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    const panel = bar._panelBridge._systemPanel;
    const source = new MessageTray.Source({title: 'Notification group test'});
    Main.messageTray.add(source);
    const add = i => source.addNotification(new MessageTray.Notification({source,
        title: `Message ${i}`, body: 'A separate notification with readable content.', acknowledged: true}));
    try {
        add(1); add(2);
        panel.menu.open('calendar');
        await Scripting.sleep(800);
        const view = panel._mediaView;
        const group = view._notificationSourceToGroup.get(source);
        const collapsed = panel.notifications.height;
        const checkContents = expanded => {
            const cards = group.get_children().map(wrapper => wrapper.child)
                .filter(message => [...group._notificationToMessage.values()].includes(message));
            assert(cards.filter(message => message.opacity > 0).length === (expanded ? cards.length : Math.min(3, cards.length)),
                'Collapsed groups paint at most three cards; expanded groups restore every card');
            for (const message of group._notificationToMessage.values()) {
                const stacked = message.has_style_pseudo_class('second-in-stack') || message.has_style_pseudo_class('lower-in-stack');
                assert(message.get_theme_node().get_background_color().alpha < 255, 'Cards retain translucent backgrounds');
                assert(message.child.get_paint_opacity() === (!expanded && stacked ? 0 : 255),
                    `Only top card contents show when collapsed: expanded=${expanded}, stacked=${stacked}, opacity=${message.child.get_paint_opacity()}`);
                assert(message.child.get_height() > 0, 'Hidden content retains layout height');
                if (expanded || message === cards[0])
                    assert(!message.has_clip, 'Expanded content and the top card are not clipped');
                else {
                    const [, y, , height] = message.get_clip();
                    assert(y > 0 && height < message.height / 2, 'Backing cards expose only a bottom strip');
                }
            }
        };
        const screenshot = async name => {
            const stream = Gio.File.new_for_path(`/tmp/luna-notifications-${name}.png`).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            await new Shell.Screenshot().screenshot(false, stream);
            stream.close(null);
        };
        checkContents(false);
        await screenshot('collapsed');
        panel.menu.close();
        await Scripting.sleep(500);
        add(3);
        panel.menu.open('calendar');
        await Scripting.sleep(800);
        checkContents(false);
        await view._setExpandedGroup(group);
        await Scripting.sleep(700);
        checkContents(true);
        await screenshot('expanded');
        const expanded = panel.notifications.height;
        const adjustment = view._scrollViewAdjustment;
        console.log(`NOTIFICATION_SIZE ${collapsed} -> ${expanded}, scroll=${adjustment.upper}/${adjustment.page_size}`);
        assert(expanded > collapsed, 'Expanding a group grows the panel');
        assert(adjustment.page_size > 0, 'Expanded group has a visible viewport');
        view.collapse();
        await Scripting.sleep(700);
        assert(panel.notifications.height === collapsed, 'Collapsing restores compact panel height');
        checkContents(false);
        group.get_first_child().child.notification.destroy();
        await Scripting.sleep(500);
        checkContents(false);
        for (let i = 4; i <= 21; i++) add(i);
        await Scripting.sleep(700);
        checkContents(false);
        await screenshot('large-collapsed');
        await view._setExpandedGroup(group);
        await Scripting.sleep(700);
        checkContents(true);
        assert(adjustment.upper > adjustment.page_size, 'Large groups remain scrollable');
        await screenshot('large-expanded');
        assert(panel.notifications.height < panel._bounds().height, 'Expanded panel respects available screen height');
        await view._setExpandedGroup(null);
        await Scripting.sleep(700);
        checkContents(false);
        group.get_first_child().child.notification.destroy();
        await Scripting.sleep(700);
        checkContents(false);
        console.log('LUNA_NOTIFICATION_GROUPS_PASS');
    } finally {
        panel.menu.close();
        await Scripting.sleep(500);
        source.destroy();
        await Scripting.sleep(500);
    }
}
