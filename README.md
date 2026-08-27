# SwissPass FlexiAbo Bridge

A self-hosted management interface and Home Assistant integration for your SwissPass FlexiAbo.

This project solves the problem of automating and managing SwissPass FlexiAbos, which are normally heavily protected by Cloudflare bot management (blocking standard API requests with 403 errors). It uses a native `curl` fetch approach combined with a browser extension to securely harvest session tokens and bypass Cloudflare protection without storing passwords.

## Features

- **Multi-Profile Support:** Manage multiple SwissPass accounts/profiles simultaneously.
- **Bypass Cloudflare Bot Protection:** Uses native curl with specific TLS fingerprinting to bypass 403 blocks.
- **Browser Extension Bridge:** Automatically harvests and syncs OAuth refresh tokens from your active browser session directly to the backend.
- **Persistent Sessions:** The backend manages the OAuth token lifecycle, automatically refreshing tokens in the background to ensure persistent access.
- **REST API:** A fully-featured REST API for integrations.
- **Home Assistant Integration:** Monitor remaining days and activate your FlexiAbo directly from Home Assistant automations and dashboards.

## Architecture

1. **Node.js Backend:** Handles the persistent token lifecycle, API endpoints, and direct communication with SwissPass via `curl`.
2. **Browser Extension (Chrome/Firefox):** Injected into your browser session on `swisspass.ch` to intercept OAuth tokens and send them to your local backend.
3. **Home Assistant Component:** A HACS-compatible integration that polls the backend and provides sensors and services for automation.

## Prerequisites

- Node.js (v18+)
- `curl` installed on the host system.
- A modern browser (Chrome or Firefox) for the extension.
- (Optional) Home Assistant.

## Installation (Backend)

1. Clone this repository.
2. Install dependencies (if any are added in the future, currently uses built-in Express/Node features plus a few others):
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   HTTP_PORT=3001 node index.js
   ```
   *The server will create a default `main` profile and start listening on port 3001.*

## Setting up the Connection (Browser Extension)

Because SwissPass uses strict OAuth and Cloudflare, the server needs an initial token from a real browser session.

1. Open the backend interface in your browser: `http://localhost:3001` (or your configured port).
2. Download the Browser Extension from the provided link (`/api/extension/download`).
3. Load the extension in your browser:
   - **Chrome:** Go to `chrome://extensions/`, enable "Developer mode", and "Load unpacked" the unzipped folder.
   - **Firefox:** Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select the downloaded ZIP file.
4. Click the extension icon and configure it to point to your backend URL (e.g., `http://localhost:3001`).
5. Log in to `https://www.swisspass.ch/`. The extension will automatically intercept your authentication token and send it to your backend.
6. Check your server logs; it should say `Token hot-reloaded from external source`. The server will now keep this token alive indefinitely.

## Home Assistant Integration

You can integrate this with Home Assistant to automate day activations or display remaining days on a dashboard.

### Installation via HACS

1. You can download the integration ZIP directly from your running server at: `http://<your-server-ip>:3001/api/ha-integration/download`
2. Extract the ZIP.
3. Copy the `custom_components/swisspass_flexiabo` folder into your Home Assistant's `config/custom_components/` directory.
4. Restart Home Assistant.

### Configuration

1. In Home Assistant, go to **Settings -> Devices & Services -> Add Integration**.
2. Search for **SwissPass FlexiAbo**.
3. Enter your backend URL (e.g., `http://192.168.1.X:3001`) and the Profile Name (default is `main`).
4. Select your subscription from the dropdown.

### Available HA Entities & Services

**Sensors:**
- Days Remaining
- Days Used
- Subscription Name

**Services:**
- `swisspass_flexiabo.activate_today`: Activates the ticket for the current day.
- `swisspass_flexiabo.activate_date`: Activates a specific date (`YYYY-MM-DD`).
- `swisspass_flexiabo.deactivate_date`: Deactivates a specific date (`YYYY-MM-DD`).

## API Reference

The backend provides a REST API organized by profile.

*Replace `:profile` with your profile name (e.g., `main`).*

- `GET /api/profiles` - List all profiles and their token status.
- `POST /api/profiles` - Create a new profile (`{ "name": "myprofile" }`).
- `DELETE /api/profiles/:profile` - Delete a profile.
- `GET /api/profiles/:profile/subscriptions` - List all valid FlexiAbo subscriptions.
- `GET /api/profiles/:profile/subscriptions/:id` - Get details of activated days for a subscription.
- `GET /api/profiles/:profile/subscriptions/:id/days` - Get remaining days (100 - used).
- `POST /api/profiles/:profile/subscriptions/:id/days/today` - Activate today.
- `POST /api/profiles/:profile/subscriptions/:id/days` - Activate a specific date (`{ "date": "YYYY-MM-DD" }`).
- `DELETE /api/profiles/:profile/subscriptions/:id/days/:date` - Deactivate a specific date.

## Disclaimer

This project is not affiliated with, endorsed by, or connected to SBB or SwissPass. It is a personal project built to facilitate home automation. Use at your own risk.
