import Adw from 'gi://Adw';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, page: Adw.PreferencesPage): void {
    const {group, combo, toggle, spin} = context;
    const bar = group(page, 'Taskbar scrolling', 'App buttons use the app scrolling action below.');
    toggle(bar, 'taskbar-scroll-workspaces', 'Scroll to switch workspaces', 'Up or left goes back; down or right goes forward. Stops at the first and last workspace.');
    const clicks = group(page, 'Application clicks', 'Default: toggle a single window, show previews for multiple windows, or launch an app that is not running.');
    const values = ['default', 'cycle', 'activate', 'toggle-group', 'minimize', 'new-window', 'previews', 'menu', 'none'] as const;
    const labels = ['Default (toggle or preview)', 'Cycle through windows', 'Activate window', 'Toggle all windows', 'Minimize all windows', 'Open new window', 'Show window previews', 'Open context menu', 'Do nothing'];
    for (const [key, title] of [['app-click-action', 'Left-click'], ['app-middle-click-action', 'Middle-click'],
        ['app-right-click-action', 'Right-click'], ['app-shift-click-action', 'Shift + left-click']] as const)
        combo(clicks, key, title, values, labels);
    const scroll = group(page, 'Application scrolling');
    combo(scroll, 'app-scroll-action', 'Scroll over an app', ['strip', 'cycle', 'workspaces', 'none'],
        ['Scroll the app bar', 'Cycle through app windows', 'Switch workspaces', 'Do nothing'],
        'Cycling wraps between windows. Up or left goes back; down or right goes forward.');
    const previews = group(page, 'Window previews');
    toggle(previews, 'show-previews', 'Show previews on hover', 'Click actions are configured separately above');
    spin(previews, 'preview-show-delay', 'Preview hover delay', 'Milliseconds before a preview appears', 'show-previews');
    spin(previews, 'preview-hide-delay', 'Dismissal delay', 'Milliseconds allowed when moving between a button and its preview');
}
