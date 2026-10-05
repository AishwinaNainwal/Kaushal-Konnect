from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Service

router = APIRouter()


@router.get("/")
def list_services(db: Session = Depends(get_db)):
    services = db.query(Service).order_by(Service.name).all()
    return [
        {
            "id": service.id,
            "name": service.name,
            "description": service.description,
            "base_price": service.base_price,
        }
        for service in services
    ]