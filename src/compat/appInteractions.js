// Keep cycling in stable creation order, independent of focus/MRU reordering.
export function performAppAction(action, task, handlers, direction = 1) {
    const windows = [...task.windows].sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
    const focused = windows.findIndex(window => window.has_focus());
    const current = focused >= 0 ? windows[focused] : task.window ?? windows[0];
    if (action === 'none') return;
    if (action === 'menu') return handlers.menu();
    if (action === 'new-window') return handlers.launch(true);
    if (!windows.length) {
        if (!['minimize', 'previews'].includes(action)) handlers.launch(false);
        return;
    }
    if (action === 'previews' || (action === 'default' && windows.length > 1))
        return handlers.previews(windows);
    if (action === 'minimize' || (action === 'toggle-group' && focused >= 0)) {
        windows.forEach(window => window.minimize());
        return;
    }
    if (action === 'toggle-group') {
        windows.filter(window => window !== current).forEach(window => handlers.activate(window));
        return handlers.activate(current);
    }
    if (action === 'cycle') {
        const index = focused < 0 ? (direction > 0 ? 0 : windows.length - 1)
            : (focused + direction + windows.length) % windows.length;
        return handlers.activate(windows[index]);
    }
    if (action === 'default' && current.has_focus()) current.minimize();
    else handlers.activate(current);
}
