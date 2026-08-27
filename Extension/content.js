/**
 * Runs in the ISOLATED world.
 * Listens for messages from the MAIN world (injected.js) and forwards them to the background script.
 */
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
});
