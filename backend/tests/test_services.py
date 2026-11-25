import unittest
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError

from app.knowledge import answer_question, retrieve
from app.models import Reading
from app.monitoring import assess_reading, serialize_utc
from app.schemas import IncidentCreate, PondCreate, ReadingCreate


def reading(**overrides: object) -> Reading:
    values = {
        "pond_id": 1,
        "recorded_at": datetime.now(timezone.utc),
        "dissolved_oxygen": 6.1,
        "temperature": 29.0,
        "ph": 8.0,
        "salinity": 18.0,
        "ammonia": 0.04,
        "source": "simulated",
    }
    values.update(overrides)
    return Reading(**values)


class MonitoringTests(unittest.TestCase):
    def test_normal_demo_reading_is_stable(self) -> None:
        result = assess_reading(reading())

        self.assertEqual(result["health"], "stable")
        self.assertEqual(result["alerts"], [])

    def test_low_oxygen_and_ammonia_are_flagged(self) -> None:
        result = assess_reading(reading(dissolved_oxygen=3.5, ammonia=0.2))

        self.assertEqual(result["health"], "attention")
        self.assertEqual(len(result["alerts"]), 2)

    def test_missing_and_outdated_readings_are_identified(self) -> None:
        self.assertEqual(assess_reading(None)["health"], "unknown")
        old = reading(recorded_at=datetime.now(timezone.utc) - timedelta(days=2))
        result = assess_reading(old)
        self.assertTrue(result["is_stale"])
        self.assertIn("Reading is older than 24 hours.", result["alerts"])


class KnowledgeTests(unittest.TestCase):
    def test_retrieval_returns_a_traceable_lifecycle_reference(self) -> None:
        results = retrieve("whiteleg shrimp life stages")

        self.assertTrue(any("Whiteleg shrimp" in result["title"] for result in results))
        self.assertTrue(all(result["url"].startswith("https://") for result in results))

    def test_unknown_question_returns_a_limitation_without_citations(self) -> None:
        result = answer_question("What is the exact disease in my pond?", "en")

        self.assertEqual(result["citations"], [])
        self.assertIn("not a pond diagnosis", result["limitation"])

    def test_telugu_and_hindi_terms_retrieve_relevant_references(self) -> None:
        telugu = answer_question("రొయ్యల పెంపకం దశలు", "te")
        hindi = answer_question("झींगा पालन चरण", "hi")

        self.assertTrue(any("Whiteleg shrimp" in citation["title"] for citation in telugu["citations"]))
        self.assertTrue(any("Whiteleg shrimp" in citation["title"] for citation in hindi["citations"]))


class ValidationTests(unittest.TestCase):
    def test_naive_sqlite_timestamps_are_serialized_as_utc(self) -> None:
        timestamp = datetime(2026, 11, 25, 10, 30)

        self.assertEqual(serialize_utc(timestamp), "2026-11-25T10:30:00+00:00")

    def test_reading_bounds_reject_impossible_values(self) -> None:
        with self.assertRaises(ValidationError):
            ReadingCreate(
                dissolved_oxygen=30,
                temperature=29,
                ph=8,
                salinity=18,
                ammonia=0.04,
            )

    def test_reading_accepts_explicit_source(self) -> None:
        result = ReadingCreate(
            dissolved_oxygen=6,
            temperature=29,
            ph=8,
            salinity=18,
            ammonia=0.04,
            source="actual",
        )

        self.assertEqual(result.source, "actual")

    def test_calendar_dates_and_nonblank_incident_descriptions_are_validated(self) -> None:
        pond = {
            "name": "Pond 4",
            "location": "Farm",
            "area_hectares": 1,
            "species": "Vannamei",
            "stage": "Nursery",
        }
        with self.assertRaises(ValidationError):
            PondCreate(**pond, stocked_on="2026-99-99")
        with self.assertRaises(ValidationError):
            IncidentCreate(pond_id=1, description="        ")


if __name__ == "__main__":
    unittest.main()
