/**
 * Runs in the ISOLATED world.
 * Listens for messages from the MAIN world (injected.js) and forwards them to the background script.
 * Also handles popup requests to extract tokens from localStorage.
 */

// Forward intercepted tokens from injected.js → background
window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data?.type === 'SWISSPASS_TOKEN_CAPTURED') {
        console.log('[SwissPass Bridge] Token captured by content script, forwarding to background...');
        try {
            chrome.runtime.sendMessage({
                type: 'TOKEN_CAPTURED',
                refreshToken: e.data.refreshToken,
            });
        } catch (err) {
            console.warn('[SwissPass Bridge] Could not send message to background:', err);
        }
    }
    // Relay localStorage scan result back to the popup
    if (e.data?.type === 'SWISSPASS_STORAGE_TOKEN_RESULT') {
        chrome.runtime.sendMessage({
            type: 'STORAGE_TOKEN_RESULT',
            refreshToken: e.data.refreshToken,
        });
    }
});

// Handle popup asking for a token from localStorage
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_TOKEN_FROM_STORAGE') {
        // Ask injected.js to scan localStorage
        window.postMessage({ type: 'SWISSPASS_SCAN_STORAGE' }, '*');

        // Wait up to 2s for injected.js to reply via window.postMessage
        const timeout = setTimeout(() => sendResponse({ refreshToken: null }), 2000);

        const handler = e => {
            if (e.source !== window) return;
            if (e.data?.type === 'SWISSPASS_STORAGE_TOKEN_RESULT') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                sendResponse({ refreshToken: e.data.refreshToken ?? null });
            }
        };
        window.addEventListener('message', handler);
        return true; // keep channel open
    } else if (msg.type === 'CLEAR_AND_RELOAD') {
        window.postMessage({ type: 'SWISSPASS_CLEAR_AND_RELOAD' }, '*');
        sendResponse({ ok: true });
        return false;
    }
});
