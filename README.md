# SwissPass FlexiAbo Bridge

A self-hosted management interface and Home Assistant integration for your SwissPass FlexiAbo.

This project solves the problem of automating and managing SwissPass FlexiAbos, which are normally heavily protected by Cloudflare bot management (blocking standard API requests with 403 errors). It uses a native `curl` fetch approach combined with a browser extension to securely harvest session tokens and bypass Cloudflare protection without storing passwords.

## Features

- **Multi-Profile Support:** Manage multiple SwissPass accounts/profiles simultaneously.
- **Bypass Cloudflare Bot Protection:** Uses native curl with specific TLS fingerprinting to bypass 403 blocks.
- **Browser Extension Bridge:** Automatically harvests and syncs OAuth refresh tokens from your active browser session directly to the backend.
- **Persistent Sessions:** The backend manages the OAuth token lifecycle, automatically refreshing tokens in the background.
- **REST API:** A fully-featured REST API for integrations.
- **Home Assistant Integration:** Monitor remaining days and activate your FlexiAbo directly from Home Assistant automations and dashboards.
- **Dual HTTP/HTTPS:** Serves HTTP (for Home Assistant) and HTTPS (for the Browser Extension) simultaneously.

## Architecture

1. **Node.js Backend:** Handles the persistent token lifecycle, API endpoints, and direct communication with SwissPass via `curl`.
2. **Browser Extension (Chrome/Firefox):** Injected into your browser session on `swisspass.ch` to intercept OAuth tokens and send them to your local backend.
3. **Home Assistant Component:** A HACS-compatible integration that polls the backend and provides sensors and a button for automation.

---

## Quick Start (Docker)

The easiest way to run the backend is via Docker Compose.

```bash
# 1. Download the compose file
curl -O https://raw.githubusercontent.com/The12Forest/swisspass-flexi-abo-interface/main/docker-compose.yml

# 2. Start the server
docker compose up -d
```

The server will:
- Auto-generate a self-signed TLS certificate on first start (saved in `./data/tls/`).
- Listen on two ports:
  - **HTTP `3001`** → for Home Assistant (no cert needed)
  - **HTTPS `3443`** → for the Browser Extension

---

## URL Overview

| Client | URL | Notes |
|---|---|---|
| **Browser Extension** | `https://<server-ip>:3443` | HTTPS required; accept cert once |
| **Home Assistant** | `http://<server-ip>:3001` | Plain HTTP, no cert needed |
| **API / Debug** | `http://<server-ip>:3001/api/...` | All API routes work on both ports |

---

## Installation (Manual / Without Docker)

```bash
git clone https://github.com/The12Forest/swisspass-flexi-abo-interface.git
cd swisspass-flexi-abo-interface
npm install
HTTP_PORT=3001 HTTPS_PORT=3443 node index.js
```

*`openssl` must be installed on the system for automatic certificate generation.*

---

## Setting up the Browser Extension

1. Start the server and navigate to `https://<server-ip>:3443` in your browser.
2. Click **"Risiko akzeptieren und fortfahren"** (accept the self-signed cert). You only need to do this once.
3. Download the extension from `/api/extension/download`.
4. Load the extension in developer mode:
   - **Chrome:** `chrome://extensions/` → Enable "Developer mode" → "Load unpacked"
   - **Firefox:** `about:debugging` → "Load Temporary Add-on" → select the ZIP
5. Click the extension icon, enter `https://<server-ip>:3443` as the server URL and click **Speichern**.
6. Log in to `https://www.swisspass.ch`. Then click **"Token senden"** in the extension popup.
7. Check your server logs — it should say `Token hot-reloaded from external source`.

---

## Home Assistant Integration

### Installation

1. Download the integration ZIP from your running server: `http://<server-ip>:3001/api/ha-integration/download`
2. Extract and copy `custom_components/swisspass_flexiabo` into your HA's `config/custom_components/` directory.
3. Restart Home Assistant.

### Configuration

1. Go to **Settings → Devices & Services → Add Integration**.
2. Search for **SwissPass FlexiAbo**.
3. Enter your backend URL: `http://<server-ip>:3001` *(use HTTP, not HTTPS)*
4. Enter the Profile Name (default: `main`) and select your subscription.

### Available Entities

**Sensors:**
- Days Remaining
- Days Used
- Subscription Name

**Button:**
- **Activate Today** — activates the ticket for today directly from the dashboard

**Services:**
- `swisspass_flexiabo.activate_today`
- `swisspass_flexiabo.activate_date` — requires `date: YYYY-MM-DD`
- `swisspass_flexiabo.deactivate_date` — requires `date: YYYY-MM-DD`

---

## API Reference

*Replace `:profile` with your profile name (e.g., `main`).*

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/profiles` | List all profiles |
| POST | `/api/profiles` | Create profile `{ "name": "..." }` |
| DELETE | `/api/profiles/:profile` | Delete a profile |
| GET | `/api/profiles/:profile/auth/status` | Token status |
| POST | `/api/profiles/:profile/auth/token` | Inject refresh token |
| GET | `/api/profiles/:profile/subscriptions` | List subscriptions |
| GET | `/api/profiles/:profile/subscriptions/:id/days` | Remaining days |
| POST | `/api/profiles/:profile/subscriptions/:id/days/today` | Activate today |
| POST | `/api/profiles/:profile/subscriptions/:id/days` | Activate date `{ "date": "YYYY-MM-DD" }` |
| DELETE | `/api/profiles/:profile/subscriptions/:id/days/:date` | Deactivate date |
| GET | `/api/extension/download` | Download browser extension ZIP |
| GET | `/api/ha-integration/download` | Download HA integration ZIP |

---

## Disclaimer

This project is not affiliated with, endorsed by, or connected to SBB or SwissPass. It is a personal project built to facilitate home automation. Use at your own risk.
