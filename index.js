import express from 'express';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import log from './Backend/functions/log.js';
import { TokenManager } from './Backend/routes/token/index.js';
import { getSubscriptions, getActivatedDays, activateDay, deactivateDay } from './Backend/functions/getSubscriptionID.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const console = { log: log('Server') };

const app = express();
const httpPort = process.env.HTTP_PORT || 3000;

app.use(express.json());

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ── Profile store (populated in main()) ──────────────────────────────────────
const tokenManagers = {};

const PROFILES_FILE = './Backend/saves/profiles.json';
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;  // 1-31 chars, starts with alphanumeric

function saveProfileList() {
    const list = Object.keys(tokenManagers).map(k => k.replace(/^tm/, ''));
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function resolveProfile(nameOrReq) {
    const name = (typeof nameOrReq === 'string')
        ? nameOrReq
        : (nameOrReq.params?.profile || nameOrReq.query?.profile || 'main');
    const tm = tokenManagers['tm' + name];
    if (!tm) throw new Error(`Profile '${name}' not found.`);
    return tm;
}

// ── Profile Management Routes ─────────────────────────────────────────────────

/** GET /api/profiles — list all profiles */
app.get('/api/profiles', (req, res) => {
    const profiles = Object.keys(tokenManagers).map(k => ({
        name: k.replace(/^tm/, ''),
        ready: tokenManagers[k].isReady(),
    }));
    res.json({ profiles });
});

/** POST /api/profiles — create a new profile
 *  Body: { "name": "myprofile" }
 *  Name rules: 1-31 chars, lowercase letters, digits, hyphens, underscores. Must start with a letter or digit.
 */
app.post('/api/profiles', (req, res) => {
    const raw = (req.body?.name ?? '').trim().toLowerCase();

    if (!raw) {
        return res.status(400).json({ error: 'name is required' });
    }
    if (!NAME_RE.test(raw)) {
        return res.status(400).json({
            error: `Invalid profile name '${raw}'. Use 1-31 lowercase letters, digits, hyphens or underscores. Must start with a letter or digit.`,
        });
    }
    if (tokenManagers['tm' + raw]) {
        return res.status(409).json({ error: `Profile '${raw}' already exists.` });
    }

    try {
        tokenManagers['tm' + raw] = new TokenManager(raw);
        saveProfileList();
        res.status(201).json({ ok: true, profile: raw });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** DELETE /api/profiles/:profile — remove a profile */
app.delete('/api/profiles/:profile', (req, res) => {
    const name = req.params.profile.trim().toLowerCase();
    if (name === 'main') {
        return res.status(400).json({ error: 'Cannot delete the default profile "main".' });
    }
    if (!tokenManagers['tm' + name]) {
        return res.status(404).json({ error: `Profile '${name}' not found.` });
    }

    delete tokenManagers['tm' + name];

    const tokenFile = `./Backend/saves/tokens/refreshtoken_${name}.json`;
    if (fs.existsSync(tokenFile)) {
        try { fs.unlinkSync(tokenFile); } catch {}
    }

    saveProfileList();
    res.json({ ok: true, deleted: name });
});

// ── Auth routes  (/api/profiles/:profile/auth/...) ───────────────────────────

/** GET /api/profiles/:profile/auth/status */
app.get('/api/profiles/:profile/auth/status', (req, res) => {
    try {
        const tm = resolveProfile(req);
        res.json({ profile: req.params.profile, tokenReady: tm.isReady() });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

/** POST /api/profiles/:profile/auth/token  — inject a new refresh token */
app.post('/api/profiles/:profile/auth/token', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
    try {
        const tm = resolveProfile(req);
        await tm.reloadToken(refreshToken);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Subscription routes (/api/profiles/:profile/subscriptions/...) ───────────

/** GET /api/profiles/:profile/subscriptions */
app.get('/api/profiles/:profile/subscriptions', async (req, res) => {
    try {
        const tm = resolveProfile(req);
        const subs = await getSubscriptions(tm);
        res.json({ subscriptions: subs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** GET /api/profiles/:profile/subscriptions/:id/days — available days left (100 - used) */
app.get('/api/profiles/:profile/subscriptions/:id/days', async (req, res) => {
    try {
        const tm = resolveProfile(req);
        const used = await getActivatedDays(tm, req.params.id);
        res.json({ days: 100 - used.length, usedDays: used });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** GET /api/profiles/:profile/subscriptions/:id — activated day list */
app.get('/api/profiles/:profile/subscriptions/:id', async (req, res) => {
    try {
        const tm = resolveProfile(req);
        const days = await getActivatedDays(tm, req.params.id);
        res.json({ days });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/profiles/:profile/subscriptions/:id/days/today — activate today */
app.post('/api/profiles/:profile/subscriptions/:id/days/today', async (req, res) => {
    try {
        const tm = resolveProfile(req);
        const today = new Date().toISOString().split('T')[0];
        const result = await activateDay(tm, req.params.id, today);
        res.json({ ok: true, date: today, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/profiles/:profile/subscriptions/:id/days  — activate specific date */
app.post('/api/profiles/:profile/subscriptions/:id/days', async (req, res) => {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
    try {
        const tm = resolveProfile(req);
        const result = await activateDay(tm, req.params.id, date);
        res.json({ ok: true, date, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** DELETE /api/profiles/:profile/subscriptions/:id/days/:date — deactivate */
app.delete('/api/profiles/:profile/subscriptions/:id/days/:date', async (req, res) => {
    try {
        const tm = resolveProfile(req);
        const result = await deactivateDay(tm, req.params.id, req.params.date);
        res.json({ ok: true, date: req.params.date, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Download routes ───────────────────────────────────────────────────────────

/** Zip a directory into outputPath using the archiver npm package (no python needed). */
function zipDirectory(sourceDir, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

/** Zip specific files/dirs into outputPath. entries = [{ src, dest }] */
function zipEntries(entries, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        for (const { src, dest } of entries) {
            const stat = fs.statSync(src);
            if (stat.isDirectory()) {
                archive.directory(src, dest);
            } else {
                archive.file(src, { name: dest });
            }
        }
        archive.finalize();
    });
}

/** GET /api/extension/download — browser extension ZIP (Chrome + Firefox) */
app.get('/api/extension/download', async (req, res) => {
    const tmpPath = path.join(__dirname, 'Backend', 'saves', 'swisspass-extension.zip');
    try {
        await zipDirectory(path.join(__dirname, 'Extension'), tmpPath);
        res.download(tmpPath, 'swisspass-flexiabo-extension.zip');
    } catch (err) {
        res.status(500).json({ error: 'Failed to build extension ZIP: ' + err.message });
    }
});

/** GET /api/ha-integration/download — HACS integration ZIP (hacs.json + custom_components/) */
app.get('/api/ha-integration/download', async (req, res) => {
    const tmpPath = path.join(__dirname, 'Backend', 'saves', 'swisspass-ha.zip');
    try {
        await zipEntries([
            { src: path.join(__dirname, 'hacs.json'), dest: 'hacs.json' },
            { src: path.join(__dirname, 'custom_components'), dest: 'custom_components' },
        ], tmpPath);
        res.download(tmpPath, 'swisspass-flexiabo-ha.zip');
    } catch (err) {
        res.status(500).json({ error: 'Failed to build HA integration ZIP: ' + err.message });
    }
});

// ── Static: serve Extension ZIP for direct browser access ────────────────────
// (No Frontend dir — download links are at /api/extension/download and /api/ha-integration/download)

// ── Start ─────────────────────────────────────────────────────────────────────
http.createServer(app).listen(httpPort, () => {
    console.log(`Server running at http://localhost:${httpPort}`);
});

async function main() {
    // Ensure saves directory exists
    fs.mkdirSync('./Backend/saves', { recursive: true });

    let profiles;
    try {
        profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
        if (!Array.isArray(profiles)) throw new Error('not an array');
    } catch {
        profiles = ['main'];
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
        console.log('Created default profiles.json');
    }

    for (const name of profiles) {
        try {
            tokenManagers['tm' + name] = new TokenManager(name);
        } catch (err) {
            console.log(`Failed to create TokenManager for profile '${name}': ${err.message}`);
        }
    }

    console.log(`Loaded profiles: ${profiles.join(', ')}`);
}

main();

export default app;
