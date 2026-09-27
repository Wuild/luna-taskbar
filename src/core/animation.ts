import type Clutter from 'gi://Clutter';

type NativeEase = Omit<Parameters<Clutter.Actor['ease']>[0], 'scaleX' | 'scaleY' | 'translationY'> & {
    scale_x?: number;
    scale_y?: number;
    translation_y?: number;
    translation_x?: number;
};

export function easeActor(actor: Clutter.Actor, parameters: NativeEase): void {
    actor.ease(parameters);
}
