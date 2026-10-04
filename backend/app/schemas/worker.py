from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from decimal import Decimal


class WorkerBase(BaseModel):
    worker_zone: Optional[str] = None
    is_verified: bool = False
    available: bool = True
    working_days: Optional[List[str]] = None
    slots: Optional[List[str]] = None
    hourly_rate: Decimal = Field(gt=0)
    rating: float = Field(default=0.0, ge=0, le=5)
    completed_jobs: int = Field(default=0, ge=0)
    response_minutes: int = Field(default=0, ge=0)


class WorkerCreate(WorkerBase):
    user_id: UUID
    coop_id: UUID
    service_id: str


class WorkerRead(WorkerBase):
    id: UUID
    user_id: UUID
    coop_id: UUID
    service_id: str
    full_name: str
    city: Optional[str] = None
    locality: Optional[str] = None
    skills: List[str] = []
    created_at: datetime

    class Config:
        from_attributes = True


class WorkerProfileRead(WorkerRead):
    email: str
    phone: Optional[str] = None
    role: str


class WorkerProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    locality: Optional[str] = None
    worker_zone: Optional[str] = None
    service_id: Optional[str] = None
    hourly_rate: Optional[Decimal] = Field(default=None, gt=0)


class AvailabilityUpdate(BaseModel):
    available: bool
    working_days: Optional[List[str]] = None
    slots: Optional[List[str]] = None


class SkillsUpdate(BaseModel):
    skills: List[str]


class VerificationDocumentBase(BaseModel):
    document_type: str
    file_path: Optional[str] = None
    status: Optional[str] = "Pending"


class VerificationDocumentCreate(VerificationDocumentBase):
    pass


class VerificationDocumentRead(VerificationDocumentBase):
    id: UUID
    worker_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True