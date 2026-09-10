// SPDX-License-Identifier: GPL-3.0-or-later
export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 256;
export const RESULT_LIMIT = 50;
export const CANDIDATE_LIMIT = 300;
export const DEBOUNCE_MS = 100;

export function queryTerms(query) {
    return query.trim().split(/\s+/u).filter(Boolean);
}

export function queryState(query) {
    if (query.includes('\0') || [...query].length > MAX_QUERY_LENGTH)
        return 'invalid';
    return [...query.trim()].length < MIN_QUERY_LENGTH ? 'short' : 'ready';
}

export function buildArguments(command, query, database = null) {
    const args = [command, '--ignore-case', '--existing', '--null',
        '--limit', String(CANDIDATE_LIMIT)];
    if (database !== null)
        args.push('--database', database);
    // Always use a substring glob, escaping user-supplied glob characters.
    // plocate combines multiple arguments with AND; no shell is involved.
    args.push('--', ...queryTerms(query).map(term =>
        `*${term.replace(/[\\*?\[\]]/g, '\\$&')}*`));
    return args;
}

export function abbreviatePath(path, home) {
    if (path === home)
        return '~';
    return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export function displayText(text) {
    // Keep unusual filenames from changing the layout; retain original paths
    // for Gio actions, including embedded newlines and other control chars.
    return text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '�');
}
