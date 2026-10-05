from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from app.models import BookingStatus

class BookingBase(BaseModel):
    worker_id: UUID
    service_id: str
    amount: Optional[Decimal] = None
    slot: Optional[str] = None
    booking_date: Optional[datetime] = None

class BookingCreate(BookingBase):
    payment_method: Optional[str] = None

class BookingRead(BookingBase):
    id: UUID
    customer_id: UUID
    status: BookingStatus
    created_at: datetime
    worker_name: Optional[str] = None
    customer_name: Optional[str] = None
    service_name: Optional[str] = None
    payment_status: Optional[str] = None
    review_rating: Optional[float] = None
    review_comment: Optional[str] = None
    complaint_status: Optional[str] = None

    class Config:
        from_attributes = True
