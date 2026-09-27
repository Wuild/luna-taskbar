import {_} from '../i18n.js';
import Adw from 'gi://Adw';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, page: Adw.PreferencesPage): void {
    const {group, combo, toggle, spin} = context;
    const bar = group(page, _('Taskbar scrolling'), _('App buttons use the app scrolling action below.'));
    toggle(bar, 'taskbar-scroll-workspaces', _('Scroll to switch workspaces'), _('Up or left goes back; down or right goes forward. Stops at the first and last workspace.'));
    const clicks = group(page, _('Application clicks'), _('Default: toggle a single window, show previews for multiple windows, or launch an app that is not running.'));
    const values = ['default', 'cycle', 'activate', 'toggle-group', 'minimize', 'new-window', 'previews', 'menu', 'none'] as const;
    const labels = [_('Default (toggle or preview)'), _('Cycle through windows'), _('Activate window'), _('Toggle all windows'), _('Minimize all windows'), _('Open new window'), _('Show window previews'), _('Open context menu'), _('Do nothing')];
    for (const [key, title] of [['app-click-action', _('Left-click')], ['app-middle-click-action', _('Middle-click')],
        ['app-right-click-action', _('Right-click')], ['app-shift-click-action', _('Shift + left-click')]] as const)
        combo(clicks, key, title, values, labels);
    const scroll = group(page, _('Application scrolling'));
    combo(scroll, 'app-scroll-action', _('Scroll over an app'), ['strip', 'cycle', 'workspaces', 'none'],
        [_('Scroll the app bar'), _('Cycle through app windows'), _('Switch workspaces'), _('Do nothing')],
        _('Cycling wraps between windows. Up or left goes back; down or right goes forward.'));
    const previews = group(page, _('Window previews'));
    toggle(previews, 'show-previews', _('Show previews on hover'), _('Click actions are configured separately above'));
    spin(previews, 'preview-show-delay', _('Preview hover delay'), _('Milliseconds before a preview appears'), 'show-previews');
    spin(previews, 'preview-hide-delay', _('Dismissal delay'), _('Milliseconds allowed when moving between a button and its preview'));
}
