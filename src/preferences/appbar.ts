import {_} from '../i18n.js';
import Adw from 'gi://Adw';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, appBar: Adw.PreferencesPage): void {
    const {group, toggle, spin, combo, color} = context;
    const apps = group(appBar, _('Buttons'));
    for (const [key, title] of [['app-icon-size', _('Icon size')], ['app-button-width', _('Button width')], ['app-padding', _('Inner padding')],
        ['app-margin', _('Button margin')], ['app-spacing', _('Space between buttons')]] as const)
        spin(apps, key, title);
    toggle(apps, 'running-indicators', _('Running window indicators'), _('Show the indicators beneath application icons'));
    toggle(apps, 'notification-badges', _('Notification badges'), _('Show app-published unread counts, GNOME notification counts and attention badges'));

    const motion = group(appBar, _('Animations'));
    combo(motion, 'app-hover-animation', _('Hover effect'), ['none', 'lift', 'zoom'], [_('None'), _('Lift'), _('Zoom')]);
    spin(motion, 'app-animation-duration', _('Duration'), _('Milliseconds; respects the system animation setting'));
    toggle(motion, 'app-appear-animation', _('Fade in new buttons'));
    toggle(motion, 'app-launch-animation', _('Push while clicking'));
    toggle(motion, 'app-close-animation', _('Fade out closed buttons'));

    const previewLayout = group(appBar, _('Preview layout'));
    spin(previewLayout, 'preview-width', _('Thumbnail width'));
    combo(previewLayout, 'preview-aspect-ratio', _('Thumbnail aspect ratio'), ['16:10', '16:9', '4:3', 'window'],
        ['16:10', '16:9', '4:3', _('Match window')], _('Fit windows without stretching or cropping'));
    spin(previewLayout, 'preview-padding', _('Panel padding'));
    spin(previewLayout, 'preview-card-spacing', _('Space between windows'));

    const indicators = group(appBar, _('Running indicators'));
    combo(indicators, 'indicator-color-mode', _('Color source'), ['default', 'custom', 'app'],
        [_('Default'), _('Custom color'), _('App icon dominant color')]);
    color(indicators, 'indicator-color', _('Indicator color'), _('Also used when an app icon has no usable dominant color'));
}
