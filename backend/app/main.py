import base64
import binascii
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from .database import Base, SessionLocal, engine, get_db
from .knowledge import KNOWLEDGE, answer_question, retrieve
from .models import ExpertReview, Farmer, Incident, Pond, Reading, utc_now
from .monitoring import assess_reading, serialize_utc
from .schemas import (
    AssistantQuestion,
    ExpertReviewCreate,
    IncidentCreate,
    PondCreate,
    PondOut,
    ReadingCreate,
    ReadingOut,
)

UPLOAD_DIRECTORY = Path(os.getenv("UPLOAD_DIRECTORY", "./uploads")).resolve()
WEB_ORIGIN = os.getenv("WEB_ORIGIN", "http://localhost:5173")


def seed_database() -> None:
    with SessionLocal() as session:
        if session.scalar(select(Farmer.id).limit(1)) is not None:
            return
        farmer = Farmer(name="Ravi Kumar")
        farmer.ponds = [
            Pond(
                name="Bluewater 01",
                location="Bhimavaram, Andhra Pradesh",
                area_hectares=1.8,
                species="Litopenaeus vannamei",
                stocked_on=(datetime.now(timezone.utc) - timedelta(days=42)).date().isoformat(),
                stage="Grow-out",
                readings=[
                    Reading(
                        dissolved_oxygen=6.2,
                        temperature=29.1,
                        ph=8.1,
                        salinity=18,
                        ammonia=0.04,
                        source="simulated",
                    )
                ],
            ),
            Pond(
                name="Bluewater 02",
                location="Bhimavaram, Andhra Pradesh",
                area_hectares=2.4,
                species="Litopenaeus vannamei",
                stocked_on=(datetime.now(timezone.utc) - timedelta(days=68)).date().isoformat(),
                stage="Grow-out",
                readings=[
                    Reading(
                        dissolved_oxygen=3.8,
                        temperature=31.4,
                        ph=8.6,
                        salinity=20,
                        ammonia=0.16,
                        source="simulated",
                    )
                ],
            ),
            Pond(
                name="Bluewater 03",
                location="Bhimavaram, Andhra Pradesh",
                area_hectares=1.2,
                species="Litopenaeus vannamei",
                stocked_on=(datetime.now(timezone.utc) - timedelta(days=12)).date().isoformat(),
                stage="Nursery",
            ),
        ]
        session.add(farmer)
        session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_database()
    yield


app = FastAPI(
    title="AquaSathi API",
    description="Shrimp pond monitoring and incident investigation MVP.",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[WEB_ORIGIN],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

DbSession = Annotated[Session, Depends(get_db)]


def reading_data(reading: Reading | None) -> dict[str, object] | None:
    if reading is None:
        return None
    data = ReadingOut.model_validate(reading).model_dump(mode="json")
    data["recorded_at"] = serialize_utc(reading.recorded_at)
    return data


def pond_data(pond: Pond, db: Session) -> dict[str, object]:
    latest = db.scalar(
        select(Reading)
        .where(Reading.pond_id == pond.id)
        .order_by(Reading.recorded_at.desc(), Reading.id.desc())
        .limit(1)
    )
    assessment = assess_reading(latest)
    return {
        **PondOut.model_validate(pond).model_dump(),
        "latest_reading": reading_data(latest),
        **assessment,
    }


def incident_data(incident: Incident) -> dict[str, object]:
    return {
        "id": incident.id,
        "pond_id": incident.pond_id,
        "pond_name": incident.pond.name,
        "description": incident.description,
        "status": incident.status,
        "severity": incident.severity,
        "image_id": incident.image_id,
        "image_url": f"/api/images/{incident.image_id}" if incident.image_id else None,
        "image_screening": (
            "Automated screening is not configured. Image attached for expert review; "
            "no disease diagnosis was performed."
            if incident.image_id
            else None
        ),
        "attached_reading": reading_data(incident.attached_reading),
        "reading_assessment": assess_reading(incident.attached_reading),
        "created_at": serialize_utc(incident.created_at),
        "reviews": [
            {
                "reviewer_name": review.reviewer_name,
                "recommendation": review.recommendation,
                "case_status": review.case_status,
                "created_at": serialize_utc(review.created_at),
            }
            for review in incident.reviews
        ],
    }


def save_image(image_data: str | None) -> str | None:
    if image_data is None:
        return None
    match = re.fullmatch(
        r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", image_data
    )
    if match is None:
        raise HTTPException(status_code=422, detail="Use a PNG, JPEG, or WebP image.")
    try:
        content = base64.b64decode(match.group(2), validate=True)
    except binascii.Error as exc:
        raise HTTPException(status_code=422, detail="The image data is invalid.") from exc
    if not content or len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Images must be smaller than 5 MB.")
    extension, signature = {
        "png": (".png", b"\x89PNG\r\n\x1a\n"),
        "jpeg": (".jpg", b"\xff\xd8\xff"),
        "webp": (".webp", b"RIFF"),
    }[match.group(1)]
    if not content.startswith(signature) or (
        match.group(1) == "webp" and content[8:12] != b"WEBP"
    ):
        raise HTTPException(status_code=422, detail="Image content does not match its format.")
    UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
    image_id = str(uuid.uuid4())
    (UPLOAD_DIRECTORY / f"{image_id}{extension}").write_bytes(content)
    return image_id


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "data_mode": "simulated_demo"}


@app.get("/api/dashboard")
def dashboard(db: DbSession) -> dict[str, object]:
    ponds = list(db.scalars(select(Pond).order_by(Pond.id)))
    incidents = list(
        db.scalars(
            select(Incident)
            .options(
                joinedload(Incident.pond),
                joinedload(Incident.reviews),
                joinedload(Incident.attached_reading),
            )
            .order_by(Incident.created_at.desc())
            .limit(8)
        ).unique()
    )
    summaries = [pond_data(pond, db) for pond in ponds]
    open_incident_count = db.scalar(
        select(func.count()).select_from(Incident).where(Incident.status != "resolved")
    ) or 0
    return {
        "farmer_name": db.scalar(select(Farmer.name).order_by(Farmer.id).limit(1)) or "Farmer",
        "total_ponds": len(ponds),
        "attention_count": sum(pond["health"] == "attention" for pond in summaries),
        "open_incidents": open_incident_count,
        "ponds": summaries,
        "recent_incidents": [incident_data(item) for item in incidents],
        "data_notice": "Sample readings are simulated and are not sensor measurements.",
    }


@app.get("/api/ponds")
def list_ponds(db: DbSession) -> list[dict[str, object]]:
    return [pond_data(pond, db) for pond in db.scalars(select(Pond).order_by(Pond.id))]


@app.post("/api/ponds", status_code=status.HTTP_201_CREATED)
def create_pond(payload: PondCreate, db: DbSession) -> dict[str, object]:
    farmer = db.scalar(select(Farmer).order_by(Farmer.id).limit(1))
    if farmer is None:
        farmer = Farmer(name="Farm manager")
        db.add(farmer)
        db.flush()
    pond = Pond(farmer_id=farmer.id, **payload.model_dump())
    db.add(pond)
    db.commit()
    db.refresh(pond)
    return pond_data(pond, db)


@app.get("/api/ponds/{pond_id}/readings")
def list_readings(
    pond_id: int,
    db: DbSession,
    limit: int = Query(default=30, ge=1, le=180),
) -> list[dict[str, object]]:
    if db.get(Pond, pond_id) is None:
        raise HTTPException(status_code=404, detail="Pond not found.")
    readings = db.scalars(
        select(Reading)
        .where(Reading.pond_id == pond_id)
        .order_by(Reading.recorded_at.desc(), Reading.id.desc())
        .limit(limit)
    )
    return [reading_data(reading) for reading in readings]


@app.post("/api/ponds/{pond_id}/readings", status_code=status.HTTP_201_CREATED)
def create_reading(pond_id: int, payload: ReadingCreate, db: DbSession) -> dict[str, object]:
    if db.get(Pond, pond_id) is None:
        raise HTTPException(status_code=404, detail="Pond not found.")
    reading = Reading(pond_id=pond_id, **payload.model_dump())
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return {**reading_data(reading), **assess_reading(reading)}


@app.get("/api/incidents")
def list_incidents(
    db: DbSession,
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[dict[str, object]]:
    query = select(Incident).options(
        joinedload(Incident.pond),
        joinedload(Incident.reviews),
        joinedload(Incident.attached_reading),
    )
    if status_filter in {"open", "monitoring", "resolved"}:
        query = query.where(Incident.status == status_filter)
    elif status_filter is not None:
        raise HTTPException(status_code=422, detail="Invalid incident status.")
    incidents = db.scalars(query.order_by(Incident.created_at.desc())).unique()
    return [incident_data(incident) for incident in incidents]


@app.post("/api/incidents", status_code=status.HTTP_201_CREATED)
def create_incident(payload: IncidentCreate, db: DbSession) -> dict[str, object]:
    if db.get(Pond, payload.pond_id) is None:
        raise HTTPException(status_code=404, detail="Pond not found.")
    image_id = save_image(payload.image_data)
    latest_reading = db.scalar(
        select(Reading)
        .where(Reading.pond_id == payload.pond_id)
        .order_by(Reading.recorded_at.desc(), Reading.id.desc())
        .limit(1)
    )
    incident = Incident(
        pond_id=payload.pond_id,
        description=payload.description.strip(),
        severity="review",
        image_id=image_id,
        reading_id=latest_reading.id if latest_reading else None,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    incident = db.scalar(
        select(Incident)
        .options(
            joinedload(Incident.pond),
            joinedload(Incident.reviews),
            joinedload(Incident.attached_reading),
        )
        .where(Incident.id == incident.id)
    )
    return incident_data(incident)


@app.get("/api/images/{image_id}")
def get_image(image_id: str) -> FileResponse:
    try:
        safe_id = str(uuid.UUID(image_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Image not found.") from exc
    for extension, media_type in (
        (".png", "image/png"),
        (".jpg", "image/jpeg"),
        (".webp", "image/webp"),
    ):
        image_path = UPLOAD_DIRECTORY / f"{safe_id}{extension}"
        if image_path.is_file():
            return FileResponse(image_path, media_type=media_type)
    raise HTTPException(status_code=404, detail="Image not found.")


@app.post("/api/incidents/{incident_id}/reviews")
def add_expert_review(
    incident_id: int, payload: ExpertReviewCreate, db: DbSession
) -> dict[str, object]:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    incident.status = payload.case_status
    review = ExpertReview(incident_id=incident_id, **payload.model_dump())
    db.add(review)
    db.commit()
    refreshed = db.scalar(
        select(Incident)
        .options(
            joinedload(Incident.pond),
            joinedload(Incident.reviews),
            joinedload(Incident.attached_reading),
        )
        .where(Incident.id == incident_id)
    )
    return incident_data(refreshed)


@app.get("/api/knowledge")
def search_knowledge(
    q: str = Query(default="", max_length=300),
) -> dict[str, object]:
    references = retrieve(q) if q else KNOWLEDGE
    return {
        "mode": "local_reference_search",
        "references": references,
        "notice": "Local reference lookup only; no external AI model is connected.",
    }


@app.post("/api/assistant")
def ask_assistant(payload: AssistantQuestion) -> dict[str, object]:
    return answer_question(payload.question, payload.language)
