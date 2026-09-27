import type {TaskbarSettings} from '../src/settings/settings.js';

// Compile-only contract tests. These failures must remain failures as the API evolves.
declare const settings: TaskbarSettings;
settings.get_int('taskbar-height');
settings.set_string('launcher-menu', 'overview');
settings.set_strv('search-shortcut', ['<Super>s']);
// @ts-expect-error numeric settings cannot be read as booleans
settings.get_boolean('taskbar-height');
// @ts-expect-error unknown setting
settings.get_int('taskbar-heigth');
// @ts-expect-error enum value outside the schema choices
settings.set_string('launcher-menu', 'dock');
// @ts-expect-error desktop settings are outside the taskbar API
settings.set_boolean('desktop-icons-enabled', true);
// @ts-expect-error incorrect value type
settings.set_int('taskbar-height', '48');
// @ts-expect-error unknown detailed signal
settings.connect('changed::taskbar-heigth', () => {});
