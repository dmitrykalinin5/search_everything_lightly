// SPDX-License-Identifier: GPL-3.0-or-later
import {queryTerms} from './query.js';

function normalize(text) {
    return text.normalize('NFC').toLowerCase();
}

function matchRank(name, query, terms) {
    if (name === query)
        return 0;
    const dot = name.lastIndexOf('.');
    if (dot > 0 && name.slice(0, dot) === query)
        return 1;
    if (name.startsWith(query))
        return 2;
    if (terms.every(term => name.includes(term)))
        return 3;
    return 4;
}

function locationRank(path, home) {
    if (path === home || path.startsWith(`${home}/`))
        return 0;
    if (path.startsWith('/home/'))
        return 1;
    if (['/run/media/', '/media/', '/mnt/'].some(root => path.startsWith(root)))
        return 2;
    return 3;
}

export function rankResults(paths, query, home, limit) {
    const normalized = normalize(query.trim());
    const terms = queryTerms(normalized);
    return [...new Set(paths)].map(path => {
        const name = normalize(path.slice(path.lastIndexOf('/') + 1));
        return {path, name, match: matchRank(name, normalized, terms),
            location: locationRank(path, home)};
    }).sort((a, b) => a.match - b.match || a.location - b.location ||
        a.name.localeCompare(b.name) || a.path.localeCompare(b.path))
        .slice(0, limit).map(result => result.path);
}
