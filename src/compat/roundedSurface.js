import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import Cogl from 'gi://Cogl';
import St from 'gi://St';
import Graphene from 'gi://Graphene';
import Clutter from 'gi://Clutter';

// BACKGROUND blur normally reads the current framebuffer. Inside a rounded
// offscreen mask that is the mask's texture, not the desktop stage.
export const StageBackdropBlur = GObject.registerClass(class LunaTaskbarStageBackdropBlur extends Shell.BlurEffect {
    vfunc_paint_node(node, context, flags) {
        const framebuffer = this.sourceFramebuffer;
        if (!framebuffer) {
            super.vfunc_paint_node(node, context, flags);
            return;
        }
        context.push_framebuffer(framebuffer);
        try {
            super.vfunc_paint_node(node, context, flags);
        } finally {
            context.pop_framebuffer();
        }
    }
});

// Apply after background blur so its rectangular texture is clipped as well.
export const RoundedSurface = GObject.registerClass(class LunaTaskbarRoundedSurface extends Clutter.ShaderEffect {
    vfunc_paint(node, context, flags) {
        // OffscreenEffect caches its entire subtree when this actor is clean.
        // A backdrop depends on other actors, so that cache would freeze the
        // nested BACKGROUND blur. Repaint on frames already being rendered;
        // do not schedule an idle redraw loop.
        if (this.liveBackdrop) {
            this.liveBackdrop.sourceFramebuffer = context.get_framebuffer();
            flags |= Clutter.EffectPaintFlags.ACTOR_DIRTY;
        }
        super.vfunc_paint(node, context, flags);
    }
    vfunc_get_static_snippet() {
        return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT,
            'uniform float surface_width; uniform float surface_height; uniform float surface_radius;', `
            vec2 extent = vec2(surface_width, surface_height);
            float radius = min(surface_radius, min(extent.x, extent.y) * 0.5);
            vec2 rounded_extent = floor(extent + vec2(0.5));
            vec2 texture_extent = rounded_extent + vec2(3.0);
            vec2 texture_origin = ceil(extent + vec2(0.75)) - texture_extent;
            vec2 point = cogl_tex_coord_in[0].xy * texture_extent + texture_origin;
            // Signed distance keeps the interior fully opaque even when an
            // animated radius approaches zero. Distance-to-corner alone would
            // fade every interior pixel once radius drops below half a pixel.
            vec2 q = abs(point - extent * 0.5) - (extent * 0.5 - vec2(radius));
            float distance = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
            float coverage = 1.0 - smoothstep(-0.5, 0.5, distance);
            cogl_color_out *= coverage;
        `);
    }
    update(width, height, radius) {
        const key = `${width}:${height}:${radius}`;
        if (this._key === key) return;
        this._key = key;
        this.enabled = radius > 0;
        if (!this.enabled && this.liveBackdrop)
            this.liveBackdrop.sourceFramebuffer = null;
        for (const [name, value] of [['surface_width', width], ['surface_height', height], ['surface_radius', radius]])
            this.set_uniform_float(name, 1, [value]);
    }
});

// Child shadows can enlarge an offscreen texture despite the parent's clip.
// Keep the mask's texture coordinates tied to the actual taskbar allocation.
export const TaskbarSurface = GObject.registerClass(class LunaTaskbarSurface extends St.Widget {
    vfunc_get_paint_volume(volume) {
        volume.set_origin(new Graphene.Point3D({x: 0, y: 0, z: 0}));
        volume.set_width(this.width);
        volume.set_height(this.height);
        return true;
    }
});
