// One task per application, with persistent favorites before other apps.
// Unidentified windows remain separate so unrelated apps are never merged.
export interface Application { get_id(): string | null; }
export interface Task<A, W> { key: string | W; app: A | null; window: W | null; windows: W[]; }
export function buildTasks<A extends Application, W>(favorites: readonly A[], windows: readonly W[], appForWindow: (window: W) => A | null | undefined): Task<A, W>[] {
    const tasks: Task<A, W>[] = [];
    const groups = new Map<string | W, Task<A, W>>();
    const add = (app: A | null, key: string | W) => {
        const task: Task<A, W> = {key, app, window: null, windows: []};
        groups.set(key, task);
        tasks.push(task);
        return task;
    };
    for (const app of favorites)
        { const id = app.get_id(); if (id && !groups.has(id)) add(app, id); }
    for (const window of windows) {
        const app = appForWindow(window);
        const key = app?.get_id() || window;
        const task = groups.get(key) ?? add(app ?? null, key);
        task.windows.push(window);
        task.window ??= window;
    }
    return tasks;
}

// _NET_WM_ICON contains a sequence of width, height, then ARGB CARDINALs.
export function decodeWindowIcon(output: string, target = 32) {
    if (output.length > 8 * 1024 * 1024 || !output.includes('='))
        return null;
    const tokens = output.slice(output.indexOf('=') + 1).trim().split(/[,\s]+/);
    const values = tokens.map(Number);
    if (values.some(value => !Number.isInteger(value) || value < 0 || value > 0xffffffff))
        return null;
    let best = null;
    for (let offset = 0; offset < values.length;) {
        const width = values[offset++];
        const height = values[offset++];
        if (!width || !height || width > 1024 || height > 1024 ||
            offset + width * height > values.length)
            return null;
        const size = Math.max(width, height);
        const score = size >= target ? size - target : (target - size) * 100;
        if (!best || score < best.score)
            best = {width, height, offset, score};
        offset += width * height;
    }
    if (!best)
        return null;
    const pixels = new Uint8Array(best.width * best.height * 4);
    for (let i = 0; i < pixels.length / 4; i++) {
        const argb = values[best.offset + i];
        pixels.set([(argb >>> 16) & 255, (argb >>> 8) & 255,
            argb & 255, (argb >>> 24) & 255], i * 4);
    }
    return {width: best.width, height: best.height, pixels};
}
