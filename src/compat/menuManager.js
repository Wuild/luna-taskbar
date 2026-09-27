import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export class ClickMenuManager extends PopupMenu.PopupMenuManager {
    _onCapturedEvent(actor, event) {
        if (event.type() === Clutter.EventType.ENTER)
            return Clutter.EVENT_PROPAGATE;
        if (event.type() === Clutter.EventType.BUTTON_PRESS ||
            event.type() === Clutter.EventType.TOUCH_BEGIN) {
            const target = global.stage.get_event_actor(event);
            if ((event.type() === Clutter.EventType.TOUCH_BEGIN || event.get_button() === 1) &&
                this.handleAppletPress?.(target))
                return Clutter.EVENT_STOP;
            const next = this._findMenuForSource(target);
            if (next && next !== this.activeMenu &&
                (event.type() === Clutter.EventType.TOUCH_BEGIN || event.get_button() === 1)) {
                // The modal menu owns this press, so the other button will not
                // receive it. Switch here rather than only dismissing the grab.
                this._changeMenu(next);
                return Clutter.EVENT_STOP;
            }
        }
        return super._onCapturedEvent(actor, event);
    }
}
