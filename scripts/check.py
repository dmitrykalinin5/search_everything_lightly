#!/usr/bin/env python3
"""Dependency-free syntax, schema, metadata and translation checks."""
import json
import ast
import gettext
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
metadata = json.loads((ROOT / 'metadata.json').read_text())
assert metadata['uuid'] == 'search_everything_lightly@dmitrykalinin5.github.com'
assert metadata['shell-version'] == ['49']
files = [ROOT / 'extension.js', ROOT / 'prefs.js', *sorted((ROOT / 'src').glob('*.js')),
         *sorted((ROOT / 'tests').glob('*.js'))]
for path in files:
    subprocess.run(['node', '--check', str(path)], check=True)
    text = path.read_text()
    for module in re.findall(r"from ['\"](\.[^'\"]+)['\"]", text):
        assert (path.parent / module).is_file(), f'Missing import: {path}: {module}'
subprocess.run(['glib-compile-schemas', '--strict', '--dry-run', str(ROOT / 'schemas')], check=True)
with tempfile.TemporaryDirectory(prefix='sel-lint-') as folder:
    subprocess.run(['msgfmt', '--check', '-o', str(Path(folder) / 'ru.mo'),
                    str(ROOT / 'po' / 'ru.po')], check=True)
    with (Path(folder) / 'ru.mo').open('rb') as catalog:
        translation = gettext.GNUTranslations(catalog)
    for path in [ROOT / 'prefs.js', *sorted((ROOT / 'src').glob('*.js'))]:
        for match in re.finditer(r"_\('((?:\\.|[^'\\])*)'\)", path.read_text()):
            message = ast.literal_eval("'" + match.group(1) + "'")
            assert translation.gettext(message) != message, f'Missing Russian translation: {message}'
print(f'Syntax checked: {len(files)} JavaScript files; metadata, imports, schema and Russian catalog OK.')
