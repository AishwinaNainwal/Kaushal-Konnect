import uuid
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import (
    Column, String, Integer, Boolean, Numeric, DateTime,
    ForeignKey, Enum, Table, CheckConstraint, UniqueConstraint, Text, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base

# Enums
class UserRole(PyEnum):
    customer = "customer"
    worker = "worker"
    coop_manager = "coop_manager"
    admin = "admin"

class BookingStatus(PyEnum):
    REQUESTED = "REQUESTED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"

# Models
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    role = Column(Enum(UserRole), nullable=False)
    zone = Column(String, nullable=True)
    city = Column(String, nullable=True)
    locality = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    worker_profile = relationship("Worker", back_populates="user", uselist=False)
    bookings = relationship("Booking", back_populates="customer")

class Cooperative(Base):
    __tablename__ = "cooperatives"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    location = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    workers = relationship("Worker", back_populates="cooperative")

class Service(Base):
    __tablename__ = "services"

    id = Column(String(50), primary_key=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    base_price = Column(Numeric(10, 2), nullable=True)

    # Relationships
    # Removed worker_skills relationship as skill_name is not a foreign key to services.id

class Worker(Base):
    __tablename__ = "workers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    coop_id = Column(UUID(as_uuid=True), ForeignKey("cooperatives.id"), nullable=False)
    service_id = Column(String(50), ForeignKey("services.id"), nullable=False)
    worker_zone = Column(String, nullable=True)
    city = Column(String, nullable=True)
    locality = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False, nullable=False)
    available = Column(Boolean, default=True, nullable=False)
    hourly_rate = Column(Numeric(10, 2), nullable=False)
    rating = Column(Numeric(3, 2), default=0.0, nullable=False)
    completed_jobs = Column(Integer, default=0, nullable=False)
    response_minutes = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="worker_profile")
    cooperative = relationship("Cooperative", back_populates="workers")
    skills = relationship("WorkerSkill", back_populates="worker")
    bookings = relationship("Booking", back_populates="worker")
    documents = relationship("VerificationDocument", back_populates="worker")

class VerificationDocument(Base):
    __tablename__ = "verification_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    worker_id = Column(UUID(as_uuid=True), ForeignKey("workers.id"), nullable=False)
    document_type = Column(String, nullable=False) # e.g., "ID Proof", "Certification"
    file_path = Column(String, nullable=True)
    status = Column(String, default="Pending", nullable=False) # "Pending", "Verified", "Rejected"
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    worker = relationship("Worker", back_populates="documents")

class WorkerSkill(Base):
    __tablename__ = "worker_skills"

    worker_id = Column(UUID(as_uuid=True), ForeignKey("workers.id"), primary_key=True)
    skill_name = Column(String, primary_key=True)

    # Relationships
    worker = relationship("Worker", back_populates="skills")
    # Note: Service relationship removed because skill_name is now a plain string
    # but the prompt said "The second primary-key column is skill_name, NOT service_id."
    # and "worker_skills: (worker_id, skill_name) composite primary key".
    # If we want to link to services, we'd need service_id, but the approved schema specifically said skill_name.
    # Let's stick to the approved schema.

class Booking(Base):
    __tablename__ = "bookings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    worker_id = Column(UUID(as_uuid=True), ForeignKey("workers.id"), nullable=False)
    service_id = Column(String(50), ForeignKey("services.id"), nullable=False)
    status = Column(Enum(BookingStatus), nullable=False, default=BookingStatus.REQUESTED)
    amount = Column(Numeric(10, 2), nullable=True)
    slot = Column(String, nullable=True)
    booking_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    customer = relationship("User", back_populates="bookings")
    worker = relationship("Worker", back_populates="bookings")
    payment = relationship("Payment", back_populates="booking", uselist=False)
    review = relationship("Review", back_populates="booking", uselist=False)
    complaint = relationship("Complaint", back_populates="booking", uselist=False)

class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=False, unique=True)
    amount = Column(Numeric(10, 2), nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow)
    payment_method = Column(String, nullable=True)
    status = Column(String, nullable=False)

    # Relationships
    booking = relationship("Booking", back_populates="payment")

class Review(Base):
    __tablename__ = "reviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=False, unique=True)
    rating = Column(Numeric(3, 2), nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    booking = relationship("Booking", back_populates="review")

    __table_args__ = (
        CheckConstraint('rating >= 1 AND rating <= 5', name='check_review_rating'),
    )

class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=False, unique=True)
    description = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="OPEN")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    booking = relationship("Booking", back_populates="complaint")
