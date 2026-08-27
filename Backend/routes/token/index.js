import express from 'express';
import log from '../../functions/log.js';
import { tokenStore } from '../../functions/tokenStore.js';
const console = { log: log('TokenRouter') };
const router = express.Router();

class TokenManager {
    #intervalId
    #intervalMs
    #currentToken
    #currentRefreshToken

    constructor(initialRefreshToken) {
        this.#intervalMs = 60000 * 5; // refresh every 5 min
        // Use provided token, or fall back to persisted one
        this.#currentRefreshToken = initialRefreshToken || tokenStore.get();
    }

    async keepTokenUpToDate() {
        if (!this.#currentRefreshToken) {
            throw new Error('No refresh token available. Please log in via the browser extension or paste a refresh token.');
        }

        const response = await fetch('https://login.swisspass.ch/v3/oev-oauth/rest/oauth2/authorization-servers/swisspass_ch/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                scope: 'openid customer ACR_Level_10 ACR_Level_20 ACR_Level_30',
                refresh_token: this.#currentRefreshToken,
                client_id: 'swisspass_ch',
                lang: 'de',
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Token refresh failed (${response.status}): ${errorBody}`);
        }

        const data = await response.json();
        this.#currentRefreshToken = data.refresh_token;
        this.#currentToken = data.access_token;

        // Persist the new refresh token so server restarts don't lose it
        tokenStore.save(this.#currentRefreshToken);
        console.log('Token refreshed and persisted ✓');
    }

    async start() {
        if (this.#intervalId) return;
        await this.keepTokenUpToDate();
        this.#intervalId = setInterval(() => {
            this.keepTokenUpToDate().catch(err => console.log('Token refresh error:', err.message));
        }, this.#intervalMs);
    }

    stop() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId);
            this.#intervalId = null;
        }
    }

    getCurrentToken() { return this.#currentToken; }
    isReady() { return !!this.#currentToken; }

    /** Hot-reload the refresh token (called when extension sends a new one) */
    async reloadToken(newRefreshToken) {
        this.#currentRefreshToken = newRefreshToken;
        tokenStore.save(newRefreshToken);
        await this.keepTokenUpToDate();
        console.log('Token hot-reloaded from external source');
    }
}

export { TokenManager };