import { curlFetch, curlPut, curlDelete } from './curlFetch.js';

const BASE = 'https://www.swisspass.ch';

function getHeaders(token) {
    return {
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
}

/** Get all active FlexiAbo subscriptions */
async function getSubscriptions(tokenManager) {
    const token = tokenManager.getCurrentToken();
    if (!token) {
        throw new Error('No access token available. Make sure TokenManager.start() has completed.');
    }

    const response = await curlFetch(`${BASE}/public/api/leistungen/v7/abonnements`, getHeaders(token));

    if (response.status !== 200) {
        throw new Error(`Failed to fetch subscriptions (${response.status}): ${response.body.substring(0, 300)}`);
    }

    const data = JSON.parse(response.body);
    return data.abonnements.filter(abo => abo.abotyp === 'flexiabo' && abo.status === 'GUELTIG');
}

/** Get activated Ausflugstage for a FlexiAbo */
async function getActivatedDays(tokenManager, leistungId) {
    const token = tokenManager.getCurrentToken();
    const response = await curlFetch(
        `${BASE}/public/api/leistungen/v7/abonnements/${leistungId}/ausflugstage`,
        getHeaders(token)
    );

    if (response.status !== 200) {
        throw new Error(`Failed to fetch days (${response.status}): ${response.body.substring(0, 200)}`);
    }

    const data = JSON.parse(response.body);
    return Array.isArray(data) ? data : (data.ausflugstage || data.tage || []);
}

/** Activate a day — PUT /ausflugstage/YYYY-MM-DD */
async function activateDay(tokenManager, leistungId, date) {
    const token = tokenManager.getCurrentToken();
    return await curlPut(
        `${BASE}/public/api/leistungen/v7/abonnements/${leistungId}/ausflugstage/${date}`,
        getHeaders(token)
    );
}

/** Deactivate a day — DELETE /ausflugstage/YYYY-MM-DD */
async function deactivateDay(tokenManager, leistungId, date) {
    const token = tokenManager.getCurrentToken();
    return await curlDelete(
        `${BASE}/public/api/leistungen/v7/abonnements/${leistungId}/ausflugstage/${date}`,
        getHeaders(token)
    );
}

export { getSubscriptions, getActivatedDays, activateDay, deactivateDay };