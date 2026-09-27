import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {PopupBackdrop} from './popupBackdrop.js';
import {anchorTaskbarMenu} from './taskbarMenuAnchor.js';
import {conditions, temperature, forecastUrl} from './weatherModel.js';

export class WeatherApplet {
    constructor(settings, manager, preferences, editing, systemPanel) {
        this.settings = settings;
        this.systemPanel = systemPanel;
        this.preferences = preferences;
        this.editing = editing;
        this.session = new Soup.Session({timeout: 20});
        this.actor = new St.Button({style_class: 'luna-taskbar-system-applet luna-taskbar-weather',
            accessible_name: 'Weather', can_focus: true, track_hover: true});
        this.contents = new St.BoxLayout({style: 'spacing: 5px;', y_align: Clutter.ActorAlign.CENTER});
        this.icon = new St.Icon({icon_name: 'weather-overcast-symbolic', icon_size: 18});
        this.degrees = new St.Label({text: '—', y_align: Clutter.ActorAlign.CENTER});
        this.contents.add_child(this.icon); this.contents.add_child(this.degrees); this.actor.child = this.contents;
        this.menu = new PopupMenu.PopupMenu(this.actor, 0.5, St.Side.BOTTOM);
        Main.uiGroup.add_child(this.menu.actor); this.menu.actor.hide();
        manager.addMenu(this.menu);
        this.manager = manager;
        this.body = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'luna-taskbar-weather-panel'});
        // A disabled menu item applies insensitive text colors to its children.
        // Weather is panel content, so use a section instead of an action row.
        const section = new PopupMenu.PopupMenuSection();
        this.item = section.actor;
        this.item.add_style_class_name('luna-weather-popup-content');
        this.item.add_child(this.body);
        this.menu.addMenuItem(section);
        const header = new St.BoxLayout({style_class: 'luna-weather-header'});
        this.body.add_child(header);
        const heading = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        header.add_child(heading);
        this.label('WEATHER', heading, 'luna-weather-eyebrow');
        this.title = this.label('Weather', heading, 'luna-weather-location');
        const settingsButton = new St.Button({style_class: 'luna-weather-settings', can_focus: true,
            accessible_name: 'Weather settings', child: new St.Icon({icon_name: 'emblem-system-symbolic', icon_size: 16})});
        settingsButton.connect('clicked', () => {
            this.menu.close(); this.systemPanel()?.menu.close(); preferences();
        });
        header.add_child(settingsButton);
        this.hero = new St.BoxLayout({style_class: 'luna-weather-hero'});
        this.body.add_child(this.hero);
        const readings = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this.hero.add_child(readings);
        this.current = this.label('—', readings, 'luna-weather-temperature');
        this.description = this.label('', readings, 'luna-weather-condition');
        this.heroIcon = new St.Icon({icon_name: 'weather-overcast-symbolic', icon_size: 52,
            style_class: 'luna-weather-condition-icon', y_align: Clutter.ActorAlign.CENTER});
        this.hero.add_child(this.heroIcon);
        this.details = new St.BoxLayout({style_class: 'luna-weather-details'});
        this.body.add_child(this.details);
        this.feels = this.label('', this.details, 'luna-weather-detail');
        this.feels.x_expand = true;
        this.wind = this.label('', this.details, 'luna-weather-detail');
        this.forecast = new St.BoxLayout({style_class: 'luna-weather-forecast'});
        this.body.add_child(this.forecast);
        const footer = new St.BoxLayout({style_class: 'luna-weather-footer'});
        this.body.add_child(footer);
        this.status = this.label('Set your city in Weather settings.', footer, 'luna-weather-status');
        this.status.x_expand = true;
        this.label('Open-Meteo', footer, 'luna-weather-credit');
        this.backdrop = new PopupBackdrop(this.menu, settings);
        this.restoreAnchor = anchorTaskbarMenu(this.menu, this.actor, settings);
        this.actor.connect('clicked', () => { if (!editing()) this.menu.toggle(); });
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open) this.actor.add_style_pseudo_class('active');
            else this.actor.remove_style_pseudo_class('active');
        });
        this.signal = settings.connect('changed', (_settings, key) => {
            if (key === 'weather-slim') {
                this.forecast.visible = !settings.get_boolean('weather-slim') && this.forecast.get_n_children() > 0;
                this.systemPanel()?._position();
            }
            if (key === 'taskbar-position') this.orient();
            if (['show-weather', 'weather-separate-button', 'unified-system-panel'].includes(key)) this.place();
            if (key === 'show-weather' || ['weather-city', 'weather-country', 'weather-units'].includes(key)) this.configure();
        });
        this.orient(); this.configure();
    }
    place() {
        const enabled = this.settings.get_boolean('show-weather');
        const separate = this.settings.get_boolean('weather-separate-button');
        this.actor.visible = enabled && separate;
        this.menu.close();
        const panel = this.systemPanel();
        const target = enabled && !separate && panel ? panel.weather : this.item;
        if (this.body.get_parent() !== target) {
            this.body.get_parent()?.remove_child(this.body);
            target.add_child(this.body);
        }
        if (panel) {
            panel.weather.visible = enabled && !separate;
            panel._position();
        }
    }
    detach() {
        if (this.body.get_parent() !== this.item) {
            this.body.get_parent()?.remove_child(this.body);
            this.item.add_child(this.body);
        }
    }
    label(text, parent = this.body, style_class = '') {
        const label = new St.Label({text, style_class});
        parent.add_child(label); return label;
    }
    orient() {
        const edge = this.settings.get_string('taskbar-position');
        this.contents.orientation = ['left', 'right'].includes(edge) ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
        this.menu._boxPointer.updateArrowSide(St.Side[edge.toUpperCase()]);
    }
    configure() {
        this.generation = (this.generation ?? 0) + 1;
        this.cancel?.cancel();
        if (this.timer) GLib.Source.remove(this.timer);
        this.timer = 0;
        this.place();
        this.menu.close();
        this.location = null; this.hasData = false;
        this.degrees.text = '—'; this.current.text = '—'; this.description.text = '';
        this.hero.hide(); this.details.hide(); this.forecast.hide();
        this.icon.icon_name = 'weather-overcast-symbolic';
        this.forecast.destroy_all_children();
        this.title.text = 'Weather';
        this.status.text = 'Set your city in Weather settings.';
        if (!this.settings.get_boolean('show-weather') || !this.settings.get_string('weather-city').trim()) return;
        this.status.text = 'Loading weather…';
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
            this.timer = 0; this.update(); return GLib.SOURCE_REMOVE;
        });
    }
    async json(url, cancellable) {
        const message = Soup.Message.new('GET', url);
        const bytes = await new Promise((resolve, reject) => this.session.send_and_read_async(message,
            GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                try { resolve(session.send_and_read_finish(result)); } catch (error) { reject(error); }
            }));
        if (message.status_code !== 200) throw new Error(`HTTP ${message.status_code}`);
        return JSON.parse(new TextDecoder().decode(bytes.get_data()));
    }
    async update() {
        const generation = this.generation;
        const cancel = this.cancel = new Gio.Cancellable();
        try {
            let location = this.location;
            if (!location) {
                const country = this.settings.get_string('weather-country').trim().toUpperCase();
                const result = await this.json(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(this.settings.get_string('weather-city').trim())}&count=1&language=en&format=json${/^[A-Z]{2}$/.test(country) ? `&countryCode=${country}` : ''}`, cancel);
                if (!result.results?.length) throw new Error('City not found');
                location = result.results[0];
            }
            const data = await this.json(forecastUrl(location, this.settings.get_string('weather-units')), cancel);
            if (this.destroyed || generation !== this.generation) return;
            this.render(location, data);
            this.location = location; this.hasData = true;
        } catch (error) {
            if (this.destroyed || generation !== this.generation) return;
            this.status.text = this.hasData ? 'Unable to update · showing last weather' : 'Weather unavailable · check city or connection';
        } finally {
            if (!this.destroyed && generation === this.generation)
                this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900000, () => {
                    this.timer = 0; this.update(); return GLib.SOURCE_REMOVE;
                });
        }
    }
    render(location, data) {
        if (!Number.isFinite(data.current?.temperature_2m)) throw new Error('Invalid weather data');
        const now = data.current;
        const unit = this.settings.get_string('weather-units') === 'fahrenheit' ? 'F' : 'C';
        const [description, icon] = conditions(now.weather_code, !!now.is_day);
        this.title.text = [location.name, location.country_code].filter(Boolean).join(', ');
        this.degrees.text = temperature(now.temperature_2m);
        this.icon.icon_name = icon;
        this.current.text = `${this.degrees.text}${unit}`;
        this.description.text = description;
        this.heroIcon.icon_name = icon;
        this.feels.text = `Feels like  ${temperature(now.apparent_temperature)}${unit}`;
        this.wind.text = `Wind  ${now.wind_speed_10m ?? '—'} km/h`;
        this.hero.show(); this.details.show(); this.forecast.visible = !this.settings.get_boolean('weather-slim');
        this.actor.accessible_name = `${this.title.text}: ${this.current.text}, ${description}`;
        this.forecast.destroy_all_children();
        for (let i = 0; i < Math.min(3, data.daily?.time?.length ?? 0); i++) {
            const column = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'luna-weather-day', x_expand: true});
            const date = GLib.DateTime.new_from_iso8601(`${data.daily.time[i]}T12:00:00Z`, null);
            this.label(i === 0 ? 'Today' : date?.format('%a') ?? '', column, 'luna-weather-day-name');
            column.add_child(new St.Icon({icon_name: conditions(data.daily.weather_code[i])[1], icon_size: 24, x_align: Clutter.ActorAlign.CENTER}));
            const temperatures = new St.BoxLayout({style_class: 'luna-weather-range', x_align: Clutter.ActorAlign.CENTER});
            this.label(temperature(data.daily.temperature_2m_max[i]), temperatures, 'luna-weather-high');
            this.label(temperature(data.daily.temperature_2m_min[i]), temperatures, 'luna-weather-low');
            column.add_child(temperatures);
            this.forecast.add_child(column);
        }
        this.status.text = `Updated ${GLib.DateTime.new_now_local().format('%H:%M')}`;
    }
    destroy() {
        this.detach();
        this.destroyed = true; this.cancel?.cancel(); this.session.abort();
        if (this.timer) GLib.Source.remove(this.timer);
        this.settings.disconnect(this.signal);
        this.restoreAnchor(); this.backdrop.destroy(); this.manager.removeMenu(this.menu);
        this.menu.destroy(); this.actor.destroy();
    }
}
