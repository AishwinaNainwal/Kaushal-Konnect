from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Booking, Payment, User, UserRole, Worker

router = APIRouter()


@router.get("/")
def list_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Payment).join(Booking)
    if current_user.role == UserRole.customer:
        query = query.filter(Booking.customer_id == current_user.id)
    elif current_user.role == UserRole.worker:
        worker = db.query(Worker).filter(Worker.user_id == current_user.id).first()
        if not worker:
            return []
        query = query.filter(Booking.worker_id == worker.id)
    elif current_user.role not in (UserRole.admin, UserRole.coop_manager):
        return []

    return [
        {
            "id": payment.id,
            "booking_id": payment.booking_id,
            "amount": payment.amount,
            "status": payment.status,
            "payment_method": payment.payment_method,
            "payment_date": payment.payment_date,
        }
        for payment in query.order_by(Payment.payment_date.desc()).all()
    ]