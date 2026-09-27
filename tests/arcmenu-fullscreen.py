import gi

gi.require_version('Gtk', '4.0')
from gi.repository import Gtk

app = Gtk.Application(application_id='org.luna.ArcMenuFullscreenTest')

def activate(app):
    window = Gtk.ApplicationWindow(application=app, title='ArcMenu fullscreen regression')
    window.set_child(Gtk.Label(label='ArcMenu fullscreen regression'))
    window.fullscreen()
    window.present()

app.connect('activate', activate)
app.run(None)
