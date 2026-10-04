from pathlib import Path

import joblib
import numpy as np
import pandas as pd


MODEL_PATH = (
    Path(__file__).resolve().parent
    / "models"
    / "kaushal_konnect_recommendation_model.joblib"
)

recommendation_model = joblib.load(MODEL_PATH)


FEATURES = [
    "category",
    "available",
    "weekly_gigs",
    "rating",
    "completed_jobs",
    "acceptance_rate",
    "cancellation_rate",
    "response_minutes",
    "price",
    "budget",
    "distance_km"
]


def get_recommendations(category, zone, budget, worker_data, top_n=10):

    print("\n========== RECOMMENDATION DEBUG ==========")
    print("Category received:", repr(category))
    print("Zone received:", repr(zone))
    print("Budget received:", repr(budget))
    print("Worker data shape:", worker_data.shape)

    print("\nCategories in DB:")
    print(worker_data["category"].unique())

    print("\nZones in DB:")
    print(worker_data["worker_zone"].unique())

    print("\nAvailable values:")
    print(worker_data["available"].unique())

    print("\nPrice range:")
    print(worker_data["price"].min(), "-", worker_data["price"].max())

    eligible_workers = worker_data[
        (worker_data["category"] == category)
        & (worker_data["available"] == 1)
        & (worker_data["price"] <= budget)
    ].copy()

    print("\nEligible workers:", len(eligible_workers))
    print(eligible_workers)

    if eligible_workers.empty:
        print("❌ NO ELIGIBLE WORKERS")
        print("==========================================\n")
        return pd.DataFrame()

    eligible_workers = worker_data[
        (worker_data["category"] == category)
        & (worker_data["available"] == 1)
        & (worker_data["price"] <= budget)
    ].copy()

    if eligible_workers.empty:
        return pd.DataFrame()

    eligible_workers["budget"] = budget

    eligible_workers["booking_success_probability"] = (
        recommendation_model.predict_proba(
            eligible_workers[FEATURES]
        )[:, 1]
    )

    maximum_weekly_gigs = max(
        eligible_workers["weekly_gigs"].max(),
        1
    )

    eligible_workers["workload_balance_score"] = (
        1 - eligible_workers["weekly_gigs"] / maximum_weekly_gigs
    )

    eligible_workers["recommendation_score"] = (
        0.85 * eligible_workers["booking_success_probability"]
        + 0.15 * eligible_workers["workload_balance_score"]
    )

    recommended_workers = eligible_workers.sort_values(
        by="recommendation_score",
        ascending=False
    ).head(top_n).reset_index(drop=True)

    recommended_workers.insert(
        0,
        "rank",
        range(1, len(recommended_workers) + 1)
    )

    return recommended_workers
