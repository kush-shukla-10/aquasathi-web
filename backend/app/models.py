from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Farmer(Base):
    __tablename__ = "farmers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(40), default="farmer", nullable=False)
    ponds: Mapped[list["Pond"]] = relationship(back_populates="farmer")


class Pond(Base):
    __tablename__ = "ponds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("farmers.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    location: Mapped[str] = mapped_column(String(120), nullable=False)
    area_hectares: Mapped[float] = mapped_column(Float, nullable=False)
    species: Mapped[str] = mapped_column(String(80), nullable=False)
    stocked_on: Mapped[str] = mapped_column(String(10), nullable=False)
    stage: Mapped[str] = mapped_column(String(40), nullable=False)
    farmer: Mapped[Farmer] = relationship(back_populates="ponds")
    readings: Mapped[list["Reading"]] = relationship(
        back_populates="pond", cascade="all, delete-orphan"
    )
    incidents: Mapped[list["Incident"]] = relationship(
        back_populates="pond", cascade="all, delete-orphan"
    )


class Reading(Base):
    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pond_id: Mapped[int] = mapped_column(ForeignKey("ponds.id"), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    dissolved_oxygen: Mapped[float] = mapped_column(Float, nullable=False)
    temperature: Mapped[float] = mapped_column(Float, nullable=False)
    ph: Mapped[float] = mapped_column(Float, nullable=False)
    salinity: Mapped[float] = mapped_column(Float, nullable=False)
    ammonia: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="simulated", nullable=False)
    pond: Mapped[Pond] = relationship(back_populates="readings")


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pond_id: Mapped[int] = mapped_column(ForeignKey("ponds.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="open", nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="review", nullable=False)
    image_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reading_id: Mapped[int | None] = mapped_column(ForeignKey("readings.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    pond: Mapped[Pond] = relationship(back_populates="incidents")
    attached_reading: Mapped[Reading | None] = relationship(foreign_keys=[reading_id])
    reviews: Mapped[list["ExpertReview"]] = relationship(
        back_populates="incident", cascade="all, delete-orphan"
    )


class ExpertReview(Base):
    __tablename__ = "expert_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), nullable=False)
    reviewer_name: Mapped[str] = mapped_column(String(120), nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    case_status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    incident: Mapped[Incident] = relationship(back_populates="reviews")
