"""Config flow for SwissPass FlexiAbo."""
import voluptuous as vol
import aiohttp

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, CONF_SERVER_URL, CONF_PROFILE, CONF_LEISTUNG_ID, DEFAULT_PROFILE


async def _test_connection(session: aiohttp.ClientSession, server_url: str, profile: str) -> dict | None:
    """Try to list subscriptions. Returns first subscription dict or None on failure."""
    url = f"{server_url.rstrip('/')}/api/profiles/{profile}/subscriptions"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status == 200:
                data = await resp.json()
                subs = data.get("subscriptions", [])
                return subs[0] if subs else {}
    except Exception:
        pass
    return None


class SwissPassFlexiAboConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for SwissPass FlexiAbo."""

    VERSION = 1

    def __init__(self):
        self._server_url = None
        self._profile = None
        self._subscriptions = []

    async def async_step_user(self, user_input=None):
        errors = {}

        if user_input is not None:
            self._server_url = user_input[CONF_SERVER_URL].rstrip("/")
            self._profile = user_input[CONF_PROFILE].strip().lower()

            session = async_get_clientsession(self.hass)
            url = f"{self._server_url}/api/profiles/{self._profile}/subscriptions"
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        self._subscriptions = data.get("subscriptions", [])
                        if not self._subscriptions:
                            errors["base"] = "no_subscriptions"
                        else:
                            return await self.async_step_subscription()
                    elif resp.status == 404:
                        errors["base"] = "profile_not_found"
                    else:
                        errors["base"] = "cannot_connect"
            except aiohttp.ClientConnectionError:
                errors["base"] = "cannot_connect"
            except Exception:
                errors["base"] = "unknown"

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_SERVER_URL, default="http://localhost:3001"): str,
                vol.Required(CONF_PROFILE, default=DEFAULT_PROFILE): str,
            }),
            errors=errors,
        )

    async def async_step_subscription(self, user_input=None):
        errors = {}

        if user_input is not None:
            leistung_id = user_input[CONF_LEISTUNG_ID]
            sub = next((s for s in self._subscriptions if str(s.get("leistungId")) == leistung_id), None)
            title = sub.get("bezeichnung", leistung_id) if sub else leistung_id

            await self.async_set_unique_id(f"{self._profile}_{leistung_id}")
            self._abort_if_unique_id_configured()

            return self.async_create_entry(
                title=f"FlexiAbo {title} ({self._profile})",
                data={
                    CONF_SERVER_URL: self._server_url,
                    CONF_PROFILE: self._profile,
                    CONF_LEISTUNG_ID: leistung_id,
                },
            )

        sub_options = {
            str(s["leistungId"]): f"{s.get('bezeichnung', s['leistungId'])} (ID: {s['leistungId']})"
            for s in self._subscriptions
        }

        return self.async_show_form(
            step_id="subscription",
            data_schema=vol.Schema({
                vol.Required(CONF_LEISTUNG_ID): vol.In(sub_options),
            }),
            errors=errors,
        )
