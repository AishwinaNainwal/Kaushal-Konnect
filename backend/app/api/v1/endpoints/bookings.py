from datetime import date, datetime, time
from decimal import Decimal
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models import Booking, BookingStatus, User, Payment, UserRole, Worker, Service, Review, Complaint
from app.schemas.booking import BookingCreate, BookingRead
from app.api.deps import get_current_user
from app.services.booking_availability import (
    ACTIVE_BOOKING_STATUSES,
    TIME_SLOTS,
    has_booking_conflict,
    parse_slot,
    slots_overlap,
)

router = APIRouter()

@router.post("/", response_model=BookingRead)
def create_booking(
    booking_in: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.customer:
        raise HTTPException(status_code=403, detail="Only customers can create bookings")

    if booking_in.booking_date is None or not booking_in.slot:
        raise HTTPException(status_code=400, detail="A booking date and time slot are required")
    if booking_in.booking_date.tzinfo is not None:
        raise HTTPException(status_code=400, detail="Booking date must use local date and time without a timezone offset")

    try:
        slot_start, slot_end = parse_slot(booking_in.slot)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    booking_date = booking_in.booking_date
    if booking_date.time().replace(second=0, microsecond=0) != slot_start:
        raise HTTPException(status_code=400, detail="Booking date start time must match the selected time slot")
    if booking_date < datetime.now().replace(second=0, microsecond=0):
        raise HTTPException(status_code=400, detail="Booking date and time must be in the future")

    try:
        worker = (
            db.query(Worker)
            .filter(Worker.id == booking_in.worker_id)
            .with_for_update()
            .first()
        )
        if not worker:
            raise HTTPException(status_code=404, detail="Worker not found")
        if not worker.is_verified:
            raise HTTPException(status_code=400, detail="Only verified workers can be booked")
        if not worker.available:
            raise HTTPException(status_code=409, detail="This worker is not currently accepting bookings")
        if worker.service_id != booking_in.service_id:
            raise HTTPException(status_code=400, detail="Selected service does not match this worker")
        service = db.query(Service).filter(Service.id == worker.service_id).first()
        if not service:
            raise HTTPException(status_code=400, detail="Worker service is not available")
        if has_booking_conflict(db, worker.id, booking_date.date(), booking_in.slot):
            raise HTTPException(status_code=409, detail="Sorry, this worker has just been booked for an overlapping time slot. Please select another time.")

        duration_hours = Decimal(str((datetime.combine(date.min, slot_end) - datetime.combine(date.min, slot_start)).total_seconds())) / Decimal("3600")
        subtotal = worker.hourly_rate * duration_hours
        amount = (subtotal * Decimal("1.08")).quantize(Decimal("0.01"))
        db_booking = Booking(
            customer_id=current_user.id,
            worker_id=worker.id,
            service_id=worker.service_id,
            status=BookingStatus.REQUESTED,
            amount=amount,
            slot=booking_in.slot,
            booking_date=booking_date,
        )
        db.add(db_booking)
        db.flush()
        db.add(Payment(
            booking_id=db_booking.id,
            amount=amount,
            payment_method=booking_in.payment_method,
            status="PENDING",
        ))
        db.commit()
        db.refresh(db_booking)
        return _booking_response(db, db_booking)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Booking failed; no changes were saved",
        ) from e


def _booking_response(db: Session, booking: Booking):
    worker = db.query(Worker).options(joinedload(Worker.user)).filter(Worker.id == booking.worker_id).first()
    customer = db.query(User).filter(User.id == booking.customer_id).first()
    service = db.query(Service).filter(Service.id == booking.service_id).first()
    payment = db.query(Payment).filter(Payment.booking_id == booking.id).first()
    review = db.query(Review).filter(Review.booking_id == booking.id).first()
    complaint = db.query(Complaint).filter(Complaint.booking_id == booking.id).first()
    return {
        "id": booking.id,
        "customer_id": booking.customer_id,
        "worker_id": booking.worker_id,
        "service_id": booking.service_id,
        "amount": booking.amount,
        "slot": booking.slot,
        "booking_date": booking.booking_date,
        "status": booking.status,
        "created_at": booking.created_at,
        "worker_name": worker.user.full_name if worker and worker.user else None,
        "customer_name": customer.full_name if customer else None,
        "service_name": service.name if service else booking.service_id,
        "payment_status": payment.status if payment else None,
        "review_rating": float(review.rating) if review else None,
        "review_comment": review.comment if review else None,
        "complaint_status": complaint.status if complaint else None,
    }


@router.get("/availability")
def get_worker_availability(
    worker_id: UUID,
    requested_date: date = Query(alias="date"),
    db: Session = Depends(get_db),
):
    worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    active_bookings = (
        db.query(Booking)
        .filter(
            Booking.worker_id == worker.id,
            func.date(Booking.booking_date) == requested_date,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
        )
        .all()
    )
    now = datetime.now().replace(second=0, microsecond=0)
    slots = []
    for slot in TIME_SLOTS:
        candidate = parse_slot(slot)
        slot_start = datetime.combine(requested_date, candidate[0])
        conflict = any(
            slots_overlap(candidate, parse_slot(booking.slot))
            if booking.slot else True
            for booking in active_bookings
        )
        slots.append({
            "slot": slot,
            "available": worker.available and worker.is_verified and slot_start > now and not conflict,
        })
    return {"worker_id": worker.id, "date": requested_date, "slots": slots}

@router.get("/", response_model=List[BookingRead])
def read_bookings(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Booking).options(
        joinedload(Booking.worker).joinedload(Worker.user),
        joinedload(Booking.customer),
    )
    if current_user.role == UserRole.customer:
        query = query.filter(Booking.customer_id == current_user.id)
    elif current_user.role == UserRole.worker:
        # Workers should see bookings where they are the worker
        # We need to join with the workers table to check worker_id
        # But Booking has worker_id directly.
        # However, current_user.id is a User ID, not a Worker ID.
        # We need to find the worker record associated with this user.
        worker = db.query(Worker).filter(Worker.user_id == current_user.id).first()
        if not worker:
            return []
        query = query.filter(Booking.worker_id == worker.id)
    else:
        # Admins or Managers might see all bookings
        pass

    bookings = query.order_by(Booking.booking_date.desc()).offset(skip).limit(limit).all()
    return [_booking_response(db, booking) for booking in bookings]

@router.get("/{booking_id}", response_model=BookingRead)
def read_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    worker = db.query(Worker).filter(Worker.id == db_booking.worker_id).first()
    if current_user.role not in (UserRole.admin, UserRole.coop_manager) and (
        current_user.id != db_booking.customer_id and (worker is None or current_user.id != worker.user_id)
    ):
        raise HTTPException(status_code=403, detail="Not authorized to view this booking")
    return _booking_response(db, db_booking)

@router.patch("/{booking_id}/status", response_model=BookingRead)
def update_booking_status(
    booking_id: str,
    status: BookingStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models import Worker
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    worker = db.query(Worker).filter(Worker.id == db_booking.worker_id).first()
    is_worker = worker is not None and current_user.id == worker.user_id
    is_customer = current_user.id == db_booking.customer_id
    if not is_worker and not is_customer:
        raise HTTPException(status_code=403, detail="Not authorized to update this booking")

    if is_worker:
        valid_worker_transition = (
            db_booking.status == BookingStatus.REQUESTED
            and status in (BookingStatus.ACCEPTED, BookingStatus.REJECTED)
        ) or (
            db_booking.status == BookingStatus.ACCEPTED
            and status == BookingStatus.CANCELLED
        )
        if not valid_worker_transition:
            raise HTTPException(status_code=409, detail="This booking cannot transition to the requested status")
    if is_customer and (status != BookingStatus.CANCELLED or db_booking.status not in (BookingStatus.REQUESTED, BookingStatus.ACCEPTED)):
        raise HTTPException(status_code=403, detail="Customers may cancel only their own active bookings")

    db_booking.status = status
    payment = db.query(Payment).filter(Payment.booking_id == db_booking.id).first()
    if payment and status in (BookingStatus.CANCELLED, BookingStatus.REJECTED):
        payment.status = "CANCELLED"
    db.commit()
    db.refresh(db_booking)
    return _booking_response(db, db_booking)

@router.patch("/{booking_id}/complete", response_model=BookingRead)
def complete_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models import Worker

    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Only the assigned worker or an admin can complete the booking
    worker = db.query(Worker).filter(Worker.id == db_booking.worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    # Verify if the current user is the worker associated with this booking
    if current_user.id != worker.user_id and current_user.role not in [UserRole.admin, UserRole.coop_manager]:
        raise HTTPException(status_code=403, detail="Not authorized to complete this booking")

    if db_booking.status != BookingStatus.ACCEPTED:
        raise HTTPException(status_code=409, detail="Only accepted bookings can be marked complete")

    try:
        # 1. Mark booking as completed
        db_booking.status = BookingStatus.COMPLETED

        # 2. Increment worker's completed jobs count
        worker.completed_jobs += 1
        payment = db.query(Payment).filter(Payment.booking_id == db_booking.id).first()
        if payment:
            payment.status = "RELEASED"

        db.commit()
        db.refresh(db_booking)
        return _booking_response(db, db_booking)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to complete booking: {str(e)}")

