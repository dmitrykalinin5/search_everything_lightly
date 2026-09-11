import assert from 'node:assert/strict';
import test from 'node:test';
import {abbreviatePath, buildArguments, displayText, hasWildcards, isPatternQuery,
    isRegexQuery, queryState, queryTerms} from '../src/query.js';

test('accepts one character while guarding empty, overlong and NUL input', () => {
    for (const query of ['', '  '])
        assert.equal(queryState(query), 'short');
    for (const query of ['a', ' я ', '😀', '*', 'abc', 'физ', 'a'.repeat(256)])
        assert.equal(queryState(query), 'ready');
    for (const query of ['a'.repeat(257), 'abc\0def'])
        assert.equal(queryState(query), 'invalid');
    assert.equal(queryState('re:'), 'invalid-pattern');
});

test('multiple words form AND terms', () => {
    assert.deepEqual(queryTerms(' physics  lab\t3 '), ['physics', 'lab', '3']);
});

test('arguments protect options, shell syntax, and escaped literal characters', () => {
    const args = buildArguments('/usr/bin/plocate', '--help a\\*b \\[x\\]\\? \\ $(id)');
    assert.deepEqual(args.slice(args.indexOf('--') + 1),
        ['*--help*', '*a\\*b*', '*\\[x\\]\\?*', '*\\\\*', '*$(id)*']);
    assert.ok(args.includes('--null'));
    assert.ok(args.includes('--existing'));
    assert.ok(!args.includes('--basename'));
    assert.deepEqual(buildArguments('plocate', 'abc', '/tmp/test.db').slice(-4),
        ['--database', '/tmp/test.db', '--', '*abc*']);
});

test('standard glob patterns match the entire basename', () => {
    for (const query of ['*.js', '?.js', 'one*.js', 'project_[123].docx',
        'photo_[0-9].jpg', 'file[!0-9].txt', 'file[^0-9].txt']) {
        const args = buildArguments('plocate', query);
        assert.ok(args.includes('--basename'));
        assert.equal(args.at(-1), query);
        assert.ok(hasWildcards(query));
    }
    const args = buildArguments('plocate', 'one *.js');
    assert.deepEqual(args.slice(args.indexOf('--') + 1), ['*one*', '*.js']);
    assert.equal(hasWildcards('one\\*.js'), false);
    assert.equal(hasWildcards('\\[a\\]'), false);
    assert.equal(hasWildcards('file[abc'), false);
    assert.equal(buildArguments('plocate', 'file[abc').at(-1), '*file\\[abc*');
    assert.equal(hasWildcards('one\\\\*.js'), true);
});

test('re: enables POSIX extended regular expressions on the basename', () => {
    const query = 're:^report-[0-9]{4}-(0[1-9]|1[0-2])\\.pdf$';
    const args = buildArguments('plocate', query);
    assert.ok(args.includes('--basename'));
    assert.ok(args.includes('--regex'));
    assert.equal(args.at(-1), query.slice(3));
    assert.equal(isRegexQuery(query), true);
    assert.equal(isPatternQuery(query), true);
    assert.equal(isRegexQuery('report-[0-9]'), false);
});

test('HOME abbreviation respects directory boundaries', () => {
    assert.equal(abbreviatePath('/home/me/a', '/home/me'), '~/a');
    assert.equal(abbreviatePath('/home/me', '/home/me'), '~');
    assert.equal(abbreviatePath('/home/me2/a', '/home/me'), '/home/me2/a');
});

test('control characters are replaced only for display', () => {
    assert.equal(displayText('file\nname\t\u202etxt'), 'file�name��txt');
    assert.equal(displayText('Физика 😀 [1].pdf'), 'Физика 😀 [1].pdf');
});
