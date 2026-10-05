from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import check_role, get_current_user
from app.db.session import get_db
from app.models import Booking, BookingStatus, Review, User, UserRole, Worker
from app.schemas.engagement import ReviewCreate, ReviewRead

router = APIRouter()


def _review_response(review: Review):
    booking = review.booking
    return {
        "id": review.id,
        "booking_id": review.booking_id,
        "rating": float(review.rating),
        "comment": review.comment,
        "created_at": review.created_at,
        "customer_name": booking.customer.full_name if booking and booking.customer else None,
        "worker_name": booking.worker.user.full_name if booking and booking.worker and booking.worker.user else None,
        "service_name": booking.service.name if booking and booking.service else booking.service_id if booking else None,
    }


@router.post("/", response_model=ReviewRead)
def create_review(
    review_in: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.customer:
        raise HTTPException(status_code=403, detail="Only customers can submit reviews")
    booking = db.query(Booking).filter(Booking.id == review_in.booking_id).first()
    if not booking or booking.customer_id != current_user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != BookingStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="A review can be submitted after the booking is completed")
    if db.query(Review).filter(Review.booking_id == booking.id).first():
        raise HTTPException(status_code=409, detail="This booking already has a review")

    review = Review(booking_id=booking.id, rating=review_in.rating, comment=review_in.comment)
    db.add(review)
    db.flush()
    worker = db.query(Worker).filter(Worker.id == booking.worker_id).first()
    if worker:
        worker.rating = db.query(func.avg(Review.rating)).join(Booking).filter(Booking.worker_id == worker.id).scalar() or 0
    db.commit()
    db.refresh(review)
    return _review_response(review)


@router.get("/", response_model=list[ReviewRead])
def list_reviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(check_role([UserRole.admin, UserRole.coop_manager])),
):
    reviews = db.query(Review).join(Booking).order_by(Review.created_at.desc()).all()
    return [_review_response(review) for review in reviews]


@router.get("/me", response_model=list[ReviewRead])
def list_my_reviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.worker:
        worker = db.query(Worker).filter(Worker.user_id == current_user.id).first()
        if not worker:
            return []
        reviews = db.query(Review).join(Booking).filter(Booking.worker_id == worker.id).all()
    elif current_user.role == UserRole.customer:
        reviews = db.query(Review).join(Booking).filter(Booking.customer_id == current_user.id).all()
    else:
        raise HTTPException(status_code=403, detail="This endpoint is only available to customers and workers")
    return [_review_response(review) for review in reviews]