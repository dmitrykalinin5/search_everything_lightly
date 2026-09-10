#!/usr/bin/env python3
"""Validate the bundle and install it with GNOME's CLI in temporary XDG directories."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
UUID = 'search-everything-lightly@ogultra'
archive = ROOT / 'dist' / f'{UUID}.shell-extension.zip'
with zipfile.ZipFile(archive) as bundle:
    names = bundle.namelist()
    assert bundle.testzip() is None
    assert len(names) == len(set(names))
    assert all(not name.startswith(('/', 'tests/', 'graphify-out/', '.')) and
               '..' not in Path(name).parts for name in names)
    assert json.loads(bundle.read('metadata.json'))['uuid'] == UUID
    assert b'shellSmoke' not in bundle.read('extension.js')
    assert {'schemas/gschemas.compiled', 'locale/ru/LC_MESSAGES/search-everything-lightly.mo',
            'LICENSE', 'README.md'} <= set(names)
    for name in names:
        assert bundle.read(name) == (ROOT / 'build' / UUID / name).read_bytes(), name
print(f'Archive verified: {len(names)} files, {archive.stat().st_size} bytes, no test hooks.')

with tempfile.TemporaryDirectory(prefix='sel-install-') as directory:
    work = Path(directory)
    env = dict(os.environ)
    for key, part in [('XDG_DATA_HOME', 'data'), ('XDG_CACHE_HOME', 'cache'),
                      ('XDG_CONFIG_HOME', 'config')]:
        env[key] = str(work / part)
        (work / part).mkdir()
    subprocess.run(['gnome-extensions', 'install', str(archive)], env=env, check=True, timeout=15)
    target = work / 'data' / 'gnome-shell/extensions' / UUID
    for name in names:
        assert (target / name).is_file(), name
print('Clean archive installation verified in temporary XDG directories.')
