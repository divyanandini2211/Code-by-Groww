from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime, timezone
import pytz

from app.core.database import get_db
from app.models.schemas import Stock, StockTick, Watchlist, WatchlistItem, UserSession
from app.services.market_service import market_service
from app.services.ml_engine import ml_engine

router = APIRouter()
IST = pytz.timezone("Asia/Kolkata")

@router.get("/status")
async def get_market_status():
    """Returns current market session status, current time, and simulation/replay details."""
    is_open = market_service.is_market_open_now()
    virtual_time = market_service.get_current_virtual_time()
    return {
        "status": "OPEN" if is_open else "CLOSED",
        "current_time_ist": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST"),
        "virtual_market_time": virtual_time.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S IST"),
        "is_replay_mode": market_service.is_replay_mode,
        "total_intraday_candles": len(market_service.replay_timestamps),
        "replay_cursor_index": market_service.replay_index,
        "message": "Market is currently OPEN (Live Polling Active)" if is_open else "Market is CLOSED. Replaying latest Friday session sequence."
    }

@router.post("/replay/toggle")
async def toggle_replay_mode(enable: bool = Query(...)):
    """Allows user or judges to force Replay Mode ON or OFF."""
    market_service.is_replay_mode = enable
    return {"is_replay_mode": market_service.is_replay_mode}

@router.post("/replay/seek")
async def seek_replay_cursor(index: int = Query(..., ge=0)):
    """Allows jumping forward or backward in time for demoing changes."""
    if market_service.replay_timestamps:
        market_service.replay_index = min(index, len(market_service.replay_timestamps) - 1)
        await market_service.advance_replay_tick()
    return {
        "current_index": market_service.replay_index,
        "timestamp": market_service.get_current_virtual_time().astimezone(IST).strftime("%H:%M:%S IST")
    }

@router.get("/stocks")
async def list_stocks(db: AsyncSession = Depends(get_db)):
    """Returns all available stocks with their current price and daily metrics."""
    res = await db.execute(select(Stock).order_by(Stock.symbol.asc()))
    stocks = res.scalars().all()
    
    result = []
    for s in stocks:
        pct_change = ((s.current_price - s.previous_close) / s.previous_close) * 100.0 if s.previous_close else 0.0
        result.append({
            "symbol": s.symbol,
            "name": s.name,
            "sector": s.sector,
            "exchange": s.exchange,
            "current_price": round(s.current_price, 2),
            "previous_close": round(s.previous_close, 2),
            "pct_change": round(pct_change, 2),
            "fifty_two_week_high": round(s.fifty_two_week_high, 2),
            "fifty_two_week_low": round(s.fifty_two_week_low, 2),
            "updated_at": s.updated_at
        })
    return result

@router.get("/stocks/{symbol}/history")
async def get_stock_history(symbol: str, limit: int = 60, db: AsyncSession = Depends(get_db)):
    """Returns the latest intraday candles for a stock."""
    res = await db.execute(
        select(StockTick)
        .filter(StockTick.symbol == symbol.upper())
        .order_by(StockTick.timestamp.desc())
        .limit(limit)
    )
    ticks = res.scalars().all()
    return [
        {
            "timestamp": t.timestamp.astimezone(IST).strftime("%H:%M"),
            "open": t.open,
            "high": t.high,
            "low": t.low,
            "close": t.close,
            "volume": t.volume
        }
        for t in reversed(ticks)
    ]
