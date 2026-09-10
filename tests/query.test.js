import assert from 'node:assert/strict';
import test from 'node:test';
import {abbreviatePath, buildArguments, displayText, queryState, queryTerms} from '../src/query.js';

test('guards empty, short, overlong and NUL input; counts Unicode characters', () => {
    for (const query of ['', '  ', ' ab ', 'яя', '😀😀'])
        assert.equal(queryState(query), 'short');
    for (const query of ['abc', 'физ', '😀😀😀', 'a'.repeat(256)])
        assert.equal(queryState(query), 'ready');
    for (const query of ['a'.repeat(257), 'abc\0def'])
        assert.equal(queryState(query), 'invalid');
});

test('multiple words form AND terms', () => {
    assert.deepEqual(queryTerms(' physics  lab\t3 '), ['physics', 'lab', '3']);
});

test('arguments protect options, shell syntax, and literal glob characters', () => {
    const args = buildArguments('/usr/bin/plocate', '--help a*b [x]? \\ $(id)');
    assert.deepEqual(args.slice(args.indexOf('--') + 1),
        ['*--help*', '*a\\*b*', '*\\[x\\]\\?*', '*\\\\*', '*$(id)*']);
    assert.ok(args.includes('--null'));
    assert.ok(args.includes('--existing'));
    assert.deepEqual(buildArguments('plocate', 'abc', '/tmp/test.db').slice(-4),
        ['--database', '/tmp/test.db', '--', '*abc*']);
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
