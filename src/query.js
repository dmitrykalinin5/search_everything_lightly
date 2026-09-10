// SPDX-License-Identifier: GPL-3.0-or-later
export const MIN_QUERY_LENGTH = 1;
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

function parseTerm(term) {
    let pattern = '';
    let wildcard = false;
    for (let i = 0; i < term.length; i++) {
        const character = term[i];
        if (character === '\\' && ['*', '?', '\\'].includes(term[i + 1])) {
            pattern += `\\${term[++i]}`;
        } else if (character === '*' || character === '?') {
            wildcard = true;
            pattern += character;
        } else {
            pattern += character.replace(/[\\\[\]]/g, '\\$&');
        }
    }
    return {pattern, wildcard};
}

export function hasWildcards(query) {
    return queryTerms(query).some(term => parseTerm(term).wildcard);
}

export function buildArguments(command, query, database = null) {
    const args = [command, '--ignore-case', '--existing', '--null',
        '--limit', String(CANDIDATE_LIMIT)];
    if (database !== null)
        args.push('--database', database);
    const terms = queryTerms(query).map(parseTerm);
    // A mask matches the whole basename, so ?.js cannot match a directory
    // component or main.js. Plain terms retain the existing substring search.
    if (terms.some(term => term.wildcard))
        args.push('--basename');
    args.push('--', ...terms.map(term => term.wildcard ? term.pattern : `*${term.pattern}*`));
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
