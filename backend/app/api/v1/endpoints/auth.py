from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core import security
from app.models import User, UserRole, Worker, Service, Cooperative
from app.schemas.user import UserCreate, UserRead

router = APIRouter()


@router.post("/signup", response_model=UserRead)
def signup(user_in: UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )

    # Worker-specific validation
    if user_in.role == UserRole.worker:
        if not user_in.service_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Service is required for worker signup."
            )

        if user_in.hourly_rate is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Hourly rate is required for worker signup."
            )

        service = db.query(Service).filter(
            Service.id == user_in.service_id
        ).first()

        if not service:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid service ID."
            )

        cooperative = db.query(Cooperative).first()

        if not cooperative:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No cooperative is available for worker registration."
            )

    # Hash password and create user
    hashed_password = security.get_password_hash(user_in.password)

    db_user = User(
        email=user_in.email,
        password_hash=hashed_password,
        full_name=user_in.full_name,
        phone=user_in.phone,
        role=user_in.role,
        zone=user_in.zone,
        city=user_in.city,
        locality=user_in.locality,
    )

    db.add(db_user)
    db.flush()

    # Create worker profile automatically
    if user_in.role == UserRole.worker:
        db_worker = Worker(
            user_id=db_user.id,
            coop_id=cooperative.id,
            service_id=user_in.service_id,
            worker_zone=user_in.zone,
            available=True,
            hourly_rate=user_in.hourly_rate,
        )

        db.add(db_worker)

    db.commit()
    db.refresh(db_user)

    return db_user


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.email == form_data.username
    ).first()

    if not user or not security.verify_password(
        form_data.password,
        user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = security.create_access_token(subject=user.id)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "phone": user.phone,
            "zone": user.zone,
            "city": user.city,
            "locality": user.locality,
        }
    }