import express from 'express';
import { getSubscriptions, getActivatedDays, activateDay, deactivateDay } from '../../functions/swisspassApi.js';
import log from '../../functions/log.js';
const console = { log: log('DaysRoute'), error: log('DaysRoute') };
const router = express.Router({ mergeParams: true });

/** GET /api/subscriptions/:leistungId/days */
router.get('/', async (req, res) => {
    try {
        const token = req.tokenManager.getCurrentToken();
        const days = await getActivatedDays(token, req.params.leistungId);
        res.json({ ok: true, days });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/subscriptions/:leistungId/days — activate a day */
router.post('/', async (req, res) => {
    try {
        const { date } = req.body;
        if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
        const token = req.tokenManager.getCurrentToken();
        const result = await activateDay(token, req.params.leistungId, date);
        console.log(`Activated day ${date} for ${req.params.leistungId}`);
        res.json({ ok: true, result });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

/** POST /api/subscriptions/:leistungId/days/today */
router.post('/today', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const token = req.tokenManager.getCurrentToken();
        const result = await activateDay(token, req.params.leistungId, today);
        console.log(`Activated today (${today}) for ${req.params.leistungId}`);
        res.json({ ok: true, date: today, result });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

/** DELETE /api/subscriptions/:leistungId/days/:date */
router.delete('/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const token = req.tokenManager.getCurrentToken();
        const result = await deactivateDay(token, req.params.leistungId, date);
        console.log(`Deactivated day ${date} for ${req.params.leistungId}`);
        res.json({ ok: true, result });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

export { router as daysRouter };
