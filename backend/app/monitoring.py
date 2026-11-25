from datetime import datetime, timezone

from .models import Reading


def assess_reading(reading: Reading | None) -> dict[str, object]:
    if reading is None:
        return {
            "health": "unknown",
            "observation": "No reading recorded yet. Add a measurement to assess this pond.",
            "alerts": ["Missing reading"],
        }

    alerts = []
    if reading.dissolved_oxygen < 4:
        alerts.append("Dissolved oxygen is below the demo review threshold (4 mg/L).")
    elif reading.dissolved_oxygen < 5:
        alerts.append("Dissolved oxygen is near the demo review threshold.")
    if reading.temperature < 26 or reading.temperature > 34:
        alerts.append("Temperature is outside the demo screening range (26–34 °C).")
    if reading.ph < 7 or reading.ph > 9:
        alerts.append("pH is outside the demo screening range (7–9).")
    if reading.salinity < 5 or reading.salinity > 35:
        alerts.append("Salinity is outside the demo screening range (5–35 ppt).")
    if reading.ammonia > 0.1:
        alerts.append("Ammonia is above the demo review threshold (0.1 mg/L).")

    recorded_at = reading.recorded_at
    if recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=timezone.utc)
    is_stale = (datetime.now(timezone.utc) - recorded_at).total_seconds() > 24 * 60 * 60
    if is_stale:
        alerts.append("Reading is older than 24 hours.")

    health = "attention" if alerts else "stable"
    return {
        "health": health,
        "observation": (
            "Review the flagged values and consider confirming them with a calibrated test."
            if alerts
            else "No demo screening thresholds are flagged in this reading."
        ),
        "alerts": alerts,
        "is_stale": is_stale,
    }
