// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {DEBOUNCE_MS, MAX_QUERY_LENGTH, queryState} from './query.js';
import {ResultItem} from './resultItem.js';
import {ApplicationItem, findApplications} from './applicationItem.js';
import {openPath} from './fileActions.js';

export class SearchOverlay {
    constructor(engine) {
        this._engine = engine;
        this._generation = 0;
        this._debounceId = 0;
        this._items = [];
        this._appCount = 0;
        this._appColumns = 4;
        this._selected = -1;
        this._isOpen = false;
        this._action = null;
        this._dialog = new ModalDialog.ModalDialog({styleClass: 'sel-dialog',
            shellReactive: true, destroyOnClose: false, shouldFadeIn: false, shouldFadeOut: false});
        this._dialog.accessible_name = 'Search Everything Lightly';
        this._dialog.buttonLayout.hide();
        const content = this._dialog.contentLayout;
        content.add_style_class_name('sel-content');
        this._entry = new St.Entry({hint_text: _('Search apps and files...'),
            style_class: 'search-entry sel-entry', can_focus: true, x_expand: true});
        this._entry.set_primary_icon(new St.Icon({icon_name: 'edit-find-symbolic',
            style_class: 'search-entry-icon'}));
        this._entry.clutter_text.set_max_length(MAX_QUERY_LENGTH);
        this._entry.clutter_text.set_single_line_mode(true);
        this._entry.accessible_name = _('Search apps and files...');
        content.add_child(this._entry);
        this._status = new St.Label({style_class: 'sel-status'});
        this._status.clutter_text.line_wrap = true;
        this._status.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        content.add_child(this._status);
        this._results = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'sel-results', x_expand: true});
        this._appGrid = new St.Widget({layout_manager: new Clutter.GridLayout({
            column_spacing: 8, row_spacing: 8}), x_align: Clutter.ActorAlign.CENTER});
        this._files = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'sel-files', x_expand: true});
        this._results.add_child(this._appGrid);
        this._results.add_child(this._files);
        this._scroll = new St.ScrollView({child: this._results,
            style_class: 'sel-scroll', overlay_scrollbars: false, x_expand: true, y_expand: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC});
        content.add_child(this._scroll);
        this._dialog.setInitialKeyFocus(this._entry.clutter_text);
        this._entry.clutter_text.connect('text-changed', () => this._queryChanged());
        this._dialog.connect('captured-event', (_actor, event) => this._keyPressed(event));
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this.close());
    }

    toggle() {
        if (this._isOpen) {
            this.close();
            return;
        }
        // Do not open over another system dialog or the lock screen.
        if (Main.modalCount > 0 || Main.sessionMode.isLocked)
            return;
        this._entry.set_text('');
        this._clearResults();
        const monitor = global.display.get_focus_window()?.get_monitor() ??
            global.display.get_current_monitor();
        const area = Main.layoutManager.getWorkAreaForMonitor(monitor);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const width = Math.min(560, area.width / scale - 64);
        const height = Math.min(320, area.height / scale * 0.45) + 48;
        this._appColumns = Math.max(1, Math.min(4, Math.floor(width / 104)));
        // Reserve the results area even while it is empty or a search is pending.
        this._dialog.contentLayout.set_style(`width: ${width}px; height: ${height}px;`);
        this._isOpen = this._dialog.open();
        if (!this._isOpen)
            return;
        // ModalDialog defaults to the pointer's monitor; prefer the focused window.
        this._dialog._monitorConstraint.index = monitor;
        this._queryChanged();
        this._entry.grab_key_focus();
    }

    close() {
        this._isOpen = false;
        this._cancelPending();
        this._clearResults();
        this._dialog.close();
    }

    destroy() {
        this.close();
        Main.layoutManager.disconnect(this._monitorsId);
        this._dialog.destroy();
        this._dialog = null;
        this._entry = null;
        this._status = null;
        this._scroll = null;
        this._results = null;
        this._appGrid = null;
        this._files = null;
        this._engine = null;
    }

    _cancelPending() {
        this._generation++;
        if (this._debounceId) {
            GLib.Source.remove(this._debounceId);
            this._debounceId = 0;
        }
        this._engine.cancel();
        if (this._action) {
            if (this._action.timer)
                GLib.Source.remove(this._action.timer);
            this._action.timer = 0;
            this._action.cancellable.cancel();
            this._action = null;
        }
    }

    _clearResults() {
        this._appGrid.destroy_all_children();
        this._appGrid.hide();
        this._files.destroy_all_children();
        this._items = [];
        this._appCount = 0;
        this._selected = -1;
        this._scroll.hide();
        this._scroll.vadjustment.value = 0;
    }

    _setStatus(text) {
        this._status.text = text;
        this._status.visible = text.length > 0;
    }

    _replaceResults(apps, paths) {
        this._clearResults();
        apps.forEach((app, index) => {
            const item = new ApplicationItem(app, selectedApp => this._activateApplication(selectedApp),
                () => this._select(index));
            this._items.push(item);
            this._appGrid.layout_manager.attach(item,
                index % this._appColumns, Math.floor(index / this._appColumns), 1, 1);
        });
        this._appCount = apps.length;
        this._appGrid.visible = apps.length > 0;
        paths.forEach(path => {
            const index = this._items.length;
            const item = new ResultItem(path, selectedPath => this._activate(selectedPath),
                () => this._select(index));
            this._items.push(item);
            this._files.add_child(item);
        });
        this._scroll.visible = this._items.length > 0;
        if (this._items.length)
            this._select(0);
    }

    _queryChanged() {
        this._cancelPending();
        if (!this._isOpen)
            return;
        const query = this._entry.get_text();
        const state = queryState(query);
        if (state !== 'ready') {
            this._clearResults();
            const messages = {
                short: _('Type to search.'),
                'invalid-pattern': _('The regular expression is empty or invalid.'),
            };
            this._setStatus(messages[state] ??
                _('The query is too long or contains an invalid character.'));
            return;
        }
        this._setStatus('');
        const generation = this._generation;
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._debounceId = 0;
            this._search(query, generation);
            return GLib.SOURCE_REMOVE;
        });
    }

    async _search(query, generation) {
        const apps = findApplications(query);
        try {
            const paths = await this._engine.search(query);
            if (!this._isOpen || generation !== this._generation)
                return;
            this._replaceResults(apps, paths);
            this._setStatus(paths.length || apps.length ? '' : _('No matching files. The index may need updating.'));
        } catch (error) {
            if (!this._isOpen || generation !== this._generation || error.code === 'cancelled')
                return;
            this._replaceResults(apps, []);
            const messages = {
                'missing-dependency': _('plocate is not installed.\nInstall it to use Search Everything Lightly.\nFedora: sudo dnf install plocate'),
                'index-unavailable': _('The plocate index is unavailable or unreadable.\nSee the README for index setup and permissions.'),
                'timeout': _('Search timed out. Try a more specific query.'),
                'invalid-pattern': _('The regular expression is empty or invalid.'),
            };
            this._setStatus(messages[error.code] ?? _('Search failed. Please try again.'));
        }
    }

    _select(index) {
        if (!this._items.length)
            return;
        this._items[this._selected]?.setSelected(false);
        this._selected = Math.max(0, Math.min(index, this._items.length - 1));
        const item = this._items[this._selected];
        item.setSelected(true);
        ensureActorVisibleInScrollView(this._scroll, item);
    }

    _keyPressed(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;
        const key = event.get_key_symbol();
        const ctrl = Boolean(event.get_state() & Clutter.ModifierType.CONTROL_MASK);
        const shift = Boolean(event.get_state() & Clutter.ModifierType.SHIFT_MASK);
        if (key === Clutter.KEY_Escape) {
            this.close();
        } else if (key === Clutter.KEY_Up || key === Clutter.KEY_Down) {
            let next = this._selected + (key === Clutter.KEY_Down ? 1 : -1);
            if (this._selected >= 0 && this._selected < this._appCount) {
                next = key === Clutter.KEY_Down ?
                    Math.min(this._selected + this._appColumns, this._appCount) :
                    Math.max(0, this._selected - this._appColumns);
            }
            this._select(next);
        } else if (!ctrl && this._selected >= 0 && this._selected < this._appCount &&
            (key === Clutter.KEY_Left || key === Clutter.KEY_Right)) {
            this._select(Math.max(0, Math.min(this._appCount - 1,
                this._selected + (key === Clutter.KEY_Right ? 1 : -1))));
        } else if ([Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_ISO_Enter].includes(key)) {
            const item = this._items[this._selected];
            if (item?.app)
                this._activateApplication(item.app);
            else if (item)
                this._activate(item.path, ctrl ? 'parent' : shift ? 'reveal' : 'open');
        } else if (ctrl && [Clutter.KEY_l, Clutter.KEY_L].includes(key)) {
            this._entry.grab_key_focus();
        } else if (ctrl && [Clutter.KEY_a, Clutter.KEY_A].includes(key)) {
            this._entry.grab_key_focus();
            this._entry.clutter_text.set_selection(0, -1);
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
        return Clutter.EVENT_STOP;
    }

    _activateApplication(app) {
        try {
            app.activate();
            this.close();
        } catch {
            this._setStatus(_('Could not launch this application.'));
        }
    }

    async _activate(path, action = 'open') {
        if (this._action)
            return;
        const pending = {cancellable: new Gio.Cancellable(), timer: 0};
        this._action = pending;
        const generation = this._generation;
        pending.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
            pending.timer = 0;
            pending.cancellable.cancel();
            return GLib.SOURCE_REMOVE;
        });
        this._setStatus(_('Opening…'));
        try {
            await openPath(path, action, global.create_app_launch_context(0, -1), pending.cancellable);
            if (this._isOpen && generation === this._generation)
                this.close();
        } catch {
            if (this._isOpen && generation === this._generation)
                this._setStatus(_('Could not open this location. It may have been removed or disconnected, or no application is available.'));
        } finally {
            if (pending.timer)
                GLib.Source.remove(pending.timer);
            pending.timer = 0;
            if (this._action === pending)
                this._action = null;
        }
    }
}
