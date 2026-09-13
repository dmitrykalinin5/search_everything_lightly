#!/usr/bin/env python3
"""Run UI/lifecycle checks in a private headless GNOME Shell (never the live desktop)."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
UUID = 'search_everything_lightly@dmitrykalinin5.github.com'


def session(work):
    log_path = work / 'shell.log'
    with log_path.open('w') as log:
        shell = subprocess.Popen(['gnome-shell', '--headless', '--virtual-monitor', '1280x900',
                                  '--virtual-monitor', '1280x900',
                                  '--no-x11', '--force-animations', '--wayland-display', 'sel-test'],
                                 stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                if shell.poll() is not None:
                    raise RuntimeError('Headless Shell exited')
                result = subprocess.run(['gdbus', 'call', '--session', '--dest', 'org.gnome.Shell',
                                         '--object-path', '/org/gnome/Shell', '--method',
                                         'org.gnome.Shell.Extensions.ListExtensions'],
                                        capture_output=True, text=True, timeout=3)
                if UUID in result.stdout:
                    break
                time.sleep(0.25)
            else:
                raise RuntimeError('Extension was not discovered')
            subprocess.run(['gdbus', 'call', '--session', '--dest', 'org.gnome.Shell',
                            '--object-path', '/org/gnome/Shell', '--method',
                            'org.gnome.Shell.Extensions.EnableExtension', UUID], check=True)
            deadline = time.monotonic() + 35
            while time.monotonic() < deadline:
                if (work / 'result.json').exists():
                    result = json.loads((work / 'result.json').read_text())
                    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
                    if not result['success']:
                        raise RuntimeError(result['error'])
                    return
                if shell.poll() is not None:
                    raise RuntimeError('Shell exited during the smoke test')
                time.sleep(0.25)
            raise RuntimeError('UI checks timed out; inspect shell.log')
        finally:
            shell.terminate()
            try:
                shell.wait(timeout=5)
            except subprocess.TimeoutExpired:
                shell.kill()
                shell.wait()
            print(f'Test artifacts: {work}', flush=True)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--session':
        session(Path(sys.argv[2]))
        return
    shell_version = subprocess.check_output(['gnome-shell', '--version'], text=True).strip()
    print(f'Testing {shell_version}', flush=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts/build.py')], check=True)
    work = Path(tempfile.mkdtemp(prefix='sel-shell-'))
    for part in ['data', 'config', 'cache', 'state', 'runtime', 'files']:
        (work / part).mkdir(mode=0o700)
    for index in range(120):
        (work / 'files' / f'Physics report {index:03}.pdf').write_text('%PDF-1.7\n')
    for name in ['project_1.docx', 'project_2.docx', 'project_4.docx',
                 'report-2024.log', 'report-2025.LOG', 'report-final.txt']:
        (work / 'files' / name).touch()
    (work / 'files' / 'Physics reports').mkdir()
    applications = work / 'data/applications'
    applications.mkdir()
    recorder = work / 'record.py'
    recorder.write_text('import sys\nfrom pathlib import Path\n'
                        f'Path({str(work / "opened-uri")!r}).write_text(sys.argv[1])\n')
    (applications / 'sel-test.desktop').write_text(
        '[Desktop Entry]\nType=Application\nName=Test URI recorder\n'
        f'Exec=/usr/bin/python3 {recorder} %u\nNoDisplay=true\n'
        'MimeType=application/pdf;inode/directory;\n')
    for index, (name, icon) in enumerate([('Physics Notes', 'accessories-text-editor'),
                                         ('Physics Files', 'system-file-manager')]):
        (applications / f'sel-demo-{index}.desktop').write_text(
            f'[Desktop Entry]\nType=Application\nName={name}\nIcon={icon}\n'
            f'Exec=/usr/bin/python3 {recorder} app-{index}\nCategories=Utility;\n')
    (work / 'config/mimeapps.list').write_text(
        '[Default Applications]\napplication/pdf=sel-test.desktop\n'
        'inode/directory=sel-test.desktop\n')
    subprocess.run(['updatedb', '-U', str(work / 'files'), '-o', str(work / 'test.db'),
                    '--prunepaths', '', '--prunefs', '', '--prunenames', '',
                    '--prune-bind-mounts', 'no', '--require-visibility', 'no'], check=True)
    target = work / 'data/gnome-shell/extensions' / UUID
    shutil.copytree(ROOT / 'build' / UUID, target)
    # Instrument only the disposable copy. Nothing in the shipped extension
    # loads the test driver, writes screenshots, or enables Shell's unsafe mode.
    (target / 'tests').mkdir()
    shutil.copy2(ROOT / 'tests' / 'shellSmoke.js', target / 'tests')
    entry = target / 'extension.js'
    text = entry.read_text().replace('    enable() {',
        "    enable() {\n        if (!this._smokeStarted) {\n"
        "            this._smokeStarted = true;\n"
        "            import('./tests/shellSmoke.js').then(module => module.run(this));\n"
        "        }", 1)
    entry.write_text(text)
    env = dict(os.environ)
    for key, part in [('XDG_DATA_HOME', 'data'), ('XDG_CONFIG_HOME', 'config'),
                      ('XDG_CACHE_HOME', 'cache'), ('XDG_STATE_HOME', 'state'),
                      ('XDG_RUNTIME_DIR', 'runtime')]:
        env[key] = str(work / part)
    env.update(GSETTINGS_BACKEND='memory', GNOME_SHELL_SLOWDOWN_FACTOR='0',
               LIBGL_ALWAYS_SOFTWARE='1', SEL_SMOKE_ROOT=str(work))
    for key in ['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_ID']:
        env.pop(key, None)
    with (work / 'session.log').open('w') as session_log:
        completed = subprocess.run(['dbus-run-session', '--', sys.executable, str(Path(__file__).resolve()),
                                    '--session', str(work)], env=env, stderr=session_log)
    if (work / 'shell.log').exists():
        shutil.copy2(work / 'shell.log', ROOT / 'build' / 'shell-smoke.log')
    (ROOT / 'build' / 'shell-smoke-path').write_text(str(work))
    if completed.returncode:
        print((work / 'session.log').read_text(), file=sys.stderr)
    sys.exit(completed.returncode)


if __name__ == '__main__':
    main()
