import * as Gettext from 'gettext';

const domain = 'luna-taskbar';
// The Shell and preferences bind this domain via metadata.json. The standalone
// desktop process calls initTranslations before constructing its interface.
export function initTranslations(extensionPath: string): void {
    Gettext.bindtextdomain(domain, `${extensionPath}/locale`);
}
export function _(message: string): string { return message ? Gettext.dgettext(domain, message) : ''; }
export function ngettext(singular: string, plural: string, count: number): string {
    return Gettext.dngettext(domain, singular, plural, count);
}
export function pgettext(context: string, message: string): string {
    return Gettext.dpgettext(domain, context, message);
}
// Support positional substitutions so translators can reorder inserted values.
export function formatText(message: string, ...values: unknown[]): string {
    let index = 0;
    return message.replace(/%%|%(?:(\d+)\$)?[sd]/g, (match, position: string | undefined) => {
        if (match === '%%') return '%';
        const value = values[position ? Number(position) - 1 : index++];
        return match.endsWith('d') ? String(Number(value)) : String(value);
    });
}
