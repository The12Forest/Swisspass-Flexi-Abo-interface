/**
 * Background Service Worker (MV3)
 * - Listens for captured tokens from content script
 * - Periodically sends cf_clearance cookies to the local server
 */

const DEFAULT_SERVER = 'http://localhost:3000';
const COOKIE_INTERVAL_MS = 5 * 60 * 1000; // 5 min

async function getSettings() {
    return new Promise(resolve => {
        chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER }, resolve);
    });
}

async function sendToServer(endpoint, body) {
    const { serverUrl } = await getSettings();
    const url = serverUrl.replace(/\/$/, '') + endpoint;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Read cf_clearance and related cookies from swisspass.ch */
async function getSwissPassCookies() {
    return new Promise(resolve => {
        chrome.cookies.getAll({ domain: 'swisspass.ch' }, cookies => {
            const result = {};
            const wanted = ['cf_clearance', '__cf_bm', '__cfruid', 'RememberMe', 'AL_LoginFromNewDevice'];
            for (const c of cookies) {
                if (wanted.includes(c.name)) {
                    result[c.name] = c.value;
                }
            }
            resolve(result);
        });
    });
}

/** Push cookies to the local server */
async function syncCookies() {
    const cookies = await getSwissPassCookies();
    if (!cookies.cf_clearance) return false;
    const ok = await sendToServer('/api/cookies', cookies);
    if (ok) console.log('[SwissPass Bridge] Cookies synced ✓');
    return ok;
}

// ── Message handling ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'TOKEN_CAPTURED' && msg.refreshToken) {
        sendToServer('/api/auth/token', { refreshToken: msg.refreshToken })
            .then(ok => {
                if (ok) console.log('[SwissPass Bridge] Refresh token sent ✓');
                sendResponse({ ok });
            });
        return true; // keep channel open for async response
    }

    if (msg.type === 'SYNC_NOW') {
        Promise.all([syncCookies()]).then(([cookieOk]) => {
            sendResponse({ cookieOk });
        });
        return true;
    }

    if (msg.type === 'GET_STATUS') {
        getSwissPassCookies().then(cookies => {
            sendResponse({ hasClearance: !!cookies.cf_clearance, cookies: Object.keys(cookies) });
        });
        return true;
    }
});

// ── Periodic cookie sync ──────────────────────────────────────────────────────
chrome.alarms.create('cookie-sync', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'cookie-sync') syncCookies();
});

// Sync on startup
syncCookies();
