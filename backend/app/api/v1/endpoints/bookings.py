from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid
from app.db.session import get_db
from app.models import Booking, BookingStatus, User, Payment, UserRole
from app.schemas.booking import BookingCreate, BookingRead
from app.api.deps import get_current_user

router = APIRouter()

@router.post("/", response_model=BookingRead)
def create_booking(
    booking_in: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.customer:
        raise HTTPException(status_code=403, detail="Only customers can create bookings")

    try:
        # 1. Create the Booking record first
        booking_data = booking_in.model_dump()
        payment_method = booking_data.pop("payment_method", "card")

        db_booking = Booking(
            **booking_data,
            customer_id=current_user.id,
            status=BookingStatus.ACCEPTED
        )
        db.add(db_booking)
        db.flush() # Flush to get the booking id without committing

        # 2. Create the Payment record
        payment = Payment(
            booking_id=db_booking.id,
            amount=booking_in.amount or 0,
            payment_method=booking_in.payment_method or "card",
            status="SUCCESS"
        )
        db.add(payment)

        db.commit()
        db.refresh(db_booking)
        return db_booking
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Booking failed: {str(e)}"
        )

@router.get("/", response_model=List[BookingRead])
def read_bookings(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Booking)
    if current_user.role == UserRole.customer:
        query = query.filter(Booking.customer_id == current_user.id)
    elif current_user.role == UserRole.worker:
        # Workers should see bookings where they are the worker
        # We need to join with the workers table to check worker_id
        # But Booking has worker_id directly.
        # However, current_user.id is a User ID, not a Worker ID.
        # We need to find the worker record associated with this user.
        from app.models import Worker
        worker = db.query(Worker).filter(Worker.user_id == current_user.id).first()
        if not worker:
            return []
        query = query.filter(Booking.worker_id == worker.id)
    else:
        # Admins or Managers might see all bookings
        pass

    return query.offset(skip).limit(limit).all()

@router.get("/{booking_id}", response_model=BookingRead)
def read_booking(booking_id: str, db: Session = Depends(get_db)):
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return db_booking

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
    if not worker or current_user.id != worker.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this booking")

    db_booking.status = status
    db.commit()
    db.refresh(db_booking)
    return db_booking

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

    if db_booking.status == BookingStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Booking is already completed")

    try:
        # 1. Mark booking as completed
        db_booking.status = BookingStatus.COMPLETED

        # 2. Increment worker's completed jobs count
        worker.completed_jobs += 1

        db.commit()
        db.refresh(db_booking)
        return db_booking
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to complete booking: {str(e)}")

