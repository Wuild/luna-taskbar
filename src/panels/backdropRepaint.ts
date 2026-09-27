import Clutter from 'gi://Clutter';

// BACKGROUND blur samples the existing framebuffer. With clipped redraws that
// framebuffer can still contain last frame's foreground UI outside the damaged
// rectangle, feeding icons/hover highlights back into the next blur pass.
// Share this guard across bars and popups; never enable CONTINUOUS_REDRAW.
const users = new Set<BackdropRepaint>();
const fullRedrawFlag = Clutter.DrawDebugFlag.DISABLE_CLIPPED_REDRAWS;
let ownsFullRedrawFlag = false;

function updateRedrawMode() {
    if (users.size > 0) {
        const [, drawFlags] = Clutter.get_debug_flags();
        if (!((drawFlags ?? 0) & fullRedrawFlag)) {
            Clutter.add_debug_flags(0 as Clutter.DebugFlag, fullRedrawFlag, 0 as Clutter.PickDebugFlag);
            ownsFullRedrawFlag = true;
            global.stage.queue_redraw();
        }
    } else if (ownsFullRedrawFlag) {
        Clutter.remove_debug_flags(0 as Clutter.DebugFlag, fullRedrawFlag, 0 as Clutter.PickDebugFlag);
        ownsFullRedrawFlag = false;
        global.stage.queue_redraw();
    }
}

export class BackdropRepaint {
    private readonly _actor: Clutter.Actor;
    private readonly _effect: Clutter.Effect;
    private _signals: Array<[Clutter.Actor | Clutter.Effect, number]>;
    private _destroyed = false;
    constructor(actor: Clutter.Actor, effect: Clutter.Effect) {
        this._actor = actor;
        this._effect = effect;
        this._signals = [
            [actor, actor.connect('notify::mapped', () => this._sync())],
            [effect, effect.connect('notify::enabled', () => this._sync())],
            [actor, actor.connect('destroy', () => this.destroy())],
        ];
        this._sync();
    }

    _sync() {
        if (this._actor.mapped && this._effect.enabled)
            users.add(this);
        else
            users.delete(this);
        updateRedrawMode();
    }

    refresh() {
        if (this._destroyed || !this._effect.enabled || !this._actor.mapped)
            return;
        this._effect.queue_repaint();
        global.stage.queue_redraw();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];
        users.delete(this);
        updateRedrawMode();
    }
}
