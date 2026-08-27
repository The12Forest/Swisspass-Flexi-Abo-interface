/**
 * Background Service Worker (MV3)
 * - Listens for captured tokens from content script
 * - Proxies ALL fetch requests from the popup (to bypass popup's stricter network policy)
 */

const DEFAULT_SERVER = 'http://localhost:3001';

async function getSettings() {
    return new Promise(resolve => {
        chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER }, resolve);
    });
}

/**
 * Generic fetch proxy - all requests from the popup go through here.
 * The background service worker has broader network access than the popup.
 */
async function doFetch(url, options = {}) {
    try {
        const res = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch {}
        return { ok: res.ok, status: res.status, body: json ?? text };
    } catch (err) {
        return { ok: false, status: 0, error: err.message || err.toString() };
    }
}

// ── Message handling ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // Generic proxy for any fetch from popup.js
    if (msg.type === 'FETCH_SERVER') {
        const { url, method, body } = msg;
        doFetch(url, {
            method: method || 'GET',
            body: body ? JSON.stringify(body) : undefined,
        }).then(sendResponse);
        return true; // keep channel open for async response
    }

    if (msg.type === 'GET_STATUS') {
        sendResponse({ ok: true });
        return true;
    }
});
