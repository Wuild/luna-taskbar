import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import Cogl from 'gi://Cogl';
import St from 'gi://St';
import Graphene from 'gi://Graphene';

// Apply after background blur so its rectangular texture is clipped as well.
export const RoundedSurface = GObject.registerClass(class LunaTaskbarRoundedSurface extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, 'uniform float surface_width; uniform float surface_height; uniform float surface_radius;', `
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
        `, false);
    }
    update(width, height, radius) {
        const key = `${width}:${height}:${radius}`;
        if (this._key === key) return;
        this._key = key;
        this.enabled = radius > 0;
        for (const [name, value] of [['surface_width', width], ['surface_height', height], ['surface_radius', radius]])
            this.set_uniform_float(this.get_uniform_location(name), 1, [value]);
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
