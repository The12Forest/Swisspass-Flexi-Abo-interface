import express from 'express';
import { getSubscriptions } from '../../functions/swisspassApi.js';
import { daysRouter } from '../days/index.js';
import log from '../../functions/log.js';
const console = { log: log('SubscriptionsRoute'), error: log('SubscriptionsRoute') };
const router = express.Router();

// Inject tokenManager into nested routes
router.use((req, res, next) => {
    if (!req.tokenManager) return res.status(503).json({ error: 'TokenManager not initialized' });
    next();
});

/** GET /api/subscriptions */
router.get('/', async (req, res) => {
    try {
        const token = req.tokenManager.getCurrentToken();
        const subs = await getSubscriptions(token);
        res.json({ ok: true, subscriptions: subs });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

/** Mount days router under /api/subscriptions/:leistungId/days */
router.use('/:leistungId/days', daysRouter);

export { router as subscriptionsRouter };
