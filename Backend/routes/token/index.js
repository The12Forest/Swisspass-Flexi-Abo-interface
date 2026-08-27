import fs from 'fs';
import path from 'path';
import express from 'express';
import log from '../../functions/log.js';
const console = { log: log('TokenRouter') };
const router = express.Router();

class TokenManager {
    #intervalMs
    #currentToken
    #currentRefreshToken
    #name

    constructor(name, interval = 60000 * 5) {
        this.#name = name
        this.#intervalMs = interval;
        try {
            this.#currentRefreshToken = JSON.parse(fs.readFileSync('./Backend/saves/tokens/refreshtoken_' + name + '.json', 'utf-8'));
        } catch {
            this.#currentRefreshToken = null;
            console.log("Refresh token file not found, add the token via the API.")
            const filePath = `./Backend/saves/tokens/refreshtoken_${name}.json`;
            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(null), 'utf-8');
        }
        this.#keepTokenUpToDate();

        setInterval(() => this.#keepTokenUpToDate(), this.#intervalMs);
        console.log("Token Updated for: " + this.#name)
    }

    async #saveRefreshToken(newRefreshToken) {
        this.#currentRefreshToken = newRefreshToken
        fs.writeFileSync('./Backend/saves/tokens/refreshtoken_' + this.#name + '.json', "\"" + this.#currentRefreshToken + "\"");
    }

    async #saveToken(newToken) {
        this.#currentToken = newToken
    }

    async #keepTokenUpToDate() {
        try {
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
        this.#saveRefreshToken(data.refresh_token);
        this.#saveToken(data.access_token);
        } catch (err) {
            console.log('Token refresh error:', err.message)
        }
    }

    currentToken() { return this.#currentToken; }
    isReady() { return !!this.#currentToken; }

    /** Hot-reload the refresh token (called when extension sends a new one) */
    async reloadToken(newRefreshToken) {
        this.#currentRefreshToken = newRefreshToken;
        await this.#keepTokenUpToDate();
        console.log('Token hot-reloaded from external source');
    }
}

export { TokenManager };