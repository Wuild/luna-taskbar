import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {settingDefinitions, taskbarKeys, type KeysOfType, type SettingKey, type SettingsValues} from './keys.js';

/** A narrow GSettings boundary. Keys and enum values are checked at call sites. */
export class TaskbarSettings {
    constructor(readonly raw: Gio.Settings) {}

    get_boolean(key: KeysOfType<boolean>): boolean { return this.raw.get_boolean(key); }
    get_int(key: KeysOfType<number>): number { return this.raw.get_int(key); }
    get_string<K extends KeysOfType<string>>(key: K): SettingsValues[K] {
        return this.raw.get_string(key) as SettingsValues[K];
    }
    get_strv(key: KeysOfType<string[]>): string[] { return this.raw.get_strv(key); }
    set_boolean(key: KeysOfType<boolean>, value: boolean): boolean { return this.raw.set_boolean(key, value); }
    set_int(key: KeysOfType<number>, value: number): boolean { return this.raw.set_int(key, value); }
    set_string<K extends KeysOfType<string>>(key: K, value: SettingsValues[K]): boolean {
        return this.raw.set_string(key, value);
    }
    set_strv(key: KeysOfType<string[]>, value: string[]): boolean { return this.raw.set_strv(key, value); }
    reset(key: SettingKey): void { this.raw.reset(key); }
    bind(key: SettingKey, object: GObject.Object, property: string, flags: Gio.SettingsBindFlags): void {
        this.raw.bind(key, object, property, flags);
    }
    connect(signal: 'changed' | `changed::${SettingKey}`, callback: (settings: TaskbarSettings, key: SettingKey) => void): number {
        return this.raw.connect(signal, (_settings: Gio.Settings, key: string) => {
            if (Object.hasOwn(settingDefinitions, key)) callback(this, key as SettingKey);
        });
    }
    disconnect(id: number): void { this.raw.disconnect(id); }
    get settings_schema(): Gio.SettingsSchema { return this.raw.settings_schema; }
    get path(): string { return this.raw.path; }

    resetAll(): void {
        const batch = new Gio.Settings({settings_schema: this.raw.settings_schema, path: this.raw.path});
        batch.delay();
        for (const key of taskbarKeys) batch.reset(key);
        batch.apply();
    }
}
