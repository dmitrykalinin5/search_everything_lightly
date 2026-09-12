// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {LocalSearchEngine} from './localSearchEngine.js';
import {buildArguments, isPatternQuery, isRegexQuery, queryState, RESULT_LIMIT} from './query.js';
import {rankResults} from './ranking.js';

export class SearchError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export class SearchEngine {
    constructor({command = 'plocate', database = null, timeoutMs = 3000,
        localSearch = undefined} = {}) {
        this._command = command;
        this._database = database;
        this._timeoutMs = timeoutMs;
        this._localSearch = localSearch === undefined ?
            new LocalSearchEngine({timeoutMs}) : localSearch;
        this._active = null;
        this._generation = 0;
        this.available = GLib.find_program_in_path(command) !== null;
    }

    cancel() {
        this._generation++;
        this._localSearch?.cancel();
        const request = this._active;
        this._active = null;
        if (!request)
            return;
        this._clearTimer(request);
        request.cancelled = true;
        request.process.force_exit();
        request.cancellable.cancel();
    }

    destroy() {
        this.cancel();
        this._localSearch?.destroy();
        this._localSearch = null;
    }

    _clearTimer(request) {
        if (request.timer) {
            GLib.Source.remove(request.timer);
            request.timer = 0;
        }
    }

    async _searchPlocate(query) {
        let process;
        try {
            process = Gio.Subprocess.new(
                buildArguments(this._command, query, this._database),
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch {
            throw new SearchError('launch-failed');
        }

        const request = {process, cancellable: new Gio.Cancellable(),
            timer: 0, timedOut: false, cancelled: false};
        this._active = request;
        request.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._timeoutMs, () => {
            request.timer = 0;
            request.timedOut = true;
            process.force_exit();
            request.cancellable.cancel();
            return GLib.SOURCE_REMOVE;
        });

        try {
            const [stdout, stderr] = await new Promise((resolve, reject) => {
                process.communicate_async(null, request.cancellable, (source, result) => {
                    try {
                        const [, out, err] = source.communicate_finish(result);
                        resolve([out, err]);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            if (request.cancelled)
                throw new SearchError('cancelled');
            const decoder = new TextDecoder();
            const errorOutput = decoder.decode(stderr.get_data()).trim();
            if (isRegexQuery(query) && errorOutput.startsWith('Error when compiling regex'))
                throw new SearchError('invalid-pattern');
            if (!process.get_if_exited() || process.get_exit_status() > 1 || errorOutput)
                throw new SearchError('index-unavailable');
            return decoder.decode(stdout.get_data()).split('\0')
                .filter(path => path.startsWith('/'));
        } catch (error) {
            if (request.timedOut)
                throw new SearchError('timeout');
            if (request.cancelled)
                throw new SearchError('cancelled');
            if (error instanceof SearchError)
                throw error;
            throw new SearchError('search-failed');
        } finally {
            this._clearTimer(request);
            if (this._active === request)
                this._active = null;
        }
    }

    async search(query) {
        this.cancel();
        const generation = this._generation;
        const state = queryState(query);
        if (state === 'short')
            return [];
        if (state !== 'ready')
            throw new SearchError(state === 'invalid-pattern' ? 'invalid-pattern' : 'invalid-query');

        const pattern = isPatternQuery(query);
        this.available = GLib.find_program_in_path(this._command) !== null;
        const searches = [];
        if (!pattern && this._localSearch)
            searches.push(this._localSearch.search(query));
        if (this.available)
            searches.push(this._searchPlocate(query));
        if (!searches.length)
            throw new SearchError(pattern ? 'pattern-backend-unavailable' : 'missing-dependency');

        const outcomes = await Promise.allSettled(searches);
        if (generation !== this._generation)
            throw new SearchError('cancelled');
        const paths = outcomes.filter(outcome => outcome.status === 'fulfilled')
            .flatMap(outcome => outcome.value);
        if (outcomes.some(outcome => outcome.status === 'fulfilled'))
            return rankResults(paths, query, GLib.get_home_dir(), RESULT_LIMIT);

        const errors = outcomes.map(outcome => outcome.reason);
        for (const code of ['invalid-pattern', 'timeout', 'index-unavailable',
            'launch-failed', 'search-failed']) {
            if (errors.some(error => error?.code === code))
                throw new SearchError(code);
        }
        throw new SearchError('missing-dependency');
    }
}
