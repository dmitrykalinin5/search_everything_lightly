import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {SearchEngine} from '../src/searchEngine.js';
import {openPath} from '../src/fileActions.js';

const root = ARGV[0];
const engine = new SearchEngine({database: `${root}/test.db`, localSearch: null});
let passed = 0;

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

function localBackend(paths, errorCode = null) {
    return {
        calls: 0,
        async search() {
            this.calls++;
            if (errorCode) {
                const error = new Error(errorCode);
                error.code = errorCode;
                throw error;
            }
            return paths;
        },
        cancel() {},
        destroy() {},
    };
}

async function test(name, run) {
    await run();
    print(`ok - ${name}`);
    passed++;
}

async function expectCode(promise, code) {
    let error;
    try {
        await promise;
    } catch (caught) {
        error = caught;
    }
    assert(error?.code === code, `Expected ${code}, got ${error}`);
}

await test('real plocate: case-insensitive multiword search', async () => {
    const paths = await engine.search('PHYSICS lab');
    assert(paths.length === 1 && paths[0].endsWith('/physics_lab.pdf'), String(paths));
});
await test('real plocate: Cyrillic, emoji, hidden files and folders', async () => {
    for (const query of ['физика', '😀😀😀', '.hidden-report', 'folder-result'])
        assert((await engine.search(query)).length === 1, query);
});
await test('real plocate: NUL-delimited paths retain embedded newlines', async () => {
    assert((await engine.search('break'))[0].endsWith('/line\nbreak.txt'), 'Lost newline');
});
await test('real plocate: escaped glob characters, quotes, backslashes and shell syntax are literal', async () => {
    for (const query of ['literal\\[a\\]\\*\\?', 'back\\slash', '-leading', "quote'\"", '$(touch SEL_INJECTION)'])
        assert((await engine.search(query)).length === 1, query);
});
await test('real plocate: deleted entries excluded, empty query and no matches', async () => {
    for (const query of ['removed-report', 'no-such-file-2938', ''])
        assert((await engine.search(query)).length === 0, query);
});
await test('real plocate: one-character queries find files', async () => {
    assert((await engine.search('я')).length > 0, 'Single Cyrillic character did not search');
    assert((await engine.search('a')).some(path => path.endsWith('/a.js')), 'Single Latin character did not search');
});
await test('real plocate: star, question mark, prefix masks and escaping', async () => {
    const names = async query => (await engine.search(query)).map(path => GLib.path_get_basename(path)).sort();
    const allJs = await names('*.js');
    assert(allJs.includes('one-more.JS') && !allJs.includes('not-javascript.txt') &&
        !allJs.includes('one.js.backup'), String(allJs));
    assert(JSON.stringify(await names('?.js')) === JSON.stringify(['a.js', 'я.js', '😀.js'].sort()),
        'Question mark did not match exactly one Unicode character');
    assert(JSON.stringify(await names('one*.js')) === JSON.stringify(['one.js', 'one-more.JS', 'one*.js'].sort()),
        'Prefix mask matched unrelated names');
    assert(JSON.stringify(await names('one\\*.js')) === JSON.stringify(['one*.js']), 'Escaped star not literal');
});
await test('real plocate: glob lists, ranges and negated lists', async () => {
    const names = async query => (await engine.search(query)).map(path => GLib.path_get_basename(path)).sort();
    assert(JSON.stringify(await names('project_[123].docx')) ===
        JSON.stringify(['project_1.docx', 'project_2.docx']), 'Glob list failed');
    assert(JSON.stringify(await names('photo_[0-9].jpg')) ===
        JSON.stringify(['photo_1.jpg', 'photo_5.jpg']), 'Glob range failed');
    assert(JSON.stringify(await names('file[!0-9].txt')) === JSON.stringify(['fileA.txt']),
        'Negated glob list failed');
    assert(JSON.stringify(await names('file[^0-9].txt')) === JSON.stringify(['fileA.txt']),
        'Caret-negated glob list failed');
});
await test('real plocate: POSIX extended regular expressions and invalid syntax', async () => {
    const names = (await engine.search('re:^report-[0-9]{4}-(0[1-9]|1[0-2])\\.pdf$'))
        .map(path => GLib.path_get_basename(path)).sort();
    assert(JSON.stringify(names) === JSON.stringify(['report-2024-01.pdf', 'report-2025-12.PDF']),
        'Extended regular expression failed');
    await expectCode(engine.search('re:['), 'invalid-pattern');
});
await test('real plocate: 120 candidates limited to 50 results', async () => {
    assert((await engine.search('many-results')).length === 50, 'Incorrect result limit');
});
await test('LocalSearch and plocate results merge without duplicates', async () => {
    const localPath = `${root}/files/fresh-local-only.txt`;
    const duplicate = `${root}/files/physics_lab.pdf`;
    const local = localBackend([localPath, duplicate]);
    const hybrid = new SearchEngine({database: `${root}/test.db`, localSearch: local});
    const paths = await hybrid.search('physics');
    assert(paths.includes(localPath), 'LocalSearch-only result was lost');
    assert(paths.filter(path => path === duplicate).length === 1, 'Duplicate backend result remained');
    hybrid.destroy();
});
await test('LocalSearch works without plocate and patterns still require it', async () => {
    const path = `${root}/files/fresh-local-only.txt`;
    const local = localBackend([path]);
    const hybrid = new SearchEngine({command: `${root}/no-plocate`, localSearch: local});
    assert((await hybrid.search('fresh'))[0] === path, 'LocalSearch did not replace missing plocate');
    await expectCode(hybrid.search('*.txt'), 'pattern-backend-unavailable');
    assert(local.calls === 1, 'Pattern query was sent to LocalSearch');
    hybrid.destroy();
});
await test('missing or corrupt index is distinct from no matches', async () => {
    for (const database of [`${root}/absent.db`, `${root}/corrupt.db`]) {
        const broken = new SearchEngine({database, localSearch: null});
        await expectCode(broken.search('report'), 'index-unavailable');
        assert(broken._active === null, 'Request leaked');
    }
});
await test('missing dependency and invalid query produce actionable errors', async () => {
    const missing = new SearchEngine({command: `${root}/no-plocate`, localSearch: null});
    assert(!missing.available, 'Missing executable reported available');
    await expectCode(missing.search('report'), 'missing-dependency');
    await expectCode(engine.search('x'.repeat(257)), 'invalid-query');
    await expectCode(engine.search('abc\0def'), 'invalid-query');
});
await test('timeout terminates the subprocess and clears its timer', async () => {
    const slow = new SearchEngine({command: `${root}/slow-plocate`, timeoutMs: 30, localSearch: null});
    await expectCode(slow.search('slow'), 'timeout');
    assert(slow._active === null, 'Timed-out request leaked');
});
await test('a new query cancels the old process without cancelling its replacement', async () => {
    const racing = new SearchEngine({command: `${root}/slow-plocate`, localSearch: null});
    const old = expectCode(racing.search('slow'), 'cancelled');
    const paths = await racing.search('fresh');
    await old;
    assert(paths[0] === '/tmp/fresh-result', 'New result lost');
    assert(racing._active === null, 'Finished request leaked');
});
await test('repeated close/disable cancellation clears processes and timers', async () => {
    const racing = new SearchEngine({command: `${root}/slow-plocate`, localSearch: null});
    for (let i = 0; i < 10; i++) {
        const done = expectCode(racing.search('slow'), 'cancelled');
        racing.cancel();
        racing.cancel();
        await done;
    }
    assert(racing._active === null, 'Cancelled request leaked');
});
await test('missing file fails before launching an application', async () => {
    let rejected = false;
    try {
        await openPath(`${root}/missing-file`, 'open', null, new Gio.Cancellable());
    } catch (error) {
        rejected = error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND);
    }
    assert(rejected, 'Missing file was not rejected');
});
await test('search remains asynchronous while the process is running', async () => {
    const slow = new SearchEngine({command: `${root}/slow-plocate`, localSearch: null});
    let ticked = false;
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
        ticked = true;
        return GLib.SOURCE_REMOVE;
    });
    await slow.search('slow');
    assert(ticked, 'Main loop was blocked');
});
engine.cancel();
print(`${passed} GJS integration tests passed.`);
