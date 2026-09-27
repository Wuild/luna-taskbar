import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {TaskbarSettings} from '../dist/settings/settings.js';
import {taskbarKeys, settingDefinitions} from '../dist/settings/keys.js';

const root = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/dist/schemas`, Gio.SettingsSchemaSource.get_default(), false);
const schema = source.lookup('org.gnome.shell.extensions.luna-taskbar', false);
const raw = new Gio.Settings({settings_schema: schema});
const settings = new TaskbarSettings(raw);
function assert(value, message) { if (!value) throw new Error(message); }
const expected = schema.list_keys().sort();
assert(!expected.some(key => key.startsWith('desktop-')), 'Taskbar schema contains no desktop settings');
assert(schema.get_path() === '/org/gnome/shell/extensions/luna-taskbar/', 'Independent settings path');
const legacySource = Gio.SettingsSchemaSource.new_from_directory(GLib.getenv('LUNA_LEGACY_SCHEMA_DIR'), null, false);
const legacy = new Gio.Settings({settings_schema: legacySource.lookup('org.gnome.shell.extensions.lunabar', false)});
legacy.set_int('taskbar-height', 77);
legacy.set_boolean('desktop-icons-enabled', true);
assert(JSON.stringify([...taskbarKeys].sort()) === JSON.stringify(expected), 'All taskbar settings ported');
for (const key of taskbarKeys) {
    assert(raw.get_value(key).get_type_string() === settingDefinitions[key].type, `Type matches schema: ${key}`);
}
settings.set_int('taskbar-height', 60);
settings.set_string('launcher-menu', 'overview');
settings.set_int('tray-visible-limit', 9);
settings.set_boolean('unified-system-panel', false);
const observed = [];
const id = settings.connect('changed', (_settings, key) => observed.push(key));
settings.set_int('taskbar-height', 61);
legacy.set_int('taskbar-height', 78);
assert(settings.get_int('taskbar-height') === 61, 'Legacy writes do not change Taskbar settings');
assert(observed.length === 1 && observed[0] === 'taskbar-height', 'Legacy changes do not emit Taskbar signals');
settings.disconnect(id);
settings.resetAll();
for (const key of taskbarKeys) assert(raw.get_value(key).equal(raw.get_default_value(key)), `Reset: ${key}`);
assert(legacy.get_int('taskbar-height') === 78, 'Taskbar reset preserves LunaBar values');
assert(legacy.get_boolean('desktop-icons-enabled'), 'Taskbar reset preserves LunaBar desktop settings');
settings.set_int('taskbar-height', 62);
legacy.reset('taskbar-height');
assert(settings.get_int('taskbar-height') === 62, 'Legacy reset does not reset Taskbar');
print(`LUNA_TASKBAR_SETTINGS_PASS (${taskbarKeys.length} keys)`);
