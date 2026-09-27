import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk?version=4.0';

// Keep the extension preferences lifecycle, but replace the crowded tab strip
// with a public NavigationPage and an adaptive sidebar.
export class SettingsNavigation {
    readonly window: Adw.PreferencesWindow;
    readonly pages: Array<{page: Adw.PreferencesPage; row: Gtk.ListBoxRow}> = [];
    readonly stack: Gtk.Stack;
    readonly list: Gtk.ListBox;
    readonly search: Gtk.SearchEntry;
    readonly title: Adw.WindowTitle;
    readonly sidebarButton: Gtk.Button;
    readonly split: Adw.OverlaySplitView;
    readonly results: Adw.PreferencesPage;
    readonly resultGroup: Adw.PreferencesGroup;
    resultRows: Adw.ActionRow[] = [];
    private readonly rowPages = new WeakMap<Gtk.ListBoxRow, Adw.PreferencesPage>();
    constructor(window: Adw.PreferencesWindow) {
        this.window = window;
        this.pages = [];
        this.stack = new Gtk.Stack({transition_type: Gtk.StackTransitionType.NONE, hexpand: true, vexpand: true});
        this.list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.SINGLE});
        this.list.add_css_class('navigation-sidebar');
        this.list.connect('row-selected', (_list, row) => {
            if (!row) return;
            this.search.text = '';
            const page = this.rowPages.get(row);
            if (page) this.select(page);
            if (this.split.collapsed) this.split.show_sidebar = false;
        });
        this.search = new Gtk.SearchEntry({placeholder_text: 'Search settings', margin_top: 8,
            margin_bottom: 8, margin_start: 12, margin_end: 12});
        this.search.connect('search-changed', () => this.filter(this.search.text));
        this.search.connect('activate', () => { if (this.split.collapsed) this.split.show_sidebar = false; });
        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_controller, key, _code, state) => {
            if ((state & Gdk.ModifierType.CONTROL_MASK) && (key === Gdk.KEY_f || key === Gdk.KEY_F)) {
                this.split.show_sidebar = true; this.search.grab_focus(); return true;
            }
            return false;
        });
        window.add_controller(keys);
        const sidebarBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
        sidebarBox.append(this.search);
        const scroll = new Gtk.ScrolledWindow({vexpand: true, hscrollbar_policy: Gtk.PolicyType.NEVER});
        scroll.set_child(this.list);
        sidebarBox.append(scroll);
        const sidebar = new Adw.ToolbarView({content: sidebarBox});
        const sidebarHeader = new Adw.HeaderBar({show_end_title_buttons: false, show_back_button: false,
            title_widget: new Adw.WindowTitle({title: 'Luna - Taskbar', subtitle: 'Taskbar settings'})});
        sidebar.add_top_bar(sidebarHeader);
        this.title = new Adw.WindowTitle({title: 'Taskbar'});
        const header = new Adw.HeaderBar({title_widget: this.title, show_back_button: false});
        this.sidebarButton = new Gtk.Button({icon_name: 'sidebar-show-symbolic', tooltip_text: 'Show categories'});
        this.sidebarButton.connect('clicked', () => { this.split.show_sidebar = true; });
        header.pack_start(this.sidebarButton);
        const content = new Adw.ToolbarView({content: this.stack});
        content.add_top_bar(header);
        this.split = new Adw.OverlaySplitView({sidebar, content, min_sidebar_width: 220, max_sidebar_width: 250,
            sidebar_width_fraction: 0.25});
        this.split.connect('notify::collapsed', () => { this.sidebarButton.visible = this.split.collapsed; });
        this.sidebarButton.visible = false;
        const breakpoint = new Adw.Breakpoint({condition: Adw.BreakpointCondition.parse('max-width: 760px')});
        breakpoint.add_setter(this.split, 'collapsed', true);
        window.add_breakpoint(breakpoint);
        window.set_size_request(480, 420);
        window.set_default_size(1080, 760);
        window.search_enabled = false;
        const root = new Adw.NavigationPage({title: 'Taskbar settings', child: this.split, can_pop: false});
        window.add(new Adw.PreferencesPage({title: 'Settings'}));
        window.push_subpage(root);
        this.results = new Adw.PreferencesPage();
        this.resultGroup = new Adw.PreferencesGroup({title: 'Search results'});
        this.results.add(this.resultGroup);
        this.stack.add_named(this.results, 'search');
        this.resultRows = [];
    }

    add(page: Adw.PreferencesPage) {
        const row = new Gtk.ListBoxRow();
        const box = new Gtk.Box({spacing: 12, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12});
        box.append(new Gtk.Image({icon_name: page.icon_name}));
        box.append(new Gtk.Label({label: page.title, xalign: 0, hexpand: true}));
        row.set_child(box);
        this.rowPages.set(row, page);
        this.pages.push({page, row});
        this.stack.add_named(page, page.title);
        this.list.append(row);
        if (this.pages.length === 1) this.list.select_row(row);
    }

    select(page: Adw.PreferencesPage) {
        this.stack.visible_child = page;
        this.title.title = page.title;
    }

    filter(text: string) {
        const terms = text.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
        for (const row of this.resultRows) this.resultGroup.remove(row);
        this.resultRows = [];
        if (!terms.length) {
            const selected = this.list.get_selected_row();
            const page = (selected ? this.rowPages.get(selected) : undefined) ?? this.pages[0]?.page;
            if (page) this.select(page);
            return;
        }
        for (const {page, row: categoryRow} of this.pages) {
            const visit = (widget: Gtk.Widget): void => {
                if (widget !== page && !widget.visible) return;
                if (widget instanceof Adw.PreferencesRow) {
                    if (!widget.visible) return;
                    const haystack = `${page.title} ${widget.title} ${widget instanceof Adw.ActionRow ? widget.subtitle : ''}`.toLocaleLowerCase();
                    if (terms.every(term => haystack.includes(term))) {
                        const result = new Adw.ActionRow({title: widget.title, subtitle: page.title, use_markup: false, activatable: true});
                        result.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
                        result.connect('activated', () => {
                            this.search.text = '';
                            this.list.select_row(categoryRow);
                            this.select(page);
                            if (this.split.collapsed) this.split.show_sidebar = false;
                            widget.grab_focus();
                            // Scroll the matching setting into view even for rows
                            // whose interactive control, rather than row, takes focus.
                            let parent = widget.get_parent();
                            while (parent && !(parent instanceof Gtk.ScrolledWindow)) parent = parent.get_parent();
                            if (parent instanceof Gtk.ScrolledWindow && parent.get_child()) {
                                const [ok, bounds] = widget.compute_bounds(parent.get_child()!);
                                if (ok) {
                                    const adjustment = parent.vadjustment;
                                    adjustment.value = Math.max(adjustment.lower,
                                        Math.min(bounds.origin.y - 16, adjustment.upper - adjustment.page_size));
                                }
                            }
                        });
                        this.resultGroup.add(result);
                        this.resultRows.push(result);
                    }
                    return;
                }
                for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) visit(child);
            };
            visit(page);
        }
        this.resultGroup.title = this.resultRows.length ? `Search results (${this.resultRows.length})` : 'No matching settings';
        this.title.title = 'Search settings';
        this.stack.visible_child = this.results;
    }
}
