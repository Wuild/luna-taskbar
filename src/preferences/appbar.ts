import Adw from 'gi://Adw';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, appBar: Adw.PreferencesPage): void {
    const {group, toggle, spin, combo, color} = context;
    const apps = group(appBar, 'Buttons');
    for (const [key, title] of [['app-icon-size', 'Icon size'], ['app-button-width', 'Button width'], ['app-padding', 'Inner padding'],
        ['app-margin', 'Button margin'], ['app-spacing', 'Space between buttons']] as const)
        spin(apps, key, title);
    toggle(apps, 'running-indicators', 'Running window indicators', 'Show the indicators beneath application icons');
    toggle(apps, 'notification-badges', 'Notification badges', 'Show app-published unread counts, GNOME notification counts and attention badges');

    const motion = group(appBar, 'Animations');
    combo(motion, 'app-hover-animation', 'Hover effect', ['none', 'lift', 'zoom'], ['None', 'Lift', 'Zoom']);
    spin(motion, 'app-animation-duration', 'Duration', 'Milliseconds; respects the system animation setting');
    toggle(motion, 'app-appear-animation', 'Fade in new buttons');
    toggle(motion, 'app-launch-animation', 'Pulse when launching');
    toggle(motion, 'app-close-animation', 'Fade out closed buttons');

    const previewLayout = group(appBar, 'Preview layout');
    spin(previewLayout, 'preview-width', 'Thumbnail width');
    combo(previewLayout, 'preview-aspect-ratio', 'Thumbnail aspect ratio', ['16:10', '16:9', '4:3', 'window'],
        ['16:10', '16:9', '4:3', 'Match window'], 'Fit windows without stretching or cropping');
    spin(previewLayout, 'preview-padding', 'Panel padding');
    spin(previewLayout, 'preview-card-spacing', 'Space between windows');

    const indicators = group(appBar, 'Running indicators');
    combo(indicators, 'indicator-color-mode', 'Color source', ['default', 'custom', 'app'],
        ['Default', 'Custom color', 'App icon dominant color']);
    color(indicators, 'indicator-color', 'Indicator color', 'Also used when an app icon has no usable dominant color');
}
