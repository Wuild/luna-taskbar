import type {Rectangle} from '../taskbar/appearance.js';
// Anchor a native popup to the click, opening left/up when it would hit an edge.
export function nativeMenuPosition(point: Pick<Rectangle, 'x' | 'y'>, size: Pick<Rectangle, 'width' | 'height'>, work: Rectangle) {
    const right = work.x + work.width;
    const bottom = work.y + work.height;
    const x = point.x + size.width <= right ? point.x : point.x - size.width;
    const y = point.y + size.height <= bottom ? point.y : point.y - size.height;
    return {
        x: Math.round(Math.max(work.x, Math.min(x, right - size.width))),
        y: Math.round(Math.max(work.y, Math.min(y, bottom - size.height))),
    };
}
