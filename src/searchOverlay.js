// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {adjustAnimationTime, ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DEBOUNCE_MS, MAX_QUERY_LENGTH, queryState} from './query.js';
import {ResultItem} from './resultItem.js';
import {ApplicationItem, findApplications} from './applicationItem.js';
import {openPath} from './fileActions.js';

const COMPACT_HEIGHT = 42;
const OPEN_ANIMATION_MS = 180;
const COMPACT_ENTRY_STYLE =
    'background-color: rgba(12, 14, 18, 0.94); ' +
    'border: 1px solid rgba(255, 255, 255, 0.22); box-shadow: none;';
const EXPANDED_ENTRY_STYLE =
    'background-color: rgba(12, 14, 18, 0.72); ' +
    'border: 1px solid rgba(255, 255, 255, 0.22); box-shadow: none;';

export class SearchOverlay {
    constructor(engine, settings) {
        this._engine = engine;
        this._settings = settings;
        this._generation = 0;
        this._debounceId = 0;
        this._items = [];
        this._appCount = 0;
        this._appColumns = 4;
        this._selected = -1;
        this._isOpen = false;
        this._isClosing = false;
        this._expanded = false;
        this._contentWidth = 0;
        this._expandedHeight = 0;
        this._monitorIndex = 0;
        this._action = null;
        this._stageCapturedId = 0;
        this._stageKeyFocusId = 0;
        this._dialog = new St.Widget({style_class: 'sel-dialog', visible: false,
            reactive: true, layout_manager: new Clutter.BinLayout()});
        this._dialog.accessible_name = 'Search Everything Lightly';
        const content = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'sel-content'});
        content.clip_to_allocation = true;
        this._dialog.contentLayout = content;
        this._dialog.add_child(content);
        Main.layoutManager.addTopChrome(this._dialog);
        this._entry = new St.Entry({hint_text: 'Search everything',
            style_class: 'search-entry sel-entry', can_focus: true, x_expand: true});
        this._entry.set_primary_icon(new St.Icon({icon_name: 'edit-find-symbolic',
            style_class: 'search-entry-icon'}));
        this._fileManagerIcon = new St.Icon({icon_name: 'folder-symbolic',
            style_class: 'search-entry-icon', accessible_name: _('Open Files')});
        this._updateFileManagerIcon();
        this._entry.clutter_text.set_max_length(MAX_QUERY_LENGTH);
        this._entry.clutter_text.set_single_line_mode(true);
        this._entry.accessible_name = 'Search everything';
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
        this._shortcutHelp = new St.BoxLayout({
            style_class: 'sel-shortcut-help', x_expand: true, visible: false,
        });
        for (const [shortcut, description] of [
            ['Enter', _('Open')],
            ['Shift + Enter', _('Show in folder')],
            ['Ctrl + Enter', _('Open parent folder')],
        ]) {
            const hint = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
                style_class: 'sel-shortcut-hint', x_expand: true,
                x_align: Clutter.ActorAlign.CENTER});
            hint.add_child(new St.Label({text: shortcut, style_class: 'sel-shortcut-key'}));
            hint.add_child(new St.Label({text: description, style_class: 'sel-shortcut-action'}));
            this._shortcutHelp.add_child(hint);
        }
        content.add_child(this._shortcutHelp);
        this._entry.clutter_text.connect('text-changed', () => this._queryChanged());
        this._entry.connect('secondary-icon-clicked', () =>
            this._activate(GLib.get_home_dir()));
        this._fileManagerSettingId = this._settings.connect(
            'changed::show-file-manager-button', () => this._updateFileManagerIcon());
        this._dialog.connect('captured-event', (_actor, event) => this._keyPressed(event));
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this.close(false));
    }

    toggle() {
        if (this._isClosing)
            return;
        if (this._isOpen) {
            this.close();
            return;
        }
        // Do not open over another system dialog or the lock screen.
        if (Main.modalCount > 0 || Main.sessionMode.isLocked)
            return;
        this._entry.set_text('');
        this._clearResults();
        const monitor = this._targetMonitor();
        const area = Main.layoutManager.getWorkAreaForMonitor(monitor);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const width = Math.min(584, area.width / scale - 64);
        const height = Math.min(320, area.height / scale * 0.45) + 48;
        this._contentWidth = width;
        this._expandedHeight = height;
        this._monitorIndex = monitor;
        this._expanded = false;
        this._appColumns = Math.max(1, Math.min(4, Math.floor(width / 104)));
        this._setContentHeight(COMPACT_HEIGHT);
        this._dialog.set_position(
            Math.round(area.x + (area.width - width * scale) / 2),
            Math.round(area.y + (area.height - height * scale) / 2));
        this._dialog.show();
        this._isOpen = true;
        this._stageCapturedId = global.stage.connect(
            'captured-event', (actor, event) => this._stageCaptured(actor, event));
        this._stageKeyFocusId = global.stage.connect(
            'notify::key-focus', () => this._stageKeyFocusChanged());
        this._animateOpen();
        this._queryChanged();
        this._entry.grab_key_focus();
    }

    _targetMonitor() {
        const count = Main.layoutManager.monitors.length;
        const candidates = [
            global.display.get_focus_window()?.get_monitor(),
            global.display.get_current_monitor(),
            Main.layoutManager.primaryIndex,
            0,
        ];
        return candidates.find(index => Number.isInteger(index) && index >= 0 && index < count);
    }

    close(animate = true) {
        if (this._isClosing) {
            if (!animate)
                this._finishClose();
            return;
        }
        if (!this._isOpen)
            return;
        this._isOpen = false;
        this._isClosing = true;
        global.stage.disconnect(this._stageCapturedId);
        this._stageCapturedId = 0;
        global.stage.disconnect(this._stageKeyFocusId);
        this._stageKeyFocusId = 0;
        const keyFocus = global.stage.get_key_focus();
        if (keyFocus && this._dialog.contains(keyFocus))
            global.stage.set_key_focus(null);
        this._cancelPending();
        const actor = this._dialog;
        actor.remove_all_transitions();
        const duration = animate ? adjustAnimationTime(OPEN_ANIMATION_MS) : 0;
        if (duration === 0) {
            this._finishClose();
            return;
        }
        actor.ease({
            opacity: 0,
            scale_x: 0.94,
            scale_y: 0.94,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._finishClose(),
        });
    }

    _finishClose() {
        if (!this._isClosing)
            return;
        this._dialog.hide();
        const actor = this._dialog;
        actor.remove_all_transitions();
        actor.opacity = 255;
        actor.scale_x = 1;
        actor.scale_y = 1;
        actor.translation_y = 0;
        this._clearResults();
        this._isClosing = false;
    }

    _setContentHeight(height) {
        const content = this._dialog.contentLayout;
        content.remove_all_transitions();
        content.remove_style_class_name('sel-expanded');
        content.set_height(-1);
        content.set_style(
            `width: ${this._contentWidth}px; height: ${height}px;`);
        this._entry.set_style(COMPACT_ENTRY_STYLE);
        this._scroll.hide();
        this._shortcutHelp.hide();
    }

    _expand() {
        if (this._expanded)
            return;
        this._expanded = true;
        const content = this._dialog.contentLayout;
        const startHeight = content.height;
        const targetHeight = this._expandedHeight;
        content.remove_all_transitions();
        content.set_height(startHeight);
        content.set_style(`width: ${this._contentWidth}px;`);
        content.add_style_class_name('sel-expanded');
        this._entry.set_style(EXPANDED_ENTRY_STYLE);
        this._scroll.show();
        this._shortcutHelp.show();
        const duration = adjustAnimationTime(OPEN_ANIMATION_MS);
        content.ease({
            height: targetHeight,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _animateOpen() {
        const actor = this._dialog;
        actor.remove_all_transitions();
        actor.set_pivot_point(0.5, 0.5);
        actor.opacity = 0;
        actor.scale_x = 0.94;
        actor.scale_y = 0.94;
        actor.ease({
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            duration: adjustAnimationTime(OPEN_ANIMATION_MS),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _updateFileManagerIcon() {
        this._entry.set_secondary_icon(
            this._settings.get_boolean('show-file-manager-button') ? this._fileManagerIcon : null);
    }

    destroy() {
        this.close(false);
        Main.layoutManager.disconnect(this._monitorsId);
        this._settings.disconnect(this._fileManagerSettingId);
        Main.layoutManager.removeChrome(this._dialog);
        this._dialog.destroy();
        this._dialog = null;
        this._entry = null;
        this._status = null;
        this._scroll = null;
        this._shortcutHelp = null;
        this._results = null;
        this._appGrid = null;
        this._files = null;
        this._fileManagerIcon = null;
        this._engine = null;
        this._settings = null;
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
        this._scroll.visible = this._expanded;
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
        if (query.length > 0)
            this._expand();
        const state = queryState(query);
        if (state !== 'ready') {
            this._clearResults();
            const messages = {
                short: '',
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
                'missing-dependency': _('GNOME LocalSearch is unavailable and plocate is not installed.'),
                'pattern-backend-unavailable': _('Masks and regular expressions require plocate.\nFedora: sudo dnf install plocate'),
                'index-unavailable': _('The available file search indexes are unavailable or unreadable.\nSee the README for setup and permissions.'),
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
        if (!this._isOpen || event.type() !== Clutter.EventType.KEY_PRESS)
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

    _stageCaptured(_actor, event) {
        return this._handleStageEvent(event.type(), global.stage.get_event_actor(event));
    }

    _stageKeyFocusChanged() {
        const keyFocus = global.stage.get_key_focus();
        if (this._isOpen && (!keyFocus || !this._dialog.contains(keyFocus)))
            this.close();
    }

    _handleStageEvent(type, target) {
        if (!this._isOpen || this._isClosing || ![
            Clutter.EventType.BUTTON_PRESS,
            Clutter.EventType.TOUCH_BEGIN,
        ].includes(type))
            return Clutter.EVENT_PROPAGATE;

        if (!target || !this._dialog.contains(target))
            this.close();
        return Clutter.EVENT_PROPAGATE;
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
