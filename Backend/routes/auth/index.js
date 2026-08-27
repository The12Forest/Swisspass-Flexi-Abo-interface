import express from 'express';
import { tokenStore } from '../../functions/tokenStore.js';
import { cookieStore } from '../../functions/cookieStore.js';
import log from '../../functions/log.js';
const console = { log: log('AuthRoute') };
const router = express.Router();

/** GET /api/auth/status */
router.get('/status', (req, res) => {
    res.json({
        tokenStore: tokenStore.getStatus(),
        cookieStore: cookieStore.getStatus(),
        tokenReady: req.tokenManager?.isReady() ?? false,
    });
});

/**
 * POST /api/auth/token
 * Called by the browser extension or manual paste to inject a fresh refresh token.
 * Body: { refreshToken: "..." }
 */
router.post('/token', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });

    try {
        if (req.tokenManager) {
            await req.tokenManager.reloadToken(refreshToken);
        } else {
            tokenStore.save(refreshToken);
        }
        console.log('Refresh token updated and reloaded via API');
        res.json({ ok: true, message: 'Token updated and refreshed' });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

export { router as authRouter };
