const DEFAULT_SERVER = 'http://localhost:3001';
const STORAGE_KEY_URL = 'serverUrl';
const STORAGE_KEY_PROFILE = 'selectedProfile';

// ── Storage helpers ───────────────────────────────────────────────────────────
function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
    return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setBadge(id, ok, text) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = 'badge ' + (ok === true ? 'ok' : ok === false ? 'err' : '');
}

async function getServerUrl() {
    const s = await storageGet({ [STORAGE_KEY_URL]: DEFAULT_SERVER });
    return s[STORAGE_KEY_URL];
}

async function getSelectedProfile() {
    const s = await storageGet({ [STORAGE_KEY_PROFILE]: 'main' });
    return s[STORAGE_KEY_PROFILE];
}

// ── Server API calls ──────────────────────────────────────────────────────────
async function fetchProfiles(serverUrl) {
    try {
        const res = await fetch(serverUrl.replace(/\/$/, '') + '/api/profiles',
            { signal: AbortSignal.timeout(4000) });
        if (!res.ok) return null;
        return (await res.json()).profiles ?? [];
    } catch { return null; }
}

async function checkServerStatus(serverUrl, profile) {
    try {
        const res = await fetch(
            `${serverUrl.replace(/\/$/, '')}/api/profiles/${profile}/auth/status`,
            { signal: AbortSignal.timeout(4000) }
        );
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

async function createProfile(serverUrl, name) {
    const res = await fetch(serverUrl.replace(/\/$/, '') + '/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(5000),
    });
    return res.ok;
}

async function sendTokenToServer(serverUrl, profile, refreshToken) {
    const res = await fetch(
        `${serverUrl.replace(/\/$/, '')}/api/profiles/${profile}/auth/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
            signal: AbortSignal.timeout(8000),
        }
    );
    return res.ok;
}

// ── Token extraction from page localStorage ───────────────────────────────────
async function extractTokenFromPage() {
    // Ask content script to scan localStorage for a refresh token
    return new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            const tab = tabs[0];
            if (!tab?.id) return resolve(null);
            chrome.tabs.sendMessage(tab.id, { type: 'GET_TOKEN_FROM_STORAGE' }, resp => {
                if (chrome.runtime.lastError) return resolve(null);
                resolve(resp?.refreshToken ?? null);
            });
        });
    });
}

// ── Profile select population ─────────────────────────────────────────────────
async function loadProfiles(serverUrl, selectedProfile) {
    const sel = document.getElementById('profile-select');
    const profiles = await fetchProfiles(serverUrl);
    if (!profiles) {
        sel.innerHTML = '<option value="">Server nicht erreichbar</option>';
        return;
    }
    sel.innerHTML = profiles.map(p => {
        const name = typeof p === 'string' ? p : p.name;
        const selected = name === selectedProfile ? ' selected' : '';
        return `<option value="${name}"${selected}>${name}</option>`;
    }).join('');
    if (!profiles.find(p => (typeof p === 'string' ? p : p.name) === selectedProfile) && profiles.length) {
        sel.value = typeof profiles[0] === 'string' ? profiles[0] : profiles[0].name;
    }
}

// ── Status refresh ────────────────────────────────────────────────────────────
async function refreshStatus() {
    const serverUrl = await getServerUrl();
    const profile = document.getElementById('profile-select').value || await getSelectedProfile();

    const status = await checkServerStatus(serverUrl, profile);
    if (!status) {
        setBadge('st-server', false, '✗ Nicht erreichbar');
        setBadge('st-token', false, '✗');
        document.getElementById('global-status').textContent = 'Server offline';
        return;
    }
    setBadge('st-server', true, '✓ Online');
    setBadge('st-token', status.tokenReady, status.tokenReady ? '✓ Aktiv' : '✗ Kein Token');
    document.getElementById('global-status').textContent =
        status.tokenReady ? `Verbunden (${profile}) ✓` : 'Kein Token – melde dich an';
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    const serverUrl = await getServerUrl();
    const selectedProfile = await getSelectedProfile();

    document.getElementById('server-url').value = serverUrl;
    document.getElementById('btn-open').href = serverUrl;

    await loadProfiles(serverUrl, selectedProfile);
    await refreshStatus();
}

// ── Event Listeners ───────────────────────────────────────────────────────────

// Save server URL
document.getElementById('btn-save').addEventListener('click', async () => {
    const url = document.getElementById('server-url').value.trim();
    if (!url) return;
    await storageSet({ [STORAGE_KEY_URL]: url });
    document.getElementById('btn-open').href = url;
    const profile = await getSelectedProfile();
    await loadProfiles(url, profile);
    await refreshStatus();
});

// Profile select change
document.getElementById('profile-select').addEventListener('change', async () => {
    const profile = document.getElementById('profile-select').value;
    await storageSet({ [STORAGE_KEY_PROFILE]: profile });
    await refreshStatus();
});

// Show new profile form
document.getElementById('btn-new-profile').addEventListener('click', () => {
    document.getElementById('new-profile-row').style.display = 'flex';
    document.getElementById('new-profile-name').focus();
});

// Cancel new profile
document.getElementById('btn-cancel-profile').addEventListener('click', () => {
    document.getElementById('new-profile-row').style.display = 'none';
    document.getElementById('new-profile-name').value = '';
});

// Create new profile
document.getElementById('btn-create-profile').addEventListener('click', async () => {
    const name = document.getElementById('new-profile-name').value.trim().toLowerCase();
    if (!name) return;
    const serverUrl = await getServerUrl();
    const ok = await createProfile(serverUrl, name);
    if (ok) {
        document.getElementById('new-profile-row').style.display = 'none';
        document.getElementById('new-profile-name').value = '';
        await storageSet({ [STORAGE_KEY_PROFILE]: name });
        await loadProfiles(serverUrl, name);
        await refreshStatus();
    } else {
        document.getElementById('new-profile-name').style.borderColor = '#ef4444';
    }
});

// Send token from page localStorage
document.getElementById('btn-send-token').addEventListener('click', async () => {
    const btn = document.getElementById('btn-send-token');
    const statusEl = document.getElementById('token-status');
    btn.disabled = true;
    btn.textContent = 'Suche Token...';
    statusEl.textContent = '';
    statusEl.className = 'token-status';

    const serverUrl = await getServerUrl();
    const profile = document.getElementById('profile-select').value || 'main';

    // 1. Ask content script to find token from page's localStorage
    const refreshToken = await extractTokenFromPage();

    if (!refreshToken) {
        statusEl.textContent = '⚠ Kein Token gefunden. Melde dich auf swisspass.ch an.';
        btn.disabled = false;
        btn.textContent = 'Token senden';
        return;
    }

    statusEl.textContent = 'Token gefunden, sende...';
    const ok = await sendTokenToServer(serverUrl, profile, refreshToken);
    if (ok) {
        statusEl.textContent = '✓ Token erfolgreich gesendet!';
        statusEl.className = 'token-status found';
        await refreshStatus();
    } else {
        statusEl.textContent = '✗ Fehler beim Senden. Server erreichbar?';
    }

    btn.disabled = false;
    btn.textContent = 'Token senden';
});

init();
