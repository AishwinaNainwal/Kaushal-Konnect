from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    booking_id: UUID
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


class ComplaintCreate(BaseModel):
    booking_id: UUID
    description: str = Field(min_length=1, max_length=5000)


class ComplaintStatusUpdate(BaseModel):
    status: str


class ReviewRead(BaseModel):
    id: UUID
    booking_id: UUID
    rating: float
    comment: str | None
    created_at: datetime
    customer_name: str | None = None
    worker_name: str | None = None
    service_name: str | None = None


class ComplaintRead(BaseModel):
    id: UUID
    booking_id: UUID
    description: str
    status: str
    created_at: datetime
    customer_name: str | None = None
    worker_name: str | None = None
    service_name: str | None = None