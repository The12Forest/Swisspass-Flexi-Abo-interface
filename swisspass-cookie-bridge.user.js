// ==UserScript==
// @name         SwissPass Cookie Bridge
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatically sends SwissPass Cloudflare cookies to your local Flexi Abo server
// @author       You
// @match        https://www.swisspass.ch/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ─── CONFIG ──────────────────────────────────────────────────────────────
    // Change this if your server runs on a different port
    const SERVER_URL = 'http://localhost:3000/api/cookies';
    // How often to resend cookies (ms). Cloudflare cookies expire in ~30min.
    const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
    // ─────────────────────────────────────────────────────────────────────────

    function parseCookies() {
        return document.cookie.split(';').reduce((acc, pair) => {
            const [key, ...rest] = pair.trim().split('=');
            if (key) acc[key.trim()] = rest.join('=').trim();
            return acc;
        }, {});
    }

    function sendCookies() {
        const cookies = parseCookies();

        // Only send the Cloudflare-related cookies (no need to send all of them)
        const relevant = {};
        const wantedKeys = ['cf_clearance', '__cf_bm', '__cfruid'];
        for (const key of wantedKeys) {
            if (cookies[key]) relevant[key] = cookies[key];
        }

        if (!relevant.cf_clearance) {
            console.debug('[SwissPass Bridge] cf_clearance not found in cookies yet, skipping.');
            return;
        }

        GM_xmlhttpRequest({
            method: 'POST',
            url: SERVER_URL,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify(relevant),
            onload(res) {
                if (res.status === 200) {
                    console.debug('[SwissPass Bridge] ✓ Cookies sent to local server:', Object.keys(relevant).join(', '));
                } else {
                    console.warn('[SwissPass Bridge] Server responded:', res.status, res.responseText);
                }
            },
            onerror(err) {
                console.warn('[SwissPass Bridge] Could not reach local server at', SERVER_URL, err);
            }
        });
    }

    // Send immediately on page load, then every INTERVAL_MS
    sendCookies();
    setInterval(sendCookies, INTERVAL_MS);
})();
