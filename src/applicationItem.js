// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as ParentalControlsManager from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';
import {displayText, isPatternQuery} from './query.js';

export function findApplications(query) {
    if (isPatternQuery(query))
        return [];
    const appSystem = Shell.AppSystem.get_default();
    const controls = ParentalControlsManager.getDefault();
    // Use the same cached desktop-entry search and visibility rules as GNOME.
    return Shell.AppSystem.search(query.trim()).flat()
        .map(id => appSystem.lookup_app(id))
        .filter(app => app && controls.shouldShowApp(app.app_info))
        .slice(0, 8);
}

export const ApplicationItem = GObject.registerClass(
class ApplicationItem extends St.Button {
    _init(app, onActivate, onSelect) {
        super._init({style_class: 'sel-app', can_focus: true,
            reactive: true, track_hover: true});
        this.app = app;
        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true, style_class: 'sel-app-content'});
        const icon = app.create_icon_texture(48);
        icon.x_align = Clutter.ActorAlign.CENTER;
        icon.y_expand = true;
        icon.y_align = Clutter.ActorAlign.CENTER;
        box.add_child(icon);
        const name = new St.Label({text: displayText(app.get_name()),
            x_align: Clutter.ActorAlign.CENTER, style_class: 'sel-app-name'});
        name.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(name);
        this.set_child(box);
        this.label_actor = name;
        this.accessible_name = name.text;
        this.connect('clicked', () => onActivate(app));
        this.connect('key-focus-in', () => onSelect());
        this.connect('destroy', () => { this.app = null; });
    }

    setSelected(selected) {
        if (selected)
            this.add_style_pseudo_class('selected');
        else
            this.remove_style_pseudo_class('selected');
    }
});
