export type Edge = 'bottom' | 'top' | 'left' | 'right';
export interface Rectangle {x: number; y: number; width: number; height: number;}
export function taskbarGeometry(monitor: Rectangle, edge: Edge, thickness: number,
    floating: boolean, edgeGap: number, endGap: number): Rectangle {
    const vertical = edge === 'left' || edge === 'right';
    const cross = vertical ? monitor.width : monitor.height;
    const length = vertical ? monitor.height : monitor.width;
    const size = Math.max(1, Math.min(thickness, cross));
    const gap = floating ? Math.max(0, Math.min(edgeGap, cross - size)) : 0;
    const ends = floating ? Math.max(0, Math.min(endGap, (length - 1) / 2)) : 0;
    return vertical
        ? {x: edge === 'left' ? monitor.x + gap : monitor.x + monitor.width - size - gap,
            y: monitor.y + ends, width: size, height: length - 2 * ends}
        : {x: monitor.x + ends, y: edge === 'top' ? monitor.y + gap : monitor.y + monitor.height - size - gap,
            width: length - 2 * ends, height: size};
}
export function reserveGeometry(monitor: Rectangle, bar: Rectangle, edge: Edge): Rectangle {
    // Reserve matching space on the window side of the bar. Derive the gap
    // from its current position so adaptive attached layouts naturally use zero.
    const vertical = edge === 'left' || edge === 'right';
    const extent = vertical ? monitor.width : monitor.height;
    const thickness = vertical ? bar.width : bar.height;
    const gap = Math.max(0, edge === 'left' ? bar.x - monitor.x
        : edge === 'right' ? monitor.x + monitor.width - bar.x - bar.width
        : edge === 'top' ? bar.y - monitor.y
        : monitor.y + monitor.height - bar.y - bar.height);
    const reserved = Math.min(extent, thickness + 2 * gap);
    if (edge === 'left') return {...monitor, width: reserved};
    if (edge === 'right') return {...monitor, x: monitor.x + monitor.width - reserved, width: reserved};
    if (edge === 'top') return {...monitor, height: reserved};
    return {...monitor, y: monitor.y + monitor.height - reserved, height: reserved};
}
