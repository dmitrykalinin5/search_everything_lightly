// SPDX-License-Identifier: GPL-3.0-or-later
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {SearchEngine} from './src/searchEngine.js';
import {SearchOverlay} from './src/searchOverlay.js';

export default class SearchEverythingLightly extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._engine = new SearchEngine();
        this._overlay = new SearchOverlay(this._engine);
        Main.wm.addKeybinding('toggle-search', this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.SYSTEM_MODAL,
            () => this._overlay.toggle());
    }

    disable() {
        Main.wm.removeKeybinding('toggle-search');
        this._overlay?.destroy();
        this._overlay = null;
        this._engine?.cancel();
        this._engine = null;
        this._settings = null;
    }
}
