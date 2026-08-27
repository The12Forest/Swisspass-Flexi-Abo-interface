import { curlFetch } from "./curlFetch.js";
import { cookieStore } from "./cookieStore.js";
import log from "./log.js";
const console = { log: log('SwisspassAPI'), warn: log('SwisspassAPI'), error: log('SwisspassAPI') };

const BASE = 'https://www.swisspass.ch';

function getHeaders(token) {
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'de',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0',
        'Referer': `${BASE}/info/abos/list`,
        'Origin': BASE,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
    };
    const cookie = cookieStore.getCookieHeader();
    if (cookie) headers['Cookie'] = cookie;
    return headers;
}

async function swisspassGet(token, path) {
    const res = await curlFetch(`${BASE}${path}`, getHeaders(token));
    if (res.status !== 200) {
        throw new Error(`SwissPass API ${path} returned ${res.status}`);
    }
    return JSON.parse(res.body);
}

async function swisspassPost(token, path, body) {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const headers = getHeaders(token);
    headers['Content-Type'] = 'application/json';

    const args = ['--silent', '--compressed', '--location',
        '--write-out', '\n__STATUS__%{http_code}',
        '-X', 'POST',
        '--data', JSON.stringify(body),
        '--tlsv1.2', '--tls-max', '1.3',
    ];
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    args.push(`${BASE}${path}`);

    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 5 * 1024 * 1024 });
    const statusMatch = stdout.match(/\n__STATUS__(\d+)$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const responseBody = statusMatch ? stdout.slice(0, -statusMatch[0].length) : stdout;
    if (status >= 400) throw new Error(`SwissPass API POST ${path} returned ${status}: ${responseBody.substring(0, 200)}`);
    return responseBody ? JSON.parse(responseBody) : {};
}

async function swisspassDelete(token, path, body) {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const headers = getHeaders(token);
    if (body) headers['Content-Type'] = 'application/json';

    const args = ['--silent', '--compressed', '--location',
        '--write-out', '\n__STATUS__%{http_code}',
        '-X', 'DELETE',
        '--tlsv1.2', '--tls-max', '1.3',
    ];
    if (body) args.push('--data', JSON.stringify(body));
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    args.push(`${BASE}${path}`);

    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 5 * 1024 * 1024 });
    const statusMatch = stdout.match(/\n__STATUS__(\d+)$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const responseBody = statusMatch ? stdout.slice(0, -statusMatch[0].length) : stdout;
    if (status >= 400) throw new Error(`SwissPass API DELETE ${path} returned ${status}: ${responseBody.substring(0, 200)}`);
    return responseBody ? JSON.parse(responseBody) : {};
}

/** Get all FlexiAbo subscriptions */
async function getSubscriptions(token) {
    const data = await swisspassGet(token, '/public/api/leistungen/v7/abonnements');
    return data.abonnements.filter(
        abo => abo.abotyp === 'flexiabo' && abo.status === 'GUELTIG'
    );
}

/** Get activated days for a FlexiAbo (leistungId) */
async function getActivatedDays(token, leistungId) {
    try {
        const data = await swisspassGet(token, `/public/api/leistungen/v7/abonnements/${leistungId}/ausflugstage`);
        // Returns array of activated day objects or a wrapper
        return Array.isArray(data) ? data : (data.ausflugstage || data.tage || data || []);
    } catch (err) {
        console.warn('getActivatedDays error:', err.message);
        return [];
    }
}

async function swisspassPut(token, path) {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const headers = getHeaders(token);

    const args = ['--silent', '--compressed', '--location',
        '--write-out', '\n__STATUS__%{http_code}',
        '-X', 'PUT',
        '--tlsv1.2', '--tls-max', '1.3',
    ];
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    args.push(`${BASE}${path}`);

    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 5 * 1024 * 1024 });
    const statusMatch = stdout.match(/\n__STATUS__(\d+)$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const responseBody = statusMatch ? stdout.slice(0, -statusMatch[0].length) : stdout;
    if (status >= 400) throw new Error(`SwissPass API PUT ${path} returned ${status}: ${responseBody.substring(0, 200)}`);
    return responseBody ? JSON.parse(responseBody) : {};
}

/** Activate a day for a FlexiAbo */
async function activateDay(token, leistungId, date) {
    // date format: "YYYY-MM-DD"
    return await swisspassPut(token, `/public/api/leistungen/v7/abonnements/${leistungId}/ausflugstage/${date}`);
}

/** Deactivate a day for a FlexiAbo */
async function deactivateDay(token, leistungId, date) {
    return await swisspassDelete(token, `/public/api/leistungen/v7/abonnements/${leistungId}/ausflugstage/${date}`);
}

export { getSubscriptions, getActivatedDays, activateDay, deactivateDay };
