from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import pandas as pd

from app.core.database import get_db
from app.models.schemas import Watchlist, WatchlistItem, Stock, StockTick, UserSession, User
from app.core.auth import get_current_user
from app.services.market_service import market_service
from app.services.ml_engine import ml_engine
from app.services.chat_service import watchlist_chat_service

router = APIRouter()

class CreateWatchlistRequest(BaseModel):
    name: str
    description: Optional[str] = None

class AddStockRequest(BaseModel):
    symbol: str

@router.get("", include_in_schema=False)
@router.get("/")
async def list_watchlists(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List watchlists belonging to the authenticated user only."""
    res = await db.execute(
        select(Watchlist)
        .filter(Watchlist.user_id == user.id)
        .order_by(Watchlist.created_at.desc())
    )
    watchlists = res.scalars().all()
    return [
        {
            "id": w.id,
            "name": w.name,
            "description": w.description,
            "user_id": w.user_id,
            "created_at": w.created_at
        }
        for w in watchlists
    ]

@router.post("", include_in_schema=False)
@router.post("/")
async def create_watchlist(
    payload: CreateWatchlistRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new watchlist tied to the authenticated user."""
    new_w = Watchlist(name=payload.name, description=payload.description, user_id=user.id)
    db.add(new_w)
    await db.commit()
    await db.refresh(new_w)
    return {"id": new_w.id, "name": new_w.name, "description": new_w.description, "user_id": new_w.user_id}

@router.get("/{watchlist_id}")
async def get_watchlist_details(
    watchlist_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get watchlist with its contained stocks. Verifies ownership."""
    w_res = await db.execute(select(Watchlist).filter(Watchlist.id == watchlist_id))
    watchlist = w_res.scalars().first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    if watchlist.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied to this watchlist")

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
async def add_stock_to_watchlist(
    watchlist_id: str,
    payload: AddStockRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a stock to a watchlist. Verifies user owns the watchlist."""
    # Verify ownership
    w_res = await db.execute(select(Watchlist).filter(Watchlist.id == watchlist_id))
    watchlist = w_res.scalars().first()
    if not watchlist or watchlist.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied to this watchlist")

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
async def remove_stock_from_watchlist(
    watchlist_id: str,
    symbol: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a stock from a watchlist. Verifies user owns the watchlist."""
    # Verify ownership
    w_res = await db.execute(select(Watchlist).filter(Watchlist.id == watchlist_id))
    watchlist = w_res.scalars().first()
    if not watchlist or watchlist.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied to this watchlist")

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


async def _compute_watchlist_insights(
    watchlist_id: str,
    effective_user_id: str,
    db: AsyncSession,
    since_minutes_ago: Optional[int] = None
):
    """Internal helper to calculate live watchlist delta, volume surges, and attention scores."""
    w_res = await db.execute(select(Watchlist).filter(Watchlist.id == watchlist_id))
    watchlist = w_res.scalars().first()
    if not watchlist or watchlist.user_id != effective_user_id:
        raise HTTPException(status_code=403, detail="Access denied to this watchlist")

    # 1. Fetch watchlist items
    items_res = await db.execute(
        select(WatchlistItem).filter(WatchlistItem.watchlist_id == watchlist_id)
    )
    items = items_res.scalars().all()
    symbols = [item.symbol for item in items]
    if not symbols:
        return watchlist, [], [], "0 minutes", datetime.now(timezone.utc), datetime.now(timezone.utc)

    # 2. Determine reference time (Auto-tracked Last Checkpoint)
    session_res = await db.execute(
        select(UserSession).filter(UserSession.user_id == effective_user_id)
    )
    session = session_res.scalars().first()

    now_real = datetime.now(timezone.utc)
    if since_minutes_ago is not None:
        away_mins = since_minutes_ago
    elif session and session.last_visited_at:
        ref_real = session.last_visited_at
        if ref_real.tzinfo is None:
            ref_real = ref_real.replace(tzinfo=timezone.utc)
        
        real_diff_secs = (now_real - ref_real).total_seconds()
        
        # Guard against legacy virtual dates (Sep 04) or unrealistic future/past desyncs
        if real_diff_secs < 0 or real_diff_secs > 86400 * 7 or ref_real.day == 4:
            away_mins = 30
        else:
            # Realistic absence window (15 mins minimum so AI model has meaningful market data)
            away_mins = max(15, min(180, int(real_diff_secs / 60)))
    else:
        away_mins = 30

    current_time = market_service.get_current_virtual_time()
    reference_time = current_time - pd.Timedelta(minutes=away_mins)

    if away_mins < 60:
        away_duration_str = f"{away_mins} minutes"
    else:
        hrs = away_mins // 60
        mins = away_mins % 60
        away_duration_str = f"{hrs}h {mins}m" if mins > 0 else f"{hrs} hour{'s' if hrs > 1 else ''}"

    # 3. Calculate Insights per stock using batch queries
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

    return watchlist, symbols, insights, away_duration_str, reference_time, current_time

@router.get("/{watchlist_id}/intelligence")
async def get_watchlist_intelligence(
    watchlist_id: str,
    since_minutes_ago: Optional[int] = Query(None, description="Optional override to simulate time away in minutes"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Calculates what has meaningfully changed since the user last checked.
    Returns ranked insights and executive AI digest.
    """
    watchlist, symbols, insights, away_duration_str, reference_time, current_time = await _compute_watchlist_insights(
        watchlist_id=watchlist_id,
        effective_user_id=user.id,
        db=db,
        since_minutes_ago=since_minutes_ago
    )

    if not symbols:
        return {"insights": [], "ai_digest": "Watchlist is empty."}

    # Generate AI Digest
    ai_digest = await ml_engine.generate_ai_digest(insights, away_duration_str)

    return {
        "reference_time": reference_time.isoformat(),
        "current_time": current_time.isoformat(),
        "away_duration": away_duration_str,
        "ai_digest": ai_digest,
        "ranked_insights": insights
    }

class ChatMessageRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = None

@router.post("/{watchlist_id}/chat")
async def chat_with_watchlist(
    watchlist_id: str,
    payload: ChatMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Real-time AI Chat endpoint grounded in active watchlist with multi-layer guardrails
    clean_msg = payload.message.strip()
    if not clean_msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    watchlist, symbols, insights, away_duration_str, reference_time, current_time = await _compute_watchlist_insights(
        watchlist_id=watchlist_id,
        effective_user_id=user.id,
        db=db
    )

    chat_result = await watchlist_chat_service.answer_watchlist_question(
        query=clean_msg,
        watchlist_name=watchlist.name,
        insights=insights,
        away_duration=away_duration_str,
        history=payload.history
    )

    return {
        "reply": chat_result["reply"],
        "model_used": chat_result["model_used"],
        "status": chat_result["status"],
        "watchlist_id": watchlist_id,
        "watchlist_name": watchlist.name,
        "timestamp": current_time.isoformat()
    }

@router.post("/checkpoint")
async def save_user_checkpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Saves the current moment as the user last seen checkpoint in Neon DB
    effective_user_id = user.id
    current_time = datetime.now(timezone.utc)
    res = await db.execute(select(UserSession).filter(UserSession.user_id == effective_user_id))
    session = res.scalars().first()
    if not session:
        session = UserSession(user_id=effective_user_id, last_visited_at=current_time)
        db.add(session)
    else:
        session.last_visited_at = current_time
    await db.commit()
    return {
        "status": "checkpoint_saved",
        "user_id": effective_user_id,
        "last_visited_at": current_time.isoformat()
    }
