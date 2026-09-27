import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {TaskbarSettings} from '../settings/settings.js';

export function styleAppButton(settings: TaskbarSettings, button: St.Button, icon: St.Icon,
    sizeKey: 'app-icon-size' | 'search-icon-size' = 'app-icon-size'): void {
    const vertical = ['left', 'right'].includes(settings.get_string('taskbar-position'));
    const thickness = settings.get_int('taskbar-height');
    const shared = sizeKey === 'search-icon-size';
    const length = settings.get_int(shared ? 'search-button-width' : 'app-button-width');
    const width = vertical ? thickness : length;
    const height = vertical ? length : thickness;
    const padding = Math.min(settings.get_int(shared ? 'search-button-padding' : 'app-padding'), Math.max(0, (Math.min(height, width) - 3) / 2));
    const margin = settings.get_int(shared ? 'search-button-margin' : 'app-margin');
    icon.icon_size = Math.floor(Math.max(1, Math.min(settings.get_int(sizeKey),
        width - 2 * padding - 2, height - 2 * padding - 2)));
    button.x_align = vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL;
    button.x_expand = vertical;
    button.clip_to_allocation = true;
    button.y_expand = false;
    button.y_align = Clutter.ActorAlign.CENTER;
    button.set_height(height * St.ThemeContext.get_for_stage(global.stage).scale_factor);
    const contentWidth = Math.max(1, width - 2 * padding - 2);
    button.set_style(`width: ${contentWidth}px; min-width: ${contentWidth}px; max-width: ${contentWidth}px; padding: ${padding}px; margin: ${vertical ? `${margin}px 0` : `0 ${margin}px`};`);
}
