import {N_} from '../translatable.js';
export function conditions(code, day = true) {
    if (code === 0)
        return [day ? N_('Clear sky') : N_('Clear night'), day ? 'weather-clear-symbolic' : 'weather-clear-night-symbolic'];
    if (code === 1 || code === 2)
        return [code === 1 ? N_('Mostly clear') : N_('Partly cloudy'), day ? 'weather-few-clouds-symbolic' : 'weather-few-clouds-night-symbolic'];
    if (code === 3)
        return [N_('Overcast'), 'weather-overcast-symbolic'];
    if (code === 45 || code === 48)
        return [N_('Fog'), 'weather-fog-symbolic'];
    if ([51, 53, 55].includes(code))
        return [N_('Drizzle'), 'weather-showers-scattered-symbolic'];
    if ([56, 57, 66, 67].includes(code))
        return [N_('Freezing rain'), 'weather-showers-symbolic'];
    if ([61, 63, 65].includes(code))
        return [N_('Rain'), 'weather-showers-symbolic'];
    if (code >= 71 && code <= 77 || code === 85 || code === 86)
        return [N_('Snow'), 'weather-snow-symbolic'];
    if (code >= 80 && code <= 82)
        return [N_('Showers'), 'weather-showers-scattered-symbolic'];
    if ([95, 96, 99].includes(code))
        return [N_('Thunderstorm'), 'weather-storm-symbolic'];
    return [N_('Unknown conditions'), 'weather-overcast-symbolic'];
}
export function temperature(value) { return Number.isFinite(value) ? `${Math.round(value)}°` : '—'; }
export function forecastUrl(location, units) {
    return `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(location.longitude)}` +
        `&current=temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto&temperature_unit=${units === 'fahrenheit' ? 'fahrenheit' : 'celsius'}`;
}
