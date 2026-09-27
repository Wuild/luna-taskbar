export function validColor(value: string | null | undefined, fallback = '#80bfff') {
    return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : fallback;
}

export function rgbaColor(value: string | null | undefined, opacity: number, fallback = '#26201e') {
    const hex = validColor(value, fallback).slice(1);
    const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
    return `rgba(${rgb.join(', ')}, ${opacity})`;
}

// Weight visible, colorful pixels rather than transparent edges or white/black
// icon backgrounds. Quantization avoids averaging unrelated colors into gray.
export function dominantColor(pixels: Uint8Array, width: number, height: number, stride: number, channels: number) {
    const buckets = new Map();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * stride + x * channels;
            const [r, g, b] = pixels.slice(i, i + 3);
            const alpha = channels === 4 ? pixels[i + 3] / 255 : 1;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            if (alpha < 0.5 || max < 45 || min > 235 || max - min < 20)
                continue;
            const key = `${r >> 5},${g >> 5},${b >> 5}`;
            const weight = alpha * (0.5 + (max - min) / 255);
            const bucket = buckets.get(key) ?? {weight: 0, r: 0, g: 0, b: 0};
            bucket.weight += weight;
            bucket.r += r * weight;
            bucket.g += g * weight;
            bucket.b += b * weight;
            buckets.set(key, bucket);
        }
    }
    const best = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
    if (!best)
        return null;
    return '#' + [best.r, best.g, best.b].map(c => Math.round(c / best.weight).toString(16).padStart(2, '0')).join('');
}
