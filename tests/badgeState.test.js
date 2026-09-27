import {badgeAppId, mergeLauncherBadge, combinedBadge} from '../badgeState.js';
function equal(actual, expected) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(JSON.stringify({actual, expected})); }
equal(badgeAppId('application://com.discordapp.Discord.desktop'), 'discord');
equal(badgeAppId('discord.desktop'), 'discord');
equal(badgeAppId('org.gnome.Evolution-alarm-notify'), 'org.gnome.evolution');
equal(badgeAppId('application://%ZZ'), null);
const update = mergeLauncherBadge({count: 12, 'count-visible': true}, {urgent: true});
equal(update, {count: 12, 'count-visible': true, urgent: true});
equal(combinedBadge({count: 3, urgent: false}, [update]), {count: 12, urgent: true});
equal(combinedBadge({count: 3, urgent: false}, [mergeLauncherBadge(update, {count: 0, urgent: false})]), {count: 0, urgent: false});
equal(combinedBadge({count: 3, urgent: false}, [{'count-visible': false, count: 12}]), {count: 3, urgent: false});
equal(mergeLauncherBadge({count: 2}, {count: NaN}), {count: 2});
print('BADGE_STATE_PASS');
