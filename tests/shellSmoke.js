// Test driver loaded ONLY into the disposable copy by run_shell_smoke.py.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
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

function hotkey(keyboard) {
    const keys = [Clutter.KEY_Control_L, Clutter.KEY_Super_L, Clutter.KEY_space];
    for (const symbol of keys)
        keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, Clutter.KeyState.PRESSED);
    for (const symbol of keys.reverse())
        keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, Clutter.KeyState.RELEASED);
}

async function screenshot(path) {
    const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
    await new Shell.Screenshot().screenshot(false, stream);
    stream.close(null);
}

export async function run(extension) {
    const root = GLib.getenv('SEL_SMOKE_ROOT');
    const checks = [];
    let error = null;
    let keyboard = null;
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
        extension._settings.set_strv('toggle-search', ['<Control><Super>space']);
        keyboard = Clutter.get_default_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        checks.push('extension enable and GSettings shortcut change');
        await delay(100);
        hotkey(keyboard);
        await until(() => overlay._isOpen, 'Global shortcut did not open the overlay');
        assert(overlay._isOpen && Main.modalCount === 1, 'Modal did not open');
        assert(global.stage.key_focus === overlay._entry.clutter_text, 'Entry did not receive focus');
        const dialogActor = overlay._dialog.dialogLayout._dialog;
        assert(dialogActor.opacity < 255 || dialogActor.scale_x < 1 || dialogActor.scale_y < 1,
            'Spotlight-style opening animation did not start');
        await until(() => dialogActor.opacity === 255 && dialogActor.scale_x === 1 &&
            dialogActor.scale_y === 1, 'Opening animation did not finish');
        const [compactWidth, compactHeight] = overlay._dialog.contentLayout.get_transformed_size();
        assert(compactWidth >= 500 && compactWidth <= 620 && compactHeight < 100,
            `Initial overlay is not a compact search row: ${compactWidth}x${compactHeight}`);
        assert(!overlay._expanded && !overlay._scroll.visible && !overlay._status.visible,
            'Compact overlay contains result or status content');
        checks.push(`compact animated overlay opened at ${compactWidth} × ${compactHeight} with initial focus`);
        await screenshot(`${root}/overlay-compact.png`);
        interfaceSettings.set_boolean('enable-animations', false);
        overlay._entry.set_text('physics report');
        await delay(30);
        const [, typingHeight] = overlay._dialog.contentLayout.get_transformed_size();
        assert(overlay._expanded && typingHeight > compactHeight + 200,
            `First input did not expand the overlay: ${typingHeight}`);
        assert(!overlay._status.visible && overlay._status.text === '',
            'Searching status still shifts the results area');
        await until(() => overlay._items.length === 50, `Search results missing: ${overlay._status.text}`);
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
        await screenshot(`${root}/overlay.png`);
        assert(width >= 500 && width <= 620 && height < 480, `Overlay is not compact: ${width}x${height}`);
        assert(!overlay._dialog._lightbox, 'Search still dims the desktop');
        assert(overlay._scroll.vscrollbar_visible && !overlay._scroll.overlay_scrollbars,
            'Overflow scrollbar is not visible');
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
        const openedUri = Gio.File.new_for_path(`${root}/opened-uri`);
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
        hotkey(keyboard);
        await until(() => overlay._isOpen, 'Global shortcut stopped working');
        hotkey(keyboard);
        await until(() => !overlay._isOpen, 'Global shortcut did not toggle closed');
        checks.push('global shortcut toggles the modal closed');
        overlay.toggle();
        overlay._entry.set_text('physics');
        await until(() => overlay._appCount === 2 && overlay._files.get_children().length === 50,
            'Applications and files were not combined');
        assert(overlay._items[0].app && overlay._items[overlay._appCount].path,
            'Applications are not above files');
        await delay(200);
        await screenshot(`${root}/overlay-apps.png`);
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
        overlay._entry.set_text('re:^report-[0-9]+\\.log$');
        await until(() => overlay._appCount === 0 && overlay._files.get_children().length === 2,
            'Regular expression did not return the expected files');
        overlay._entry.set_text('re:[');
        await until(() => overlay._items.length === 0 && overlay._status.visible,
            'Invalid regular expression did not show an error');
        checks.push('one-character input, standard globs and regular expressions work in the overlay');
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
        await screenshot(`${root}/preferences.png`);
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_title()?.includes('Search Everything Lightly'))
                actor.meta_window.delete(global.get_current_time());
        }
        checks.push('real GTK preferences window opens');
        extension.disable();
    } catch (caught) {
        error = `${caught}\n${caught.stack}`;
    } finally {
        keyboard?.run_dispose();
    }
    GLib.file_set_contents(`${root}/result.json`, JSON.stringify({success: error === null, checks, error}));
}
