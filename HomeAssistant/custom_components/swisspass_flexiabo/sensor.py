"""Sensor platform for SwissPass FlexiAbo."""
from __future__ import annotations
from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback):
    """Set up sensors."""
    d = hass.data[DOMAIN][entry.entry_id]
    coordinator = d["coordinator"]
    profile = d["profile"]
    leistung_id = d["leistung_id"]

    async_add_entities([
        FlexiAboDaysRemainingSensor(coordinator, entry, profile, leistung_id),
        FlexiAboDaysUsedSensor(coordinator, entry, profile, leistung_id),
        FlexiAboNameSensor(coordinator, entry, profile, leistung_id),
    ])


class FlexiAboBaseSensor(CoordinatorEntity, SensorEntity):
    def __init__(self, coordinator, entry, profile, leistung_id):
        super().__init__(coordinator)
        self._entry = entry
        self._profile = profile
        self._leistung_id = leistung_id

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, f"{self._profile}_{self._leistung_id}")},
            "name": f"SwissPass FlexiAbo ({self._profile})",
            "manufacturer": "SBB / SwissPass",
            "model": "FlexiAbo",
        }


class FlexiAboDaysRemainingSensor(FlexiAboBaseSensor):
    _attr_icon = "mdi:ticket-outline"
    _attr_native_unit_of_measurement = "days"

    @property
    def unique_id(self):
        return f"swisspass_{self._profile}_{self._leistung_id}_days_remaining"

    @property
    def name(self):
        return f"FlexiAbo {self._profile} Days Remaining"

    @property
    def native_value(self):
        return self.coordinator.data.get("days_remaining") if self.coordinator.data else None

    @property
    def extra_state_attributes(self):
        if not self.coordinator.data:
            return {}
        sub = self.coordinator.data.get("subscription", {})
        return {
            "leistung_id": self._leistung_id,
            "profile": self._profile,
            "validity_from": sub.get("ersterGueltigkeitsTag"),
            "validity_to": sub.get("letzterGueltigkeitsTag"),
            "class": sub.get("klasse"),
        }


class FlexiAboDaysUsedSensor(FlexiAboBaseSensor):
    _attr_icon = "mdi:calendar-check"
    _attr_native_unit_of_measurement = "days"

    @property
    def unique_id(self):
        return f"swisspass_{self._profile}_{self._leistung_id}_days_used"

    @property
    def name(self):
        return f"FlexiAbo {self._profile} Days Used"

    @property
    def native_value(self):
        if not self.coordinator.data:
            return None
        return len(self.coordinator.data.get("used_days", []))

    @property
    def extra_state_attributes(self):
        if not self.coordinator.data:
            return {}
        return {"activated_dates": self.coordinator.data.get("used_days", [])}


class FlexiAboNameSensor(FlexiAboBaseSensor):
    _attr_icon = "mdi:card-account-details"

    @property
    def unique_id(self):
        return f"swisspass_{self._profile}_{self._leistung_id}_name"

    @property
    def name(self):
        return f"FlexiAbo {self._profile} Subscription"

    @property
    def native_value(self):
        if not self.coordinator.data:
            return None
        return self.coordinator.data.get("subscription", {}).get("bezeichnung", "Unknown")
