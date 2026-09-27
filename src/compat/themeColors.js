import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {rgbaColor} from './colors.js';

let probes = null;
let palette = null;
let context = null;
let changedId = 0;
let idle = 0;
const listeners = new Set();
const hex = c => '#' + [c.red, c.green, c.blue].map(v => v.toString(16).padStart(2, '0')).join('');

function readPalette() {
    const panel = probes.panel.get_theme_node();
    const popup = probes.content.get_theme_node();
    let background = popup.get_background_color();
    if (!background.alpha) {
        const [found, color] = probes.popup.get_theme_node().lookup_color('-arrow-background-color', false);
        if (found) background = color;
    }
    return {taskbar: hex(panel.get_background_color()), panel: hex(background),
        taskbarText: hex(panel.get_foreground_color()), panelText: hex(popup.get_foreground_color())};
}

export function watchThemeColors(callback) {
    if (!probes) {
        probes = {panel: new St.Widget({name: 'panel', visible: false}),
            popup: new St.BoxLayout({style_class: 'popup-menu', visible: false}),
            content: new St.BoxLayout({style_class: 'popup-menu-content'})};
        probes.popup.add_child(probes.content);
        Main.uiGroup.add_child(probes.panel);
        Main.uiGroup.add_child(probes.popup);
        context = St.ThemeContext.get_for_stage(global.stage);
        palette = readPalette();
        changedId = context.connect('changed', () => {
            if (idle) return;
            idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                idle = 0;
                const next = readPalette();
                if (JSON.stringify(next) !== JSON.stringify(palette)) {
                    palette = next;
                    for (const listener of [...listeners]) listener();
                }
                return GLib.SOURCE_REMOVE;
            });
        });
    }
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
        if (listeners.size) return;
        context.disconnect(changedId);
        if (idle) GLib.Source.remove(idle);
        idle = 0;
        probes.panel.destroy();
        probes.popup.destroy();
        probes = palette = context = null;
    };
}

export function surfaceColor(settings, prefix, kind, opacity) {
    const color = settings.get_boolean(`${prefix}-color-override`)
        ? settings.get_string(`${prefix}-color`) : palette[kind];
    return rgbaColor(color, opacity);
}

export function surfaceText(kind) { return palette[`${kind}Text`]; }
