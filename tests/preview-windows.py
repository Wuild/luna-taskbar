import gi
gi.require_version('Gtk', '4.0')
from gi.repository import Gtk
app=Gtk.Application(application_id='org.luna-taskbar.PreviewTest')
def activate(app):
 for i in range(5):
  w=Gtk.ApplicationWindow(application=app,title=f'Preview regression {i}')
  w.set_default_size(1000,650)
  w.set_child(Gtk.Label(label='Preview performance'))
  w.present()
app.connect('activate',activate)
app.run(None)
