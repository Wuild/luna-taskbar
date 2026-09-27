import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export function anchorTaskbarMenu(menu, source, settings) {
    const pointer = menu._boxPointer;
    const original = pointer._reposition;
    const reposition = box => {
        original.call(pointer, box);
        let bar = source;
        while (bar && bar.name !== 'luna-taskbar') bar = bar.get_parent();
        const parent = pointer.get_parent();
        const monitor = Main.layoutManager.findMonitorForActor(source);
        if (!bar || !parent || !monitor) return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const gap = settings.get_int('panel-taskbar-gap') * scale;
        const inset = settings.get_int('panel-edge-gap') * scale;
        const [barX, barY] = bar.get_transformed_position();
        const [barWidth, barHeight] = bar.get_transformed_size();
        const [sourceX, sourceY] = source.get_transformed_position();
        const [sourceWidth, sourceHeight] = source.get_transformed_size();
        const [ok, centerX, centerY] = parent.transform_stage_point(sourceX + sourceWidth / 2, sourceY + sourceHeight / 2);
        if (!ok) return;
        const edge = bar._lunaEdge || 'bottom';
        const vertical = edge === 'left' || edge === 'right';
        const alignment = pointer._arrowAlignment ?? 0.5;
        let x = centerX - box.get_width() * alignment;
        let y = centerY - box.get_height() * alignment;
        if (edge === 'bottom') y = parent.transform_stage_point(barX, barY - gap)[2] - box.get_height();
        if (edge === 'top') y = parent.transform_stage_point(barX, barY + barHeight + gap)[2];
        if (edge === 'left') x = parent.transform_stage_point(barX + barWidth + gap, barY)[1];
        if (edge === 'right') x = parent.transform_stage_point(barX - gap, barY)[1] - box.get_width();
        const [, left, top] = parent.transform_stage_point(monitor.x + inset, monitor.y + inset);
        const [, right, bottom] = parent.transform_stage_point(monitor.x + monitor.width - inset, monitor.y + monitor.height - inset);
        x = Math.max(left, Math.min(x, right - box.get_width()));
        y = Math.max(top, Math.min(y, bottom - box.get_height()));
        box.set_origin(x, y);
        pointer.setArrowOrigin(vertical ? centerY - y : centerX - x);
    };
    pointer._reposition = reposition;
    return () => {
        if (pointer._reposition === reposition) pointer._reposition = original;
    };
}
