from datetime import datetime, timedelta

from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload
import pandas as pd

from app.models import Booking, BookingStatus, Worker, User
from recommender import get_recommendations

def get_worker_recommendations(db: Session, category: str, zone: str, budget: float, top_n: int):
    # The frontend sends canonical category names like "Home Cleaning", "Plumbing", etc.
    # The DB uses IDs like "home-cleaning", "plumbing".
    category_mapping = {
        "Home Cleaning": "home-cleaning",
        "Plumbing": "plumbing",
        "Electrical": "electrical",
        "Painting": "painting",
        "Carpentry": "carpentry",
        "Appliance Repair": "appliance-repair",
    }

    service_id = category_mapping.get(category, category)

    # Fetch relevant workers from DB to create a DataFrame for the ML model
    # Filter by service_id, city (passed as zone), and availability
    workers = db.query(Worker).join(User, Worker.user_id == User.id).filter(
        Worker.service_id == service_id,
        func.coalesce(Worker.city, User.city) == zone,
        Worker.is_verified.is_(True),
        Worker.available == True
    ).all()

    if not workers:
        return pd.DataFrame()

    worker_ids = [worker.id for worker in workers]
    cutoff = datetime.utcnow() - timedelta(days=7)
    booking_metrics = (
        db.query(
            Booking.worker_id,
            func.count(Booking.id).label("total_bookings"),
            func.sum(case((Booking.booking_date >= cutoff, 1), else_=0)).label("weekly_gigs"),
            func.sum(case((Booking.status.in_((BookingStatus.ACCEPTED, BookingStatus.COMPLETED)), 1), else_=0)).label("accepted_bookings"),
            func.sum(case((Booking.status == BookingStatus.CANCELLED, 1), else_=0)).label("cancelled_bookings"),
        )
        .filter(Booking.worker_id.in_(worker_ids))
        .group_by(Booking.worker_id)
        .all()
    )
    metrics_by_worker = {row.worker_id: row for row in booking_metrics}

    # Convert SQLAlchemy models to a DataFrame that the recommender expects
    worker_list = []
    for w in workers:
        metrics = metrics_by_worker.get(w.id)
        booking_count = int(metrics.total_bookings or 0) if metrics else 0
        accepted_count = int(metrics.accepted_bookings or 0) if metrics else 0
        cancelled_count = int(metrics.cancelled_bookings or 0) if metrics else 0
        worker_list.append({
            "worker_id": str(w.id),
            "category": w.service_id, # Mapping service_id to category for the model
            "worker_zone": w.city or w.user.city,
            "available": int(w.available),
            "rating": float(w.rating),
            "weekly_gigs": int(metrics.weekly_gigs or 0) if metrics else 0,
            "completed_jobs": w.completed_jobs,
            "price": float(w.hourly_rate),
            "distance_km": 0.0,
            "acceptance_rate": accepted_count / booking_count if booking_count else 0.0,
            "cancellation_rate": cancelled_count / booking_count if booking_count else 0.0,
            "response_minutes": w.response_minutes,
        })

    worker_df = pd.DataFrame(worker_list)

    # Get the ranked worker IDs from the ML model
    ranked_df = get_recommendations(
        category=service_id,
        zone=zone,
        budget=budget,
        worker_data=worker_df,
        top_n=top_n
    )

    if ranked_df.empty:
        return ranked_df

    # Extract the worker IDs from the ranked results
    worker_ids = ranked_df["worker_id"].tolist()

    # Fetch the full worker and user records from the DB for these IDs
    # We use joinedload to avoid N+1 queries when accessing worker.user
    final_workers = (
        db.query(Worker)
        .options(joinedload(Worker.user))
        .filter(Worker.id.in_(worker_ids))
        .all()
    )

    # The ML model might have returned a specific order, so we sort the DB results to match
    # The worker_ids list is already sorted by the ML model
    worker_map = {str(w.id): w for w in final_workers}
    sorted_workers = [worker_map[wid] for wid in worker_ids if wid in worker_map]

    # Convert to a list of dicts that match WorkerRead schema
    # Note: We add the full_name from the associated User model
    results = []
    for w in sorted_workers:
        results.append({
            "id": w.id,
            "user_id": w.user_id,
            "coop_id": w.coop_id,
            "service_id": w.service_id,
            "worker_zone": w.city or w.user.city,
            "city": w.city or w.user.city,
            "locality": w.locality or w.user.locality,
            "is_verified": w.is_verified,
            "available": w.available,
            "hourly_rate": w.hourly_rate,
            "rating": w.rating,
            "completed_jobs": w.completed_jobs,
            "response_minutes": w.response_minutes,
            "created_at": w.created_at,
            "full_name": w.user.full_name if w.user else "Unknown",
        })

    return pd.DataFrame(results)
