# Search Everything Lightly

[English](README.md) · [Русский](README.ru.md)

A fast, compact Spotlight-style search overlay for GNOME Shell 49. Press **Super+Enter**, type one character or more, choose an application, file or folder, and press Enter.

![Search overlay on GNOME Shell 49](screenshots/overlay.png)

## Highlights

- Applications appear first as square tiles using GNOME's application index and visibility rules.
- Ordinary file searches use **GNOME LocalSearch** as the primary source. It monitors normal files in the home directory and updates its index automatically.
- Optional **plocate** results add hidden files, system paths and other indexed locations.
- LocalSearch and plocate results are merged, deduplicated and ranked together.
- One-character queries, multiple words, standard glob masks and POSIX extended regular expressions are supported.
- The overlay opens as a compact search row, then expands once after the first input and keeps a stable size until closed.
- On multi-monitor desktops, the overlay opens on the focused window's monitor, or on the pointer's monitor when no window is focused.
- A 180 ms fade-and-scale opening animation follows the system animation preference.
- The desktop is not dimmed. The result list has a visible scrollbar and keeps the previous results visible while the next query is running.
- Everything stays local. There are no network requests, telemetry or stored query history.

## Search sources and automatic updates

Search Everything Lightly uses two complementary file sources:

| Source | Purpose | Updates |
|---|---|---|
| GNOME LocalSearch | Primary source for ordinary files and folders in the home directory | Automatic, usually within seconds |
| plocate | Optional source for hidden files, system files and additional indexed locations | Updated by the system timer or `sudo updatedb` |

The extension works for ordinary files without plocate and does not require the user to run `sudo updatedb`. If optional hidden or system results are missing or stale, refresh the plocate database:

```bash
sudo updatedb
```

On Fedora, check whether the regular system update is enabled:

```bash
systemctl status plocate-updatedb.timer
sudo systemctl enable --now plocate-updatedb.timer
```

The extension never requests administrator privileges and never runs `sudo` or `updatedb` itself.

LocalSearch deliberately skips some hidden files, Git repositories and configured exclusions. plocate coverage also follows `/etc/updatedb.conf` and the current user's path permissions. Consequently, excluded files may remain unavailable even after an index refresh.

## Query syntax

Ordinary terms are case-insensitive. Multiple words must all occur in the filename or path:

```text
physics report
```

### Filename glob masks

| Query | Meaning |
|---|---|
| `*.js` | Any basename ending in `.js` |
| `?.js` | Exactly one character before `.js` |
| `one*.js` | Basenames beginning with `one` and ending in `.js` |
| `project_[123].docx` | One listed character |
| `photo_[0-9].jpg` | One character in the specified range |
| `file[!0-9].txt` | One character outside the specified range |
| `one\*.js` | The literal text `one*.js` |

An unescaped `*`, `?` or valid `[…]` expression switches to whole-basename matching. Use `!` or `^` immediately after `[` for negation. Escape literal special characters as `\*`, `\?`, `\[` and `\]`.

Glob masks are handled by plocate. If plocate is not installed, ordinary LocalSearch queries continue to work, while masks show an actionable message.

### Regular expressions

Prefix a query with `re:` to use a case-insensitive POSIX extended regular expression against the complete basename:

| Query | Matches |
|---|---|
| `re:^report-[0-9]+\.pdf$` | `report-1.pdf`, `report-2026.pdf` |
| `re:\.(js|ts)$` | Names ending in `.js` or `.ts` |
| `re:^file[^0-9]\.txt$` | `fileA.txt`, but not `file5.txt` |

Use `[0-9]` instead of the PCRE-only shorthand `\d`. Invalid expressions produce an error in the overlay. Regular-expression searches require plocate and may be slower because plocate scans its index linearly; the extension keeps the 300-candidate limit and three-second timeout.

## Installation on Fedora

Dependencies for a source installation:

```bash
sudo dnf install localsearch tinysparql gettext make python3 glib2
```

Install plocate for hidden files, system files, glob masks and regular expressions:

```bash
sudo dnf install plocate
```

Build and install the extension:

```bash
make install
```

Log out and back in after the first installation on Wayland, then enable it:

```bash
make enable
make prefs
```

A prebuilt archive can be installed with:

```bash
gnome-extensions install --force dist/search_everything_lightly@dmitrykalinin5.github.com.shell-extension.zip
gnome-extensions enable search_everything_lightly@dmitrykalinin5.github.com
```

GNOME treats the previous `search-everything-lightly@ogultra` UUID as a different extension. Disable it before installing the current UUID:

```bash
gnome-extensions disable search-everything-lightly@ogultra
```

## Keyboard controls

| Key | Action |
|---|---|
| Super+Enter or the configured shortcut | Open or close the overlay |
| Escape | Close |
| ↑ / ↓ | Move between application rows and file results |
| ← / → | Move between application tiles |
| Enter | Launch the application or open the selected path |
| Ctrl+Enter | Open the parent folder |
| Shift+Enter | Reveal the item in Files, falling back to the parent folder |
| Ctrl+L | Return focus to the search entry |
| Ctrl+A | Select the full query |

The default shortcut is **Super+Enter**. Run `make prefs` to assign another shortcut when necessary.

## Settings

The preferences window contains the shortcut editor and a search-source status section. It explains that LocalSearch updates ordinary files automatically and that `sudo updatedb` is only useful when optional plocate results are missing or stale.

The GSettings schema is `org.gnome.shell.extensions.search-everything-lightly`; the shortcut key is `toggle-search` with type `as`.

## Development and verification

Additional development dependencies:

```bash
sudo dnf install nodejs gjs
```

Run the automated checks:

```bash
make lint
make test
make pack
python3 tests/run_shell_smoke.py
python3 tests/check_archive.py
```

The test suite uses a private plocate database and does not modify the system index. The headless Shell smoke test runs in a separate D-Bus session with two virtual 1280×900 monitors. It checks the global shortcut, monitor targeting, compact and expanded geometry, animations, focus, scrolling, application and file activation, masks, regular expressions, cancellation and extension cleanup.

Manual checks for real monitors, scaling and themes are listed in [tests/MANUAL.md](tests/MANUAL.md).

## Project structure

| Path | Responsibility |
|---|---|
| `extension.js` | Extension lifecycle and global shortcut |
| `src/searchOverlay.js` | Spotlight-style UI, debounce, focus and keyboard navigation |
| `src/searchEngine.js` | Hybrid backend orchestration, cancellation, merge and fallback |
| `src/localSearchEngine.js` | Asynchronous GNOME LocalSearch queries over D-Bus |
| `src/query.js`, `src/ranking.js` | Query preparation and result ranking |
| `src/applicationItem.js` | GNOME application search and tiles |
| `src/resultItem.js` | File result rows and asynchronous icons |
| `src/fileActions.js` | Opening paths and FileManager1 integration |
| `prefs.js` | GTK4/libadwaita preferences process |

## Privacy

All search and ranking happens locally. The extension does not send queries or file paths over the network and does not write them to the journal. It launches a file or application only after explicit user activation.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
