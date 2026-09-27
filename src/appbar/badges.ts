export interface Badge {count?: number; 'count-visible'?: boolean; urgent?: boolean;}
export function badgeAppId(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    let value = input;
    try { value = decodeURIComponent(value.replace(/^application:\/\//, '')); } catch { return null; }
    value = value.replace(/\.desktop$/i, '').toLowerCase();
    if (!value || /[\/\s]/.test(value)) return null;
    if (/^org\.gnome\.evolution([.-].+)?$/.test(value)) value = 'org.gnome.evolution';
    const aliases: Record<string, string> = {'com.discordapp.discord': 'discord', 'com.discordapp.discordptb': 'discordptb',
        'com.discordapp.discordcanary': 'discordcanary'};
    return aliases[value] || value;
}

export function mergeLauncherBadge(previous: Badge = {}, update: Record<string, unknown> = {}): Badge {
    const next = {...previous};
    if (typeof update.count === 'number' && Number.isFinite(update.count))
        next.count = Math.max(0, Math.trunc(update.count));
    for (const key of ['count-visible', 'urgent'] as const)
        if (typeof update[key] === 'boolean') next[key] = update[key];
    return next;
}

export function combinedBadge(system: {count: number; urgent?: boolean}, launchers: readonly Badge[]) {
    const visible = launchers.filter(state => state['count-visible']);
    return {
        // Both mechanisms may describe the same messages. Never add them together.
        count: visible.length ? Math.max(...visible.map(state => state.count || 0)) : system.count,
        urgent: !!system.urgent || launchers.some(state => state.urgent),
    };
}
