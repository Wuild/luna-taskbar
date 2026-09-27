import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import TaskbarRuntime from './compat/runtime.js';

export default class LunaTaskbar extends Extension {
    runtime: TaskbarRuntime | null = null;

    override enable(): void {
        if (this.runtime) return;
        const runtime = new TaskbarRuntime(this.metadata);
        this.runtime = runtime;
        try {
            runtime.enable();
        } catch (error) {
            this.runtime = null;
            try { runtime.disable(); } catch (cleanupError) { console.error(cleanupError); }
            throw error;
        }
    }

    override disable(): void {
        const runtime = this.runtime;
        this.runtime = null;
        runtime?.disable();
    }
}
