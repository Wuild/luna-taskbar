import {_} from '../i18n.js';
export function appLabel(app, window) {
    const name = app?.get_name()?.trim();
    const generic = !name || /^(steam_app_(?:default|\d+)|wine(?:64)?(?:-preloader)?|.*\.exe)$/i.test(name);
    if (app?.get_app_info?.() && !generic) return name;
    return window?.get_title()?.trim() || (!generic ? name : null) || _('Application');
}
