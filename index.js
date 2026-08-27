import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import log from './Backend/functions/log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const console = { log: log('Server') };

const app = express();
const httpPort = process.env.HTTP_PORT || 3000;

app.use(express.json());

// ── CORS (allow extension + Home Assistant) ──────────────────────────────────
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ── Token Manager (singleton, shared across routes) ─────────────────────────
import { TokenManager } from './Backend/routes/token/index.js';
import { tokenStore } from './Backend/functions/tokenStore.js';

const tokenManager = new TokenManager(null); // loads from tokenStore automatically

// Inject tokenManager into every request so routes can use it
app.use((req, _res, next) => {
    req.tokenManager = tokenManager;
    next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
import { cookiesRouter } from './Backend/routes/cookies/index.js';
import { authRouter } from './Backend/routes/auth/index.js';
import { subscriptionsRouter } from './Backend/routes/subscriptions/index.js';
import { apiTokensRouter, verifyApiToken } from './Backend/routes/apiTokens/index.js';

app.use('/api/cookies', cookiesRouter);
app.use('/api/auth', authRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/tokens', apiTokensRouter);

// ── Home Assistant API (token-protected) ─────────────────────────────────────
import { getSubscriptions, getActivatedDays, activateDay } from './Backend/functions/swisspassApi.js';

const haAuth = (req, res, next) => {
    const bearer = req.headers.authorization?.replace('Bearer ', '');
    if (!bearer || !verifyApiToken(bearer)) {
        return res.status(401).json({ error: 'Invalid or missing API token' });
    }
    next();
};

app.get('/api/ha/subscriptions', haAuth, async (req, res) => {
    try {
        const subs = await getSubscriptions(tokenManager.getCurrentToken());
        res.json(subs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ha/subscriptions/:id/days', haAuth, async (req, res) => {
    try {
        const days = await getActivatedDays(tokenManager.getCurrentToken(), req.params.id);
        res.json(days);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ha/subscriptions/:id/days/today', haAuth, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const result = await activateDay(tokenManager.getCurrentToken(), req.params.id, today);
        res.json({ ok: true, date: today, result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Frontend SPA ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'Frontend')));
app.get('*path', (req, res) => {
    // Don't catch API routes
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, 'Frontend', 'index.html'));
});

// ── Start Server ─────────────────────────────────────────────────────────────
http.createServer(app).listen(httpPort, () => {
    console.log(`Server running at http://localhost:${httpPort}`);
});

// ── Auto-start TokenManager (non-blocking) ───────────────────────────────────
async function initTokenManager() {
    if (!tokenStore.hasToken()) {
        console.log('No refresh token stored. Open the app and connect via the browser extension.');
        return;
    }
    try {
        await tokenManager.start();
        console.log('TokenManager started ✓');
    } catch (err) {
        console.log(`TokenManager start failed: ${err.message}`);
        console.log('The server is still running. Update the refresh token via POST /api/auth/token');
    }
}

initTokenManager();

export default app;
