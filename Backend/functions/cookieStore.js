import fs from 'fs';
import path from 'path';
import log from './log.js';
const console = { log: log('CookieStore'), warn: log('CookieStore'), error: log('CookieStore') };

const STORE_PATH = process.env.COOKIE_STORE_PATH || './cookies.json';

class CookieStore {
    #cookies = {};
    #lastUpdated = null;

    constructor() {
        this.#load();
    }

    /** Load persisted cookies from disk (survives restarts) */
    #load() {
        try {
            if (fs.existsSync(STORE_PATH)) {
                const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
                this.#cookies = data.cookies || {};
                this.#lastUpdated = data.lastUpdated ? new Date(data.lastUpdated) : null;
                console.log(`Loaded ${Object.keys(this.#cookies).length} cookies from ${STORE_PATH}`);
            }
        } catch (err) {
            console.warn('Could not load cookie store:', err.message);
        }
    }

    /** Persist cookies to disk */
    #save() {
        try {
            fs.writeFileSync(STORE_PATH, JSON.stringify({
                lastUpdated: this.#lastUpdated,
                cookies: this.#cookies,
            }, null, 2));
        } catch (err) {
            console.warn('Could not save cookie store:', err.message);
        }
    }

    /**
     * Update stored cookies (called by the /api/cookies endpoint).
     * @param {Object} cookies - key/value pairs from the browser
     */
    set(cookies) {
        this.#cookies = { ...this.#cookies, ...cookies };
        this.#lastUpdated = new Date();
        this.#save();
        console.log(`Updated ${Object.keys(cookies).length} cookie(s). cf_clearance: ${cookies.cf_clearance ? '✓' : '✗'}`);
    }

    /**
     * Returns the cookies as a Cookie header string.
     * e.g. "cf_clearance=abc; __cf_bm=xyz"
     */
    getCookieHeader() {
        return Object.entries(this.#cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    hasClearance() {
        return !!this.#cookies.cf_clearance;
    }

    getLastUpdated() {
        return this.#lastUpdated;
    }

    getStatus() {
        const age = this.#lastUpdated
            ? Math.round((Date.now() - this.#lastUpdated.getTime()) / 1000)
            : null;
        return {
            hasCookies: Object.keys(this.#cookies).length > 0,
            hasClearance: this.hasClearance(),
            cookieCount: Object.keys(this.#cookies).length,
            lastUpdated: this.#lastUpdated,
            ageSeconds: age,
        };
    }
}

// Singleton — shared across the whole app
const cookieStore = new CookieStore();
export { cookieStore };
