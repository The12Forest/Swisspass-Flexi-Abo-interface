/**
 * Runs in the MAIN world on swisspass.ch
 * Patches window.fetch and XMLHttpRequest to intercept OAuth token responses.
 * Also handles localStorage scanning on demand.
 */
(function () {
    console.log('[SwissPass Bridge] Injecting token interceptor...');

    // ── On-demand localStorage scan (triggered by popup) ─────────────────────
    window.addEventListener('message', e => {
        if (e.source !== window) return;
        if (e.data?.type === 'SWISSPASS_SCAN_STORAGE') {
            const token = findTokenInStorage();
            window.postMessage({ type: 'SWISSPASS_STORAGE_TOKEN_RESULT', refreshToken: token ?? null }, '*');
        } else if (e.data?.type === 'SWISSPASS_CLEAR_AND_RELOAD') {
            try { sessionStorage.clear(); } catch(e) {}
            try { localStorage.clear(); } catch(e) {}
            try {
                document.cookie.split(";").forEach(function(c) {
                    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                });
            } catch(e) {}
            window.location.reload();
        }
    });

    function findTokenInStorage() {
        // Known SwissPass OIDC/auth storage key patterns
        const patterns = ['refresh_token', 'refreshToken', 'oidc.user', 'swisspass', 'token'];
        const stores = [sessionStorage, localStorage];
        for (const store of stores) {
            try {
                for (let i = 0; i < store.length; i++) {
                    const key = store.key(i);
                    if (!key) continue;
                    const lk = key.toLowerCase();
                    if (!patterns.some(p => lk.includes(p))) continue;
                    try {
                        const raw = store.getItem(key);
                        if (!raw) continue;
                        
                        // If the key specifically is refresh_token, just take it (if it looks valid)
                        if (lk === 'refresh_token' && typeof raw === 'string' && raw.length > 20) {
                            // it might be JSON or not, if it starts with { it might be JSON, but let's just parse
                            try {
                                const val = JSON.parse(raw);
                                if (val?.refresh_token) return val.refresh_token;
                                if (val?.refreshToken) return val.refreshToken;
                                if (typeof val === 'string') return val;
                            } catch {
                                return raw; // It's a raw string
                            }
                        }

                        // Otherwise try JSON parsing
                        const val = JSON.parse(raw);
                        if (val?.refresh_token) return val.refresh_token;
                        if (val?.refreshToken) return val.refreshToken;
                        if (typeof val === 'string' && val.length > 20) return val;
                    } catch { 
                        // Ignored
                    }
                }
            } catch {}
        }
        return null;
    }

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (url && url.includes('/oauth2/') && url.includes('/token')) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data.refresh_token) {
                        console.log('[SwissPass Bridge] Token found via fetch!');
                        window.postMessage({
                            type: 'SWISSPASS_TOKEN_CAPTURED',
                            refreshToken: data.refresh_token,
                            accessToken: data.access_token,
                        }, '*');
                    }
                }).catch(() => {});
            }
        } catch {}
        return response;
    };

    // 2. Patch XMLHttpRequest
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            try {
                if (this.responseURL && this.responseURL.includes('/oauth2/') && this.responseURL.includes('/token')) {
                    const data = JSON.parse(this.responseText);
                    if (data.refresh_token) {
                        console.log('[SwissPass Bridge] Token found via XHR!');
                        window.postMessage({
                            type: 'SWISSPASS_TOKEN_CAPTURED',
                            refreshToken: data.refresh_token,
                            accessToken: data.access_token,
                        }, '*');
                    }
                }
            } catch {}
        });
        return originalXHRSend.apply(this, arguments);
    };

    // 3. Fallback: Check localStorage/sessionStorage periodically just in case
    setInterval(() => {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.includes('token')) {
                    const val = localStorage.getItem(key);
                    if (val && val.includes('refresh_token')) {
                        const parsed = JSON.parse(val);
                        if (parsed.refresh_token) {
                            window.postMessage({
                                type: 'SWISSPASS_TOKEN_CAPTURED',
                                refreshToken: parsed.refresh_token,
                            }, '*');
                        }
                    }
                }
            }
        } catch {}
    }, 5000);
})();
