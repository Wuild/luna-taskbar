import type {SettingsValues} from '../settings/keys.js';
export interface Rectangle {x: number; y: number; width: number; height: number;}
export interface AppearanceWindow {minimized: boolean; skipTaskbar: boolean; monitor: number; maximized: boolean; frame: Rectangle;}
// Geometry is in compositor pixels. Ignore windows on other displays and those
// that do not participate in the taskbar; evaluate only the active workspace.
export function usesWindowAppearance(mode: SettingsValues['window-appearance-mode'], windows: readonly AppearanceWindow[], bar: Rectangle, distance: number, monitorIndex: number | undefined, edge: SettingsValues['taskbar-position'] = 'bottom'): boolean {
    if (mode === 'disabled')
        return false;
    return windows.some(window => {
        if (window.minimized || window.skipTaskbar || window.monitor !== monitorIndex)
            return false;
        const r = window.frame;
        const horizontalOverlap = r.x < bar.x + bar.width && r.x + r.width > bar.x;
        const verticalOverlap = r.y < bar.y + bar.height && r.y + r.height > bar.y;
        const near = edge === 'bottom' ? horizontalOverlap && r.y < bar.y + bar.height && r.y + r.height >= bar.y - distance
            : edge === 'top' ? horizontalOverlap && r.y + r.height > bar.y && r.y <= bar.y + bar.height + distance
            : edge === 'left' ? verticalOverlap && r.x + r.width > bar.x && r.x <= bar.x + bar.width + distance
            : verticalOverlap && r.x < bar.x + bar.width && r.x + r.width >= bar.x - distance;
        return (mode === 'maximized' && window.maximized) ||
            (mode === 'near' && near) || (mode === 'either' && (window.maximized || near));
    });
}
