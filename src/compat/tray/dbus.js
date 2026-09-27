import Gio from 'gi://Gio';

export function call(bus, name, path, iface, method, parameters, cancellable) {
    return new Promise((resolve, reject) => {
        bus.call(name, path, iface, method, parameters, null,
            Gio.DBusCallFlags.NONE, 2500, cancellable, (connection, result) => {
                try {
                    resolve(connection.call_finish(result).recursiveUnpack());
                } catch (error) {
                    reject(error);
                }
            });
    });
}
