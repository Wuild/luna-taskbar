import Clutter from 'gi://Clutter';
import St from 'gi://St';

// A separate timeline keeps layout movement independent of visibility fades.
export class LayoutTransition {
    constructor(actor, paint) {
        this._actor = actor;
        this._paint = paint;
        this._destroyId = actor.connect('destroy', () => {
            this._actorGone = true;
            this.destroy();
        });
    }

    update(target, context) {
        if (!this._actor) return;
        const changed = !this.target || Object.keys(target).some(key => target[key] !== this.target[key]);
        const animate = this.target && context === this._context && this._actor.mapped &&
            this._actor.opacity > 0 && St.Settings.get().enable_animations;
        this._context = context;
        if (!changed) {
            this._paint(this.current);
            return;
        }
        this._stop();
        this.target = target;
        if (!animate) {
            this.current = {...target};
            this._paint(this.current);
            return;
        }
        const from = {...this.current};
        const timeline = new Clutter.Timeline({duration: 220, actor: this._actor});
        this._timeline = timeline;
        timeline.set_progress_mode(Clutter.AnimationMode.EASE_OUT_CUBIC);
        timeline.connect('new-frame', () => {
            const progress = timeline.get_progress();
            this.current = Object.fromEntries(Object.keys(target)
                .map(key => [key, from[key] + (target[key] - from[key]) * progress]));
            this._paint(this.current);
        });
        timeline.connect('completed', () => {
            this._timeline = null;
            this.current = {...target};
            this._paint(this.current);
        });
        timeline.start();
    }

    _stop() {
        this._timeline?.stop();
        this._timeline = null;
    }

    destroy() {
        this._stop();
        if (this._actor && !this._actorGone) this._actor.disconnect(this._destroyId);
        this._paint = null;
        this._actor = null;
    }
}
