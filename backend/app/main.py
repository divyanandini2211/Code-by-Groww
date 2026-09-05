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
