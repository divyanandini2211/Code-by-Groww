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
        "replay_date": market_service.get_replay_date_str(),
        "simulation_speed": market_service.simulation_speed,
        "total_intraday_candles": len(market_service.replay_timestamps),
        "replay_cursor_index": market_service.replay_index,
        "message": "Market is currently OPEN (Live Polling Active)" if is_open else f"Market is CLOSED. Replaying {market_service.get_replay_date_str()} session sequence."
    }

@router.post("/replay/toggle")
async def toggle_replay_mode(enable: bool = Query(...)):
    """Allows user or judges to force Replay Mode ON or OFF."""
    market_service.is_replay_mode = enable
    return {"is_replay_mode": market_service.is_replay_mode}

@router.post("/replay/speed")
async def set_replay_speed(speed: float = Query(..., ge=0.5, le=10.0)):
    """Sets simulation speed multiplier (0.5x to 10x max within ML processing limits)."""
    current_speed = market_service.set_simulation_speed(speed)
    return {
        "simulation_speed": current_speed,
        "message": f"Simulation running at {current_speed}x speed"
    }

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

@router.get("/search")
async def search_stocks(query: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    """Search stocks by symbol, company name, or sector for watchlist addition."""
    q = f"%{query}%"
    res = await db.execute(
        select(Stock)
        .filter(
            (Stock.symbol.ilike(q)) | 
            (Stock.name.ilike(q)) | 
            (Stock.sector.ilike(q))
        )
        .limit(10)
    )
    stocks = res.scalars().all()
    return [
        {
            "symbol": s.symbol,
            "name": s.name,
            "sector": s.sector,
            "exchange": s.exchange,
            "current_price": round(s.current_price, 2),
            "fifty_two_week_high": round(s.fifty_two_week_high, 2),
            "fifty_two_week_low": round(s.fifty_two_week_low, 2)
        }
        for s in stocks
    ]

@router.get("/stocks/{symbol}/history")
async def get_stock_history(symbol: str, limit: int = 60, db: AsyncSession = Depends(get_db)):
    """Returns the latest intraday candles for a stock up to the current simulation time."""
    sym = symbol.upper()
    query = select(StockTick).filter(StockTick.symbol == sym)

    if market_service.is_replay_mode and market_service.replay_timestamps:
        current_virtual_time = market_service.get_current_virtual_time()
        query = query.filter(StockTick.timestamp <= current_virtual_time)

    # Fetch extra to account for potential deduplication
    res = await db.execute(
        query.order_by(StockTick.timestamp.desc()).limit(limit * 2)
    )
    raw_ticks = res.scalars().all()

    # Deduplicate strictly by minute string (keeps newest tick per minute)
    seen_minutes = set()
    deduped_ticks = []
    for t in raw_ticks:
        minute_key = t.timestamp.astimezone(IST).strftime("%H:%M")
        if minute_key not in seen_minutes:
            seen_minutes.add(minute_key)
            deduped_ticks.append(t)
        if len(deduped_ticks) >= limit:
            break

    # Fallback if at the very start of replay session
    if len(deduped_ticks) < 5:
        fallback_res = await db.execute(
            select(StockTick)
            .filter(StockTick.symbol == sym)
            .order_by(StockTick.timestamp.asc())
            .limit(limit)
        )
        deduped_ticks = fallback_res.scalars().all()
    else:
        deduped_ticks = list(reversed(deduped_ticks))

    return [
        {
            "timestamp": t.timestamp.astimezone(IST).strftime("%H:%M"),
            "open": round(t.open, 2),
            "high": round(t.high, 2),
            "low": round(t.low, 2),
            "close": round(t.close, 2),
            "volume": round(t.volume)
        }
        for t in deduped_ticks
    ]

@router.post("/simulate-anomaly")
async def simulate_anomaly(
    symbol: str = Query(..., description="Stock symbol to shock"),
    price_shock_pct: float = Query(2.5, description="Price change percentage, e.g. 2.5 or -3.0"),
    volume_multiplier: float = Query(3.5, description="Volume surge multiplier, e.g. 3.0x"),
    db: AsyncSession = Depends(get_db)
):
    """
    Pitch/Demo Tool for Judges:
    Injects a real-time anomaly on a stock to immediately demonstrate the ML Attention & Anomaly Engine.
    """
    sym = symbol.upper()
    stock_res = await db.execute(select(Stock).filter(Stock.symbol == sym))
    stock = stock_res.scalars().first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock {sym} not found")

    old_price = stock.current_price
    new_price = round(stock.current_price * (1.0 + (price_shock_pct / 100.0)), 2)
    stock.current_price = new_price
    virtual_time = market_service.get_current_virtual_time()
    stock.updated_at = virtual_time

    # Realistic candlestick OHLC with natural financial wicks
    wick_offset = max(0.5, abs(new_price - old_price) * 0.15)
    candle_high = round(max(old_price, new_price) + wick_offset, 2)
    candle_low = round(min(old_price, new_price) - wick_offset, 2)
    sim_vol = round(stock.avg_volume_20d * (volume_multiplier / 375.0), 1)

    # Upsert: check if a tick already exists for this exact timestamp
    existing_tick_res = await db.execute(
        select(StockTick).filter(StockTick.symbol == sym, StockTick.timestamp == virtual_time)
    )
    existing_tick = existing_tick_res.scalars().first()

    if existing_tick:
        existing_tick.price = new_price
        existing_tick.close = new_price
        existing_tick.high = max(existing_tick.high, candle_high)
        existing_tick.low = min(existing_tick.low, candle_low)
        existing_tick.volume = max(existing_tick.volume, sim_vol)
        existing_tick.vwap = new_price
    else:
        simulated_tick = StockTick(
            symbol=sym,
            timestamp=virtual_time,
            price=new_price,
            open=old_price,
            high=candle_high,
            low=candle_low,
            close=new_price,
            volume=sim_vol,
            vwap=new_price
        )
        db.add(simulated_tick)

    # Maintain continuity in simulation replay
    if old_price > 0:
        market_service.stock_multipliers[sym] = new_price / old_price

    await db.commit()

    return {
        "status": "anomaly_injected",
        "symbol": sym,
        "new_price": new_price,
        "price_shock_pct": price_shock_pct,
        "volume_multiplier": volume_multiplier,
        "timestamp": virtual_time.astimezone(IST).strftime("%H:%M:%S IST"),
        "message": f"Successfully injected {price_shock_pct:+.2f}% shock with {volume_multiplier}x volume on {sym}."
    }

