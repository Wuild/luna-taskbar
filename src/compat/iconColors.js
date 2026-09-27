import Gio from 'gi://Gio';
import St from 'gi://St';
import {dominantColor} from './colors.js';

export class IconColors {
    constructor(onReady) {
        this._onReady = onReady;
        this._theme = new St.IconTheme();
        this._cache = new Map();
        this._cancel = new Gio.Cancellable();
        this._themeId = this._theme.connect('changed', () => {
            this._cache.clear();
            this._onReady();
        });
    }

    get(icon) {
        const gicon = icon.gicon ?? new Gio.ThemedIcon({name: icon.icon_name || 'application-x-executable'});
        const key = gicon.to_string() ?? gicon;
        if (this._cache.has(key))
            return this._cache.get(key);
        this._cache.set(key, null);
        try {
            const info = this._theme.lookup_by_gicon(gicon, 32, 0);
            if (info)
                info.load_icon_async(this._cancel, (source, result) => {
                    if (this._cancel.is_cancelled())
                        return;
                    try {
                        const pixbuf = source.load_icon_finish(result);
                        this._cache.set(key, dominantColor(pixbuf.get_pixels(), pixbuf.width,
                            pixbuf.height, pixbuf.rowstride, pixbuf.n_channels));
                        this._onReady();
                    } catch {
                        // A missing or undecodable icon uses the configured fallback.
                    }
                });
        } catch {
            // Symbolic and unavailable icons keep the default indicator color.
        }
        return null;
    }

    destroy() {
        this._cancel.cancel();
        this._theme.disconnect(this._themeId);
        this._cache.clear();
    }
}
