import os
import json
import traceback

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints import workers, bookings, recommendations, auth


app = FastAPI(
    title="Kaushal-Konnect API",
    version="1.0.0"
)


FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://kaushal-konnect-frontend.onrender.com",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print("\n🔥 ACTUAL ERROR:")
    print(repr(exc))
    traceback.print_exc()

    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": str(exc),
            "code": 500
        }
    )


app.include_router(
    auth.router,
    prefix="/auth",
    tags=["Authentication"]
)

app.include_router(
    workers.router,
    prefix="/workers",
    tags=["Workers"]
)

app.include_router(
    bookings.router,
    prefix="/bookings",
    tags=["Bookings"]
)

app.include_router(
    recommendations.router,
    prefix="/recommendations",
    tags=["Recommendations"]
)


@app.get("/")
def home():
    return {
        "message": "Kaushal-Konnect backend is running (Production DB mode)."
    }