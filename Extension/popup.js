const DEFAULT_SERVER = 'http://localhost:3001';
const STORAGE_KEY_URL = 'serverUrl';
const STORAGE_KEY_PROFILE = 'selectedProfile';

// ── Storage helpers (sync = persists in Firefox + Chrome across reloads) ─────────────
function storageGet(keys) {
    return new Promise(resolve => chrome.storage.sync.get(keys, resolve));
}
function storageSet(obj) {
    return new Promise(resolve => chrome.storage.sync.set(obj, resolve));
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

// ── Background proxy fetch ────────────────────────────────────────────────────
// All server requests go through the background service worker, which has
// broader network permissions than the popup.
function bgFetch(url, method = 'GET', body = null) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { type: 'FETCH_SERVER', url, method, body },
            (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ ok: false, status: 0, error: chrome.runtime.lastError.message });
                } else {
                    resolve(response || { ok: false, status: 0, error: 'No response' });
                }
            }
        );
    });
}

// ── Server API calls ──────────────────────────────────────────────────────────
async function fetchProfiles(serverUrl) {
    const result = await bgFetch(serverUrl.replace(/\/$/, '') + '/api/profiles');
    if (!result.ok) return { error: result.error || `HTTP ${result.status}` };
    return result.body?.profiles ?? [];
}

async function checkServerStatus(serverUrl, profile) {
    const result = await bgFetch(
        `${serverUrl.replace(/\/$/, '')}/api/profiles/${profile}/auth/status`
    );
    if (!result.ok) return null;
    return result.body;
}

async function createProfile(serverUrl, name) {
    const result = await bgFetch(
        serverUrl.replace(/\/$/, '') + '/api/profiles',
        'POST',
        { name }
    );
    return result.ok;
}

async function sendTokenToServer(serverUrl, profile, refreshToken) {
    const result = await bgFetch(
        `${serverUrl.replace(/\/$/, '')}/api/profiles/${profile}/auth/token`,
        'POST',
        { refreshToken }
    );
    if (!result.ok) throw new Error(result.error || `HTTP ${result.status}`);
    return true;
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
    const certWarning = document.getElementById('cert-warning');
    const certLink = document.getElementById('cert-link');
    certWarning.style.display = 'none';
    const result = await fetchProfiles(serverUrl);

    if (result && result.error) {
        const err = result.error.toLowerCase();
        // SSL/cert error = server reachable but cert not trusted yet
        if (err.includes('ssl') || err.includes('cert') || err.includes('security') || err.includes('networkerror') || err.includes('fetch')) {
            sel.innerHTML = '<option value="">Server nicht erreichbar</option>';
            // Update the cert link to point to the server URL
            certLink.onclick = (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: serverUrl.replace(/\/$/, '') });
            };
            certWarning.style.display = 'block';
        } else {
            sel.innerHTML = `<option value="">Fehler &mdash; Server offline?</option>`;
        }
        return;
    }

    const profiles = result || [];
    if (!profiles.length) {
        sel.innerHTML = '<option value="">Keine Profile (Server offline?)</option>';
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

// Save server URL (on button click)
document.getElementById('btn-save').addEventListener('click', async () => {
    const url = document.getElementById('server-url').value.trim();
    if (!url) return;
    await storageSet({ [STORAGE_KEY_URL]: url });
    document.getElementById('btn-open').href = url;
    const profile = await getSelectedProfile();
    await loadProfiles(url, profile);
    await refreshStatus();
});

// Also auto-save when user leaves the input field
document.getElementById('server-url').addEventListener('blur', async () => {
    const url = document.getElementById('server-url').value.trim();
    if (!url) return;
    const current = await getServerUrl();
    if (url === current) return; // no change
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

    try {
        const ok = await sendTokenToServer(serverUrl, profile, refreshToken);
        if (ok) {
            statusEl.textContent = '\u2713 Token erfolgreich gesendet!';
            statusEl.className = 'token-status found';
            await refreshStatus();

            // Clear cookies and reload page
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                const tab = tabs[0];
                if (tab?.id) {
                    chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_AND_RELOAD' });
                }
            });
        } else {
            statusEl.textContent = '\u2717 Fehler beim Senden. Server erreichbar?';
        }
    } catch (e) {
        statusEl.textContent = '\u2717 Fehler: ' + (e.message || e.toString());
    }

    btn.disabled = false;
    btn.textContent = 'Token senden';
});

init();

