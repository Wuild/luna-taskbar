import {styleStartButton} from './buttonStyle.js';
import {styleAppButton} from '../appbar/buttonStyle.js';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type {TaskbarSettings} from '../settings/settings.js';

export class StartMenuLauncher {
    readonly icon = new St.Icon({icon_name: 'view-app-grid-symbolic',
        fallback_icon_name: 'view-app-grid-symbolic', icon_size: 28});
    readonly actor = new St.Button({style_class: 'luna-taskbar-button luna-taskbar-launcher',
        can_focus: true, accessible_name: 'Start — show overview', child: this.icon});

    constructor(private readonly settings: TaskbarSettings) {
        this.actor.connect('clicked', () => Main.overview.toggle());
        this.update(false);
    }

    update(arcMenuActive: boolean): void {
        const mode = this.settings.get_string('launcher-icon');
        this.actor.visible = this.settings.get_boolean('show-overview-button');
        this.actor.accessible_name = arcMenuActive ? 'Task view — show overview' : 'Start — show overview';
        this.icon.icon_name = arcMenuActive
            ? (this.settings.get_string('overview-button-icon') || 'view-paged-symbolic')
            : mode === 'distro' ? (GLib.get_os_info('LOGO') || 'distributor-logo')
            : mode === 'custom' ? (this.settings.get_string('custom-launcher-icon') || 'view-app-grid-symbolic')
            : 'view-app-grid-symbolic';
        this.icon.set_style(null);
        if (arcMenuActive) {
            styleAppButton(this.settings, this.actor, this.icon, 'search-icon-size');
            return;
        }
        styleStartButton(this.settings, this.actor, this.icon);
    }

    destroy(): void { this.actor.destroy(); }
}
