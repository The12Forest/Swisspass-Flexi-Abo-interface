import { cookieStore } from "./cookieStore.js";
import { getFirefoxCookies } from "./getFirefoxCookies.js";
import { curlFetch } from "./curlFetch.js";

async function getSubscriptions(TokenManager) {
    const token = TokenManager.getCurrentToken();
    if (!token) {
        throw new Error('No access token available. Make sure TokenManager.start() has completed.');
    }
    console.log('Using token:', token.substring(0, 40) + '...');
    const url = 'https://www.swisspass.ch/public/api/leistungen/v7/abonnements';

    // --- Cookie resolution priority ---
    // 1. CookieStore (injected by browser userscript via POST /api/cookies — works in Docker)
    // 2. Firefox profile on disk (local dev convenience, no userscript needed)
    // 3. CF_CLEARANCE environment variable (manual fallback)
    let cookieHeader = '';

    if (cookieStore.hasClearance()) {
        cookieHeader = cookieStore.getCookieHeader();
        const status = cookieStore.getStatus();
        console.log(`✓ Using cookies from store (updated ${status.ageSeconds}s ago)`);
    } else {
        // Try reading from Firefox profile (local dev only — won't work in Docker)
        try {
            const fxCookies = getFirefoxCookies('swisspass.ch');
            const parts = Object.entries(fxCookies).map(([k, v]) => `${k}=${v}`);
            if (fxCookies.cf_clearance) {
                cookieHeader = parts.join('; ');
                // Also inject into the store so subsequent calls use it
                cookieStore.set(fxCookies);
                console.log('✓ cf_clearance read from Firefox profile and saved to store');
            } else {
                console.warn('⚠ cf_clearance not found in Firefox. Visit swisspass.ch first.');
            }
        } catch {
            // Firefox not available (Docker etc.)
            if (process.env.CF_CLEARANCE) {
                cookieHeader = `cf_clearance=${process.env.CF_CLEARANCE}`;
                console.log('Using CF_CLEARANCE from environment variable');
            } else {
                console.warn('⚠ No Cloudflare cookies available. API will likely return 403.');
                console.warn('  → Install the userscript and visit swisspass.ch, then POST cookies to /api/cookies');
                console.warn('  → Or run: CF_CLEARANCE="<value>" node index.js');
            }
        }
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'de',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0',
        'Referer': 'https://www.swisspass.ch/info/abos/list',
        'Origin': 'https://www.swisspass.ch',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
    };

    if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
    }

    // Use curl to avoid Cloudflare TLS fingerprint blocking
    const response = await curlFetch(url, headers);

    if (response.status !== 200) {
        console.error('Response body (first 300 chars):', response.body.substring(0, 300));
        throw new Error(`Failed to fetch subscriptions (${response.status})`);
    }

    const data = JSON.parse(response.body);

    // Filter for manageable FlexiAbos
    const flexiAbos = data.abonnements.filter(
        abo => abo.abotyp === 'flexiabo' && abo.status === 'GUELTIG'
    );

    return flexiAbos;
}


export { getSubscriptions }