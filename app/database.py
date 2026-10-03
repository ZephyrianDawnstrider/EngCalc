"""Local-first persistence for EngCalc calculation reports.

Set DATABASE_URL to use an explicitly configured SQLAlchemy database. The
default is a project-local SQLite file; importing the app never targets a
remote service by default.
"""

from datetime import datetime
import os

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./engcalc.db")
engine_options = {"connect_args": {"check_same_thread": False}} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Calculation(Base):
    """Legacy v0 table retained in place; new v1 reports use CalculationReport."""

    __tablename__ = "calculations"

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    calc_type = Column(String)
    grade = Column(String)
    diameter_mm = Column(Float)
    applied_N = Column(Float)
    shear_planes = Column(Integer)
    margin = Column(Float)
    status = Column(String)


class CalculationReport(Base):
    """Immutable versioned report snapshot; v1 writes never rewrite legacy rows."""

    __tablename__ = "calculation_reports"

    report_id = Column(String(36), primary_key=True)
    created_at = Column(DateTime, nullable=False)
    report_schema_version = Column(String(16), nullable=False)
    calculator_version = Column(String(32), nullable=False)
    report_json = Column(Text, nullable=False)


Base.metadata.create_all(bind=engine)
