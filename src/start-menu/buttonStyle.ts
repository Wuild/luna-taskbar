import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {TaskbarSettings} from '../settings/settings.js';

export function styleStartButton(settings: TaskbarSettings, button: St.Widget, icon: St.Icon): void {
    const vertical = ['left', 'right'].includes(settings.get_string('taskbar-position'));
    const size = settings.get_int('launcher-size');
    const padding = settings.get_int('launcher-padding');
    const margin = settings.get_int('launcher-margin');
    icon.icon_size = size;
    icon.set_style(`icon-size: ${size}px;`);
    button.set_height(-1);
    button.x_expand = vertical;
    button.x_align = vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL;
    button.y_align = Clutter.ActorAlign.FILL;
    const width = vertical ? Math.max(1, settings.get_int('taskbar-height') - 2 * padding) : size + 10;
    const nativePadding = Math.max(0, (width + 2 * padding - size) / 2);
    button.set_style(`width: ${width}px; min-width: ${width}px; padding: ${padding}px; margin: ${vertical ? `${margin}px 0` : `0 ${margin}px`}; border-width: 0; -natural-hpadding: ${nativePadding}px; -minimum-hpadding: ${nativePadding}px;`);
}
