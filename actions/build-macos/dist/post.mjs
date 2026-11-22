import { s as setFailed, h as getState, i as deleteKeychain } from './credentials.mjs';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve, basename, join } from 'node:path';
import 'os';
import 'crypto';
import 'fs';
import 'path';
import 'http';
import 'https';
import 'net';
import 'tls';
import 'events';
import 'assert';
import 'util';
import 'node:assert';
import 'node:net';
import 'node:http';
import 'node:stream';
import 'node:buffer';
import 'node:util';
import 'node:querystring';
import 'node:events';
import 'node:diagnostics_channel';
import 'node:tls';
import 'node:zlib';
import 'node:perf_hooks';
import 'node:util/types';
import 'node:worker_threads';
import 'node:crypto';
import 'node:http2';
import 'node:url';
import 'node:async_hooks';
import 'node:console';
import 'node:dns';
import 'string_decoder';
import 'child_process';
import 'timers';
import 'node:child_process';

function clean() {
    const work = getState('work');
    if (!work || !existsSync(work))
        return;
    const temp = process.env.RUNNER_TEMP;
    if (!temp || dirname(resolve(work)) !== resolve(temp) || !/^build-macos-[a-zA-Z0-9]{6}$/.test(basename(work))) {
        throw new Error('Unexpected cleanup directory');
    }
    try {
        const keychain = join(work, 'private/signing.keychain-db');
        deleteKeychain(keychain);
    }
    finally {
        rmSync(work, { recursive: true, force: true });
    }
}
try {
    clean();
}
catch (error) {
    setFailed(error instanceof Error ? error.message : String(error));
}
