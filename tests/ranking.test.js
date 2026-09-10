import assert from 'node:assert/strict';
import test from 'node:test';
import {rankResults} from '../src/ranking.js';

test('exact name, stem, prefix, substring, then path-only match', () => {
    const paths = ['/home/me/lab3/other.txt', '/home/me/my-lab3.pdf',
        '/home/me/lab3-report.txt', '/home/me/lab3.pdf', '/home/me/lab3'];
    assert.deepEqual(rankResults(paths, 'lab3', '/home/me', 50), [...paths].reverse());
});

test('HOME, other user directories, mounts, then system paths within each tier', () => {
    const paths = ['/usr/share/report.txt', '/mnt/disk/report.txt',
        '/home/other/report.txt', '/home/me/report.txt'];
    assert.deepEqual(rankResults(paths, 'report', '/home/me', 50), [...paths].reverse());
    assert.equal(rankResults(['/home/me/report-other', '/usr/report'], 'report', '/home/me', 50)[0],
        '/usr/report');
});

test('case insensitive Cyrillic and canonical Unicode ranking', () => {
    assert.equal(rankResults(['/home/me/ФИЗИКА.txt', '/home/me/моя-физика.txt'],
        'физика', '/home/me', 50)[0], '/home/me/ФИЗИКА.txt');
    assert.equal(rankResults(['/home/me/cafe\u0301', '/home/me/café.txt'],
        'café', '/home/me', 50)[0], '/home/me/cafe\u0301');
});

test('all words in the name beat words split across directories', () => {
    assert.equal(rankResults(['/home/me/physics/lab.txt', '/home/me/physics_lab.pdf'],
        'physics lab', '/home/me', 50)[0], '/home/me/physics_lab.pdf');
});

test('deduplication, cap and deterministic tie breaking', () => {
    const paths = ['/home/me/z/report', '/home/me/a/report', '/home/me/a/report'];
    assert.deepEqual(rankResults(paths, 'report', '/home/me', 50),
        ['/home/me/a/report', '/home/me/z/report']);
    assert.equal(rankResults(paths, 'report', '/home/me', 1).length, 1);
});
