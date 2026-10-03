import {_, formatText, ngettext} from '../i18n.js';
import {PanelHover} from './panelHover.js';
import {WeatherApplet} from './weatherApplet.js';
import {performAppAction} from './appInteractions.js';
import {WorkspaceSwitcher} from './workspaceSwitcher.js';
import {LayoutTransition} from './layoutTransition.js';
import {RoundedSurface, TaskbarSurface, StageBackdropBlur} from './roundedSurface.js';
import {taskbarGeometry, reserveGeometry} from '../taskbar/geometry.js';
import {IconArtwork} from './iconArtwork.js';
import {StartMenuLauncher} from '../start-menu/launcher.js';
import {styleAppButton} from '../appbar/buttonStyle.js';
import {TaskbarSettings} from '../settings/settings.js';
import {appLabel} from './appLabel.js';
import {isNativeTrayPopup, watchNativeTrayPopups} from './tray/nativeMenu.js';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {AppAnimations} from './appAnimations.js';
import {SearchPanel} from './searchPanel.js';
import {AppTooltip} from './appTooltip.js';
import {TrayDrawer} from './trayDrawer.js';
import {AppStrip} from './appStrip.js';
import {revealInScroll} from './horizontalScroll.js';
import {BackdropRepaint} from './backdropRepaint.js';
import {NotificationBadges} from './notificationBadges.js';
import {OverviewBridge} from './overviewBridge.js';
import {usesWindowAppearance} from './windowAppearance.js';
import {rgbaColor, validColor} from './colors.js';
import {watchThemeColors, surfaceColor, surfaceText} from './themeColors.js';
import {IconColors} from './iconColors.js';
import {WindowAnimationBounds} from './windowAnimationBounds.js';
import {TaskbarVisibility} from './taskbarVisibility.js';
import {AppletEditor} from './appletEditor.js';
import {PanelBridge} from './panelBridge.js';
import {buildTasks} from './taskModel.js';
import {createTaskIcon} from './windowIcons.js';
import {WindowPreview} from './windowPreview.js';
import {TaskDrag} from './taskDrag.js';
import {TaskMenus} from './taskMenus.js';
import {Tray} from './tray/tray.js';

export default class TaskbarRuntime extends Extension {
    enable() {
        this._stopped = false;
        this._arcMenuActive = false;
        this._secondaryBars = [];
        this._surfaceKey = null;
        this._signals = [];
        this._settings = this._owner?._settings ?? new TaskbarSettings(this.getSettings());
        this._animations = new AppAnimations(this._settings);
        this._releaseThemeColors = watchThemeColors(() => this._updateSurface());
        this._windowAnimationBounds = this._secondary ? null : new WindowAnimationBounds();
        this._windowSignals = new Map();
        this._buttons = new Map();
        this._iconColors = new IconColors(() => this._updateIndicators());
        this._badges = new NotificationBadges(() => this._updateIndicators());
        this._favorites = AppFavorites.getAppFavorites();
        this._tracker = Shell.WindowTracker.get_default();
        this._bar = new TaskbarSurface({
            name: 'luna-taskbar', style_class: 'luna-taskbar', reactive: true,
            clip_to_allocation: true,
            accessible_name: _('Luna - Taskbar taskbar'),
            layout_manager: new Clutter.BinLayout(),
        });
        this._background = new St.Widget({style_class: 'luna-taskbar-surface',
            x_expand: true, y_expand: true});
        this._blur = new StageBackdropBlur({mode: Shell.BlurMode.BACKGROUND,
            radius: 12, brightness: 0.85});
        this._roundedSurface = new RoundedSurface();
        this._roundedSurface.liveBackdrop = this._blur;
        this._layoutTransition = new LayoutTransition(this._bar, geometry => {
            this._bar.set_position(geometry.x, geometry.y);
            this._bar.set_size(geometry.width, geometry.height);
            this._roundedSurface.update(geometry.width, geometry.height, geometry.corners);
            this._roundedContent?.update(geometry.width, geometry.height, geometry.corners);
            this._styleShowDesktop(geometry);
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            this._background.set_style(`background-color: ${this._surfaceColor}; border-radius: ${geometry.corners / scale}px;
                border-color: ${this._borderColor}; border-style: solid;
                border-top-width: ${geometry.borderTop}px; border-right-width: ${geometry.borderRight}px;
                border-bottom-width: ${geometry.borderBottom}px; border-left-width: ${geometry.borderLeft}px;`);
            this._backdropRepaint?.refresh();
        });
        this._background.add_effect_with_name('luna-taskbar-rounded', this._roundedSurface);
        this._background.add_effect_with_name('luna-taskbar-backdrop', this._blur);
        this._backdropRepaint = new BackdropRepaint(this._bar, this._blur);
        this._desktopBackground = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        this._connect(this._desktopBackground, 'changed', () => {
            // BACKGROUND blur caches the sampled framebuffer. Wallpaper
            // changes do not otherwise guarantee damage beneath the taskbar.
            this._backdropRepaint?.refresh();
        });
        this._content = new St.BoxLayout({style_class: 'luna-taskbar-content', clip_to_allocation: true,
            x_expand: true, y_expand: true});
        this._roundedContent = new RoundedSurface();
        // Keep BACKGROUND blur outside the content's offscreen mask so it
        // samples the desktop, not a resizing intermediate framebuffer.
        this._content.add_effect_with_name('luna-taskbar-rounded-content', this._roundedContent);
        this._bar.add_child(this._background);
        this._bar.add_child(this._content);
        this._bar.set_text_direction(Clutter.TextDirection.LTR);
        this._startMenu = new StartMenuLauncher(this._settings);
        const launcher = this._startMenu.actor;
        this._launcher = launcher;
        this._animations.bindButton(launcher, this._startMenu.icon);
        this._content.add_child(launcher);
        this._searchPanel = new SearchPanel(this._settings);
        this._syncSearchShortcut();
        this._searchButton = new St.Button({style_class: 'luna-taskbar-button luna-taskbar-search-button',
            can_focus: true, accessible_name: _('Search'), x_expand: false,
            visible: this._settings.get_boolean('show-search-button') && this._settings.get_boolean('search-panel-enabled'),
            child: new St.Icon({icon_name: 'edit-find-symbolic', icon_size: this._settings.get_int('app-icon-size')})});
        this._connect(this._searchPanel.actor, 'notify::visible', () => {
            if (this._searchPanel.actor.visible) this._searchButton.add_style_class_name('luna-taskbar-start-open');
            else this._searchButton.remove_style_class_name('luna-taskbar-start-open');
        });
        this._animations.bindButton(this._searchButton, this._searchButton.child);
        this._searchButton.connect('clicked', () => this._searchPanel.toggle());
        this._content.add_child(this._searchButton);
        this._updateLauncher();
        this._apps = new St.BoxLayout({style_class: 'luna-taskbar-apps'});
        this._apps.connect('destroy', () => {
            this._stopped = true;
            if (this._syncSource) GLib.Source.remove(this._syncSource);
            this._syncSource = 0;
        });
        this._appStrip = new AppStrip(this._apps, () => this._taskDrag,
            () => this._backdropRepaint?.refresh());
        this._taskScroll = this._appStrip.scroll;
        this._content.add_child(this._appStrip.actor);
        this._trayBox = new St.BoxLayout({style_class: 'luna-taskbar-tray', x_expand: false});
        this._systemBox = new St.BoxLayout({style_class: 'luna-taskbar-system', x_expand: false});
        this._systemBox.add_child(this._trayBox);
        this._content.add_child(this._systemBox);
        // Staging parent for panel additions; the editor places each block in the content row.
        this._systemBox.hide();
        this._showDesktopButton = new St.Button({
            style_class: 'luna-taskbar-show-desktop', can_focus: true,
            accessible_name: _('Show desktop'), button_mask: St.ButtonMask.PRIMARY,
            // The divider expands inside the button, not across the taskbar.
            x_expand: false,
            y_expand: true, y_align: Clutter.ActorAlign.FILL,
            child: new St.Widget({
                style_class: 'luna-taskbar-show-desktop-divider',
                reactive: false, x_expand: true, y_expand: true,
                x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.FILL,
            }),
        });
        this._showDesktopButton.connect('clicked', () => this._toggleDesktop());
        this._content.add_child(this._showDesktopButton);
        Main.layoutManager.addChrome(this._bar, {affectsStruts: true});
        Main.ctrlAltTabManager.addGroup(this._bar, 'Luna - Taskbar', 'view-app-grid-symbolic');
        this._panelBridge = this._secondary ? {_records: new Map(), closeMenus() {}, destroy() {}}
            : new PanelBridge(this._trayBox, this._systemBox, this._settings, this._launcher, active => {
                this._arcMenuActive = active;
                this._updateLauncher();
            }, () => this._syncVisibility());
        this._tray = this._secondary ? {closeMenus() {}, destroy() {}}
            : new Tray(this._trayBox, this.getLogger(), this._settings, () => this._trayDrawer);
        this._trayDrawer = this._secondary ? null : new TrayDrawer(this._trayBox, this._settings, this._panelBridge._menuManager);
        this._preview = new WindowPreview(this._bar, this._settings,
            (window, x, y) => this._taskMenus.openWindow(window, x, y));
        this._tooltip = new AppTooltip(this._bar, () => this._preview.actor.visible ||
            this._taskMenus?.menu?.isOpen || this._taskDrag?.dragging || this._appletEditor?.active);
        this._connect(this._preview.actor, 'notify::visible', () => {
            if (this._preview.actor.visible)
                this._tooltip.hide();
        });
        this._overviewBridge = this._secondary ? null : new OverviewBridge(this._settings, this._bar);
        this._taskMenus = new TaskMenus(this._bar, this._settings, () => {
            this._tooltip.hide();
            this._preview.hide();
            this._panelBridge.closeMenus();
            this._tray.closeMenus(); this._trayDrawer?.close();
        }, () => this.openPreferences(), () => this._toggleDesktop(), () => (this._owner ?? this)._appletEditor.start());
        this._panelHover = new PanelHover(this._bar, () =>
            !(this._owner ?? this)._appletEditor?.active && (
                this._searchPanel.actor.visible || this._weather?.menu.isOpen || this._trayDrawer?.menu.isOpen ||
                this._taskMenus.menu?.isOpen || [...this._panelBridge._records.values()].some(r =>
                    r.indicator.menu?.isOpen || r.indicator.arcMenu?.isOpen || r.indicator.arcMenuContextMenu?.isOpen)),
            () => this._searchPanel.actor);
        this._workspaceSwitcher = new WorkspaceSwitcher(this._bar, this._settings, () => (this._owner ?? this)._appletEditor?.active);
        this._content.add_child(this._workspaceSwitcher.actor);
        this._weather = this._secondary ? null : new WeatherApplet(this._settings, this._panelBridge._menuManager,
            () => this.openPreferences(), () => (this._owner ?? this)._appletEditor?.active, () => this._panelBridge._systemPanel);
        if (this._weather) {
            this._content.add_child(this._weather.actor);
            this._panelBridge.weatherApplet = this._weather;
        }
        this._appletEditor = new AppletEditor(this._content, this._settings, () => [
            {id: 'overview', label: this._arcMenuActive ? _('Overview') : _('Start'), actor: this._launcher},
            {id: 'search', label: _('Search'), actor: this._searchButton},
            ...(this._weather ? [{id: 'weather', label: _('Weather'), actor: this._weather.actor, system: true}] : []),
            {id: 'workspaces', label: _('Workspaces'), actor: this._workspaceSwitcher.actor},
            {id: 'appbar', label: _('App bar'), actor: this._appStrip.actor},
            ...(this._trayDrawer ? [{id: 'tray', label: _('Application tray'), actor: this._trayDrawer.actor, system: true}] : []),
            ...[...this._panelBridge._records.values()]
                .filter(record => !record.isTray &&
                    !(record.role === 'dateMenu' && this._panelBridge._systemPanel?._combinedButton))
                .map(record => ({id: record.role, actor: record.actor, system: record.role !== 'ArcMenu',
                    label: {ArcMenu: 'ArcMenu', dateMenu: _('Clock'), quickSettings: this._panelBridge._systemPanel?._combinedButton ? _('System and clock') : _('System controls'),
                        screenSharing: _('Screen sharing'), screenRecording: _('Screen recording')}[record.role] ?? record.role})),
            {id: 'showDesktop', label: _('Show desktop'), actor: this._showDesktopButton},
        ], () => {
            this._preview.hide();
            this._weather?.menu.close();
            this._taskMenus.menu?.close();
            this._panelBridge.closeMenus();
            this._tray.closeMenus(); this._trayDrawer?.close();
        }, () => this._backdropRepaint?.refresh(), [this._systemBox]);
        this._bar.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== 3)
                return Clutter.EVENT_PROPAGATE;
            if ((this._owner ?? this)._appletEditor?.active)
                return Clutter.EVENT_STOP;
            const target = global.stage.get_event_actor(event);
            if (this._trayBox.contains(target) || this._systemBox.contains(target) ||
                [...this._panelBridge._records.values()].some(record => record.actor.contains(target)) ||
                [...this._buttons.values()].some(({button}) => button.contains(target)))
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = event.get_coords();
            this._taskMenus.openBar(x, y);
            return Clutter.EVENT_STOP;
        });
        this._connect(this._settings, 'changed', (_settings, key) => {
            if (['separate-applet-panels', 'unified-system-panel'].includes(key)) this._appletEditor?.applyOrder();
            if (key === 'taskbar-position') this._appletEditor?.stop();
            if (key.startsWith('monitor-')) {
                if (!this._secondary)
                    this._syncMonitorBars();
                this._queueSync();
                this._position();
            }
            this._updateLauncher();
            this._searchButton.visible = this._settings.get_boolean('show-search-button') && this._settings.get_boolean('search-panel-enabled');
            if (key === 'search-panel-enabled') {
                this._syncSearchShortcut();
                if (!this._settings.get_boolean(key)) this._searchPanel.close();
            }
            if (key === 'show-search-button' && !this._searchButton.visible) this._searchPanel.close();
            if (key.startsWith('taskbar-') || key.startsWith('window-appearance-') || key.startsWith('app-') || ['taskbar-height', 'launcher-size', 'launcher-padding', 'tray-icon-size', 'tray-text-size'].includes(key)) {
                for (const {button} of this._buttons.values())
                    this._styleTask(button);
                this._position();
            }
            this._updateSurface();
            this._apps.set_style(`spacing: ${this._settings.get_int('app-spacing')}px;`);
            this._trayBox.set_style(`spacing: ${this._settings.get_int('tray-spacing')}px;`);
            this._systemBox.set_style(`spacing: ${this._settings.get_int('applet-spacing')}px;`);
            this._showDesktopButton.visible = this._settings.get_boolean('show-desktop-button');
            if (key.startsWith('app-') || key === 'taskbar-height' || ['notification-badges', 'running-indicators', 'indicator-color-mode', 'indicator-color'].includes(key))
                this._updateIndicators();
            if (!this._settings.get_boolean('show-previews'))
                this._preview.hide();
        });
        this._updateSurface();
        this._taskDrag = new TaskDrag(this._apps, this._favorites, this._buttons,
            () => this._queueSync(), () => {
                this._tooltip.hide();
                this._preview.hide();
                this._taskMenus.close();
                this._appStrip.beginDrag();
            }, () => this._backdropRepaint?.refresh());
        this._connect(Main.layoutManager, 'monitors-changed', () => {
            if (!this._secondary)
                this._syncMonitorBars();
            this._position();
            this._queueSync();
        });
        this._connect(St.ThemeContext.get_for_stage(global.stage),
            'notify::scale-factor', () => this._position());
        this._connect(this._favorites, 'changed', () => this._queueSync());
        this._connect(Shell.AppSystem.get_default(), 'installed-changed', () => this._queueSync());
        this._connect(this._tracker, 'tracked-windows-changed', () => this._queueSync());
        this._connect(global.display, 'window-created', () => this._queueSync());
        this._unwatchTrayPopups = watchNativeTrayPopups(() => this._queueSync());
        this._connect(global.display, 'notify::focus-window', () => {
            this._updateIndicators();
            this._revealFocusedApp();
        });
        this._connect(Main.overview, 'showing', () => {
            // Keep the taskbar on BACKGROUND blur during Overview. The
            // framebuffer is the authoritative source for what is actually
            // behind the taskbar; the old wallpaper copy could drift in
            // scale/position while Overview was animating.
            this._updateSurface();
            this._launcher.add_style_class_name('luna-taskbar-start-open');
            this._syncVisibility();
        });
        this._connect(Main.overview, 'hiding', () => this._launcher.remove_style_class_name('luna-taskbar-start-open'));
        if (Main.overview.visible) this._launcher.add_style_class_name('luna-taskbar-start-open');
        this._connect(Main.overview, 'hidden', () => {
            this._updateSurface();
            this._syncVisibility();
        });
        this._connect(global.display, 'window-demands-attention', () => this._updateIndicators());
        this._connect(global.display, 'window-marked-urgent', () => this._updateIndicators());
        this._connect(global.display, 'in-fullscreen-changed', () => this._syncVisibility());
        this._apps.set_style(`spacing: ${this._settings.get_int('app-spacing')}px;`);
        this._trayBox.set_style(`spacing: ${this._settings.get_int('tray-spacing')}px;`);
        this._systemBox.set_style(`spacing: ${this._settings.get_int('applet-spacing')}px;`);
        this._showDesktopButton.visible = this._settings.get_boolean('show-desktop-button');
        this._visibility = new TaskbarVisibility(this._bar, this._settings, () => this._monitor(),
            () => this._preview.actor.visible || this._taskMenus.menu?.isOpen || this._taskDrag.dragging ||
                this._appletEditor?.active || this._weather?.menu.isOpen || this._trayDrawer?.menu.isOpen || [...this._panelBridge._records.values()].some(r => (r.indicator.menu?.isOpen || r.indicator.arcMenu?.isOpen || r.indicator.arcMenuContextMenu?.isOpen)) ||
                [...(this._tray._modern?.items?.values() ?? [])].some(item => item.remoteMenu?.menu?.isOpen),
            () => { this._preview.hide(); this._panelBridge.closeMenus(); this._tray.closeMenus(); this._trayDrawer?.close(); },
            windows => this._updateSurface(windows),
            () => [...this._panelBridge._records.values()].some(r => r.role === 'ArcMenu' &&
                (r.indicator.arcMenu?.isOpen || r.indicator.arcMenuContextMenu?.isOpen)));
        this._iconArtwork = new IconArtwork(this._bar, this._trayDrawer?.menu.actor);
        this._position();
        this._syncTasks();
        if (!this._secondary)
            this._syncMonitorBars();
    }

    _monitor() {
        if (this._secondary)
            return Main.layoutManager.monitors[this._monitorIndex];
        if (this._settings.get_string('monitor-mode') === 'specific') {
            const connector = this._settings.get_string('monitor-connector');
            const index = connector ? global.backend.get_monitor_manager().get_monitor_for_connector(connector)
                : this._settings.get_int('monitor-index');
            return Main.layoutManager.monitors[index] ?? Main.layoutManager.primaryMonitor;
        }
        return Main.layoutManager.primaryMonitor;
    }

    getDesktopWorkArea(index, work) {
        const bar = [this, ...this._secondaryBars].find(candidate => candidate._monitor()?.index === index);
        if (!bar || this._settings.get_string('visibility-mode') !== 'always') return work;
        const monitor = bar._monitor();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const edge = this._settings.get_string('taskbar-position');
        // Keep room for either layout even while attached, so toggling floating
        // or entering the adaptive layout cannot recenter the desktop grid.
        const gap = Math.max(this._settings.get_int('taskbar-edge-gap'),
            this._settings.get_string('window-appearance-layout') === 'floating'
                ? this._settings.get_int('window-appearance-edge-gap') : 0) * scale;
        const bounds = taskbarGeometry(monitor, edge, this._settings.get_int('taskbar-height') * scale, true, gap, 0);
        const reserve = reserveGeometry(monitor, bounds, edge);
        const x = edge === 'left' ? Math.max(work.x, reserve.x + reserve.width) : work.x;
        const y = edge === 'top' ? Math.max(work.y, reserve.y + reserve.height) : work.y;
        const right = edge === 'right' ? Math.min(work.x + work.width, reserve.x) : work.x + work.width;
        const bottom = edge === 'bottom' ? Math.min(work.y + work.height, reserve.y) : work.y + work.height;
        return {x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y)};
    }

    _syncMonitorBars() {
        for (const child of this._secondaryBars)
            child.disable();
        this._secondaryBars = [];
        if (this._settings.get_string('monitor-mode') !== 'all')
            return;
        for (const monitor of Main.layoutManager.monitors) {
            if (monitor.index === Main.layoutManager.primaryIndex)
                continue;
            const child = Object.create(Object.getPrototypeOf(this));
            child._secondary = true;
            child._owner = this;
            child._monitorIndex = monitor.index;
            child.getSettings = () => this._settings;
            child.openPreferences = () => this.openPreferences();
            child.enable();
            this._secondaryBars.push(child);
        }
    }

    _syncSearchShortcut() {
        if (this._secondary) return;
        if (this._searchShortcutRegistered) Main.wm.removeKeybinding('search-shortcut');
        this._searchShortcutRegistered = this._settings.get_boolean('search-panel-enabled');
        if (this._searchShortcutRegistered)
            Main.wm.addKeybinding('search-shortcut', this._settings.raw, Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, () => this._searchPanel.toggle());
    }

    _toggleDesktop() {
        Main.overview.hide();
        this._preview?.hide();
        this._taskMenus?.menu?.close();
        this._panelBridge.closeMenus();
        this._tray.closeMenus(); this._trayDrawer?.close();
        const workspace = global.workspace_manager.get_active_workspace();
        const live = new Set(workspace.list_windows());
        if (this._desktopRestore?.workspace === workspace) {
            for (const window of this._desktopRestore.windows) {
                if (live.has(window))
                    window.unminimize();
            }
            const focused = this._desktopRestore.focused;
            this._desktopRestore = null;
            if (live.has(focused))
                Main.activateWindow(focused);
            this._showDesktopButton.accessible_name = _('Show desktop');
            return;
        }
        const windows = [...live].filter(window =>
            !window.skip_taskbar && !window.minimized && window.can_minimize());
        this._desktopRestore = windows.length ? {
            workspace, windows, focused: global.display.focus_window,
        } : null;
        for (const window of windows)
            window.minimize();
        this._showDesktopButton.accessible_name = windows.length ? _('Restore windows') : _('Show desktop');
    }

    _updateLauncher() {
        this._startMenu.update(this._arcMenuActive);
        if (this._searchButton)
            this._styleAppButton(this._searchButton, this._searchButton.child, 'search-icon-size');
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _styleShowDesktop(geometry) {
        if (!this._showDesktopButton) return;
        const vertical = ['left', 'right'].includes(this._bar._lunaEdge);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const radius = Math.min(geometry.corners, geometry.width / 2, geometry.height / 2) / scale;
        const children = this._content.get_children().filter(actor => actor.visible);
        const first = children[0] === this._showDesktopButton;
        const last = children.at(-1) === this._showDesktopButton;
        const before = first ? 0 : this._settings.get_int('show-desktop-margin');
        // The rounded cap belongs to the hit target, not to an empty margin.
        const width = Math.max(this._settings.get_int('show-desktop-width'), first || last ? radius : 0);
        this._showDesktopButton.set_style(vertical
            ? `height: ${width}px; margin: ${before}px 0 0 0;`
            : `width: ${width}px; margin: 0 0 0 ${before}px;`);
        this._showDesktopButton.x_expand = vertical;
        this._showDesktopButton.y_expand = !vertical;
        const divider = this._showDesktopButton.child;
        // BinLayout honors the child's alignment only on expanding axes.
        // Request both axes, then align the thin divider to the inner edge.
        divider.x_expand = true;
        divider.y_expand = true;
        divider.x_align = vertical ? Clutter.ActorAlign.FILL : first ? Clutter.ActorAlign.END : Clutter.ActorAlign.START;
        divider.y_align = vertical ? (first ? Clutter.ActorAlign.END : Clutter.ActorAlign.START) : Clutter.ActorAlign.FILL;
        divider.set_style(vertical
            ? `height: 1px; width: ${geometry.width / scale}px; margin: 0;`
            : `width: 1px; height: ${geometry.height / scale}px; margin: 0;`);
    }

    _updateSurface(windows = null) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const monitor = this._monitor();
        if (!monitor) return;
        const edge = this._settings.get_string('taskbar-position');
        const base = taskbarGeometry(monitor, edge, this._settings.get_int('taskbar-height') * scale,
            this._settings.get_boolean('taskbar-floating'), this._settings.get_int('taskbar-edge-gap') * scale,
            this._settings.get_int('taskbar-end-gap') * scale);
        const mode = this._settings.get_string('window-appearance-mode');
        // Group membership also covers tiles using the optional maximized styling.
        // Read live membership so unsnapping or disabling Desktop clears the exclusion.
        const groups = Main.extensionManager.lookup('luna-desktop@wuild')?.stateObj?.snapping?.groups;
        const snapped = new Set();
        for (const group of groups ?? [])
            for (const window of group.windows.values()) snapped.add(window);
        const candidates = mode !== 'disabled' && !Main.overview.visible
            ? (windows ?? global.workspace_manager.get_active_workspace().list_windows()).map(window => ({
                minimized: window.minimized, skipTaskbar: window.skip_taskbar || window.is_override_redirect(),
                snapped: snapped.has(window), monitor: window.get_monitor(), maximized: window.is_maximized(), frame: window.get_frame_rect(),
            })) : [];
        const alternate = usesWindowAppearance(mode, candidates,
            base,
            this._settings.get_int('window-appearance-distance') * scale, monitor?.index, edge);
        this._windowAppearanceActive = alternate;
        const layout = alternate ? this._settings.get_string('window-appearance-layout') : 'inherit';
        const geometry = layout === 'inherit' ? base : taskbarGeometry(monitor, edge,
            this._settings.get_int('taskbar-height') * scale, layout === 'floating',
            this._settings.get_int('window-appearance-edge-gap') * scale,
            this._settings.get_int('window-appearance-end-gap') * scale);
        const corners = this._settings.get_int(layout === 'inherit' ? 'taskbar-corner-radius' : 'window-appearance-corner-radius');
        const vertical = edge === 'left' || edge === 'right';
        this._bar._lunaEdge = edge;
        if (vertical) this._bar.add_style_class_name('luna-taskbar-vertical');
        else this._bar.remove_style_class_name('luna-taskbar-vertical');
        const startPadding = this._settings.get_int('taskbar-start-padding');
        const endPadding = this._settings.get_int('taskbar-end-padding');
        this._content.set_style(vertical
            ? `padding: ${startPadding}px 0 ${endPadding}px 0;`
            : `padding: 0 ${endPadding}px 0 ${startPadding}px;`);
        this._content.orientation = vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
        this._appStrip.setVertical(vertical);
        for (const child of this._content.get_children())
            child.x_align = vertical && child !== this._showDesktopButton ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL;
        this._trayBox.orientation = this._content.orientation;
        if (this._trayDrawer) this._trayDrawer.actor.orientation = this._content.orientation;
        this._panelBridge?.setEdge?.(edge);
        this._trayDrawer?.menu._boxPointer.updateArrowSide(St.Side[edge.toUpperCase()]);
        const combined = this._panelBridge?._systemPanel?._combinedButton;
        const quick = Main.panel.statusArea.quickSettings;
        if (quick?._indicators) {
            quick._indicators.orientation = this._content.orientation;
            for (const child of quick._indicators.get_children())
                child.x_align = vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL;
        }
        if (combined && quick?.get_first_child() instanceof St.BoxLayout)
            quick.get_first_child().orientation = this._content.orientation;
        const prefix = alternate ? 'window-appearance' : 'taskbar';
        const radius = this._settings.get_int(`${prefix}-blur-radius`) * scale;
        const enabled = this._settings.get_boolean(alternate ? 'window-appearance-blur' : 'enable-blur') && radius > 0;
        const color = surfaceColor(this._settings, prefix, 'taskbar', this._settings.get_int(`${prefix}-opacity`) / 100);
        const textColor = surfaceText('taskbar');
        const opacity = this._settings.get_int(`${prefix}-opacity`) / 100;
        // Always sample the live stage behind the taskbar, including while
        // Overview is showing. Rendering a second wallpaper actor here
        // produces a cropped, stale approximation during the transition.
        const nativeBlur = enabled;
        const surfaceKey = `${radius}:${nativeBlur}:${color}:${opacity}:${textColor}:${corners}`;
        if (surfaceKey !== this._surfaceKey) {
            this._surfaceKey = surfaceKey;
            this._blur.radius = radius;
            this._blur.enabled = nativeBlur;
            this._bar.set_style(`color: ${textColor};`);
            this._backdropRepaint?.refresh();
        }
        this._surfaceColor = color;
        this._borderColor = rgbaColor(this._settings.get_string('taskbar-border-color'),
            this._settings.get_int('taskbar-border-opacity') / 100, '#808080');
        const floating = layout === 'inherit' ? this._settings.get_boolean('taskbar-floating') : layout === 'floating';
        const border = this._settings.get_boolean('taskbar-border-enabled') ? this._settings.get_int('taskbar-border-width') : 0;
        this._layoutTransition.update({...geometry, corners: corners * scale,
            borderTop: floating || edge === 'bottom' ? border : 0,
            borderRight: floating || edge === 'left' ? border : 0,
            borderBottom: floating || edge === 'top' ? border : 0,
            borderLeft: floating || edge === 'right' ? border : 0},
            `${edge}:${monitor.x}:${monitor.y}:${monitor.width}:${monitor.height}:${scale}`);
        // Reserve the final layout immediately; intermediate animation frames
        // must not repeatedly resize maximized windows or feed adaptive layout.
        return geometry;
    }

    _position() {
        this._updateSurface();
        this._syncVisibility();
    }

    _syncVisibility() {
        this._visibility?.sync();
    }

    _queueSync() {
        if (this._stopped || this._syncSource)
            return;
        this._syncSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._syncSource = 0;
            this._syncTasks();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncTasks() {
        if (this._stopped || this._taskDrag?.dragging)
            return;
        const allWindows = global.display.list_all_windows();
        const live = new Set(allWindows);
        for (const [window, ids] of this._windowSignals) {
            if (!live.has(window)) {
                ids.forEach(id => window.disconnect(id));
                this._windowSignals.delete(window);
            }
        }
        for (const window of allWindows) {
            if (this._windowSignals.has(window))
                continue;
            this._windowSignals.set(window, [
                window.connect('unmanaged', () => {
                    const ids = this._windowSignals.get(window) ?? [];
                    ids.forEach(id => window.disconnect(id));
                    this._windowSignals.delete(window);
                    this._queueSync();
                }),
                window.connect('position-changed', () => {
                    this._backdropRepaint.refresh();
                    this._queueSync();
                }),
                window.connect('size-changed', () => this._backdropRepaint.refresh()),
                window.connect('notify::skip-taskbar', () => this._queueSync()),
                window.connect('notify::wm-class', () => this._queueSync()),
                window.connect('notify::gtk-application-id', () => this._queueSync()),
                window.connect('notify::title', () => this._updateIndicators()),
                window.connect('notify::urgent', () => this._updateIndicators()),
                window.connect('notify::demands-attention', () => this._updateIndicators()),
                window.connect('notify::minimized', () => this._updateIndicators()),
            ]);
        }
        const localWindows = this._settings.get_boolean('monitor-local-windows') &&
            this._settings.get_string('monitor-mode') === 'all' && Main.layoutManager.monitors.length > 1;
        const windows = allWindows.filter(window =>
            (!localWindows || window.get_monitor() === this._monitor()?.index) &&
            !window.skip_taskbar &&
            !window.is_override_redirect() && !isNativeTrayPopup(window) &&
            ![Meta.WindowType.DESKTOP, Meta.WindowType.DOCK, Meta.WindowType.MENU,
                Meta.WindowType.POPUP_MENU, Meta.WindowType.DROPDOWN_MENU].includes(window.get_window_type()))
            .sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
        const tasks = buildTasks(this._favorites.getFavorites(), this._taskDrag.sortWindows(windows),
            window => this._tracker.get_window_app(window));
        const keys = new Set(tasks.map(task => task.key));
        for (const [key, record] of this._buttons) {
            if (!keys.has(key)) {
                this._preview?.forget(record.button);
                this._tooltip?.forget(record.button);
                this._animations.close(record.button);
                this._buttons.delete(key);
            }
        }
        tasks.forEach((task, index) => {
            let record = this._buttons.get(task.key);
            if (record && record.app !== task.app) {
                record.button.destroy();
                this._buttons.delete(task.key);
                record = null;
            }
            if (!record) {
                record = this._createTask(task);
                this._buttons.set(task.key, record);
                this._apps.add_child(record.button);
                this._animations.appear(record.button);
            }
            // Preserve the button and its open preview as group membership changes.
            record.window = task.window;
            record.windows = task.windows;
            this._apps.set_child_at_index(record.button, index);
        });
        this._updateIndicators();
        this._revealFocusedApp();
    }

    _revealFocusedApp() {
        const focused = global.display.focus_window;
        if (focused === this._revealedWindow)
            return;
        const record = [...this._buttons.values()].find(task => task.windows.includes(focused));
        this._revealedWindow = record ? focused : null;
        if (record)
            this._appStrip.reveal(record.button);
    }

    _styleTask(button) {
        this._styleAppButton(button, button.child.get_first_child());
    }

    _styleAppButton(button, icon, sizeKey = 'app-icon-size') {
        styleAppButton(this._settings, button, icon, sizeKey);
    }

    _positionBadge(button) {
        const content = button.child;
        const icon = content.get_first_child();
        const badge = content.get_last_child();
        if (!badge.visible || !content.has_allocation() || !badge.has_allocation()) return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const right = button.width - content.x - badge.width - 2 * scale;
        badge.translation_x = Math.max(0, Math.min(right, icon.x + icon.width - badge.width / 2));
        badge.translation_y = Math.max(2 * scale - content.y, icon.y - Math.min(4 * scale, badge.height / 3));
    }

    _createTask(task) {
        const {app, window, windows} = task;
        const content = new St.Widget({
            layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true,
        });
        const icon = createTaskIcon(app, window);
        icon.x_align = Clutter.ActorAlign.CENTER;
        icon.y_align = Clutter.ActorAlign.CENTER;
        icon.x_expand = icon.y_expand = true;
        icon.connect('notify::gicon', () => this._updateIndicators());
        icon.connect('notify::icon-name', () => this._updateIndicators());
        content.add_child(icon);
        const indicator = new St.BoxLayout({
            style_class: 'luna-taskbar-indicators', x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END, x_expand: true, y_expand: true,
            opacity: windows.length ? 255 : 0,
        });
        for (let i = 0; i < Math.max(1, Math.min(3, windows.length)); i++)
            indicator.add_child(new St.Widget({style_class: 'luna-taskbar-indicator'}));
        content.add_child(indicator);
        const badge = new St.Bin({
            style_class: 'luna-taskbar-notification-badge', visible: false,
            child: new St.Label({style_class: 'luna-taskbar-notification-badge-label',
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER}),
            x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.START,
            x_expand: true, y_expand: true,
        });
        content.add_child(badge);
        const button = new St.Button({
            style_class: 'luna-taskbar-button', can_focus: true, x_expand: false, clip_to_allocation: true,
            button_mask: St.ButtonMask.PRIMARY | St.ButtonMask.MIDDLE | St.ButtonMask.SECONDARY, child: content,
            track_hover: true,
        });
        content.connect('notify::allocation', () => this._positionBadge(button));
        badge.connect('notify::allocation', () => this._positionBadge(button));
        button.connect('key-focus-in', () => revealInScroll(this._taskScroll, button));
        button.connect('notify::allocation', () => {
            if (task.windows.some(candidate => candidate.has_focus()))
                this._appStrip?.reveal(button);
        });
        button.connect('button-press-event', () => {
            this._tooltip.hide();
            this._preview.hide();
            return Clutter.EVENT_PROPAGATE;
        });
        this._animations.bindButton(button, icon);
        button.connect('enter-event', () => {
            this._tooltip.schedule(task, button);
            if (!this._taskDrag.dragging && !this._taskMenus.menu?.isOpen &&
                this._settings.get_boolean('show-previews'))
                this._preview.schedule(task, button);
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('leave-event', () => {
            this._tooltip.hide();
            this._preview.hideLater();
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('destroy', () => {
            if (this._buttons?.get(task.key)?.button === button)
                this._buttons.delete(task.key);
            this._preview?.forget(button);
            this._tooltip?.forget(button);
        });
        button.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Menu ||
                (event.get_key_symbol() === Clutter.KEY_F10 &&
                 (event.get_state() & Clutter.ModifierType.SHIFT_MASK))) {
                this._taskMenus.openTask(task, button);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        const perform = (action, direction = 1) => {
            if ((this._owner ?? this)._appletEditor?.active || this._taskDrag.dragging) return;
            this._tooltip.hide();
            this._preview.hide();
            performAppAction(action, task, {
                menu: () => this._taskMenus.openTask(task, button),
                previews: windows => this._preview.showMany(windows.map(window => ({app, window})), button),
                activate: window => Main.activateWindow(window),
                launch: newWindow => {
                    if (!app || (newWindow && !app.can_open_new_window())) return;
                    if (newWindow) app.open_new_window(-1);
                    else app.activate();
                },
            }, direction);
        };
        button.connect('clicked', (_button, mouseButton) => {
            const shift = global.get_pointer()[2] & Clutter.ModifierType.SHIFT_MASK;
            const key = mouseButton === 3 ? 'app-right-click-action'
                : mouseButton === 2 ? 'app-middle-click-action'
                : shift ? 'app-shift-click-action' : 'app-click-action';
            perform(this._settings.get_string(key));
        });
        let scrollDelta = 0;
        let lastScroll = 0;
        button.connect('scroll-event', (_actor, event) => {
            if ((this._owner ?? this)._appletEditor?.active) return Clutter.EVENT_STOP;
            const action = this._settings.get_string('app-scroll-action');
            if (action === 'strip') {
                this._taskScroll.emit('scroll-event', event);
                return Clutter.EVENT_STOP;
            }
            if (action === 'none') return Clutter.EVENT_STOP;
            const direction = event.get_scroll_direction();
            let step = 0;
            if (direction === Clutter.ScrollDirection.SMOOTH) {
                const [dx, dy] = event.get_scroll_delta();
                const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
                if (Math.sign(delta) !== Math.sign(scrollDelta)) scrollDelta = 0;
                scrollDelta += delta;
                if (Math.abs(scrollDelta) >= 1) { step = Math.sign(scrollDelta); scrollDelta = 0; }
            } else step = [Clutter.ScrollDirection.UP, Clutter.ScrollDirection.LEFT].includes(direction) ? -1 : 1;
            const now = GLib.get_monotonic_time() / 1000;
            if (step && now - lastScroll > 220) {
                lastScroll = now;
                if (action === 'workspaces') this._workspaceSwitcher.move(step);
                else if (task.windows.length) perform('cycle', step);
            }
            return Clutter.EVENT_STOP;
        });
        this._styleTask(button);
        this._taskDrag.attach(task, button);
        return Object.assign(task, {button, indicator, badge});
    }

    _updateIndicators() {
        for (const {window, windows, app, button, indicator, badge} of this._buttons.values()) {
            const focused = windows.some(candidate => candidate.appears_focused);
            button.accessible_name = windows.length > 1
                ? formatText(ngettext('%s — %d window', '%s — %d windows', windows.length), appLabel(app, window), windows.length)
                : window?.get_title() || app?.get_name() || _('Window');
            const enabled = this._settings.get_boolean('notification-badges');
            const state = enabled ? this._badges?.getState(app) : null;
            const count = state?.count ?? 0;
            const urgent = enabled && (state?.urgent || windows.some(candidate => candidate.urgent || candidate.demands_attention));
            badge.visible = count > 0 || !!urgent;
            badge.child.text = count > 99 ? '99+' : count > 0 ? String(count) : '';
            badge.child.visible = count > 0;
            if (count > 0) badge.remove_style_class_name('attention-dot');
            else badge.add_style_class_name('attention-dot');
            this._positionBadge(button);
            if (count)
                button.accessible_name += `, ${count} notifications`;
            else if (urgent) button.accessible_name += ', needs attention';
            for (const actor of [button, indicator]) {
                if (focused)
                    actor.add_style_class_name('focused');
                else
                    actor.remove_style_class_name('focused');
            }
            const indicatorCount = Math.max(1, Math.min(3, windows.length));
            while (indicator.get_n_children() > indicatorCount)
                indicator.get_last_child().destroy();
            while (indicator.get_n_children() < indicatorCount)
                indicator.add_child(new St.Widget({style_class: 'luna-taskbar-indicator'}));
            const mode = this._settings.get_string('indicator-color-mode');
            const custom = validColor(this._settings.get_string('indicator-color'));
            const color = mode === 'app' ? this._iconColors.get(button.child.get_first_child()) ?? custom
                : mode === 'custom' ? custom : null;
            const width = this._settings.get_int('app-button-width');
            const height = this._settings.get_int('taskbar-height');
            const padding = Math.min(this._settings.get_int('app-padding'),
                Math.max(0, (Math.min(height, width) - 3) / 2));
            const available = Math.max(1, Math.min(28, width - 2 * padding - 2));
            const gap = indicatorCount > 1 ? Math.min(2, available / (indicatorCount * 3)) : 0;
            const weights = indicator.get_children().map((_segment, index) =>
                (index === 2 ? windows.slice(2) : windows.slice(index, index + 1))
                    .some(candidate => candidate.appears_focused) ? 16 : 8);
            const factor = Math.min(1, (available - gap * (indicatorCount - 1)) /
                weights.reduce((sum, value) => sum + value, 0));
            indicator.set_style(`spacing: ${gap}px;`);
            indicator.get_children().forEach((segment, index) => {
                const segmentWidth = weights[index] * factor;
                segment.set_style(`width: ${segmentWidth}px; min-width: ${segmentWidth}px; max-width: ${segmentWidth}px;${color ? ` background-color: ${color};` : ''}`);
                const represented = index === 2 ? windows.slice(2) : windows.slice(index, index + 1);
                if (represented.some(candidate => candidate.appears_focused))
                    segment.add_style_class_name('focused');
                else
                    segment.remove_style_class_name('focused');
            });
            indicator.opacity = this._settings.get_boolean('running-indicators') && windows.length ? (windows.every(candidate => candidate.minimized) ? 110 : 255) : 0;
        }
    }

    disable() {
        this._panelHover?.destroy();
        this._panelHover = null;
        if (this._panelBridge) this._panelBridge.weatherApplet = null;
        this._weather?.destroy();
        this._weather = null;
        this._unwatchTrayPopups?.();
        this._unwatchTrayPopups = null;
        if (this._searchShortcutRegistered) Main.wm.removeKeybinding('search-shortcut');
        this._searchShortcutRegistered = false;
        this._stopped = true;
        for (const child of this._secondaryBars ?? [])
            child.disable();
        this._secondaryBars = [];
        this._windowAnimationBounds?.destroy();
        this._windowAnimationBounds = null;
        this._iconArtwork?.destroy();
        this._iconArtwork = null;
        this._layoutTransition?.destroy();
        this._layoutTransition = null;
        this._visibility?.destroy();
        this._visibility = null;
        if (this._syncSource)
            GLib.Source.remove(this._syncSource);
        this._syncSource = 0;
        for (const [object, id] of this._signals ?? [])
            object.disconnect(id);
        for (const [window, ids] of this._windowSignals ?? [])
            ids.forEach(id => window.disconnect(id));
        this._signals = [];
        this._windowSignals?.clear();
        this._searchPanel?.destroy();
        this._searchPanel = null;
        this._overviewBridge?.destroy();
        this._overviewBridge = null;
        this._desktopRestore = null;
        this._backdropRepaint?.destroy();
        this._backdropRepaint = null;
        this._iconColors?.destroy();
        this._iconColors = null;
        this._badges?.destroy();
        this._badges = null;
        this._appStrip?.destroy();
        this._appStrip = null;
        this._taskDrag?.destroy();
        this._taskDrag = null;
        this._taskMenus?.destroy();
        this._tooltip?.destroy();
        this._tooltip = null;
        this._preview?.destroy();
        this._preview = this._taskMenus = null;
        this._appletEditor?.destroy();
        this._workspaceSwitcher?.destroy();
        this._appletEditor = null;
        this._trayDrawer?.destroy();
        this._trayDrawer = null;
        this._tray?.destroy();
        this._panelBridge?.destroy();
        if (this._bar) {
            Main.ctrlAltTabManager.removeGroup(this._bar);
            Main.layoutManager.removeChrome(this._bar);
            this._bar.destroy();
        }
        this._buttons?.clear();
        this._tray = this._panelBridge = this._bar = this._apps = null;
        this._trayBox = this._systemBox = this._favorites = this._tracker = null;
        this._background = this._content = this._blur = null;
        this._desktopBackground = null;
        this._startMenu = null;
        this._launcher = this._searchButton = null;
        this._releaseThemeColors?.();
        this._releaseThemeColors = null;
    }
}
