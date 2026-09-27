/** Mark static display strings without translating before domain initialization.
 * @template {string} T
 * @param {T} message
 * @returns {T}
 */
export function N_(message) { return message; }
