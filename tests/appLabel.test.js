import {appLabel} from '../appLabel.js';
const window = {get_title: () => 'Battle.net'};
const fake = (name, desktop = null) => ({get_name: () => name, get_app_info: () => desktop});
for (const [app, win, expected] of [
    [fake('steam_app_default'), window, 'Battle.net'],
    [fake('steam_app_default', {}), window, 'Battle.net'],
    [fake('Battle.net.exe'), window, 'Battle.net'],
    [fake('Files', {}), {get_title: () => 'Downloads'}, 'Files'],
    [null, window, 'Battle.net'],
    [fake('steam_app_default'), null, 'Application'],
]) {
    if (appLabel(app, win) !== expected) throw new Error(`Expected ${expected}`);
}
print('APP_LABEL_PASS');
