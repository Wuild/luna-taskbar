import Clutter from 'gi://Clutter';
import St from 'gi://St';

// EXTERNAL retains a scrollable adjustment without creating visible scrollbars.
// Map a regular mouse wheel onto the horizontal strip as well as touchpad input.
export function createHorizontalScroll(properties = {}) {
    const scroll = new St.ScrollView({
        ...properties,
        hscrollbar_policy: St.PolicyType.EXTERNAL,
        vscrollbar_policy: St.PolicyType.NEVER,
        enable_mouse_scrolling: false,
        clip_to_allocation: true,
    });
    scroll.connect('scroll-event', (_actor, event) => {
        const adjustment = scroll._lunaVertical ? scroll.vadjustment : scroll.hadjustment;
        const limit = Math.max(adjustment.lower, adjustment.upper - adjustment.page_size);
        if (limit <= adjustment.lower)
            return Clutter.EVENT_PROPAGATE;
        const direction = event.get_scroll_direction();
        const step = 48 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let delta;
        if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = event.get_scroll_delta();
            delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy) * step;
        } else {
            delta = [Clutter.ScrollDirection.LEFT, Clutter.ScrollDirection.UP].includes(direction)
                ? -step : step;
        }
        adjustment.remove_transition('value');
        adjustment.value = Math.max(adjustment.lower, Math.min(limit, adjustment.value + delta));
        return Clutter.EVENT_STOP;
    });
    return scroll;
}

export function revealInScroll(scroll, actor, animate = false) {
    if (!actor.has_allocation() || !scroll.has_allocation()) return false;
    const axis = scroll._lunaVertical ? 1 : 0;
    const x = actor.get_transformed_position()[axis];
    const viewportX = scroll.get_transformed_position()[axis];
    const width = actor.get_transformed_size()[axis];
    const extent = scroll._lunaVertical ? scroll.height : scroll.width;
    const adjustment = scroll._lunaVertical ? scroll.vadjustment : scroll.hadjustment;
    if (![x, viewportX, width, extent, adjustment.value, adjustment.lower,
        adjustment.upper, adjustment.page_size].every(Number.isFinite)) return false;
    const delta = x < viewportX ? x - viewportX
        : Math.max(0, x + width - viewportX - extent);
    const value = Math.max(adjustment.lower,
        Math.min(adjustment.upper - adjustment.page_size, adjustment.value + delta));
    if (animate)
        adjustment.ease(value, {duration: 180, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    else
        adjustment.value = value;
    return true;
}
