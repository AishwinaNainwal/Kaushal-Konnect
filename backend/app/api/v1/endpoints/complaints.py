from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import check_role, get_current_user
from app.db.session import get_db
from app.models import Booking, Complaint, User, UserRole
from app.schemas.engagement import ComplaintCreate, ComplaintRead, ComplaintStatusUpdate

router = APIRouter()
MANAGER_ROLES = [UserRole.admin, UserRole.coop_manager]


def _complaint_response(complaint: Complaint):
    booking = complaint.booking
    return {
        "id": complaint.id,
        "booking_id": complaint.booking_id,
        "description": complaint.description,
        "status": complaint.status,
        "created_at": complaint.created_at,
        "customer_name": booking.customer.full_name if booking and booking.customer else None,
        "worker_name": booking.worker.user.full_name if booking and booking.worker and booking.worker.user else None,
        "service_name": booking.service.name if booking and booking.service else booking.service_id if booking else None,
    }


@router.post("/", response_model=ComplaintRead)
def create_complaint(
    complaint_in: ComplaintCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.customer:
        raise HTTPException(status_code=403, detail="Only customers can submit complaints")
    booking = db.query(Booking).filter(Booking.id == complaint_in.booking_id).first()
    if not booking or booking.customer_id != current_user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    if db.query(Complaint).filter(Complaint.booking_id == booking.id).first():
        raise HTTPException(status_code=409, detail="This booking already has a complaint")

    complaint = Complaint(booking_id=booking.id, description=complaint_in.description, status="OPEN")
    db.add(complaint)
    db.commit()
    db.refresh(complaint)
    return _complaint_response(complaint)


@router.get("/", response_model=list[ComplaintRead])
def list_complaints(
    db: Session = Depends(get_db),
    current_user: User = Depends(check_role(MANAGER_ROLES)),
):
    complaints = db.query(Complaint).order_by(Complaint.created_at.desc()).all()
    return [_complaint_response(complaint) for complaint in complaints]


@router.patch("/{complaint_id}/status", response_model=ComplaintRead)
def update_complaint_status(
    complaint_id: str,
    update: ComplaintStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_role(MANAGER_ROLES)),
):
    status = update.status.upper()
    if status not in {"OPEN", "INVESTIGATING", "RESOLVED"}:
        raise HTTPException(status_code=400, detail="Status must be OPEN, INVESTIGATING, or RESOLVED")
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    complaint.status = status
    db.commit()
    db.refresh(complaint)
    return _complaint_response(complaint)