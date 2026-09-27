import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as RemoteSearch from 'resource:///org/gnome/shell/ui/remoteSearch.js';
import * as ParentalControls from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';
import {PopupBackdrop} from './popupBackdrop.js';

export class SearchPanel {
    constructor(settings) {
        this._settings = settings;
        this._generation = 0;
        this._rows = [];
        this._searchSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.search-providers'});
        this.actor = new St.Widget({visible: false, reactive: true,
            accessible_name: 'Search', layout_manager: new Clutter.FixedLayout()});
        this.actor.add_constraint(new Clutter.BindConstraint({source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL}));
        Main.uiGroup.add_child(this.actor);
        this.panel = new St.BoxLayout({style_class: 'luna-taskbar-search-panel', reactive: true,
            orientation: Clutter.Orientation.VERTICAL});
        this.actor.add_child(this.panel);
        this.entry = new St.Entry({hint_text: 'Search apps, files and more…', can_focus: true,
            style_class: 'luna-taskbar-search-entry', primary_icon: new St.Icon({icon_name: 'edit-find-symbolic', icon_size: 18})});
        this.panel.add_child(this.entry);
        this.scroll = new St.ScrollView({hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC, x_expand: true});
        this.results = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'luna-taskbar-search-results', x_expand: true});
        this.scroll.set_child(this.results);
        this.panel.add_child(this.scroll);
        this._backdrop = new PopupBackdrop({actor: this.panel}, settings);
        Main.uiGroup.set_child_below_sibling(this._backdrop.surface, this.actor);
        this.entry.clutter_text.connect('text-changed', () => this._queueSearch());
        this.actor.connect('button-press-event', (_actor, event) => {
            if (!this.panel.contains(global.stage.get_event_actor(event))) this.close();
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.KEY_PRESS) return Clutter.EVENT_PROPAGATE;
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Escape) { this.close(); return Clutter.EVENT_STOP; }
            if ([Clutter.KEY_Up, Clutter.KEY_Down].includes(key)) {
                if (this._rows.length) this._select((this._selected +
                    (key === Clutter.KEY_Down ? 1 : -1) + this._rows.length) % this._rows.length);
                return Clutter.EVENT_STOP;
            }
            if ([Clutter.KEY_Return, Clutter.KEY_KP_Enter].includes(key)) {
                this._rows[this._selected]?._activate();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this.close());
    }

    toggle() { this.actor.visible ? this.close() : this.open(); }

    open() {
        if (!this._settings.get_boolean('search-panel-enabled')) return;
        if (this.actor.visible) return;
        const monitor = Main.layoutManager.monitors[global.display.get_current_monitor()];
        if (!monitor) return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const width = Math.max(120 * scale, Math.min(660 * scale, monitor.width - 32 * scale));
        this.panel.set_width(width);
        this.entry.set_height(38 * scale);
        this.panel.set_position(monitor.x + (monitor.width - width) / 2,
            monitor.y + Math.min(120 * scale, monitor.height * 0.18));
        this.scroll.set_style(`max-height: ${Math.floor(monitor.height * 0.55 / scale)}px;`);
        Main.uiGroup.set_child_above_sibling(this.actor, null);
        Main.uiGroup.set_child_below_sibling(this._backdrop.surface, this.actor);
        this.actor.show();
        this._grab = Main.pushModal(this.actor, {actionMode: Shell.ActionMode.POPUP});
        this.entry.set_text('');
        this._queueSearch();
        global.stage.set_key_focus(this.entry.clutter_text);
    }

    _queueSearch() {
        this._cancelSearch();
        this._rows = [];
        this._selected = -1;
        this.results.destroy_all_children();
        if (!this.actor.visible) return;
        const text = this.entry.get_text().trim();
        if (!text) {
            this.results.add_child(new St.Label({text: 'Type to search', style_class: 'luna-taskbar-search-hint'}));
            return;
        }
        this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            this._timeout = 0;
            this._search(text).catch(error => console.warn(`Luna - Taskbar search: ${error.message}`));
            return GLib.SOURCE_REMOVE;
        });
    }

    async _search(text) {
        const generation = this._generation;
        const cancellable = this._cancellable = new Gio.Cancellable();
        const terms = text.split(/\s+/);
        const permitted = info => ParentalControls.getDefault().shouldShowApp(info);
        const apps = GioUnix.DesktopAppInfo.search(text).flat().map(id => GioUnix.DesktopAppInfo.new(id))
            .filter(info => info?.should_show() && permitted(info)).slice(0, 8);
        for (const info of apps) {
            this._addResult(info.get_display_name(), 'Application',
                new St.Icon({gicon: info.get_icon(), icon_size: 32}), () => {
                    const app = Shell.AppSystem.get_default().lookup_app(info.get_id());
                    if (app) app.activate();
                    else info.launch([], global.create_app_launch_context(0, -1));
                });
        }
        const providers = RemoteSearch.loadRemoteSearchProviders(this._searchSettings)
            .filter(provider => !provider.appInfo || permitted(provider.appInfo));
        const groups = await Promise.all(providers.map(async provider => {
            try {
                // RemoteSearch starts proxy initialization asynchronously.
                // Wait for its connection before issuing the first request.
                await new Promise(resolve => {
                    let attempts = 0;
                    const ready = () => provider.proxy.get_connection() || cancellable.is_cancelled() || ++attempts >= 50;
                    if (ready()) { resolve(); return; }
                    const waits = this._providerWaits ??= new Map();
                    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
                        if (!ready()) return GLib.SOURCE_CONTINUE;
                        waits.delete(id);
                        resolve();
                        return GLib.SOURCE_REMOVE;
                    });
                    waits.set(id, resolve);
                });
                if (cancellable.is_cancelled() || !provider.proxy.get_connection()) return {provider, metas: []};
                const ids = await provider.getInitialResultSet(terms, cancellable);
                const metas = ids.length ? await provider.getResultMetas(ids.slice(0, 4), cancellable) : [];
                return {provider, metas};
            } catch { return {provider, metas: []}; }
        }));
        if (generation !== this._generation || cancellable.is_cancelled()) return;
        for (const {provider, metas} of groups) {
            for (const meta of metas) {
                this._addResult(meta.name, meta.description || provider.appInfo?.get_display_name() || '',
                    meta.createIcon(32), () => {
                        provider.activateResult(meta.id, terms);
                        if (meta.clipboardText) St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, meta.clipboardText);
                    });
            }
        }
        if (!this._rows.length) this.results.add_child(new St.Label({text: 'No results', style_class: 'luna-taskbar-search-hint'}));
    }

    _addResult(title, description, icon, activate) {
        const row = new St.Button({style_class: 'luna-taskbar-search-result', can_focus: true,
            x_expand: true, accessible_name: title});
        const content = new St.BoxLayout({style_class: 'luna-taskbar-search-result-content',
            x_expand: true, x_align: Clutter.ActorAlign.FILL});
        if (icon) { icon.y_align = Clutter.ActorAlign.CENTER; content.add_child(icon); }
        const labels = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        labels.add_child(new St.Label({text: title || '', x_expand: true}));
        if (description) labels.add_child(new St.Label({text: description, style_class: 'luna-taskbar-search-description', x_expand: true, opacity: 170}));
        content.add_child(labels);
        row.set_child(content);
        row._activate = () => { this.close(); activate(); };
        row.connect('clicked', row._activate);
        row.connect('key-focus-in', () => this._select(this._rows.indexOf(row)));
        this.results.add_child(row);
        this._rows.push(row);
        if (this._selected < 0) this._select(0);
    }

    _select(index) {
        this._rows[this._selected]?.remove_style_pseudo_class('selected');
        this._selected = index;
        const row = this._rows[index];
        if (!row) return;
        row.add_style_pseudo_class('selected');
        const adjustment = this.scroll.vadjustment;
        if (row.y < adjustment.value) adjustment.value = row.y;
        else if (row.y + row.height > adjustment.value + adjustment.page_size)
            adjustment.value = row.y + row.height - adjustment.page_size;
    }

    _cancelSearch() {
        this._generation++;
        if (this._timeout) GLib.Source.remove(this._timeout);
        this._timeout = 0;
        this._cancellable?.cancel();
        this._cancellable = null;
        for (const [id, resolve] of this._providerWaits ?? []) { GLib.Source.remove(id); resolve(); }
        this._providerWaits?.clear();
    }

    close() {
        this._cancelSearch();
        if (this._grab) { Main.popModal(this._grab); this._grab = null; }
        this.actor.hide();
    }

    destroy() {
        this.close();
        Main.layoutManager.disconnect(this._monitorsId);
        this._backdrop.destroy();
        this.actor.destroy();
    }
}
