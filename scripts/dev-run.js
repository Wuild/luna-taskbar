#!/usr/bin/gjs -m
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const project = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const [, location] = project.get_child('.dev-session').load_contents(null);
const directory = new TextDecoder().decode(location).trim();
const [, bytes] = Gio.File.new_for_path(`${directory}/environment.json`).load_contents(null);
const environment = JSON.parse(new TextDecoder().decode(bytes));
const bus = Gio.DBusConnection.new_for_address_sync(environment.DBUS_SESSION_BUS_ADDRESS,
    Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
    null, null);
const [display] = bus.call_sync('org.gnome.Mutter.Devkit', '/org/gnome/Mutter/Devkit',
    'org.freedesktop.DBus.Properties', 'Get',
    new GLib.Variant('(ss)', ['org.gnome.Mutter.Devkit', 'Env']),
    null, Gio.DBusCallFlags.NONE, 2500, null).recursiveUnpack();
const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
launcher.setenv('GTK_A11Y', 'none', true);
for (const [key, value] of Object.entries({...environment, ...display}))
    launcher.setenv(key, value, true);
const command = ARGV.length ? ARGV : ['ptyxis', '--standalone'];
const process = launcher.spawnv(command);
process.wait(null);
