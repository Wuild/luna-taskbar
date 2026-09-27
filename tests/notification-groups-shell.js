import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
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
            for (const message of group._notificationToMessage.values()) {
                const stacked = message.has_style_pseudo_class('second-in-stack') || message.has_style_pseudo_class('lower-in-stack');
                assert(message.get_theme_node().get_background_color().alpha < 255, 'Cards retain translucent backgrounds');
                assert(message.child.get_paint_opacity() === (!expanded && stacked ? 0 : 255),
                    `Only top card contents show when collapsed: expanded=${expanded}, stacked=${stacked}, opacity=${message.child.get_paint_opacity()}`);
                assert(message.child.get_height() > 0, 'Hidden content retains layout height');
            }
        };
        checkContents(false);
        await view._setExpandedGroup(group);
        await Scripting.sleep(700);
        checkContents(true);
        const expanded = panel.notifications.height;
        const adjustment = view._scrollViewAdjustment;
        console.log(`NOTIFICATION_SIZE ${collapsed} -> ${expanded}, scroll=${adjustment.upper}/${adjustment.page_size}`);
        assert(expanded > collapsed, 'Expanding a group grows the panel');
        assert(adjustment.upper <= adjustment.page_size + 1, 'Fitting group does not need scrolling');
        view.collapse();
        await Scripting.sleep(700);
        assert(panel.notifications.height === collapsed, 'Collapsing restores compact panel height');
        checkContents(false);
        group.get_first_child().child.notification.destroy();
        await Scripting.sleep(500);
        checkContents(false);
        for (let i = 3; i <= 10; i++) add(i);
        await view._setExpandedGroup(group);
        await Scripting.sleep(700);
        assert(adjustment.upper > adjustment.page_size, 'Large groups remain scrollable');
        assert(panel.notifications.height < panel._bounds().height, 'Expanded panel respects available screen height');
        console.log('LUNA_NOTIFICATION_GROUPS_PASS');
    } finally {
        panel.menu.close();
        source.destroy();
    }
}
