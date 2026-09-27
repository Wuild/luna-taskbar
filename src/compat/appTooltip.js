import {appLabel} from './appLabel.js';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class AppTooltip {
    constructor(bar, suppressed) {
        this._bar = bar;
        this._suppressed = suppressed;
        this.actor = new St.Label({style_class: 'luna-taskbar-tooltip', reactive: false, visible: false});
        Main.layoutManager.addTopChrome(this.actor);
    }

    schedule(task, button) {
        this.hide();
        this._button = button;
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._timer = 0;
            if (!button.hover || !button.mapped || this._suppressed())
                return GLib.SOURCE_REMOVE;
            this.actor.text = appLabel(task.app, task.window);
            const monitor = Main.layoutManager.findMonitorForActor(button);
            if (!monitor)
                return GLib.SOURCE_REMOVE;
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            this.actor.set_style(`max-width: ${Math.min(360, monitor.width / scale - 24)}px;`);
            this.actor.show();
            const width = this.actor.get_preferred_width(-1)[1];
            const height = this.actor.get_preferred_height(width)[1];
            const [bx, by] = button.get_transformed_position();
            const [left, top] = this._bar.get_transformed_position();
            const edge = this._bar._lunaEdge || 'bottom';
            const gap = 6 * scale;
            let x = bx + button.width / 2 - width / 2;
            let y = top - height - gap;
            if (edge === 'top') y = top + this._bar.height + gap;
            if (edge === 'left' || edge === 'right') {
                x = edge === 'left' ? left + this._bar.width + gap : left - width - gap;
                y = by + button.height / 2 - height / 2;
            }
            this.actor.set_position(Math.max(monitor.x + gap, Math.min(x, monitor.x + monitor.width - width - gap)),
                Math.max(monitor.y + gap, Math.min(y, monitor.y + monitor.height - height - gap)));
            return GLib.SOURCE_REMOVE;
        });
    }

    forget(button) {
        if (this._button === button)
            this.hide();
    }

    hide() {
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = 0;
        this._button = null;
        this.actor.hide();
    }

    destroy() {
        this.hide();
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }
}
