import {dominantColor, rgbaColor, validColor} from '../colors.js';
function assert(value, message) { if (!value) throw new Error(message); }
assert(rgbaColor('#123456', 0.5) === 'rgba(18, 52, 86, 0.5)', 'Custom color preserves separate opacity');
assert(validColor('red; opacity: 0') === '#80bfff', 'Invalid settings cannot inject CSS');
const pixels = new Uint8Array([
    255, 0, 0, 0, 255, 255, 255, 255, 10, 120, 240, 255,
    0, 0, 0, 255, 10, 120, 240, 255, 250, 10, 20, 255,
]);
assert(dominantColor(pixels, 3, 2, 12, 4) === '#0a78f0', 'Dominant icon color ignores transparent and neutral pixels');
assert(dominantColor(new Uint8Array([255, 255, 255, 255]), 1, 1, 4, 4) === null, 'Neutral icons request fallback');
assert(dominantColor(new Uint8Array([10, 120, 240, 0, 0, 0, 0, 0]), 1, 1, 8, 3) === '#0a78f0', 'RGB pixels support padded rows');
print('5 color checks passed');
