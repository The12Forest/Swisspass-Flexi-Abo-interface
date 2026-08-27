import fs from 'fs';
import path from 'path';
import log from './log.js';
const console = { log: log('TokenStore'), warn: log('TokenStore') };

const STORE_PATH = process.env.TOKEN_STORE_PATH || './data/token.json';

class TokenStore {
    #refreshToken = null;
    #lastUpdated = null;

    constructor() {
        this.#load();
    }

    #load() {
        try {
            const dir = path.dirname(STORE_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            if (fs.existsSync(STORE_PATH)) {
                const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
                this.#refreshToken = data.refreshToken || null;
                this.#lastUpdated = data.lastUpdated ? new Date(data.lastUpdated) : null;
                if (this.#refreshToken) {
                    console.log('Loaded refresh token from disk');
                }
            }
        } catch (err) {
            console.warn('Could not load token store:', err.message);
        }
    }

    save(refreshToken) {
        this.#refreshToken = refreshToken;
        this.#lastUpdated = new Date();
        try {
            const dir = path.dirname(STORE_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(STORE_PATH, JSON.stringify({
                refreshToken: this.#refreshToken,
                lastUpdated: this.#lastUpdated,
            }, null, 2));
        } catch (err) {
            console.warn('Could not save token store:', err.message);
        }
    }

    get() { return this.#refreshToken; }
    hasToken() { return !!this.#refreshToken; }
    getLastUpdated() { return this.#lastUpdated; }

    getStatus() {
        return {
            hasToken: this.hasToken(),
            lastUpdated: this.#lastUpdated,
        };
    }
}

const tokenStore = new TokenStore();
export { tokenStore };
