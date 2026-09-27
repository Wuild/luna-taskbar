import {_} from '../i18n.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import type {PreferenceContext} from './controls.js';

export function populate(context: PreferenceContext, general: Adw.PreferencesPage): void {
    const {settings, window, group} = context;
    const resetGroup = group(general, _('Reset settings'),
        _('Restore every Luna - Taskbar setting, including custom app ordering and tray exceptions. GNOME favorites and other extensions are unchanged.'));
    const resetRow = new Adw.ActionRow({title: _('Reset all settings'),
        subtitle: _('Restore Luna - Taskbar’s defaults')});
    const resetButton = new Gtk.Button({label: _('Reset…'), valign: Gtk.Align.CENTER});
    resetButton.add_css_class('destructive-action');
    resetButton.connect('clicked', () => {
        const dialog = new Adw.AlertDialog({heading: _('Reset all Luna - Taskbar settings?'),
            body: _('This clears your Luna - Taskbar preferences, custom app ordering, and tray exceptions. This cannot be undone.')});
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('reset', _('Reset all settings'));
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
