import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, general: Adw.PreferencesPage): void {
    const {settings, window, group, toggle} = context;
    const windowBehavior = group(general, 'Window behavior');
    toggle(windowBehavior, 'remember-window-positions', 'Remember window positions and sizes',
        'Restore app windows and maximized state when reopened. Off-screen layouts move to the primary display; minimized state is never restored. When disabled, new app windows open on the primary display.');
    const resetGroup = group(general, 'Reset settings',
        'Restore every Luna - Taskbar setting, including saved window positions, custom app ordering, and tray exceptions. GNOME favorites and other extensions are unchanged.');
    const resetRow = new Adw.ActionRow({title: 'Reset all settings',
        subtitle: 'Restore Luna - Taskbar’s defaults'});
    const resetButton = new Gtk.Button({label: 'Reset…', valign: Gtk.Align.CENTER});
    resetButton.add_css_class('destructive-action');
    resetButton.connect('clicked', () => {
        const dialog = new Adw.AlertDialog({heading: 'Reset all Luna - Taskbar settings?',
            body: 'This clears your Luna - Taskbar preferences, saved window positions, custom app ordering, and tray exceptions. This cannot be undone.'});
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('reset', 'Reset all settings');
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.default_response = 'cancel';
        dialog.close_response = 'cancel';
        dialog.connect('response', (_dialog, response) => {
            if (response === 'reset') settings.resetAll();
        });
        dialog.present(window);
    });
    resetRow.add_suffix(resetButton);
    resetRow.activatable_widget = resetButton;
    resetGroup.add(resetRow);
}
