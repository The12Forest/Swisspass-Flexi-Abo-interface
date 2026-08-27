/**
 * Runs in the MAIN world on swisspass.ch
 * Patches window.fetch and XMLHttpRequest to intercept OAuth token responses
 */
(function () {
    console.log('[SwissPass Bridge] Injecting token interceptor...');

    // 1. Patch fetch
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
