/* ── State ─────────────────────────────────────────────────────────────────── */
const state = {
    subscriptions: [],
    activatedDays: {},   // { leistungId: Set<"YYYY-MM-DD"> }
    currentSub: null,
    calMonth: new Date().getMonth(),
    calYear: new Date().getFullYear(),
    tokens: [],
};

/* ── API ───────────────────────────────────────────────────────────────────── */
async function api(method, path, body) {
    const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

/* ── Toast ─────────────────────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

/* ── Modal ─────────────────────────────────────────────────────────────────── */
function openModal(title, body, footer) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer;
    document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}
document.getElementById('modal-close').onclick = closeModal;
document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
});

/* ── Navigation ────────────────────────────────────────────────────────────── */
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${name}`).classList.remove('hidden');
    const navItem = document.getElementById(`nav-${name}`);
    if (navItem) navItem.classList.add('active');
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
        e.preventDefault();
        const page = item.dataset.page;
        showPage(page);
        if (page === 'calendar') renderCalendar();
        if (page === 'tokens') loadTokens();
        if (page === 'settings') loadSettings();
    });
});

/* ── Status Check ──────────────────────────────────────────────────────────── */
async function checkStatus() {
    try {
        const status = await api('GET', '/api/auth/status');
        const dot = document.getElementById('status-dot');
        const label = document.getElementById('status-label');

        if (status.tokenReady) {
            dot.className = 'status-dot online';
            label.textContent = 'Verbunden';
            document.getElementById('alert-no-token').classList.add('hidden');
        } else {
            dot.className = 'status-dot error';
            label.textContent = 'Nicht verbunden';
            document.getElementById('alert-no-token').classList.remove('hidden');
        }
        return status;
    } catch {
        document.getElementById('status-dot').className = 'status-dot error';
        document.getElementById('status-label').textContent = 'Server offline';
        return null;
    }
}

/* ── Dashboard ─────────────────────────────────────────────────────────────── */
async function loadDashboard() {
    const status = await checkStatus();
    if (!status?.tokenReady) return;

    try {
        const data = await api('GET', '/api/subscriptions');
        state.subscriptions = data.subscriptions || [];

        if (!state.subscriptions.length) {
            document.getElementById('empty-subscriptions').classList.remove('hidden');
            return;
        }

        const sub = state.subscriptions[0];
        state.currentSub = sub;

        // Stats
        const info = sub.ausflugstageInfo;
        document.getElementById('stat-available').textContent = info.verfuegbar;
        document.getElementById('stat-used').textContent = info.total - info.verfuegbar;
        document.getElementById('stat-total').textContent = info.total;
        document.getElementById('stat-price').textContent =
            `${sub.zahlungsInfo?.betrag} ${sub.zahlungsInfo?.waehrung}`;

        document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('loading'));

        // Subscription details
        document.getElementById('sub-name').textContent = sub.bezeichnung;
        document.getElementById('sub-class').textContent =
            sub.klasse === 'ZWEITE' ? '2. Klasse' : '1. Klasse';
        document.getElementById('sub-validity').textContent =
            `${formatDate(sub.ersterGueltigkeitsTag)} – ${formatDate(sub.letzterGueltigkeitsTag)}`;
        const zones = sub.zonenGeltungsbereich
            ?.map(z => `${z.verbundBezeichnung}: Zone ${z.zonen?.join(', ')}`)
            .join(' | ') || '--';
        document.getElementById('sub-zones').textContent = zones;
        document.getElementById('sub-payment').textContent =
            sub.zahlungsintervall === 'JAEHRLICH' ? 'Jährlich' : sub.zahlungsintervall;

        document.getElementById('sub-info').classList.remove('hidden');
        document.getElementById('badge-status').classList.remove('hidden');
        document.getElementById('progress-section').classList.remove('hidden');

        // Progress bar
        const pct = ((info.total - info.verfuegbar) / info.total * 100).toFixed(1);
        document.getElementById('progress-fill').style.width = pct + '%';
        document.getElementById('progress-text').textContent =
            `${info.total - info.verfuegbar} / ${info.total} Tage`;

        // Load activated days
        await loadActivatedDays(sub.leistungId);

    } catch (err) {
        toast('Fehler beim Laden: ' + err.message, 'error');
    }
}

async function loadActivatedDays(leistungId) {
    try {
        const data = await api('GET', `/api/subscriptions/${leistungId}/days`);
        const days = data.days || [];
        state.activatedDays[leistungId] = new Set(
            days.map(d => typeof d === 'string' ? d : (d.datum || d.date || d))
        );
    } catch {
        state.activatedDays[leistungId] = new Set();
    }
}

/* ── Activate Today ────────────────────────────────────────────────────────── */
document.getElementById('btn-activate-today').addEventListener('click', async () => {
    if (!state.currentSub) return toast('Kein Abonnement geladen.', 'error');
    const btn = document.getElementById('btn-activate-today');
    btn.disabled = true;
    btn.textContent = 'Aktiviere...';
    try {
        const res = await api('POST', `/api/subscriptions/${state.currentSub.leistungId}/days/today`);
        toast(`Heute (${res.date}) wurde aktiviert! ✓`, 'success');
        await loadDashboard();
        renderCalendar();
    } catch (err) {
        toast('Fehler: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Heute aktivieren`;
    }
});

/* ── Calendar ──────────────────────────────────────────────────────────────── */
const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function renderCalendar() {
    const { calYear, calMonth } = state;
    document.getElementById('cal-title').textContent = `${MONTHS_DE[calMonth]} ${calYear}`;

    const grid = document.querySelector('.calendar-grid');
    // Remove old day cells (keep weekday headers = first 7 children)
    const headers = [...grid.children].slice(0, 7);
    grid.innerHTML = '';
    headers.forEach(h => grid.appendChild(h));

    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const today = new Date();
    const todayStr = toDateStr(today);

    const activatedSet = state.currentSub
        ? (state.activatedDays[state.currentSub.leistungId] || new Set())
        : new Set();

    // Blank cells before first day (Mon=0 offset)
    let startDow = firstDay.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon-based
    for (let i = 0; i < startDow; i++) {
        const blank = document.createElement('div');
        blank.className = 'cal-day empty';
        grid.appendChild(blank);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const cell = document.createElement('div');
        const isPast = dateStr < todayStr;
        const isToday = dateStr === todayStr;
        const isActivated = activatedSet.has(dateStr);

        cell.className = 'cal-day' +
            (isToday ? ' today' : '') +
            (isPast && !isToday ? ' past' : '') +
            (isActivated ? ' activated' : '');
        cell.textContent = d;
        cell.title = dateStr;

        if (!isPast || isToday) {
            cell.addEventListener('click', () => toggleDay(dateStr, cell));
        }
        grid.appendChild(cell);
    }
}

async function toggleDay(dateStr, cell) {
    if (!state.currentSub) return;
    const lid = state.currentSub.leistungId;
    const set = state.activatedDays[lid] || new Set();
    const isActivated = set.has(dateStr);

    cell.classList.add('loading-spin');
    try {
        if (isActivated) {
            await api('DELETE', `/api/subscriptions/${lid}/days/${dateStr}`);
            set.delete(dateStr);
            cell.classList.remove('activated');
            toast(`${formatDate(dateStr)} deaktiviert`, 'info');
        } else {
            await api('POST', `/api/subscriptions/${lid}/days`, { date: dateStr });
            set.add(dateStr);
            cell.classList.add('activated');
            toast(`${formatDate(dateStr)} aktiviert ✓`, 'success');
        }
        state.activatedDays[lid] = set;
        await loadDashboard();
    } catch (err) {
        toast('Fehler: ' + err.message, 'error');
    } finally {
        cell.classList.remove('loading-spin');
    }
}

document.getElementById('cal-prev').addEventListener('click', () => {
    if (state.calMonth === 0) { state.calMonth = 11; state.calYear--; }
    else state.calMonth--;
    renderCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
    if (state.calMonth === 11) { state.calMonth = 0; state.calYear++; }
    else state.calMonth++;
    renderCalendar();
});

/* ── API Tokens ────────────────────────────────────────────────────────────── */
async function loadTokens() {
    try {
        const tokens = await api('GET', '/api/tokens');
        state.tokens = tokens;
        renderTokens();
        updateHaConfig();
    } catch (err) {
        toast('Fehler: ' + err.message, 'error');
    }
}

function renderTokens() {
    const list = document.getElementById('tokens-list');
    if (!state.tokens.length) {
        list.innerHTML = '<div class="empty-state">Keine API Tokens. Erstelle einen für Home Assistant.</div>';
        return;
    }
    list.innerHTML = state.tokens.map(t => `
        <div class="token-item">
            <div class="token-info">
                <h4>${t.name}</h4>
                <div class="token-meta">
                    Erstellt: ${formatDate(t.createdAt)}
                    ${t.lastUsed ? ` · Zuletzt: ${formatDate(t.lastUsed)}` : ''}
                    ${t.revoked ? ' · <span style="color:var(--red)">Widerrufen</span>' : ''}
                </div>
                <div class="token-preview">${t.tokenPreview}</div>
            </div>
            ${!t.revoked ? `<button class="btn btn-danger btn-sm" onclick="revokeToken('${t.id}')">Widerrufen</button>` : ''}
        </div>
    `).join('');
}

function updateHaConfig() {
    const host = window.location.host;
    const firstToken = state.tokens.find(t => !t.revoked);
    const tokenStr = firstToken ? firstToken.tokenPreview : 'DEIN_API_TOKEN';
    const preview = `# configuration.yaml
sensor:
  - platform: rest
    name: "FlexiAbo Verfügbar"
    resource: http://${host}/api/ha/subscriptions/LEISTUNG_ID/days
    headers:
      Authorization: Bearer ${tokenStr}
    value_template: "{{ value_json | length }}"
    
# Dienst zum Aktivieren des heutigen Tages:
rest_command:
  flexiabo_today:
    url: http://${host}/api/ha/subscriptions/LEISTUNG_ID/days/today
    method: POST
    headers:
      Authorization: Bearer ${tokenStr}`;
    document.getElementById('ha-config-preview').textContent = preview;
}

document.getElementById('btn-create-token').addEventListener('click', () => {
    openModal('API Token erstellen',
        `<div class="form-group">
            <label>Name</label>
            <input type="text" id="new-token-name" class="input" placeholder="z.B. Home Assistant" autofocus>
        </div>`,
        `<button class="btn btn-secondary" onclick="closeModal()">Abbrechen</button>
         <button class="btn btn-primary" onclick="createToken()">Erstellen</button>`
    );
    setTimeout(() => document.getElementById('new-token-name')?.focus(), 100);
});

window.createToken = async () => {
    const name = document.getElementById('new-token-name').value.trim();
    if (!name) return toast('Name erforderlich', 'error');
    try {
        const t = await api('POST', '/api/tokens', { name });
        openModal('Token gespeichert',
            `<p style="color:var(--text-muted);margin-bottom:12px">Kopiere den Token jetzt — er wird nicht mehr angezeigt:</p>
             <div class="new-token-display">${t.token}</div>
             <div class="new-token-warning">⚠ Dieser Token wird nur einmal angezeigt!</div>`,
            `<button class="btn btn-primary" onclick="navigator.clipboard.writeText('${t.token}').then(()=>toast('Kopiert!','success'));closeModal()">Token kopieren & schliessen</button>`
        );
        await loadTokens();
    } catch (err) {
        toast('Fehler: ' + err.message, 'error');
    }
};

window.revokeToken = async (id) => {
    if (!confirm('Token wirklich widerrufen?')) return;
    try {
        await api('DELETE', `/api/tokens/${id}`);
        toast('Token widerrufen', 'info');
        await loadTokens();
    } catch (err) {
        toast('Fehler: ' + err.message, 'error');
    }
};

/* ── Settings ──────────────────────────────────────────────────────────────── */
async function loadSettings() {
    try {
        const status = await api('GET', '/api/auth/status');
        document.getElementById('cs-token').textContent =
            status.tokenReady ? '✓ Aktiv' : '✗ Kein Token';
        document.getElementById('cs-token').style.color =
            status.tokenReady ? 'var(--green)' : 'var(--red)';
        document.getElementById('cs-cookies').textContent =
            status.cookieStore?.hasClearance ? '✓ cf_clearance vorhanden' : '⚠ Fehlend';
        document.getElementById('cs-cookies').style.color =
            status.cookieStore?.hasClearance ? 'var(--green)' : 'var(--yellow)';
        const age = status.cookieStore?.ageSeconds;
        document.getElementById('cs-cookie-age').textContent =
            age != null ? `vor ${Math.round(age / 60)} Minuten` : '--';
    } catch {}
}

document.getElementById('btn-save-token').addEventListener('click', async () => {
    const token = document.getElementById('input-refresh-token').value.trim();
    if (!token) return toast('Bitte Token einfügen', 'error');
    try {
        await api('POST', '/api/auth/token', { refreshToken: token });
        toast('Token gespeichert und aktiviert ✓', 'success');
        document.getElementById('input-refresh-token').value = '';
        await loadSettings();
        await checkStatus();
        await loadDashboard();
    } catch (err) {
        toast('Fehler: ' + err.message, 'error');
    }
});

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDate(str) {
    if (!str) return '--';
    const d = new Date(str);
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ── Init ──────────────────────────────────────────────────────────────────── */
async function init() {
    await loadDashboard();
    // Poll status every 30s
    setInterval(checkStatus, 30000);
}

init();
