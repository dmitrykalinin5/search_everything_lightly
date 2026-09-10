#!/usr/bin/env python3
"""Build a clean extension and installable zip using only system tools."""
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
UUID = json.loads((ROOT / 'metadata.json').read_text())['uuid']
stage = ROOT / 'build' / UUID
if stage.exists():
    shutil.rmtree(stage)
stage.mkdir(parents=True)
for name in ('extension.js', 'prefs.js', 'stylesheet.css', 'metadata.json', 'LICENSE', 'README.md'):
    shutil.copy2(ROOT / name, stage / name)
for name in ('src', 'schemas'):
    shutil.copytree(ROOT / name, stage / name, ignore=shutil.ignore_patterns('gschemas.compiled'))
subprocess.run(['glib-compile-schemas', '--strict', str(stage / 'schemas')], check=True)
locale = stage / 'locale' / 'ru' / 'LC_MESSAGES'
locale.mkdir(parents=True)
subprocess.run(['msgfmt', '--check', '-o', str(locale / 'search-everything-lightly.mo'),
                str(ROOT / 'po' / 'ru.po')], check=True)
(ROOT / 'dist').mkdir(exist_ok=True)
bundle = ROOT / 'dist' / f'{UUID}.shell-extension.zip'
with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(stage.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(stage))
print(f'Built {bundle.relative_to(ROOT)}')
