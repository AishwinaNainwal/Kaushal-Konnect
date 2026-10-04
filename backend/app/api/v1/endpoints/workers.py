from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.db.session import get_db
from app.models import (
Worker,
User,
UserRole,
VerificationDocument,
WorkerSkill,
Service,
)
from app.schemas.worker import (
WorkerCreate,
WorkerRead,
WorkerProfileRead,
WorkerProfileUpdate,
AvailabilityUpdate,
SkillsUpdate,
VerificationDocumentRead,
)
from app.api.deps import get_current_user, check_role

router = APIRouter()

def build_worker_response(worker: Worker, user: User):
    """Build a response containing worker + user + skills data."""

    skills = [
        skill.skill_name
        for skill in worker.skills
    ]

    return {
        "id": worker.id,
        "user_id": worker.user_id,
        "coop_id": worker.coop_id,
        "service_id": worker.service_id,
        "worker_zone": worker.worker_zone,
        "is_verified": worker.is_verified,
        "available": worker.available,
        "working_days": getattr(worker, "working_days", []),
        "slots": getattr(worker, "slots", []),
        "hourly_rate": worker.hourly_rate,
        "rating": worker.rating,
        "completed_jobs": worker.completed_jobs,
        "response_minutes": worker.response_minutes,
        "full_name": user.full_name,
        "city": user.city,
        "locality": user.locality,
        "skills": skills,
        "created_at": worker.created_at,
        "email": user.email,
        "phone": user.phone,
        "role": user.role.value if hasattr(user.role, "value") else user.role,
    }


# ---------------------------------------------------------

# CURRENT WORKER PROFILE

# ---------------------------------------------------------

@router.get("/me", response_model=WorkerProfileRead)
def read_worker_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.worker:
        raise HTTPException(
            status_code=403,
            detail="Only workers can access this endpoint",
        )

    worker = (
        db.query(Worker)
        .filter(Worker.user_id == current_user.id)
        .first()
    )

    if not worker:
        raise HTTPException(
            status_code=404,
            detail="Worker profile not found",
        )

    return build_worker_response(worker, current_user)
# ---------------------------------------------------------

# UPDATE CURRENT WORKER PROFILE

# ---------------------------------------------------------

@router.patch("/me", response_model=WorkerProfileRead)
def update_worker_me(
    update_data: WorkerProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.worker:
        raise HTTPException(
            status_code=403,
            detail="Only workers can access this endpoint",
        )

    worker = (
        db.query(Worker)
        .filter(Worker.user_id == current_user.id)
        .first()
    )

    if not worker:
        raise HTTPException(
            status_code=404,
            detail="Worker profile not found",
        )

    # Update User fields
    if update_data.full_name is not None:
        current_user.full_name = update_data.full_name

    if update_data.phone is not None:
        current_user.phone = update_data.phone

    if update_data.city is not None:
        current_user.city = update_data.city

    if update_data.locality is not None:
        current_user.locality = update_data.locality

    # Update Worker fields
    if update_data.worker_zone is not None:
        worker.worker_zone = update_data.worker_zone

    if update_data.hourly_rate is not None:
        worker.hourly_rate = update_data.hourly_rate

    # Update service/category
    if update_data.service_id is not None:
        service = (
            db.query(Service)
            .filter(Service.id == update_data.service_id)
            .first()
        )

        if not service:
            raise HTTPException(
                status_code=400,
                detail="Invalid service ID",
            )

        worker.service_id = service.id

    db.commit()
    db.refresh(worker)

    return build_worker_response(worker, current_user)

# ---------------------------------------------------------

# UPDATE WORKER AVAILABILITY

# ---------------------------------------------------------

@router.patch("/me/availability", response_model=WorkerProfileRead)
def update_worker_availability(
    update_data: AvailabilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.worker:
        raise HTTPException(
            status_code=403,
            detail="Only workers can access this endpoint",
        )

    worker = (
        db.query(Worker)
        .filter(Worker.user_id == current_user.id)
        .first()
    )

    if not worker:
        raise HTTPException(
            status_code=404,
            detail="Worker profile not found",
        )

    worker.available = update_data.available

    if (
        hasattr(worker, "working_days")
        and update_data.working_days is not None
    ):
        worker.working_days = update_data.working_days

    if hasattr(worker, "slots") and update_data.slots is not None:
        worker.slots = update_data.slots

    db.commit()
    db.refresh(worker)

    return build_worker_response(worker, current_user)


# ---------------------------------------------------------

# UPDATE WORKER SKILLS

# ---------------------------------------------------------

@router.put("/me/skills", response_model=WorkerProfileRead)
def update_worker_skills(
    update_data: SkillsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.worker:
        raise HTTPException(
            status_code=403,
            detail="Only workers can access this endpoint",
        )

    worker = (
        db.query(Worker)
        .filter(Worker.user_id == current_user.id)
        .first()
    )

    if not worker:
        raise HTTPException(
            status_code=404,
            detail="Worker profile not found",
        )

    cleaned_skills = []

    for skill in update_data.skills:
        skill = skill.strip()

        if skill and skill.lower() not in [
            existing.lower()
            for existing in cleaned_skills
        ]:
            cleaned_skills.append(skill)

    # Remove existing skills
    db.query(WorkerSkill).filter(
        WorkerSkill.worker_id == worker.id
    ).delete()

    # Add new skills
    for skill in cleaned_skills:
        db.add(
            WorkerSkill(
                worker_id=worker.id,
                skill_name=skill,
            )
        )

    db.commit()
    db.refresh(worker)

    return build_worker_response(worker, current_user)


# ---------------------------------------------------------

# CREATE WORKER PROFILE

# ---------------------------------------------------------

@router.post("/", response_model=WorkerRead)
def create_worker(
    worker: WorkerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.worker:
        raise HTTPException(
            status_code=403,
            detail="Only workers can create a worker profile",
        )

    if worker.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only create your own worker profile",
        )

    existing_worker = (
        db.query(Worker)
        .filter(Worker.user_id == current_user.id)
        .first()
    )

    if existing_worker:
        raise HTTPException(
            status_code=400,
            detail="Worker profile already exists",
        )

    service = (
        db.query(Service)
        .filter(Service.id == worker.service_id)
        .first()
    )

    if not service:
        raise HTTPException(
            status_code=400,
            detail="Invalid service ID",
        )

    db_worker = Worker(**worker.model_dump())

    db.add(db_worker)
    db.commit()
    db.refresh(db_worker)

    user = (
        db.query(User)
        .filter(User.id == db_worker.user_id)
        .first()
    )

    return build_worker_response(db_worker, user)


# ---------------------------------------------------------

# PUBLIC WORKER LIST

# ---------------------------------------------------------

@router.get("/", response_model=List[WorkerRead])
def read_workers(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    results = (
        db.query(Worker, User)
        .join(User, Worker.user_id == User.id)
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [
        build_worker_response(worker, user)
        for worker, user in results
    ]


# ---------------------------------------------------------

# PUBLIC WORKER DETAIL

# ---------------------------------------------------------

@router.get("/{worker_id}", response_model=WorkerRead)
def read_worker(
    worker_id: str,
    db: Session = Depends(get_db),
):
    result = (
        db.query(Worker, User)
        .join(User, Worker.user_id == User.id)
        .filter(Worker.id == worker_id)
        .first()
    )

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Worker not found",
        )

    worker, user = result

    return build_worker_response(worker, user)

# ---------------------------------------------------------

# VERIFY WORKER

# ---------------------------------------------------------

@router.patch("/{worker_id}/verify", response_model=WorkerRead)
def verify_worker(
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        check_role([UserRole.admin, UserRole.coop_manager])
    ),
):
    result = (
        db.query(Worker, User)
        .join(User, Worker.user_id == User.id)
        .filter(Worker.id == worker_id)
        .first()
    )

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Worker not found",
        )

    worker, user = result

    worker.is_verified = True

    db.commit()
    db.refresh(worker)

    return build_worker_response(worker, user)

# ---------------------------------------------------------

# WORKER DOCUMENTS

# ---------------------------------------------------------

@router.get(
    "/me/documents",
    response_model=List[VerificationDocumentRead],
)
def read_worker_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.worker:
        raise HTTPException(
            status_code=403,
            detail="Only workers can access this endpoint",
        )

    worker = (
        db.query(Worker)
        .filter(Worker.user_id == current_user.id)
        .first()
    )

    if not worker:
        raise HTTPException(
            status_code=404,
            detail="Worker profile not found",
        )

    return (
        db.query(VerificationDocument)
        .filter(VerificationDocument.worker_id == worker.id)
        .all()
    )

@router.post(
    "/me/documents",
    response_model=VerificationDocumentRead,
)
def upload_worker_document(
    document_type: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.worker:
        raise HTTPException(
            status_code=403,
            detail="Only workers can access this endpoint",
        )

    worker = (
        db.query(Worker)
        .filter(Worker.user_id == current_user.id)
        .first()
    )

    if not worker:
        raise HTTPException(
            status_code=404,
            detail="Worker profile not found",
        )

    file_path = f"uploads/workers/{worker.id}/{file.filename}"

    doc = VerificationDocument(
        worker_id=worker.id,
        document_type=document_type,
        file_path=file_path,
        status="Pending",
    )

    db.add(doc)
    db.commit()
    db.refresh(doc)

    return doc


@router.patch(
    "/me/documents/{doc_id}",
    response_model=VerificationDocumentRead,
)
def update_document_status(
    doc_id: UUID,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        check_role([UserRole.admin, UserRole.coop_manager])
    ),
):
    doc = (
        db.query(VerificationDocument)
        .filter(VerificationDocument.id == doc_id)
        .first()
    )

    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    doc.status = status

    db.commit()
    db.refresh(doc)

    return doc

