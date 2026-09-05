import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.market import router as market_router
from app.api.v1.watchlist import router as watchlist_router
from app.services.market_service import market_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize market engine & start background ticking task
    await market_service.initialize()
    task = asyncio.create_task(market_service.start_background_loop(interval_seconds=15))
    yield
    # Cleanup
    market_service.is_running = False
    task.cancel()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend API for Groww Smart Market Watchlist - with ML Attention Engine and Replay Simulation",
    lifespan=lifespan
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(market_router, prefix="/api/v1/market", tags=["Market Data & Simulation"])
app.include_router(watchlist_router, prefix="/api/v1/watchlists", tags=["Smart Watchlists & AI Intelligence"])

@app.get("/", tags=["Health"])
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "status": "healthy",
        "docs_url": "/docs"
    }

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.future import select
from app.core.database import AsyncSessionLocal
from app.models.schemas import Stock

@app.websocket("/ws/market")
async def websocket_market_stream(websocket: WebSocket):
    """
    WebSocket Live Market Stream:
    Pushes live ticker quotes, replay timestamps, and market status to connected clients every 3 seconds.
    """
    await websocket.accept()
    try:
        while True:
            virtual_time = market_service.get_current_virtual_time()
            async with AsyncSessionLocal() as session:
                res = await session.execute(select(Stock).order_by(Stock.symbol.asc()))
                stocks = res.scalars().all()
                data = {
                    "type": "MARKET_TICK",
                    "status": "OPEN" if market_service.is_market_open_now() else "CLOSED",
                    "is_replay_mode": market_service.is_replay_mode,
                    "virtual_time": virtual_time.isoformat(),
                    "stocks": [
                        {
                            "symbol": s.symbol,
                            "current_price": round(s.current_price, 2),
                            "previous_close": round(s.previous_close, 2),
                            "pct_change": round(((s.current_price - s.previous_close) / s.previous_close) * 100.0, 2) if s.previous_close else 0.0
                        }
                        for s in stocks
                    ]
                }
            await websocket.send_json(data)
            await asyncio.sleep(3)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass

