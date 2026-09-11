// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {buildArguments, isRegexQuery, queryState, RESULT_LIMIT} from './query.js';
import {rankResults} from './ranking.js';

export class SearchError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export class SearchEngine {
    constructor({command = 'plocate', database = null, timeoutMs = 3000} = {}) {
        this._command = command;
        this._database = database;
        this._timeoutMs = timeoutMs;
        this._active = null;
        this.available = GLib.find_program_in_path(command) !== null;
    }

    cancel() {
        const request = this._active;
        this._active = null;
        if (!request)
            return;
        this._clearTimer(request);
        request.cancelled = true;
        request.process.force_exit();
        request.cancellable.cancel();
    }

    _clearTimer(request) {
        if (request.timer) {
            GLib.Source.remove(request.timer);
            request.timer = 0;
        }
    }

    async search(query) {
        this.cancel();
        const state = queryState(query);
        if (state === 'short')
            return [];
        if (state !== 'ready')
            throw new SearchError(state === 'invalid-pattern' ? 'invalid-pattern' : 'invalid-query');

        // Recheck so installing plocate does not require a Shell restart.
        this.available = GLib.find_program_in_path(this._command) !== null;
        if (!this.available)
            throw new SearchError('missing-dependency');

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
            // plocate uses exit 1 for BOTH no matches and database errors.
            // stderr distinguishes them; do not log paths or queries.
            if (!process.get_if_exited() || process.get_exit_status() > 1 || errorOutput)
                throw new SearchError('index-unavailable');
            const paths = decoder.decode(stdout.get_data()).split('\0')
                .filter(path => path.startsWith('/'));
            return rankResults(paths, query, GLib.get_home_dir(), RESULT_LIMIT);
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
}
