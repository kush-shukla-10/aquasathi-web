from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PondCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    location: str = Field(min_length=2, max_length=120)
    area_hectares: float = Field(gt=0, le=500)
    species: str = Field(min_length=2, max_length=80)
    stocked_on: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    stage: str = Field(min_length=2, max_length=40)

    @field_validator("stocked_on")
    @classmethod
    def validate_stocked_on(cls, value: str) -> str:
        date.fromisoformat(value)
        return value


class PondOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    location: str
    area_hectares: float
    species: str
    stocked_on: str
    stage: str


class ReadingCreate(BaseModel):
    dissolved_oxygen: float = Field(ge=0, le=20)
    temperature: float = Field(ge=0, le=50)
    ph: float = Field(ge=0, le=14)
    salinity: float = Field(ge=0, le=60)
    ammonia: float = Field(ge=0, le=10)
    source: str = Field(default="actual", pattern="^(actual|simulated)$")


class ReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pond_id: int
    recorded_at: datetime
    dissolved_oxygen: float
    temperature: float
    ph: float
    salinity: float
    ammonia: float
    source: str


class IncidentCreate(BaseModel):
    pond_id: int = Field(gt=0)
    description: str = Field(min_length=8, max_length=2000)
    image_data: str | None = Field(default=None, max_length=7_000_000)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 8:
            raise ValueError("Description must contain at least 8 non-space characters.")
        return value


class ExpertReviewCreate(BaseModel):
    reviewer_name: str = Field(min_length=2, max_length=120)
    recommendation: str = Field(min_length=5, max_length=2000)
    case_status: str = Field(pattern="^(open|monitoring|resolved)$")

    @field_validator("reviewer_name", "recommendation")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class AssistantQuestion(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    language: str = Field(default="en", pattern="^(en|te|hi)$")
