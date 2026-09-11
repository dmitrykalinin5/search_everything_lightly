#!/usr/bin/env python3
"""Use a private plocate database; never rebuild the system index."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='sel-tests-') as folder:
    work = Path(folder)
    files = work / 'files'
    files.mkdir()
    names = ['physics_lab.pdf', 'ФИЗИКА отчёт.txt', 'emoji-😀😀😀.txt',
             'line\nbreak.txt', 'literal[a]*?.txt', 'literalXaZZZ.txt',
             'back\\slash.txt', '-leading-option.txt', '.hidden-report.txt',
             "quote'\" $(touch SEL_INJECTION).txt", 'removed-report.txt']
    names += ['a.js', 'я.js', '😀.js', 'ab.js', 'one.js', 'one-more.JS',
              'someone.js', '.js', 'one.js.backup', 'one*.js']
    names += ['project_1.docx', 'project_2.docx', 'project_4.docx',
              'photo_1.jpg', 'photo_5.jpg', 'photo_12.jpg',
              'fileA.txt', 'file5.txt', 'report-2024-01.pdf',
              'report-2025-12.PDF', 'report-2025-13.pdf', 'report-final.pdf']
    for name in names:
        (files / name).touch()
    for index in range(120):
        (files / f'many-results-{index:03}.txt').touch()
    (files / 'folder-result').mkdir()
    (files / 'nested.js').mkdir()
    (files / 'nested.js' / 'not-javascript.txt').touch()
    database = work / 'test.db'
    subprocess.run(['updatedb', '--database-root', str(files), '--output', str(database),
                    '--prunepaths', '', '--prunefs', '', '--prunenames', '',
                    '--prune-bind-mounts', 'no', '--require-visibility', 'no'], check=True)
    (files / 'removed-report.txt').unlink()
    (work / 'corrupt.db').write_text('not a plocate database')
    fake = work / 'slow-plocate'
    fake.write_text('#!/usr/bin/python3\nimport sys, time\n'
                    'time.sleep(0.3 if "*slow*" in sys.argv else 0.01)\n'
                    'sys.stdout.buffer.write(b"/tmp/fresh-result\\x00")\n')
    fake.chmod(0o755)
    subprocess.run(['gjs', '-m', str(ROOT / 'tests' / 'integration.js'), str(work)],
                   cwd=work, check=True, timeout=30)
    assert not (work / 'SEL_INJECTION').exists(), 'Query executed a shell command!'
