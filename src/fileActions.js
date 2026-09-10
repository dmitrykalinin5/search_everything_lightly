// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function checkFile(file, cancellable) {
    return new Promise((resolve, reject) => {
        file.query_info_async('standard::type', Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
                try {
                    resolve(source.query_info_finish(result));
                } catch (error) {
                    reject(error);
                }
            });
    });
}

function launch(file, context, cancellable) {
    return new Promise((resolve, reject) => {
        Gio.AppInfo.launch_default_for_uri_async(file.get_uri(), context, cancellable,
            (source, result) => {
                try {
                    resolve(Gio.AppInfo.launch_default_for_uri_finish(result));
                } catch (error) {
                    reject(error);
                }
            });
    });
}

function reveal(file, cancellable) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
            'org.freedesktop.FileManager1', 'ShowItems',
            new GLib.Variant('(ass)', [[file.get_uri()], '']), null,
            Gio.DBusCallFlags.NONE, 1500, cancellable, (source, result) => {
                try {
                    resolve(source.call_finish(result));
                } catch (error) {
                    reject(error);
                }
            });
    });
}

export async function openPath(path, action, context, cancellable) {
    const file = Gio.File.new_for_path(path);
    const parent = file.get_parent() ?? file;
    await checkFile(action === 'parent' ? parent : file, cancellable);
    if (action === 'reveal') {
        try {
            await reveal(file, cancellable);
            return;
        } catch (error) {
            if (cancellable.is_cancelled())
                throw error;
            await launch(parent, context, cancellable);
            return;
        }
    }
    await launch(action === 'parent' ? parent : file, context, cancellable);
}
