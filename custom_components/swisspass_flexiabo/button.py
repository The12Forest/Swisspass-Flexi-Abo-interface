"""Button platform for SwissPass FlexiAbo."""
from __future__ import annotations

import logging

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
import aiohttp

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the button platform."""
    data = hass.data[DOMAIN][entry.entry_id]
    coordinator = data["coordinator"]

    async_add_entities([ActivateTodayButton(coordinator, data)])


class ActivateTodayButton(CoordinatorEntity, ButtonEntity):
    """Button to activate today's day for the subscription."""

    _attr_icon = "mdi:calendar-check"

    def __init__(self, coordinator, data):
        """Initialize the button."""
        super().__init__(coordinator)
        self.data = data
        self.profile = data["profile"]
        self.leistung_id = data["leistung_id"]
        self._attr_name = f"SwissPass {self.profile} Activate Today"
        self._attr_unique_id = f"swisspass_{self.profile}_{self.leistung_id}_activate_today"

    @property
    def device_info(self):
        """Link this entity to the device."""
        return {
            "identifiers": {(DOMAIN, f"{self.profile}_{self.leistung_id}")},
            "name": f"SwissPass FlexiAbo ({self.profile})",
            "manufacturer": "SBB / SwissPass",
            "model": "FlexiAbo",
        }

    async def async_press(self) -> None:
        """Handle the button press."""
        url = f"{self.data['server_url']}/api/profiles/{self.profile}/subscriptions/{self.leistung_id}/days/today"
        _LOGGER.info("Activating today's day via button...")
        try:
            async with self.data["session"].post(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 200:
                    _LOGGER.info("SwissPass FlexiAbo: today activated ✓")
                    await self.coordinator.async_request_refresh()
                else:
                    body = await resp.text()
                    _LOGGER.error("SwissPass FlexiAbo: activate failed %s: %s", resp.status, body)
        except Exception as e:
            _LOGGER.error("SwissPass FlexiAbo: Error activating today's day: %s", e)
