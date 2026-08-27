import express from 'express';
import { cookieStore } from '../../functions/cookieStore.js';
import log from '../../functions/log.js';
const console = { log: log('CookiesRoute') };
const router = express.Router();

/**
 * POST /api/cookies
 * Called by the browser userscript to inject Cloudflare cookies.
 * Body: { "cf_clearance": "...", "__cf_bm": "...", ... }
 */
router.post('/', (req, res) => {
    const cookies = req.body;
    if (!cookies || typeof cookies !== 'object') {
        return res.status(400).json({ ok: false, error: 'Expected JSON body with cookie key/value pairs' });
    }
    cookieStore.set(cookies);
    console.log('Cookies injected via API:', Object.keys(cookies).join(', '));
    res.json({ ok: true, received: Object.keys(cookies) });
});

/**
 * GET /api/cookies/status
 * Shows the current cookie store status (no secret values).
 */
router.get('/status', (req, res) => {
    res.json(cookieStore.getStatus());
});

export { router as cookiesRouter };
