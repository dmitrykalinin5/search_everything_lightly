// Test driver loaded ONLY into the disposable copy by run_shell_smoke.py.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

function delay(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

async function until(condition, message) {
    for (let attempt = 0; attempt < 150; attempt++) {
        if (condition())
            return;
        await delay(50);
    }
    throw new Error(message);
}

function assert(value, message) {
    if (!value)
        throw new Error(message);
}

function key(overlay, symbol, modifiers = 0) {
    overlay._keyPressed({type: () => Clutter.EventType.KEY_PRESS,
        get_key_symbol: () => symbol, get_state: () => modifiers});
}

function hotkey(keyboard, control = false) {
    const keys = control ? [Clutter.KEY_Control_L, Clutter.KEY_Super_L, Clutter.KEY_Return] :
        [Clutter.KEY_Super_L, Clutter.KEY_Return];
    for (const symbol of keys)
        keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, Clutter.KeyState.PRESSED);
    for (const symbol of keys.reverse())
        keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, Clutter.KeyState.RELEASED);
}

function typeKey(keyboard, symbol) {
    keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, Clutter.KeyState.RELEASED);
}

async function screenshot(path, monitor = null) {
    const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
    if (monitor) {
        await new Shell.Screenshot().screenshot_area(
            monitor.x, monitor.y, monitor.width, monitor.height, stream);
    } else {
        await new Shell.Screenshot().screenshot(false, stream);
    }
    stream.close(null);
}

export async function run(extension) {
    const root = GLib.getenv('SEL_SMOKE_ROOT');
    const checks = [];
    let error = null;
    let keyboard = null;
    let backgroundProbe = null;
    try {
        await until(() => !Main.layoutManager._startingUp, 'Shell startup timed out');
        Main.overview.hide();
        Main.welcomeDialog?.close();
        const interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        interfaceSettings.set_boolean('enable-animations', true);
        await delay(300);
        const engine = extension._engine;
        const overlay = extension._overlay;
        assert(overlay, 'Extension did not construct the overlay');
        engine._localSearch = null;
        engine._database = `${root}/test.db`;
        assert(extension._settings.get_strv('toggle-search')[0] === '<Super>Return',
            'Default shortcut is not Super+Enter');
        const seat = global.stage.context.get_backend().get_default_seat();
        keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        assert(Main.layoutManager.monitors.length === 2, 'Headless Shell did not create two monitors');
        const targetMonitor = Main.layoutManager.monitors[1];
        backgroundProbe = new St.Widget({reactive: true});
        assert(Main.extensionManager.openExtensionPrefs(extension.uuid, '', {}), 'Prefs not advertised');
        await until(() => global.get_window_actors().some(actor =>
            actor.meta_window.get_title()?.includes('Search Everything Lightly') && actor.visible),
        'Preferences did not open for the monitor test');
        const prefsActor = global.get_window_actors().find(actor =>
            actor.meta_window.get_title()?.includes('Search Everything Lightly'));
        prefsActor.meta_window.move_to_monitor(targetMonitor.index);
        prefsActor.meta_window.activate(global.get_current_time());
        await until(() => global.display.get_focus_window() === prefsActor.meta_window &&
            prefsActor.meta_window.get_monitor() === targetMonitor.index,
        'Preferences did not move to the second monitor');
        await delay(100);
        hotkey(keyboard);
        await until(() => overlay._isOpen, 'Global shortcut did not open the overlay');
        assert(overlay._isOpen && Main.modalCount === 0,
            'Search overlay still holds a modal grab');
        const dialogActor = overlay._dialog;
        assert(dialogActor.opacity < 255 || dialogActor.scale_x < 1 || dialogActor.scale_y < 1,
            `Opening animation did not start: enabled=${St.Settings.get().enable_animations}, ` +
            `factor=${St.Settings.get().slow_down_factor}, opacity=${dialogActor.opacity}`);
        assert(overlay._monitorIndex === targetMonitor.index,
            'Overlay did not target the pointer monitor');
        extension._settings.set_strv('toggle-search', ['<Control><Super>Return']);
        prefsActor.meta_window.delete(global.get_current_time());
        await until(() => !global.get_window_actors().some(actor =>
            actor.meta_window.get_title()?.includes('Search Everything Lightly')),
        'Preferences did not close after the monitor test');
        checks.push('Super+Enter default, GSettings shortcut change and second-monitor targeting');
        assert(global.stage.key_focus === overlay._entry.clutter_text, 'Entry did not receive focus');
        assert(overlay._stageCapturedId !== 0, 'Outside-click handler was not connected while open');
        assert(overlay._stageKeyFocusId !== 0, 'Focus-loss handler was not connected while open');
        await until(() => dialogActor.opacity === 255 && dialogActor.scale_x === 1 &&
            dialogActor.scale_y === 1, 'Opening animation did not finish');
        const [compactWidth, compactHeight] = overlay._dialog.contentLayout.get_transformed_size();
        const [compactX, compactY] = overlay._dialog.contentLayout.get_transformed_position();
        const [compactEntryWidth] = overlay._entry.get_transformed_size();
        const [compactEntryX, compactEntryY] = overlay._entry.get_transformed_position();
        assert(compactWidth >= 500 && compactWidth <= 620 && compactHeight < 100,
            `Initial overlay is not a compact search row: ${compactWidth}x${compactHeight}`);
        assert(compactX >= targetMonitor.x && compactY >= targetMonitor.y &&
            compactX + compactWidth <= targetMonitor.x + targetMonitor.width &&
            compactY + compactHeight <= targetMonitor.y + targetMonitor.height,
        `Overlay geometry is outside the second monitor: ${compactX},${compactY},` +
            `${compactWidth},${compactHeight}`);
        assert(compactY + compactHeight / 2 < targetMonitor.y + targetMonitor.height / 2,
            `Compact search row was not positioned above the monitor center: y=${compactY}, ` +
            `height=${compactHeight}`);
        assert(!overlay._expanded && !overlay._scroll.visible && !overlay._status.visible &&
            !overlay._shortcutHelp.visible,
            'Compact overlay contains result or status content');
        assert(overlay._entry.hint_text === 'Search everything', 'Search hint was not updated');
        assert(overlay._entry.style.includes('background-color: rgba(12, 14, 18, 0.94)') &&
            overlay._entry.style.includes('box-shadow: none'),
        'Compact field did not receive its less transparent shadowless style');
        checks.push(`compact animated overlay opened at ${compactWidth} × ${compactHeight} with initial focus`);
        await screenshot(`${root}/overlay-compact.png`, targetMonitor);
        typeKey(keyboard, Clutter.KEY_x);
        await until(() => overlay._entry.get_text() === 'x',
            'Physical-style keyboard input did not reach the non-modal search entry');
        overlay._entry.set_text('physics report');
        await delay(30);
        const [typingWidth, typingHeight] = overlay._dialog.contentLayout.get_transformed_size();
        assert(overlay._expanded && typingHeight > compactHeight &&
            typingHeight < overlay._expandedHeight,
            `First input did not expand the overlay: ${typingHeight}`);
        assert(Math.abs(typingWidth - compactWidth) < 1,
            `Overlay width changed while expanding: ${compactWidth} -> ${typingWidth}`);
        await until(() => Math.abs(overlay._dialog.contentLayout.height -
            overlay._expandedHeight) < 1, 'Expansion animation did not finish');
        const [expandedX, expandedY] = overlay._dialog.contentLayout.get_transformed_position();
        const [expandedEntryWidth] = overlay._entry.get_transformed_size();
        const [expandedEntryX, expandedEntryY] = overlay._entry.get_transformed_position();
        assert(Math.abs(expandedX - compactX) < 1 && Math.abs(expandedY - compactY) < 1,
            `Overlay did not expand downward: ${compactX},${compactY} -> ${expandedX},${expandedY}`);
        assert(Math.abs(expandedEntryWidth - compactEntryWidth) < 1 &&
            Math.abs(expandedEntryX - compactEntryX) < 1 &&
            Math.abs(expandedEntryY - compactEntryY) < 1,
        'Search field was replaced or moved instead of remaining the top of the expanding panel');
        assert(overlay._entry.style.includes('background-color: rgba(12, 14, 18, 0.72)') &&
            overlay._entry.style.includes('box-shadow: none'),
        'Expanded field did not receive its translucent shadowless style');
        assert(Math.abs(expandedY + overlay._expandedHeight / 2 -
            (targetMonitor.y + targetMonitor.height / 2)) < 2,
        'Expanded overlay is not vertically centered on the target monitor');
        assert(!overlay._status.visible && overlay._status.text === '',
            'Searching status still shifts the results area');
        const shortcutHints = overlay._shortcutHelp.get_children();
        assert(overlay._shortcutHelp.visible && shortcutHints.length === 3,
            'Expanded overlay does not show all shortcut hints');
        assert(shortcutHints.map(hint => hint.get_child_at_index(0).text).join('|') ===
            'Enter|Shift + Enter|Ctrl + Enter', 'Shortcut hints show the wrong keys');
        assert(shortcutHints.every(hint => hint.get_child_at_index(1).text.length > 0),
            'Shortcut hint action is empty');
        await until(() => overlay._items.length === 50, `Search results missing: ${overlay._status.text}`);
        overlay.toggle();
        assert(!overlay._isOpen && overlay._isClosing && Main.modalCount === 0,
            'Second toggle started closing with a modal grab');
        await until(() => dialogActor.opacity > 0 && dialogActor.opacity < 255 &&
            dialogActor.scale_x < 1, 'Closing animation did not change opacity and scale');
        await until(() => !overlay._isClosing && Main.modalCount === 0,
            'Closing animation did not release the modal grab');
        overlay.toggle();
        await until(() => overlay._isOpen && dialogActor.opacity === 255,
            'Toggle did not reopen the overlay after its closing animation');
        key(overlay, Clutter.KEY_Escape);
        assert(overlay._isClosing, 'Escape did not start the closing animation');
        await until(() => !overlay._isClosing && Main.modalCount === 0,
            'Escape closing animation did not finish');
        checks.push('smooth downward expansion and animated close via shortcut and Escape');
        overlay.toggle();
        await until(() => overlay._isOpen && dialogActor.opacity === 255,
            'Overlay did not reopen for the Files button test');
        interfaceSettings.set_boolean('enable-animations', false);
        assert(overlay._entry.get_secondary_icon() === overlay._fileManagerIcon,
            'Files button is hidden by default');
        extension._settings.set_boolean('show-file-manager-button', false);
        assert(overlay._entry.get_secondary_icon() === null,
            'Files button setting did not hide the icon');
        extension._settings.set_boolean('show-file-manager-button', true);
        assert(overlay._entry.get_secondary_icon() === overlay._fileManagerIcon,
            'Files button setting did not restore the icon');
        const openedUri = Gio.File.new_for_path(`${root}/opened-uri`);
        overlay._entry.emit('secondary-icon-clicked');
        await until(() => !overlay._isOpen && openedUri.query_exists(null),
            'Files button did not open the home folder');
        const [, homeData] = openedUri.load_contents(null);
        assert(Gio.File.new_for_commandline_arg(new TextDecoder().decode(homeData))
            .equal(Gio.File.new_for_path(GLib.get_home_dir())), 'Files button opened the wrong folder');
        openedUri.delete(null);
        checks.push('Files button opens Home and can be hidden or restored from GSettings');
        interfaceSettings.set_boolean('enable-animations', true);
        overlay.toggle();
        overlay._entry.set_text('physics report');
        await until(() => overlay._items.length === 50, 'Results did not return after Files button test');
        await delay(200);
        assert(overlay._selected === 0, 'First result is not selected');
        const [width, height] = overlay._dialog.contentLayout.get_transformed_size();
        const position = overlay._dialog.contentLayout.get_transformed_position();
        const checkBounds = state => {
            const bounds = [...overlay._dialog.contentLayout.get_transformed_size(),
                ...overlay._dialog.contentLayout.get_transformed_position()];
            assert(bounds.every((value, index) => Math.abs(value - [width, height, ...position][index]) < 1),
                `Overlay moved or resized during ${state}: ${bounds}`);
        };
        checks.push(`UI rendered at ${width} × ${height}`);
        const first = overlay._items[0];
        const child = first.get_child();
        const labels = child.get_child_at_index(1);
        assert(child.x < 30 && labels.height >= 30 && first.height >= 44,
            `Result layout is cramped: child x=${child.x}, text height=${labels.height}, row height=${first.height}`);
        await screenshot(`${root}/overlay.png`, Main.layoutManager.monitors[
            overlay._monitorIndex]);
        assert(width >= 500 && width <= 620 && height < 480, `Overlay is not compact: ${width}x${height}`);
        assert(!overlay._dialog._lightbox, 'Search still dims the desktop');
        assert(overlay._scroll.vscrollbar_visible && !overlay._scroll.overlay_scrollbars,
            'Overflow scrollbar is not visible');
        const [dialogWidth, dialogHeight] = overlay._dialog.get_transformed_size();
        assert(Math.abs(dialogWidth - width) < 1 && Math.abs(dialogHeight - height) < 1,
            `Search actor blocks more than its panel: ${dialogWidth}x${dialogHeight}`);
        assert(overlay._handleStageEvent(Clutter.EventType.BUTTON_PRESS, overlay._entry) ===
            Clutter.EVENT_PROPAGATE,
        'Inside click was consumed instead of reaching the search field');
        assert(overlay._isOpen && !overlay._isClosing,
            'Clicking inside the search panel closed it');
        assert(overlay._handleStageEvent(Clutter.EventType.SCROLL, backgroundProbe) ===
            Clutter.EVENT_PROPAGATE,
        'Background scrolling was consumed while search was open');
        assert(overlay._isOpen && !overlay._isClosing,
            'Background scrolling closed the search panel');
        global.stage.set_key_focus(null);
        assert(overlay._isClosing, 'Moving focus to another application did not close search');
        assert(overlay._stageCapturedId === 0,
            'Outside-click handler remained connected after search started closing');
        assert(overlay._stageKeyFocusId === 0,
            'Focus-loss handler remained connected after search started closing');
        const keyFocus = global.stage.get_key_focus();
        assert(!keyFocus || !overlay._dialog.contains(keyFocus),
            'Search retained keyboard focus after an outside click');
        await until(() => !overlay._isClosing, 'Outside-click closing animation did not finish');
        interfaceSettings.set_boolean('enable-animations', false);
        overlay.toggle();
        overlay._entry.set_text('physics report');
        await until(() => overlay._items.length === 50,
            'Results did not return after outside-click close');
        checks.push('background scroll passes through; inside click stays open; outside click closes');
        for (let i = 0; i < 49; i++)
            key(overlay, Clutter.KEY_Down);
        assert(overlay._selected === 49 && overlay._scroll.vadjustment.value > 0,
            'Keyboard navigation did not scroll to the last result');
        await delay(150);
        const [, scrollTop] = overlay._scroll.get_transformed_position();
        const [, lastTop] = overlay._items[49].get_transformed_position();
        assert(lastTop >= scrollTop && lastTop + overlay._items[49].height <=
            scrollTop + overlay._scroll.height + 1, 'Selected result is outside the visible scroll area');
        key(overlay, Clutter.KEY_Up);
        assert(overlay._selected === 48, 'Up did not change selection');
        key(overlay, Clutter.KEY_l, Clutter.ModifierType.CONTROL_MASK);
        key(overlay, Clutter.KEY_a, Clutter.ModifierType.CONTROL_MASK);
        assert(overlay._entry.clutter_text.get_selection() === 'physics report', 'Ctrl+A failed');
        checks.push('50 real results, arrow navigation, scrolling, Ctrl+L and Ctrl+A');
        overlay._select(0);
        const firstPath = overlay._items[0].path;
        for (const [modifier, expected] of [[0, firstPath],
            [Clutter.ModifierType.CONTROL_MASK, GLib.path_get_dirname(firstPath)]]) {
            key(overlay, Clutter.KEY_Return, modifier);
            await until(() => !overlay._isOpen && openedUri.query_exists(null), 'Enter did not launch the test handler');
            const [, data] = openedUri.load_contents(null);
            assert(Gio.File.new_for_commandline_arg(new TextDecoder().decode(data))
                .equal(Gio.File.new_for_path(expected)), 'Wrong location launched');
            openedUri.delete(null);
            overlay.toggle();
            overlay._entry.set_text('physics report');
            await until(() => overlay._items.length === 50, 'Results did not return');
        }
        checks.push('Enter and Ctrl+Enter launch the correct URI and close the overlay');
        let shown = null;
        let rejectReveal = false;
        const manager = Gio.DBusExportedObject.wrapJSObject(
            '<node><interface name="org.freedesktop.FileManager1"><method name="ShowItems">' +
            '<arg type="as" direction="in"/><arg type="s" direction="in"/>' +
            '</method></interface></node>', {
                ShowItems(uris) {
                    if (rejectReveal)
                        throw new Error('Reveal intentionally unavailable in this test');
                    shown = uris[0];
                },
            });
        manager.export(Gio.DBus.session, '/org/freedesktop/FileManager1');
        let owner;
        await new Promise(resolve => {
            owner = Gio.bus_own_name_on_connection(Gio.DBus.session, 'org.freedesktop.FileManager1',
                Gio.BusNameOwnerFlags.NONE, resolve, null);
        });
        try {
            key(overlay, Clutter.KEY_Return, Clutter.ModifierType.SHIFT_MASK);
            await until(() => !overlay._isOpen, 'Reveal did not close the overlay');
            assert(shown === GLib.filename_to_uri(firstPath, null), 'FileManager1 received the wrong URI');
            rejectReveal = true;
            overlay.toggle();
            overlay._entry.set_text('physics report');
            await until(() => overlay._items.length === 50, 'Results did not return');
            key(overlay, Clutter.KEY_Return, Clutter.ModifierType.SHIFT_MASK);
            await until(() => !overlay._isOpen && openedUri.query_exists(null), 'Reveal fallback did not launch');
            const [, data] = openedUri.load_contents(null);
            assert(Gio.File.new_for_commandline_arg(new TextDecoder().decode(data))
                .equal(Gio.File.new_for_path(GLib.path_get_dirname(firstPath))),
                'Reveal fallback opened the wrong directory');
            openedUri.delete(null);
        } finally {
            manager.unexport();
            Gio.bus_unown_name(owner);
        }
        checks.push('Shift+Enter uses FileManager1 and falls back to the parent directory');
        overlay.toggle();
        await overlay._activate(`${root}/no-such-file`);
        assert(overlay._isOpen && overlay._status.text.length > 0 && overlay._action === null,
            'Failed activation did not restore the dialog');
        key(overlay, Clutter.KEY_Escape);
        assert(!overlay._isOpen && Main.modalCount === 0, 'Escape left a modal grab');
        checks.push('opening a deleted file reports an error; Escape releases the grab');
        for (let i = 0; i < 10; i++) {
            overlay.toggle();
            assert(overlay._entry.get_text() === '', 'New open did not clear the query');
            await delay(20);
            const [, reopenedHeight] = overlay._dialog.contentLayout.get_transformed_size();
            assert(!overlay._expanded && Math.abs(reopenedHeight - compactHeight) < 1,
                `New open did not restore compact height: ${reopenedHeight}`);
            overlay._entry.set_text('physics');
            overlay.close();
        }
        assert(overlay._debounceId === 0 && engine._active === null, 'Close leaked a search');
        checks.push('10 rapid open/search/close cycles');
        hotkey(keyboard, true);
        await until(() => overlay._isOpen, 'Global shortcut stopped working');
        hotkey(keyboard, true);
        await until(() => !overlay._isOpen, 'Global shortcut did not toggle closed');
        checks.push('global shortcut toggles the search panel closed');
        overlay.toggle();
        overlay._entry.set_text('physics');
        await until(() => overlay._appCount === 2 && overlay._files.get_children().length === 50,
            'Applications and files were not combined');
        assert(overlay._items[0].app && overlay._items[overlay._appCount].path,
            'Applications are not above files');
        await delay(200);
        await screenshot(`${root}/overlay-apps.png`, Main.layoutManager.monitors[
            overlay._monitorIndex]);
        key(overlay, Clutter.KEY_Right);
        assert(overlay._selected === 1, 'Right did not move between application tiles');
        key(overlay, Clutter.KEY_Down);
        assert(overlay._selected === 2, 'Down did not enter the file list');
        key(overlay, Clutter.KEY_Up);
        assert(overlay._selected === 1, 'Up did not return to applications');
        overlay._select(51);
        assert(overlay._scroll.vadjustment.value > 0, 'Combined results did not scroll');
        overlay._select(0);
        assert(overlay._scroll.vadjustment.value === 0, 'Application navigation did not scroll back to the top');
        checks.push('application tiles precede files with shared scrolling and arrow navigation');
        const previousFirstItem = overlay._items[0];
        overlay._entry.set_text('p');
        await delay(30);
        assert(overlay._items[0] === previousFirstItem && overlay._scroll.visible,
            'Existing results disappeared before the replacement was ready');
        await until(() => overlay._appCount > 0 && overlay._files.get_children().length === 50,
            'One-character input did not search apps and files');
        overlay._entry.set_text('*.pdf');
        await until(() => overlay._appCount === 0 && overlay._files.get_children().length === 50,
            'File mask did not return the PDFs');
        overlay._entry.set_text('project_[12].docx');
        await until(() => overlay._appCount === 0 && overlay._files.get_children().length === 2,
            'Bracket glob did not return the expected files');
        overlay._entry.set_text('project_4.docx');
        await until(() => overlay._appCount === 0 && overlay._files.get_children().length === 1,
            'Exact query did not return one file');
        await delay(100);
        const onlyResult = overlay._files.get_child_at_index(0);
        assert(onlyResult.height >= 44 && onlyResult.height < 80,
            `A single result filled the results panel: ${onlyResult.height}px`);
        await screenshot(`${root}/overlay-single.png`, Main.layoutManager.monitors[
            overlay._monitorIndex]);
        overlay._entry.set_text('re:^report-[0-9]+\\.log$');
        await until(() => overlay._appCount === 0 && overlay._files.get_children().length === 2,
            'Regular expression did not return the expected files');
        overlay._entry.set_text('re:[');
        await until(() => overlay._items.length === 0 && overlay._status.visible,
            'Invalid regular expression did not show an error');
        checks.push('one-character input, single-result layout, globs and regular expressions work');
        for (const query of ['physics report 000', '', 'no-such-result-2938', 'physics', 'p', '*.pdf']) {
            overlay._entry.set_text(query);
            await delay(30);
            assert(overlay._expanded, `Overlay collapsed while typing ${JSON.stringify(query)}`);
            checkBounds(`typing ${JSON.stringify(query)}`);
            await until(() => overlay._debounceId === 0 && engine._active === null,
                'Search did not finish during geometry check');
            await delay(100);
            checkBounds(`results for ${JSON.stringify(query)}`);
        }
        checks.push('expanded window stays fixed until close without an intermediate searching status');
        overlay._entry.set_text('physics');
        await until(() => overlay._appCount === 2, 'Application tiles did not return');
        overlay._select(overlay._items.findIndex(item => item.app?.get_id() === 'sel-demo-0.desktop'));
        key(overlay, Clutter.KEY_Return);
        await until(() => !overlay._isOpen && openedUri.query_exists(null), 'Application did not launch with Enter');
        const [, appData] = openedUri.load_contents(null);
        assert(new TextDecoder().decode(appData) === 'app-0', 'Wrong application launched');
        openedUri.delete(null);
        const command = engine._command;
        try {
            engine._command = `${root}/missing-plocate`;
            overlay.toggle();
            overlay._entry.set_text('physics');
            await until(() => overlay._appCount === 2 && overlay._status.text.includes('plocate'),
                'Missing plocate prevented application search');
            await delay(100);
            checkBounds('application results with a dependency error');
            const app = overlay._items.find(item => item.app?.get_id() === 'sel-demo-1.desktop');
            app.emit('clicked', 1);
            await until(() => !overlay._isOpen && openedUri.query_exists(null), 'Application click did not launch');
            const [, clickedData] = openedUri.load_contents(null);
            assert(new TextDecoder().decode(clickedData) === 'app-1', 'Wrong application clicked');
            openedUri.delete(null);
        } finally {
            engine._command = command;
        }
        checks.push('apps launch with Enter and click even when plocate is unavailable');
        overlay.toggle();
        overlay._entry.set_text('physics');
        extension.disable();
        await delay(200);
        assert(Main.modalCount === 0 && engine._active === null && !extension._overlay,
            'Disable leaked resources');
        extension.enable();
        extension._overlay.toggle();
        assert(extension._overlay._isOpen, 'Enable after disable failed');
        extension._overlay.close();
        checks.push('disable during debounce and clean re-enable');
        assert(Main.extensionManager.openExtensionPrefs(extension.uuid, '', {}), 'Prefs not advertised');
        await until(() => global.get_window_actors().some(actor =>
            actor.meta_window.get_title()?.includes('Search Everything Lightly')), 'Preferences did not open');
        await until(() => global.get_window_actors().some(actor =>
            actor.meta_window.get_title()?.includes('Search Everything Lightly') &&
            actor.visible && actor.scale_x === 1 && actor.scale_y === 1 &&
            actor.opacity === 255), 'Preferences still animating');
        await delay(100);
        const prefsMonitor = Main.layoutManager.monitors[
            global.display.get_focus_window()?.get_monitor() ?? targetMonitor.index];
        await screenshot(`${root}/preferences.png`, prefsMonitor);
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_title()?.includes('Search Everything Lightly'))
                actor.meta_window.delete(global.get_current_time());
        }
        checks.push('real GTK preferences window opens');
        extension.disable();
    } catch (caught) {
        error = `${caught}\n${caught.stack}`;
    } finally {
        if (backgroundProbe) {
            backgroundProbe.destroy();
        }
        keyboard?.run_dispose();
    }
    GLib.file_set_contents(`${root}/result.json`, JSON.stringify({
        shellVersion: Config.PACKAGE_VERSION, success: error === null, checks, error,
    }));
}
