import {_, formatText} from '../i18n.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class WorkspaceSwitcher {
    constructor(bar, settings, editing) {
        this.settings = settings;
        this.editing = editing;
        this.actor = new St.BoxLayout({style_class: 'luna-taskbar-workspaces',
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        this.signals = [];
        const connect = (object, signal, fn) => this.signals.push([object, object.connect(signal, fn)]);
        connect(global.workspace_manager, 'notify::n-workspaces', () => this.rebuild());
        connect(global.workspace_manager, 'active-workspace-changed', () => this.highlight());
        connect(global.workspace_manager, 'workspaces-reordered', () => this.highlight());
        connect(settings, 'changed::show-workspace-switcher', () => this.update());
        connect(settings, 'changed::taskbar-position', () => this.update());
        connect(bar, 'scroll-event', (_actor, event) => {
            if (editing() || !settings.get_boolean('taskbar-scroll-workspaces')) return Clutter.EVENT_PROPAGATE;
            let step = 0;
            const direction = event.get_scroll_direction();
            if ([Clutter.ScrollDirection.DOWN, Clutter.ScrollDirection.RIGHT].includes(direction)) step = 1;
            else if ([Clutter.ScrollDirection.UP, Clutter.ScrollDirection.LEFT].includes(direction)) step = -1;
            else {
                const [dx, dy] = event.get_scroll_delta();
                const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
                if (Math.sign(delta) !== Math.sign(this.delta ?? 0)) this.delta = 0;
                this.delta = (this.delta ?? 0) + delta;
                if (Math.abs(this.delta) >= 1) { step = Math.sign(this.delta); this.delta = 0; }
            }
            const now = GLib.get_monotonic_time() / 1000;
            if (step && now - (this.lastScroll ?? 0) > 220) {
                this.lastScroll = now;
                this.move(step);
            }
            return Clutter.EVENT_STOP;
        });
        this.rebuild();
    }
    move(step) {
        const manager = global.workspace_manager;
        const index = Math.max(0, Math.min(manager.n_workspaces - 1, manager.get_active_workspace_index() + step));
        Main.wm.actionMoveWorkspace(manager.get_workspace_by_index(index));
    }
    rebuild() {
        this.actor.destroy_all_children();
        for (let i = 0; i < global.workspace_manager.n_workspaces; i++) {
            const content = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
                style_class: 'luna-taskbar-workspace-content', x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER});
            const screen = new St.Bin({style_class: 'luna-taskbar-workspace-screen',
                child: new St.Label({text: String(i + 1), x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER})});
            content.add_child(screen);
            content.add_child(new St.Widget({style_class: 'luna-taskbar-workspace-stand',
                x_align: Clutter.ActorAlign.CENTER}));
            const button = new St.Button({child: content, can_focus: true, track_hover: true,
                accessible_name: formatText(_("Workspace %s"), i + 1), style_class: 'luna-taskbar-workspace-button'});
            button.connect('clicked', () => {
                if (this.editing()) return;
                const workspace = global.workspace_manager.get_workspace_by_index(i);
                if (workspace) Main.wm.actionMoveWorkspace(workspace);
                this.highlight();
            });
            this.actor.add_child(button);
        }
        this.update(); this.highlight();
    }
    update() {
        this.actor.visible = this.settings.get_boolean('show-workspace-switcher');
        this.actor.orientation = ['left', 'right'].includes(this.settings.get_string('taskbar-position')) ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
    }
    highlight() {
        const active = global.workspace_manager.get_active_workspace_index();
        this.actor.get_children().forEach((button, index) => {
            button.checked = index === active;
            button.accessible_name = formatText(_("Workspace %s%s"), index + 1, button.checked ? ', current' : '');
        });
    }
    destroy() { for (const [object, id] of this.signals) object.disconnect(id); this.actor.destroy(); }
}
