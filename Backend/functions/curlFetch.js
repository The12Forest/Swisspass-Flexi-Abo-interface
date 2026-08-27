import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Performs an HTTP GET via the system `curl` binary.
 * This bypasses Cloudflare's TLS fingerprinting which blocks Node.js's built-in fetch.
 *
 * @param {string} url
 * @param {Record<string,string>} headers
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function curlFetch(url, headers = {}) {
    const args = [
        '--silent',
        '--compressed',
        '--location',
        '--write-out', '\n__STATUS__%{http_code}',
        '--tlsv1.2',
        '--tls-max', '1.3',
    ];

    for (const [k, v] of Object.entries(headers)) {
        args.push('-H', `${k}: ${v}`);
    }

    args.push(url);

    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 });

    const statusMatch = stdout.match(/\n__STATUS__(\d+)$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const body = statusMatch ? stdout.slice(0, -statusMatch[0].length) : stdout;

    return { status, body };
}

/**
 * Performs an HTTP PUT via curl (for activating days — empty body).
 */
export async function curlPut(url, headers = {}) {
    const args = [
        '--silent',
        '--compressed',
        '--location',
        '--write-out', '\n__STATUS__%{http_code}',
        '-X', 'PUT',
        '--tlsv1.2',
        '--tls-max', '1.3',
    ];

    for (const [k, v] of Object.entries(headers)) {
        args.push('-H', `${k}: ${v}`);
    }

    args.push(url);

    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 1 * 1024 * 1024 });
    const statusMatch = stdout.match(/\n__STATUS__(\d+)$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const body = statusMatch ? stdout.slice(0, -statusMatch[0].length) : stdout;

    if (status >= 400) throw new Error(`PUT ${url} returned ${status}: ${body.substring(0, 200)}`);
    return { status, body };
}

/**
 * Performs an HTTP DELETE via curl.
 */
export async function curlDelete(url, headers = {}) {
    const args = [
        '--silent',
        '--compressed',
        '--location',
        '--write-out', '\n__STATUS__%{http_code}',
        '-X', 'DELETE',
        '--tlsv1.2',
        '--tls-max', '1.3',
    ];

    for (const [k, v] of Object.entries(headers)) {
        args.push('-H', `${k}: ${v}`);
    }

    args.push(url);

    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 1 * 1024 * 1024 });
    const statusMatch = stdout.match(/\n__STATUS__(\d+)$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const body = statusMatch ? stdout.slice(0, -statusMatch[0].length) : stdout;

    if (status >= 400) throw new Error(`DELETE ${url} returned ${status}: ${body.substring(0, 200)}`);
    return { status, body };
}
