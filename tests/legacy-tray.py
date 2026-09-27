#!/usr/bin/env python3
"""Interactive XEmbed fixture: run inside the isolated session, not the host."""
import os
import signal
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib, Gdk

GLib.set_prgname('luna-taskbar-tray-test')
Gdk.set_program_class('Lunabar-tray-test')

icon = Gtk.StatusIcon.new_from_icon_name('dialog-information')
icon.set_title('LunaTaskbar legacy tray test')
icon.set_tooltip_text('Left-click and right-click to test native XEmbed delivery')
icon.set_visible(True)
menu = Gtk.Menu()
for label in ['Legacy menu received right-click', 'Quit test']:
    item = Gtk.MenuItem(label=label)
    menu.append(item)
    item.connect('activate', lambda _item, text=label: print(text, flush=True))
    if label == 'Quit test':
        item.connect('activate', lambda _item: Gtk.main_quit())
menu.show_all()

def popup(_icon, button, timestamp):
    print(f'Legacy popup-menu: button={button}, time={timestamp}', flush=True)
    menu.popup(None, None, Gtk.StatusIcon.position_menu, icon, button, timestamp)

icon.connect('popup-menu', popup)
icon.connect('activate', lambda _icon: print('Legacy activate: left-click received', flush=True))
print('Legacy tray fixture running. Right-click its information icon.', flush=True)
if os.getenv('LUNA_TASKBAR_AUTO_TEST'):
    window = Gtk.Window(title='LunaTaskbar preview fixture')
    window.set_wmclass('luna-taskbar-tray-test', 'Lunabar-tray-test')
    window.set_default_size(420, 260)
    window.add(Gtk.Label(label='Live preview test window'))
    if os.getenv('LUNA_TASKBAR_KEY_LOG'):
        def log_key(_widget, event):
            with open(os.environ['LUNA_TASKBAR_KEY_LOG'], 'a') as stream:
                stream.write(str(event.keyval) + '\n')
            return False
        window.connect('key-press-event', log_key)
    window.show_all()
    print('Preview fixture shown', flush=True)
    def auto_popup():
        popup(icon, 3, 0)
        return True
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGUSR1, auto_popup)
    wine_popup = Gtk.Window(title='Wine-shaped popup fixture')
    wine_popup.set_wmclass('luna-taskbar-tray-test', 'Lunabar-tray-test')
    wine_popup.set_decorated(False)
    wine_popup.set_resizable(False)
    wine_popup.set_default_size(240, 180)
    wine_popup.move(450, 300)
    wine_popup.add(Gtk.Label(label='Wine-shaped popup'))
    def key_press(_widget, event):
        if event.keyval == Gdk.KEY_Escape:
            wine_popup.hide()
            return True
        return False
    wine_popup.connect('key-press-event', key_press)
    wine_popup.connect('delete-event', lambda widget, _event: (widget.hide(), True)[1])
    def open_wine_popup():
        wine_popup.show_all()
        return True
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGUSR2, open_wine_popup)
Gtk.main()
