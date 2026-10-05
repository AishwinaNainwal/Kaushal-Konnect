"""Insert realistic local demo records without updating or deleting existing rows."""

import os
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import func

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models import (
    Booking,
    BookingStatus,
    Complaint,
    Cooperative,
    Payment,
    Review,
    Service,
    User,
    UserRole,
    VerificationDocument,
    Worker,
    WorkerSkill,
)


SERVICE_DEFINITIONS = (
    ("home-cleaning", "Home Cleaning"),
    ("plumbing", "Plumbing"),
    ("electrical", "Electrical"),
    ("painting", "Painting"),
    ("carpentry", "Carpentry"),
    ("appliance-repair", "Appliance Repair"),
)

WORKER_DEFINITIONS = (
    ("worker.plumbing", "Aarav Sharma", "plumbing", "New Delhi", "Karol Bagh", True, True, "650", ("Leak repair", "Water heaters")),
    ("worker.cleaning", "Meera Nair", "home-cleaning", "Noida", "Sector 62", True, True, "550", ("Deep cleaning", "Move-out cleaning")),
    ("worker.electrical", "Kabir Verma", "electrical", "Delhi", "Lajpat Nagar", True, True, "700", ("Wiring", "Fixture installation")),
    ("worker.painting", "Sana Khan", "painting", "Gurugram", "Sector 45", False, True, "600", ("Interior painting",)),
    ("worker.carpentry", "Rohan Das", "carpentry", "Noida", "Sector 18", True, False, "750", ("Furniture repair", "Cabinet fitting")),
    ("worker.appliance", "Ishita Sen", "appliance-repair", "Ghaziabad", "Indirapuram", False, True, "800", ("Air conditioning", "Refrigerator repair")),
)

CUSTOMER_DEFINITIONS = (
    ("customer.one", "Ananya Rao", "New Delhi", "Karol Bagh"),
    ("customer.two", "Vikram Patel", "Noida", "Sector 62"),
    ("customer.three", "Priya Iyer", "Delhi", "Lajpat Nagar"),
)

SEED_COMPLETED_DAY = date(2026, 9, 26)
SEED_REQUESTED_DAY = date(2026, 10, 6)
SEED_ACCEPTED_DAY = date(2026, 10, 7)
SEED_CANCELLED_DAY = date(2026, 10, 8)


def ensure_user(db, email, full_name, role, city, locality, password_hash):
    user = db.query(User).filter(User.email == email).first()
    if user:
        if user.role != role:
            raise ValueError(f"Existing demo email has a different role: {email}")
        return user
    user = User(
        email=email,
        password_hash=password_hash,
        full_name=full_name,
        role=role,
        city=city,
        locality=locality,
        zone=city,
    )
    db.add(user)
    db.flush()
    return user


def ensure_service(db, service_id, name):
    service = db.get(Service, service_id)
    if service:
        return service
    same_name = db.query(Service).filter(Service.name == name).first()
    if same_name:
        raise ValueError(f"Service name already exists with a different ID: {name}")
    service = Service(
        id=service_id,
        name=name,
        description=f"Professional {name} services",
        base_price=Decimal("500.00"),
    )
    db.add(service)
    db.flush()
    return service


def ensure_booking(db, customer, worker, booking_day, slot, status, payment_status):
    booking_time = datetime.combine(booking_day, time.fromisoformat(slot.split(" ")[0]))
    booking = (
        db.query(Booking)
        .filter(
            Booking.customer_id == customer.id,
            Booking.worker_id == worker.id,
            Booking.booking_date == booking_time,
            Booking.slot == slot,
        )
        .first()
    )
    if booking:
        return booking

    booking = Booking(
        customer_id=customer.id,
        worker_id=worker.id,
        service_id=worker.service_id,
        status=status,
        amount=Decimal(worker.hourly_rate) * 2 * Decimal("1.08"),
        slot=slot,
        booking_date=booking_time,
    )
    db.add(booking)
    db.flush()
    db.add(Payment(
        booking_id=booking.id,
        amount=booking.amount,
        payment_method="local demo",
        status=payment_status,
    ))
    return booking


def main():
    demo_password = os.environ.get("LOCAL_SEED_PASSWORD")
    if not demo_password or len(demo_password) < 12:
        raise SystemExit("Set LOCAL_SEED_PASSWORD to a local-only password of at least 12 characters")
    password_hash = get_password_hash(demo_password)
    with SessionLocal.begin() as db:
        for service_id, name in SERVICE_DEFINITIONS:
            ensure_service(db, service_id, name)

        cooperative = db.query(Cooperative).filter(
            Cooperative.name == "Kaushal Main Cooperative"
        ).first()
        if not cooperative:
            cooperative = Cooperative(
                name="Kaushal Main Cooperative",
                location="Delhi NCR",
                contact_email="contact@kaushalkonnect.com",
                manager_id=None,
            )
            db.add(cooperative)
            db.flush()

        customers = {}
        for suffix, name, city, locality in CUSTOMER_DEFINITIONS:
            customers[suffix] = ensure_user(
                db,
                f"demo.{suffix}@example.test",
                name,
                UserRole.customer,
                city,
                locality,
                password_hash,
            )

        workers = {}
        for suffix, name, service_id, city, locality, verified, available, rate, skills in WORKER_DEFINITIONS:
            user = ensure_user(
                db,
                f"demo.{suffix}@example.test",
                name,
                UserRole.worker,
                city,
                locality,
                password_hash,
            )
            worker = db.query(Worker).filter(Worker.user_id == user.id).first()
            if not worker:
                worker = Worker(
                    user_id=user.id,
                    coop_id=cooperative.id,
                    service_id=service_id,
                    worker_zone=city,
                    city=city,
                    locality=locality,
                    is_verified=verified,
                    available=available,
                    hourly_rate=Decimal(rate),
                    rating=Decimal("0.00"),
                    completed_jobs=0,
                    response_minutes=30,
                )
                db.add(worker)
                db.flush()
            elif worker.service_id != service_id:
                raise ValueError(f"Existing demo worker has a different service: {user.email}")
            workers[suffix] = worker

            for skill_name in skills:
                if not db.get(WorkerSkill, (worker.id, skill_name)):
                    db.add(WorkerSkill(worker_id=worker.id, skill_name=skill_name))

            document_status = "Verified" if worker.is_verified else "Pending"
            if not db.query(VerificationDocument).filter(
                VerificationDocument.worker_id == worker.id,
                VerificationDocument.document_type == "Identity and address proof",
            ).first():
                db.add(VerificationDocument(
                    worker_id=worker.id,
                    document_type="Identity and address proof",
                    file_path=None,
                    status=document_status,
                ))

        completed = ensure_booking(
            db, customers["customer.one"], workers["worker.plumbing"],
            SEED_COMPLETED_DAY, "10:00 – 12:00", BookingStatus.COMPLETED, "RELEASED",
        )
        ensure_booking(
            db, customers["customer.two"], workers["worker.cleaning"],
            SEED_REQUESTED_DAY, "10:00 – 12:00", BookingStatus.REQUESTED, "PENDING",
        )
        ensure_booking(
            db, customers["customer.three"], workers["worker.electrical"],
            SEED_ACCEPTED_DAY, "12:00 – 14:00", BookingStatus.ACCEPTED, "PENDING",
        )
        ensure_booking(
            db, customers["customer.one"], workers["worker.carpentry"],
            SEED_CANCELLED_DAY, "15:00 – 17:00", BookingStatus.CANCELLED, "CANCELLED",
        )

        if not db.query(Review).filter(Review.booking_id == completed.id).first():
            db.add(Review(booking_id=completed.id, rating=5, comment="Careful work and clear communication."))
        if not db.query(Complaint).filter(Complaint.booking_id == completed.id).first():
            db.add(Complaint(
                booking_id=completed.id,
                description="Demo record: customer requested a follow-up inspection.",
                status="INVESTIGATING",
            ))

    with SessionLocal() as db:
        counts = {
            "Services": db.query(func.count(Service.id)).scalar(),
            "Customers": db.query(func.count(User.id)).filter(User.role == UserRole.customer).scalar(),
            "Workers": db.query(func.count(Worker.id)).scalar(),
            "Co-op Managers": db.query(func.count(User.id)).filter(User.role == UserRole.coop_manager).scalar(),
            "Cooperatives": db.query(func.count(Cooperative.id)).scalar(),
            "Bookings": db.query(func.count(Booking.id)).scalar(),
            "Reviews": db.query(func.count(Review.id)).scalar(),
            "Complaints": db.query(func.count(Complaint.id)).scalar(),
        }
    print("Local demo seed committed (insert-only).")
    for label, count in counts.items():
        print(f"{label}: {count}")
    print("No manager account is created by this seed; create/sign in through the app's signup flow.")
    print("New demo customer/worker accounts use LOCAL_SEED_PASSWORD.")


if __name__ == "__main__":
    main()