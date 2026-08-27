const DEFAULT_SERVER = 'http://localhost:3000';

async function getSettings() {
    return new Promise(r => chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER }, r));
}

async function checkServerStatus(serverUrl) {
    try {
        const res = await fetch(serverUrl.replace(/\/$/, '') + '/api/auth/status', { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

function setBadge(id, ok, text) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = 'badge ' + (ok === true ? 'ok' : ok === false ? 'err' : '');
}

async function refreshStatus() {
    // Cookie status
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, ({ hasClearance, cookies }) => {
        setBadge('st-cookie', hasClearance, hasClearance ? '✓ Vorhanden' : '✗ Fehlend');
    });

    // Server + token status
    const { serverUrl } = await getSettings();
    const status = await checkServerStatus(serverUrl);
    if (!status) {
        setBadge('st-server', false, '✗ Nicht erreichbar');
        setBadge('st-token', false, '✗');
        document.getElementById('global-status').textContent = 'Server offline';
        return;
    }
    setBadge('st-server', true, '✓ Online');
    setBadge('st-token', status.tokenReady, status.tokenReady ? '✓ Aktiv' : '✗ Kein Token');
    document.getElementById('global-status').textContent =
        status.tokenReady ? 'Verbunden ✓' : 'Besuche swisspass.ch';
}

async function init() {
    const { serverUrl } = await getSettings();
    document.getElementById('server-url').value = serverUrl;
    document.getElementById('btn-open').href = serverUrl;
    await refreshStatus();
}

document.getElementById('btn-save').addEventListener('click', async () => {
    const url = document.getElementById('server-url').value.trim();
    if (!url) return;
    await chrome.storage.sync.set({ serverUrl: url });
    document.getElementById('btn-open').href = url;
    await refreshStatus();
});

document.getElementById('btn-sync').addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync');
    btn.disabled = true;
    btn.textContent = 'Synchronisiere...';
    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {
        setTimeout(async () => {
            await refreshStatus();
            btn.disabled = false;
            btn.textContent = 'Jetzt synchronisieren';
        }, 800);
    });
});

init();
