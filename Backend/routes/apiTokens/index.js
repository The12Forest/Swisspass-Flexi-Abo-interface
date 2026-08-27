import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import log from '../../functions/log.js';
const console = { log: log('ApiTokens'), warn: log('ApiTokens') };

const STORE_PATH = process.env.API_TOKENS_PATH || './data/api_tokens.json';

function loadTokens() {
    try {
        if (fs.existsSync(STORE_PATH)) {
            return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
        }
    } catch {}
    return [];
}

function saveTokens(tokens) {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(tokens, null, 2));
}

/** Verify a Bearer token string, return the token object or null */
function verifyApiToken(rawToken) {
    const tokens = loadTokens();
    return tokens.find(t => t.token === rawToken && !t.revoked) || null;
}

import express from 'express';
const router = express.Router();

/** GET /api/tokens — list all tokens (masked) */
router.get('/', (req, res) => {
    const tokens = loadTokens().map(t => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt,
        lastUsed: t.lastUsed,
        revoked: t.revoked,
        tokenPreview: t.token.substring(0, 8) + '...',
    }));
    res.json(tokens);
});

/** POST /api/tokens — create new token */
router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const token = 'spta_' + crypto.randomBytes(32).toString('hex');
    const entry = {
        id: crypto.randomUUID(),
        name,
        token,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        revoked: false,
    };

    const tokens = loadTokens();
    tokens.push(entry);
    saveTokens(tokens);
    console.log(`Created API token: ${name}`);

    // Return the full token only on creation — it won't be shown again
    res.json({ ...entry, tokenPreview: undefined });
});

/** DELETE /api/tokens/:id — revoke token */
router.delete('/:id', (req, res) => {
    const tokens = loadTokens();
    const idx = tokens.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Token not found' });
    tokens[idx].revoked = true;
    saveTokens(tokens);
    console.log(`Revoked API token: ${tokens[idx].name}`);
    res.json({ ok: true });
});

export { router as apiTokensRouter, verifyApiToken };
