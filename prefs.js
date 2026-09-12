// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SearchPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: _('Search'), icon_name: 'edit-find-symbolic'});
        const group = new Adw.PreferencesGroup({title: _('Keyboard shortcut'),
            description: _('Super+Space may already switch keyboard layouts in GNOME. Choose another shortcut here if needed.')});
        page.add(group);
        window.add(page);
        const row = new Adw.ActionRow({title: _('Open or close search')});
        const label = new Gtk.ShortcutLabel({accelerator: settings.get_strv('toggle-search')[0] ?? ''});
        const button = new Gtk.Button({child: label, valign: Gtk.Align.CENTER,
            tooltip_text: _('Change shortcut')});
        row.add_suffix(button);
        row.activatable_widget = button;
        const reset = new Gtk.Button({icon_name: 'edit-undo-symbolic', valign: Gtk.Align.CENTER,
            tooltip_text: _('Reset shortcut')});
        reset.connect('clicked', () => settings.reset('toggle-search'));
        row.add_suffix(reset);
        group.add(row);
        button.connect('clicked', () => this._captureShortcut(window, settings));
        const signal = settings.connect('changed::toggle-search', () => {
            label.accelerator = settings.get_strv('toggle-search')[0] ?? '';
        });
        window.connect('close-request', () => {
            settings.disconnect(signal);
            return false;
        });

        const dependencies = new Adw.PreferencesGroup({title: _('Search sources'),
            description: _('GNOME LocalSearch updates ordinary home files automatically. Optional plocate adds hidden and system files.')});
        dependencies.add(new Adw.ActionRow({title: 'GNOME LocalSearch',
            subtitle: _('Primary source. Updates automatically without sudo updatedb.')}));
        dependencies.add(new Adw.ActionRow({title: _('Optional plocate'),
            subtitle: GLib.find_program_in_path('plocate') ? _('Installed for hidden and system files') :
                _('Not installed. Fedora: sudo dnf install plocate')}));
        dependencies.add(new Adw.ActionRow({title: _('Refreshing hidden and system files'),
            subtitle: _('If plocate results are missing or stale, run sudo updatedb in a terminal. Ordinary LocalSearch results do not require it.')}));
        page.add(dependencies);
    }

    _captureShortcut(parent, settings) {
        const dialog = new Adw.Window({title: _('Change shortcut'), transient_for: parent,
            modal: true, default_width: 440, default_height: 240});
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 24,
            margin_start: 24, margin_end: 24, margin_top: 24, margin_bottom: 24});
        const message = new Gtk.Label({label: _('Press a shortcut with Ctrl, Alt or Super.\nEscape cancels.'), wrap: true,
            justify: Gtk.Justification.CENTER, vexpand: true});
        box.append(message);
        const cancel = new Gtk.Button({label: _('Cancel'), halign: Gtk.Align.CENTER});
        cancel.connect('clicked', () => dialog.close());
        box.append(cancel);
        dialog.set_content(box);
        const controller = new Gtk.EventControllerKey({propagation_phase: Gtk.PropagationPhase.CAPTURE});
        controller.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            if (keyval === Gdk.KEY_Escape) {
                dialog.close();
                return true;
            }
            const modifiers = state & Gtk.accelerator_get_default_mod_mask();
            const required = Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK |
                Gdk.ModifierType.SUPER_MASK;
            if (!(modifiers & required) || !Gtk.accelerator_valid(keyval, modifiers))
                return true;
            const accelerator = Gtk.accelerator_name(Gdk.keyval_to_lower(keyval), modifiers);
            settings.set_strv('toggle-search', [accelerator]);
            dialog.close();
            return true;
        });
        dialog.add_controller(controller);
        dialog.present();
    }
}
