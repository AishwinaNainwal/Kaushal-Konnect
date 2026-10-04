from sqlalchemy.orm import Session, joinedload
import pandas as pd
from app.models import Worker, User
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
    workers = db.query(Worker).filter(
        Worker.service_id == service_id,
        Worker.city == zone,
        Worker.available == True
    ).all()

    if not workers:
        return pd.DataFrame()

    # Convert SQLAlchemy models to a DataFrame that the recommender expects
    worker_list = []
    for w in workers:
        worker_list.append({
            "worker_id": str(w.id),
            "category": w.service_id, # Mapping service_id to category for the model
            "worker_zone": w.city,
            "available": int(w.available),
            "rating": float(w.rating),
            "weekly_gigs": 0, # This would need a real query to bookings
            "completed_jobs": w.completed_jobs,
            "price": float(w.hourly_rate),
            "distance_km": 0.0, # This would need a geo-calculation
            "acceptance_rate": 0.5,
            "cancellation_rate": 0.0,
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
            "worker_zone": w.city,
            "city": w.city,
            "locality": w.locality,
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
