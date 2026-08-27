"""Config flow for SwissPass FlexiAbo."""
import voluptuous as vol
import aiohttp

from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, CONF_SERVER_URL, CONF_PROFILE, CONF_LEISTUNG_ID, DEFAULT_PROFILE


class SwissPassFlexiAboConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for SwissPass FlexiAbo."""

    VERSION = 1

    def __init__(self):
        self._server_url = None
        self._profile = None
        self._subscriptions = []

    async def async_step_user(self, user_input=None):
        errors = {}

        # Preserve whatever the user typed so the form doesn't reset on error
        suggested_url = (user_input or {}).get(CONF_SERVER_URL, "http://192.168.188.20:3001")
        suggested_profile = (user_input or {}).get(CONF_PROFILE, DEFAULT_PROFILE)

        if user_input is not None:
            self._server_url = user_input[CONF_SERVER_URL].rstrip("/")
            self._profile = user_input[CONF_PROFILE].strip().lower()

            session = async_get_clientsession(self.hass)

            # ── Step 1: Check server reachability via /api/profiles ──────────
            profiles_url = f"{self._server_url}/api/profiles"
            try:
                async with session.get(profiles_url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status != 200:
                        errors["base"] = "cannot_connect"
                    else:
                        data = await resp.json()
                        profiles = [
                            (p["name"] if isinstance(p, dict) else p)
                            for p in data.get("profiles", [])
                        ]
                        if self._profile not in profiles:
                            errors["base"] = "profile_not_found"
                        else:
                            # Check if profile has a token ready
                            profile_obj = next(
                                (p for p in data.get("profiles", [])
                                 if (p["name"] if isinstance(p, dict) else p) == self._profile),
                                None
                            )
                            token_ready = isinstance(profile_obj, dict) and profile_obj.get("ready", False)
                            if not token_ready:
                                errors["base"] = "no_token"
                            else:
                                # ── Step 2: Fetch subscriptions ───────────────
                                subs_url = f"{self._server_url}/api/profiles/{self._profile}/subscriptions"
                                async with session.get(subs_url, timeout=aiohttp.ClientTimeout(total=10)) as sresp:
                                    if sresp.status == 200:
                                        subs_data = await sresp.json()
                                        self._subscriptions = subs_data.get("subscriptions", [])
                                        if not self._subscriptions:
                                            errors["base"] = "no_subscriptions"
                                        else:
                                            return await self.async_step_subscription()
                                    else:
                                        errors["base"] = "no_subscriptions"

            except aiohttp.ClientConnectionError:
                errors["base"] = "cannot_connect"
            except Exception:
                errors["base"] = "cannot_connect"

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_SERVER_URL, default=suggested_url): str,
                vol.Required(CONF_PROFILE, default=suggested_profile): str,
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
