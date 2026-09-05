from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import pandas as pd

from app.core.database import get_db
from app.models.schemas import Watchlist, WatchlistItem, Stock, StockTick, UserSession
from app.services.market_service import market_service
from app.services.ml_engine import ml_engine

router = APIRouter()

class CreateWatchlistRequest(BaseModel):
    name: str
    description: Optional[str] = None

class AddStockRequest(BaseModel):
    symbol: str

@router.get("/")
async def list_watchlists(db: AsyncSession = Depends(get_db)):
    """List all created watchlists."""
    res = await db.execute(select(Watchlist).order_by(Watchlist.created_at.desc()))
    watchlists = res.scalars().all()
    return [
        {
            "id": w.id,
            "name": w.name,
            "description": w.description,
            "created_at": w.created_at
        }
        for w in watchlists
    ]

@router.post("/")
async def create_watchlist(payload: CreateWatchlistRequest, db: AsyncSession = Depends(get_db)):
    """Create a new watchlist."""
    new_w = Watchlist(name=payload.name, description=payload.description)
    db.add(new_w)
    await db.commit()
    await db.refresh(new_w)
    return {"id": new_w.id, "name": new_w.name, "description": new_w.description}

@router.get("/{watchlist_id}")
async def get_watchlist_details(watchlist_id: str, db: AsyncSession = Depends(get_db)):
    """Get watchlist with its contained stocks."""
    w_res = await db.execute(select(Watchlist).filter(Watchlist.id == watchlist_id))
    watchlist = w_res.scalars().first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    items_res = await db.execute(
        select(WatchlistItem).filter(WatchlistItem.watchlist_id == watchlist_id)
    )
    items = items_res.scalars().all()
    
    symbols = [item.symbol for item in items]
    stocks_res = await db.execute(select(Stock).filter(Stock.symbol.in_(symbols)))
    stocks = stocks_res.scalars().all()

    stocks_data = []
    for s in stocks:
        pct = ((s.current_price - s.previous_close) / s.previous_close) * 100.0 if s.previous_close else 0.0
        stocks_data.append({
            "symbol": s.symbol,
            "name": s.name,
            "sector": s.sector,
            "current_price": round(s.current_price, 2),
            "pct_change": round(pct, 2),
            "fifty_two_week_high": round(s.fifty_two_week_high, 2),
            "fifty_two_week_low": round(s.fifty_two_week_low, 2)
        })

    return {
        "id": watchlist.id,
        "name": watchlist.name,
        "description": watchlist.description,
        "stocks": stocks_data
    }

@router.post("/{watchlist_id}/stocks")
async def add_stock_to_watchlist(watchlist_id: str, payload: AddStockRequest, db: AsyncSession = Depends(get_db)):
    """Add a stock to a watchlist."""
    sym = payload.symbol.upper()
    stock_res = await db.execute(select(Stock).filter(Stock.symbol == sym))
    if not stock_res.scalars().first():
        raise HTTPException(status_code=404, detail=f"Stock {sym} not found in database")

    existing = await db.execute(
        select(WatchlistItem).filter_by(watchlist_id=watchlist_id, symbol=sym)
    )
    if existing.scalars().first():
        return {"message": f"{sym} already in watchlist"}

    item = WatchlistItem(watchlist_id=watchlist_id, symbol=sym)
    db.add(item)
    await db.commit()
    return {"message": f"Added {sym} to watchlist"}

@router.delete("/{watchlist_id}/stocks/{symbol}")
async def remove_stock_from_watchlist(watchlist_id: str, symbol: str, db: AsyncSession = Depends(get_db)):
    """Remove a stock from a watchlist."""
    sym = symbol.upper()
    res = await db.execute(
        select(WatchlistItem).filter_by(watchlist_id=watchlist_id, symbol=sym)
    )
    item = res.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Stock not in watchlist")
    await db.delete(item)
    await db.commit()
    return {"message": f"Removed {sym} from watchlist"}

@router.get("/{watchlist_id}/intelligence")
async def get_watchlist_intelligence(
    watchlist_id: str,
    user_id: str = "default_user",
    since_minutes_ago: Optional[int] = Query(None, description="Optional override to simulate time away in minutes"),
    db: AsyncSession = Depends(get_db)
):
    """
    THE CORE HACKATHON FEATURE:
    Calculates what has meaningfully changed since the user last checked.
    Returns:
    1. AI/ML Attention-ranked list of stocks
    2. Exact Delta since last visit
    3. Anomaly and Breakout signals
    4. Executive AI narrative digest
    """
    # 1. Fetch watchlist items
    items_res = await db.execute(
        select(WatchlistItem).filter(WatchlistItem.watchlist_id == watchlist_id)
    )
    items = items_res.scalars().all()
    symbols = [item.symbol for item in items]
    if not symbols:
        return {"insights": [], "ai_digest": "Watchlist is empty."}

    # 2. Determine reference time (Last Checkpoint)
    current_time = market_service.get_current_virtual_time()
    session_res = await db.execute(
        select(UserSession).filter(UserSession.user_id == user_id)
    )
    session = session_res.scalars().first()
    
    if since_minutes_ago is not None:
        # Override for testing/demo simulation
        reference_time = current_time - pd.Timedelta(minutes=since_minutes_ago)
        away_duration_str = f"{since_minutes_ago} minutes"
    elif session and session.last_visited_at:
        reference_time = session.last_visited_at
        diff_mins = max(1, int((current_time - reference_time).total_seconds() / 60))
        away_duration_str = f"{diff_mins} minutes"
    else:
        # Default to 30 mins ago
        reference_time = current_time - pd.Timedelta(minutes=30)
        away_duration_str = "30 minutes"

    # 3. Calculate Insights per stock using batch queries (Zero N+1 DB roundtrips)
    stocks_res = await db.execute(select(Stock).filter(Stock.symbol.in_(symbols)))
    stocks = stocks_res.scalars().all()

    # Bulk fetch reference ticks
    ref_subq = (
        select(
            StockTick.symbol,
            StockTick.close,
            func.row_number().over(
                partition_by=StockTick.symbol,
                order_by=StockTick.timestamp.desc()
            ).label("rn")
        )
        .filter(StockTick.symbol.in_(symbols), StockTick.timestamp <= reference_time)
        .subquery()
    )
    ref_ticks_res = await db.execute(
        select(ref_subq.c.symbol, ref_subq.c.close).filter(ref_subq.c.rn == 1)
    )
    ref_prices = dict(ref_ticks_res.all())

    # Bulk fetch recent ticks (last 20 per stock)
    recent_subq = (
        select(
            StockTick.symbol,
            StockTick.volume,
            func.row_number().over(
                partition_by=StockTick.symbol,
                order_by=StockTick.timestamp.desc()
            ).label("rn")
        )
        .filter(StockTick.symbol.in_(symbols), StockTick.timestamp <= current_time)
        .subquery()
    )
    recent_ticks_res = await db.execute(
        select(recent_subq.c.symbol, recent_subq.c.volume, recent_subq.c.rn)
        .filter(recent_subq.c.rn <= 20)
    )
    
    recent_volumes = {}
    for sym_val, vol_val, _ in recent_ticks_res.all():
        recent_volumes.setdefault(sym_val, []).append(vol_val)

    insights = []
    for s in stocks:
        ref_price = ref_prices.get(s.symbol, s.previous_close)
        vols = recent_volumes.get(s.symbol, [1000.0])
        curr_vol = vols[0] if vols else 1000.0
        avg_vol_1m = sum(vols) / max(1, len(vols))

        analysis = ml_engine.calculate_attention_score(
            current_price=s.current_price,
            reference_price=ref_price,
            current_volume=curr_vol,
            avg_volume_1m=avg_vol_1m,
            fifty_two_high=s.fifty_two_week_high,
            fifty_two_low=s.fifty_two_week_low
        )

        insights.append({
            "symbol": s.symbol,
            "name": s.name,
            "sector": s.sector,
            "current_price": round(s.current_price, 2),
            "price_at_last_seen": round(ref_price, 2),
            "pct_change_since_seen": analysis["pct_change_since_seen"],
            "volume_surge_ratio": analysis["volume_surge_ratio"],
            "attention_score": analysis["attention_score"],
            "signals": analysis["signals"]
        })

    # Sort descending by Attention Score
    insights.sort(key=lambda x: x["attention_score"], reverse=True)

    # 4. Generate AI Digest
    ai_digest = await ml_engine.generate_ai_digest(insights, away_duration_str)

    return {
        "reference_time": reference_time.isoformat(),
        "current_time": current_time.isoformat(),
        "away_duration": away_duration_str,
        "ai_digest": ai_digest,
        "ranked_insights": insights
    }

@router.post("/checkpoint")
async def save_user_checkpoint(user_id: str = "default_user", db: AsyncSession = Depends(get_db)):
    """Saves the current moment as the user's 'last seen' checkpoint."""
    current_time = market_service.get_current_virtual_time()
    res = await db.execute(select(UserSession).filter(UserSession.user_id == user_id))
    session = res.scalars().first()
    if not session:
        session = UserSession(user_id=user_id, last_visited_at=current_time)
        db.add(session)
    else:
        session.last_visited_at = current_time
    await db.commit()
    return {
        "status": "checkpoint_saved",
        "last_visited_at": current_time.isoformat()
    }
