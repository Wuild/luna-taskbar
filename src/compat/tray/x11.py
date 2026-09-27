#!/usr/bin/env python3
"""Small X11 bridge: dismiss one known tray popup without changing desktop focus."""
import ctypes as C
import sys

X = C.CDLL('libX11.so.6')
P = C.c_void_p
U = C.c_ulong
I = C.c_int

def bind(name, result, *args):
    fn = getattr(X, name)
    fn.restype, fn.argtypes = result, list(args)
    return fn

open_display = bind('XOpenDisplay', P, C.c_char_p)
close_display = bind('XCloseDisplay', I, P)
sync = bind('XSync', I, P, I)

class KeyEvent(C.Structure):
    _fields_ = [('type', I), ('serial', U), ('send_event', I), ('display', P),
                ('window', U), ('root', U), ('subwindow', U), ('time', U),
                ('x', I), ('y', I), ('x_root', I), ('y_root', I),
                ('state', C.c_uint), ('keycode', C.c_uint), ('same_screen', I)]

class Event(C.Union):
    _fields_ = [('key', KeyEvent), ('padding', C.c_long * 24)]

display = open_display(None)
if not display:
    sys.exit('No X11 display')
try:
    if sys.argv[1] == 'dismiss':
        window = int(sys.argv[2], 16)
        event = Event()
        event.key = KeyEvent(type=2, display=display, window=window,
            root=bind('XDefaultRootWindow', U, P)(display), same_screen=1,
            keycode=bind('XKeysymToKeycode', C.c_uint, P, U)(display, 0xff1b))
        send = bind('XSendEvent', I, P, U, I, C.c_long, C.POINTER(Event))
        for selected in ([False, True] if 'wine' in sys.argv[3:] else [False]):
            event.key.type = 2
            send(display, window, 0, 1 if selected else 0, C.byref(event))
            event.key.type = 3
            send(display, window, 0, 2 if selected else 0, C.byref(event))
        sync(display, 0)
finally:
    close_display(display)
