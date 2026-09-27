export function validRect(rect) {
    return rect && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) &&
        rect.width > 0 && rect.height > 0;
}

export function restoreGeometry(saved, monitors, primaryIndex) {
    if (!validRect(saved?.rect) || !monitors.length) return null;
    let monitor = saved.monitor ? monitors.find(m => m.id === saved.monitor) :
        monitors.find(m => saved.rect.x >= m.work.x && saved.rect.y >= m.work.y &&
            saved.rect.x + saved.rect.width <= m.work.x + m.work.width &&
            saved.rect.y + saved.rect.height <= m.work.y + m.work.height);
    let rect = {...saved.rect};
    if (monitor && validRect(saved.work)) {
        rect.x += monitor.work.x - saved.work.x;
        rect.y += monitor.work.y - saved.work.y;
    }
    const fits = monitor && rect.x >= monitor.work.x && rect.y >= monitor.work.y &&
        rect.x + rect.width <= monitor.work.x + monitor.work.width &&
        rect.y + rect.height <= monitor.work.y + monitor.work.height;
    if (!fits) {
        // A maximized window's normal rectangle can belong to its previous
        // display. Keep the saved display and fit the unmaximized rectangle there.
        if (!monitor || !(saved.maximized & 3))
            monitor = monitors.find(m => m.index === primaryIndex) ?? monitors[0];
        rect.width = Math.min(rect.width, monitor.work.width);
        rect.height = Math.min(rect.height, monitor.work.height);
        rect.x = monitor.work.x + Math.round((monitor.work.width - rect.width) / 2);
        rect.y = monitor.work.y + Math.round((monitor.work.height - rect.height) / 2);
    }
    return {rect, monitor: monitor.index, maximized: Number.isInteger(saved.maximized) ? saved.maximized & 3 : 0};
}
