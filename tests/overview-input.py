import gi
import sys
from pathlib import Path
gi.require_version('Gtk', '4.0')
from gi.repository import Gtk
app = Gtk.Application(application_id='org.luna.OverviewInputTest')
def activate(app):
    window = Gtk.ApplicationWindow(application=app, title='Overview input regression', default_width=400, default_height=180)
    entry = Gtk.Entry()
    entry.connect('changed', lambda entry: Path(sys.argv[1]).write_text(entry.get_text()))
    window.set_child(entry)
    window.present()
    entry.grab_focus()
app.connect('activate', activate)
app.run([])
