/** Own acquired resources in reverse order, including partially constructed features. */
export class Lifecycle {
    private cleanups: Array<() => void> = [];
    private disposed = false;

    add(cleanup: () => void): void {
        if (this.disposed) cleanup();
        else this.cleanups.push(cleanup);
    }

    destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        const errors: unknown[] = [];
        for (const cleanup of this.cleanups.reverse()) {
            try { cleanup(); } catch (error) { errors.push(error); }
        }
        this.cleanups = [];
        if (errors.length) throw new AggregateError(errors, 'Luna taskbar cleanup failed');
    }
}
