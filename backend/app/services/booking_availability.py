import re
from datetime import date, datetime, time

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus


TIME_SLOTS = (
    "08:00 – 10:00",
    "10:00 – 12:00",
    "12:00 – 14:00",
    "14:00 – 16:00",
    "16:00 – 18:00",
    "18:00 – 20:00",
)

ACTIVE_BOOKING_STATUSES = (BookingStatus.REQUESTED, BookingStatus.ACCEPTED)
_SLOT_PATTERN = re.compile(r"^\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*$")


def parse_slot(slot: str) -> tuple[time, time]:
    match = _SLOT_PATTERN.match(slot)
    if not match:
        raise ValueError("Slot must contain start and end times, for example 10:00 – 12:00")

    start = datetime.strptime(match.group(1), "%H:%M").time()
    end = datetime.strptime(match.group(2), "%H:%M").time()
    if end <= start:
        raise ValueError("Slot end time must be after its start time")
    return start, end


def slots_overlap(first: tuple[time, time], second: tuple[time, time]) -> bool:
    return first[0] < second[1] and second[0] < first[1]


def has_booking_conflict(
    db: Session,
    worker_id,
    booking_day: date,
    requested_slot: str,
) -> bool:
    requested_interval = parse_slot(requested_slot)
    existing_bookings = (
        db.query(Booking)
        .filter(
            Booking.worker_id == worker_id,
            func.date(Booking.booking_date) == booking_day,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
        )
        .all()
    )

    for booking in existing_bookings:
        try:
            existing_interval = parse_slot(booking.slot or "")
        except ValueError:
            return True
        if slots_overlap(requested_interval, existing_interval):
            return True
    return False