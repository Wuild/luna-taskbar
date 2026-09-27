export function hasRemoteMenu(path: unknown): path is string {
    return typeof path === 'string' && path.startsWith('/') &&
        path !== '/' && path !== '/NO_DBUSMENU';
}

export interface TrayActivation {
    button: number;
    props?: {Id?: string; ItemIsMenu?: boolean};
    remoteMenu?: {toggle(): Promise<void>} | null;
    invoke(method: 'ContextMenu' | 'SecondaryActivate' | 'Activate'): Promise<unknown>;
    isCancelled(): boolean;
    restoreWindow(): Promise<unknown>;
}
export async function activateTrayItem({button, props, remoteMenu, invoke, isCancelled, restoreWindow}: TrayActivation): Promise<void> {
    if ((button === 3 || props?.ItemIsMenu) && remoteMenu) {
        try {
            await remoteMenu.toggle();
            return;
        } catch (error) {
            if (isCancelled()) return;
            // Some bridges advertise a path without actually exporting a menu.
            if (!/UnknownMethod|UnknownInterface|UnknownObject/.test(error instanceof Error ? error.message : String(error)))
                throw error;
        }
    }
    if (isCancelled()) return;
    await invoke(button === 3 ? 'ContextMenu' : button === 2 ? 'SecondaryActivate' : 'Activate');
    if (button === 1 && (props?.Id?.startsWith('wine-') || props?.Id?.startsWith('chrome_status_icon_')) && !props.ItemIsMenu && !isCancelled())
        await restoreWindow();
}

export type MenuLayout = [number, {label?: string; enabled?: boolean; visible?: boolean}, MenuLayout[]];
export interface MenuRoute {label: string; index: number;}
export function resolveMenuAction(layout: MenuLayout | null, route: readonly MenuRoute[]): MenuLayout | null {
    let node: MenuLayout | null | undefined = layout;
    for (const {label, index} of route) {
        const children: MenuLayout[] = node?.[2] ?? [];
        const sameLabel = children.filter(child => child[1].label === label);
        node = sameLabel.length === 1 ? sameLabel[0] : children[index];
        if (!node || node[1].label !== label || node[1].enabled === false || node[1].visible === false)
            return null;
    }
    return node ?? null;
}
