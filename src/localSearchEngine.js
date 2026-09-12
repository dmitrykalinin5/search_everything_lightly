// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Tsparql from 'gi://Tsparql?version=3.0';

import {CANDIDATE_LIMIT, queryTerms} from './query.js';

const SERVICE_NAME = 'org.freedesktop.LocalSearch3';

function backendError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function buildStatement(query) {
    const bindings = queryTerms(query).map((term, index) => [`term${index}`, term]);
    const filters = bindings.map(([name]) =>
        `(CONTAINS(LCASE(?fileName), LCASE(~${name})) || ` +
        `CONTAINS(LCASE(STR(?url)), LCASE(~${name})))`);
    return {
        sparql: `SELECT DISTINCT ?url WHERE {
            GRAPH tracker:FileSystem {
                ?file a nfo:FileDataObject ;
                    nie:url ?url ;
                    nfo:fileName ?fileName .
                FILTER (${filters.join(' && ')})
            }
        } LIMIT ${CANDIDATE_LIMIT}`,
        bindings,
    };
}

export class LocalSearchEngine {
    constructor({timeoutMs = 3000} = {}) {
        this._timeoutMs = timeoutMs;
        this._connection = null;
        this._active = null;
    }

    cancel() {
        const request = this._active;
        this._active = null;
        if (!request)
            return;
        if (request.timer)
            GLib.Source.remove(request.timer);
        request.timer = 0;
        request.cancelled = true;
        request.cancellable.cancel();
    }

    destroy() {
        this.cancel();
        this._connection?.close();
        this._connection = null;
    }

    async _connect(cancellable) {
        if (this._connection)
            return this._connection;
        const connection = await new Promise((resolve, reject) => {
            Tsparql.SparqlConnection.bus_new_async(
                SERVICE_NAME, null, null, cancellable, (_source, result) => {
                    try {
                        resolve(Tsparql.SparqlConnection.bus_new_finish(result));
                    } catch (error) {
                        reject(error);
                    }
                });
        });
        if (this._connection) {
            connection.close();
        } else {
            this._connection = connection;
        }
        return this._connection;
    }

    async _execute(statement, cancellable) {
        return new Promise((resolve, reject) => {
            statement.execute_async(cancellable, (source, result) => {
                try {
                    resolve(source.execute_finish(result));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async _next(cursor, cancellable) {
        return new Promise((resolve, reject) => {
            cursor.next_async(cancellable, (source, result) => {
                try {
                    resolve(source.next_finish(result));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async search(query) {
        this.cancel();
        const request = {cancellable: new Gio.Cancellable(), timer: 0,
            timedOut: false, cancelled: false};
        this._active = request;
        request.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._timeoutMs, () => {
            request.timer = 0;
            request.timedOut = true;
            request.cancellable.cancel();
            return GLib.SOURCE_REMOVE;
        });
        let cursor = null;
        try {
            const connection = await this._connect(request.cancellable);
            if (request.cancelled)
                throw backendError('cancelled');
            const {sparql, bindings} = buildStatement(query);
            const statement = connection.query_statement(sparql, request.cancellable);
            for (const [name, value] of bindings)
                statement.bind_string(name, value);
            cursor = await this._execute(statement, request.cancellable);
            const paths = [];
            while (paths.length < CANDIDATE_LIMIT &&
                await this._next(cursor, request.cancellable)) {
                const [uri] = cursor.get_string(0);
                const path = Gio.File.new_for_uri(uri).get_path();
                if (path)
                    paths.push(path);
            }
            return paths;
        } catch (error) {
            if (request.timedOut)
                throw backendError('timeout');
            if (request.cancelled)
                throw backendError('cancelled');
            this._connection?.close();
            this._connection = null;
            throw backendError('local-search-unavailable');
        } finally {
            cursor?.close();
            if (request.timer)
                GLib.Source.remove(request.timer);
            request.timer = 0;
            if (this._active === request)
                this._active = null;
        }
    }
}
