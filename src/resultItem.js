// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {abbreviatePath, displayText} from './query.js';

export const ResultItem = GObject.registerClass(
class ResultItem extends St.Button {
    _init(path, onActivate, onSelect) {
        super._init({style_class: 'sel-result', can_focus: true,
            reactive: true, track_hover: true, x_expand: true});
        this.path = path;
        this._cancellable = new Gio.Cancellable();
        const box = new St.BoxLayout({style_class: 'sel-result-content',
            x_expand: true, y_expand: true});
        this._icon = new St.Icon({icon_name: 'text-x-generic-symbolic', icon_size: 24,
            y_align: Clutter.ActorAlign.CENTER});
        box.add_child(this._icon);
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        const name = new St.Label({text: displayText(GLib.path_get_basename(path)),
            style_class: 'sel-result-name'});
        name.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const location = new St.Label({
            text: displayText(abbreviatePath(path, GLib.get_home_dir())),
            style_class: 'sel-result-path'});
        location.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
        text.add_child(name);
        text.add_child(location);
        box.add_child(text);
        this.set_child(box);
        this.label_actor = name;
        this.accessible_name = `${name.text}, ${location.text}`;
        this.connect('clicked', () => onActivate(path));
        this.connect('key-focus-in', () => onSelect());
        this.connect('destroy', () => {
            this._cancellable.cancel();
            this._icon = null;
        });
        this._loadIcon();
    }

    _loadIcon() {
        const file = Gio.File.new_for_path(this.path);
        file.query_info_async('standard::symbolic-icon', Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT, this._cancellable, (source, result) => {
                try {
                    const info = source.query_info_finish(result);
                    if (!this._cancellable.is_cancelled() && this._icon)
                        this._icon.gicon = info.get_symbolic_icon();
                } catch {
                    // An unplugged drive or removed file keeps the generic icon.
                }
            });
    }

    setSelected(selected) {
        if (selected)
            this.add_style_pseudo_class('selected');
        else
            this.remove_style_pseudo_class('selected');
    }
});
