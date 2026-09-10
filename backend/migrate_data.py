import csv
import uuid
from datetime import datetime

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.models import (
    User,
    Worker,
    Service,
    Cooperative,
    UserRole,
    Booking,
    BookingStatus,
    Review,
    Complaint,
    Payment,
    WorkerSkill,
)
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

import os

# Get the directory where the script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

WORKER_CSV = os.path.join(SCRIPT_DIR, "data", "worker_data_final_india.csv")
BOOKING_CSV = os.path.join(SCRIPT_DIR, "data", "bookings_final_india.csv")

# Number of workers to migrate
MAX_WORKERS = 500


def migrate():
    # 0. CLEAR ALL DATA (Dev Mode)
    # We use a direct connection to ensure tables are emptied before starting the ORM session.
    try:
        print("Clearing existing data...")
        with engine.begin() as conn:
            conn.execute(text(
                "TRUNCATE TABLE reviews, complaints, payments, bookings, "
                "worker_skills, verification_documents, workers, services CASCADE"
            ))
            conn.execute(text(
                "DELETE FROM users WHERE role IN ('worker', 'customer')"
            ))
        print("Database cleared successfully.")
    except Exception as e:
        print(f"Warning: Clearing data failed: {e}")

    session = SessionLocal()

    try:
        print("Starting migration...")

        # 1. Migrate Services (Canonical)
        CATEGORY_MAPPING = {
            "Home Cleaning": "home-cleaning",
            "Plumbing": "plumbing",
            "Electrical": "electrical",
            "Painting": "painting",
            "Carpentry": "carpentry",
            "Appliance Repair": "appliance-repair",
        }

        for name, service_id in CATEGORY_MAPPING.items():
            print(f"Creating service: {name} (ID: {service_id})")
            session.add(
                Service(
                    id=service_id,
                    name=name,
                    description=f"Professional {name} services",
                    base_price=500.0,
                )
            )

        session.commit()

        # 2. Create / Get Default Cooperative
        coop = session.query(Cooperative).first()

        if not coop:
            print("Creating default cooperative...")
            coop = Cooperative(
                id=uuid.uuid4(),
                name="Kaushal Main Cooperative",
                location="Delhi NCR",
                contact_email="contact@kaushalkonnect.com",
            )
            session.add(coop)
            session.commit()

        print(f"Using cooperative: {coop.name}")

        # 3. Migrate Workers
        worker_map = {}
        worker_count = 0

        with open(WORKER_CSV, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)

            for i, row in enumerate(reader):

                # Import only first 500 workers
                if i >= MAX_WORKERS:
                    break

                csv_worker_id = row["worker_id"].strip()
                category_csv = row["category"].strip()

                # Map CSV category to canonical service_id
                service_id = None

                for name, s_id in CATEGORY_MAPPING.items():
                    if category_csv.lower() == name.lower():
                        service_id = s_id
                        break

                if not service_id:
                    continue

                # Create User
                user_id = uuid.uuid4()

                user = User(
                    id=user_id,
                    email=row["email"].strip(),
                    password_hash="hashed_password",
                    full_name=row["full_name"].strip(),
                    phone=str(row["phone"]).strip(),
                    role=UserRole.worker,
                    zone=row["user_zone"].strip(),
                    city=row["city"].strip(),
                    locality=row["locality"].strip(),
                )

                session.add(user)
                session.flush()

                # Create Worker
                worker = Worker(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    coop_id=coop.id,
                    service_id=service_id,
                    worker_zone=row["worker_zone"].strip(),
                    city=row["city"].strip(),
                    locality=row["locality"].strip(),
                    available=row["available"].strip() == "1",
                    hourly_rate=float(row["price"]),
                    rating=float(row["rating"]),
                    completed_jobs=int(row["completed_jobs"]),
                    response_minutes=int(row["response_minutes"]),
                    is_verified=True,
                )

                session.add(worker)

                worker_map[csv_worker_id] = worker.id
                worker_count += 1

                # Progress indicator
                if worker_count % 100 == 0:
                    print(f"Processed {worker_count}/{MAX_WORKERS} workers...")

        session.commit()

        print(f"Migrated {worker_count} workers.")

        # 4. Migrate Bookings
        booking_count = 0
        customer_map = {}

        with open(BOOKING_CSV, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)

            for row in reader:
                csv_worker_id = row["worker_id"].strip()
                csv_customer_id = row["customer_id"].strip()

                # Only migrate bookings belonging to the
                # 500 imported workers
                if csv_worker_id not in worker_map:
                    continue

                # Customer Upsert
                customer_email = row["customer_email"].strip()

                customer = (
                    session.query(User)
                    .filter(User.email == customer_email)
                    .first()
                )

                if not customer:
                    customer = User(
                        id=uuid.uuid4(),
                        email=customer_email,
                        password_hash="hashed_password",
                        full_name=row["customer_name"].strip(),
                        phone=str(row["customer_phone"].strip()),
                        role=UserRole.customer,
                        zone=row["user_zone"].strip(),
                    )

                    session.add(customer)
                    session.flush()

                csv_status = row["status"].strip().lower()

                status_mapping = {
                    "booked": BookingStatus.ACCEPTED,
                    "completed": BookingStatus.COMPLETED,
                    "cancelled": BookingStatus.CANCELLED,
                    "requested": BookingStatus.REQUESTED,
                    "rejected": BookingStatus.REJECTED,
                }

                booking_status = status_mapping.get(
                    csv_status,
                    BookingStatus.REQUESTED
                )

                created_at = datetime.fromisoformat(
                    row["created_at"].replace("Z", "+00:00")
                )

                category_csv = row["category"].strip()
                service_id = None

                for name, s_id in CATEGORY_MAPPING.items():
                    if category_csv.lower() == name.lower():
                        service_id = s_id
                        break

                if not service_id:
                    continue

                booking = Booking(
                    id=uuid.uuid4(),
                    customer_id=customer.id,
                    worker_id=worker_map[csv_worker_id],
                    service_id=service_id,
                    status=booking_status,
                    amount=float(row["budget"]) if row["budget"] else 0.0,
                    booking_date=created_at,
                    slot="Morning",
                )

                session.add(booking)
                booking_count += 1

        session.commit()

        print(f"Migrated {booking_count} bookings.")
        print("Migration completed successfully.")

    except Exception as e:
        session.rollback()
        print(f"Migration failed: {e}")
        raise

    finally:
        session.close()


if __name__ == "__main__":
    migrate()
