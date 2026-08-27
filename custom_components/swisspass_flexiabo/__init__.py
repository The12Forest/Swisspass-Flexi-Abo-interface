"""SwissPass FlexiAbo integration."""
from __future__ import annotations

import logging
from datetime import timedelta

import aiohttp
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import DOMAIN, CONF_SERVER_URL, CONF_PROFILE, CONF_LEISTUNG_ID, SCAN_INTERVAL_SECONDS

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up SwissPass FlexiAbo from a config entry."""
    server_url = entry.data[CONF_SERVER_URL].rstrip("/")
    profile = entry.data[CONF_PROFILE]
    leistung_id = entry.data[CONF_LEISTUNG_ID]

    session = async_get_clientsession(hass)

    async def async_fetch_data():
        """Fetch data from the FlexiAbo server."""
        try:
            # Fetch subscriptions
            subs_url = f"{server_url}/api/profiles/{profile}/subscriptions"
            async with session.get(subs_url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    raise UpdateFailed(f"Server returned {resp.status}")
                subs_data = await resp.json()

            subs = subs_data.get("subscriptions", [])
            sub = next((s for s in subs if str(s.get("leistungId")) == str(leistung_id)), None)
            if not sub:
                raise UpdateFailed(f"Subscription {leistung_id} not found")

            # Fetch activated days
            days_url = f"{server_url}/api/profiles/{profile}/subscriptions/{leistung_id}/days"
            async with session.get(days_url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    raise UpdateFailed(f"Days endpoint returned {resp.status}")
                days_data = await resp.json()

            return {
                "subscription": sub,
                "days_remaining": days_data.get("days", 0),
                "used_days": days_data.get("usedDays", []),
            }
        except aiohttp.ClientConnectionError as err:
            raise UpdateFailed(f"Cannot connect to server: {err}")

    coordinator = DataUpdateCoordinator(
        hass,
        _LOGGER,
        name=f"swisspass_flexiabo_{profile}_{leistung_id}",
        update_method=async_fetch_data,
        update_interval=timedelta(seconds=SCAN_INTERVAL_SECONDS),
    )

    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
        "coordinator": coordinator,
        "server_url": server_url,
        "profile": profile,
        "leistung_id": leistung_id,
        "session": session,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # ── Services ──────────────────────────────────────────────────────────────

    async def handle_activate_today(call: ServiceCall):
        """Service: activate today's day for a given entry."""
        entry_id = call.data.get("entry_id", entry.entry_id)
        d = hass.data[DOMAIN].get(entry_id)
        if not d:
            _LOGGER.error("SwissPass FlexiAbo: entry_id %s not found", entry_id)
            return
        url = f"{d['server_url']}/api/profiles/{d['profile']}/subscriptions/{d['leistung_id']}/days/today"
        async with d["session"].post(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                _LOGGER.info("SwissPass FlexiAbo: today activated ✓")
                await coordinator.async_request_refresh()
            else:
                body = await resp.text()
                _LOGGER.error("SwissPass FlexiAbo: activate failed %s: %s", resp.status, body)

    async def handle_activate_date(call: ServiceCall):
        """Service: activate a specific date."""
        date = call.data.get("date")
        if not date:
            _LOGGER.error("SwissPass FlexiAbo: 'date' parameter required (YYYY-MM-DD)")
            return
        entry_id = call.data.get("entry_id", entry.entry_id)
        d = hass.data[DOMAIN].get(entry_id)
        if not d:
            _LOGGER.error("SwissPass FlexiAbo: entry_id %s not found", entry_id)
            return
        url = f"{d['server_url']}/api/profiles/{d['profile']}/subscriptions/{d['leistung_id']}/days"
        async with d["session"].post(url, json={"date": date}, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                _LOGGER.info("SwissPass FlexiAbo: %s activated ✓", date)
                await coordinator.async_request_refresh()
            else:
                body = await resp.text()
                _LOGGER.error("SwissPass FlexiAbo: activate %s failed %s: %s", date, resp.status, body)

    async def handle_deactivate_date(call: ServiceCall):
        """Service: deactivate a specific date."""
        date = call.data.get("date")
        if not date:
            _LOGGER.error("SwissPass FlexiAbo: 'date' parameter required (YYYY-MM-DD)")
            return
        entry_id = call.data.get("entry_id", entry.entry_id)
        d = hass.data[DOMAIN].get(entry_id)
        if not d:
            _LOGGER.error("SwissPass FlexiAbo: entry_id %s not found", entry_id)
            return
        url = f"{d['server_url']}/api/profiles/{d['profile']}/subscriptions/{d['leistung_id']}/days/{date}"
        async with d["session"].delete(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                _LOGGER.info("SwissPass FlexiAbo: %s deactivated ✓", date)
                await coordinator.async_request_refresh()
            else:
                body = await resp.text()
                _LOGGER.error("SwissPass FlexiAbo: deactivate %s failed %s: %s", date, resp.status, body)

    if not hass.services.has_service(DOMAIN, "activate_today"):
        hass.services.async_register(DOMAIN, "activate_today", handle_activate_today)
    if not hass.services.has_service(DOMAIN, "activate_date"):
        hass.services.async_register(DOMAIN, "activate_date", handle_activate_date)
    if not hass.services.has_service(DOMAIN, "deactivate_date"):
        hass.services.async_register(DOMAIN, "deactivate_date", handle_deactivate_date)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok
