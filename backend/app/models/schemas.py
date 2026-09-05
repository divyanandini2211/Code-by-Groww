import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Float, Integer, DateTime, ForeignKey, 
    Text, Boolean, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.core.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class Stock(Base):
    __tablename__ = "stocks"

    symbol = Column(String(20), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    sector = Column(String(50), nullable=True)
    exchange = Column(String(10), default="NSE")
    current_price = Column(Float, nullable=False)
    previous_close = Column(Float, nullable=False)
    fifty_two_week_high = Column(Float, nullable=False)
    fifty_two_week_low = Column(Float, nullable=False)
    avg_volume_20d = Column(Float, default=100000.0)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    ticks = relationship("StockTick", back_populates="stock", cascade="all, delete-orphan")
    watchlist_items = relationship("WatchlistItem", back_populates="stock", cascade="all, delete-orphan")
    anomalies = relationship("AnomalyEvent", back_populates="stock", cascade="all, delete-orphan")

class StockTick(Base):
    __tablename__ = "stock_ticks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), ForeignKey("stocks.symbol", ondelete="CASCADE"), index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    price = Column(Float, nullable=False)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=False)
    vwap = Column(Float, nullable=True)

    stock = relationship("Stock", back_populates="ticks")

    __table_args__ = (
        Index("idx_tick_sym_time", "symbol", "timestamp"),
    )

class Watchlist(Base):
    __tablename__ = "watchlists"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    user_id = Column(String(50), nullable=True, index=True) # Scoped to user if authenticated
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    items = relationship("WatchlistItem", back_populates="watchlist", cascade="all, delete-orphan")

class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    watchlist_id = Column(String(36), ForeignKey("watchlists.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(20), ForeignKey("stocks.symbol", ondelete="CASCADE"), index=True, nullable=False)
    added_at = Column(DateTime(timezone=True), default=utcnow)

    watchlist = relationship("Watchlist", back_populates="items")
    stock = relationship("Stock", back_populates="watchlist_items")

    __table_args__ = (
        UniqueConstraint("watchlist_id", "symbol", name="uq_watchlist_stock"),
    )

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(120), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sessions = relationship("UserAuthToken", back_populates="user", cascade="all, delete-orphan")

class UserAuthToken(Base):
    __tablename__ = "user_auth_tokens"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="sessions")

class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(50), default="default_user", index=True)
    last_visited_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    device_info = Column(String(100), default="web_browser")
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class AnomalyEvent(Base):
    __tablename__ = "anomaly_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    symbol = Column(String(20), ForeignKey("stocks.symbol", ondelete="CASCADE"), index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)
    anomaly_score = Column(Float, nullable=False) # 0.0 to 1.0 (Isolation Forest / Multi-variate)
    regime_type = Column(String(50), nullable=False) # e.g. BREAKOUT, VOLUME_SURGE, FLASH_DROP
    delta_pct = Column(Float, nullable=False)
    volume_surge_ratio = Column(Float, nullable=False)
    ai_summary = Column(Text, nullable=True)

    stock = relationship("Stock", back_populates="anomalies")
