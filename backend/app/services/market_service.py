import asyncio
from datetime import datetime, time, timezone
import pytz
try:
    import yfinance as yf
except ImportError:
    yf = None
from sqlalchemy import desc, func
from app.core.database import AsyncSessionLocal
from app.models.schemas import Stock, StockTick, UserSession

IST = pytz.timezone("Asia/Kolkata")
MARKET_OPEN = time(9, 15)
MARKET_CLOSE = time(15, 30)

class MarketStateService:
    def __init__(self):
        self.is_replay_mode = False
        self.replay_index = 0 # Cursor index in historical intraday sequence
        self.replay_timestamps = [] # List of unique timestamps from Friday
        self.last_poll_time = None
        self.is_running = False
        self.simulation_speed = 1.0 # 1x (10s), 2x (5s), 5x (2s), 10x (1s max safe ML threshold)
        self.stock_multipliers: dict[str, float] = {}

    def is_market_open_now(self) -> bool:
        now_ist = datetime.now(IST)
        # Weekdays: Monday is 0, Sunday is 6
        if now_ist.weekday() >= 5: # Saturday or Sunday
            return False
        current_time = now_ist.time()
        return MARKET_OPEN <= current_time <= MARKET_CLOSE

    def get_replay_date_str(self) -> str:
        """Returns formatted string of the historical session date (e.g. Sep 04, 2026)."""
        if self.replay_timestamps:
            return self.replay_timestamps[0].astimezone(IST).strftime("%b %d, %Y")
        return "latest Friday"

    async def initialize(self):
        """Loads available intraday timestamps from Neon DB for replay mode."""
        async with AsyncSessionLocal() as session:
            # Get distinct timestamps ordered ascending
            res = await session.execute(
                select(StockTick.timestamp)
                .group_by(StockTick.timestamp)
                .order_by(StockTick.timestamp.asc())
            )
            self.replay_timestamps = [r[0] for r in res.all()]
            
            if self.replay_timestamps:
                # Default replay starts ~halfway or from beginning
                self.replay_index = min(60, len(self.replay_timestamps) - 1)
                
            # If market is closed right now, enable replay mode automatically
            if not self.is_market_open_now():
                self.is_replay_mode = True

    def get_current_virtual_time(self) -> datetime:
        """Returns either real current time or the current simulation replay timestamp."""
        if not self.is_replay_mode or not self.replay_timestamps:
            return datetime.now(timezone.utc)
        return self.replay_timestamps[self.replay_index]

    def set_simulation_speed(self, speed: float) -> float:
        """Sets safe simulation speed between 0.5x and 10x (ML pipeline capacity)."""
        clamped = max(0.5, min(10.0, float(speed)))
        self.simulation_speed = clamped
        return self.simulation_speed

    async def advance_replay_tick(self):
        """Advances replay cursor by 1 minute and updates Stock current_price in Neon."""
        if not self.replay_timestamps:
            return
        
        self.replay_index = (self.replay_index + 1) % len(self.replay_timestamps)
        current_ts = self.replay_timestamps[self.replay_index]
        
        async with AsyncSessionLocal() as session:
            # Find ticks at this timestamp
            res = await session.execute(
                select(StockTick).filter(StockTick.timestamp == current_ts)
            )
            ticks = res.scalars().all()
            for tick in ticks:
                stock_res = await session.execute(
                    select(Stock).filter(Stock.symbol == tick.symbol)
                )
                stock = stock_res.scalars().first()
                if stock:
                    mult = self.stock_multipliers.get(tick.symbol, 1.0)
                    stock.current_price = round(tick.close * mult, 2)
                    stock.updated_at = current_ts
            await session.commit()

    async def poll_live_market(self):
        """Polls live 1-minute data from exchange (active during Monday market hours)."""
        async with AsyncSessionLocal() as session:
            stocks = (await session.execute(select(Stock))).scalars().all()
            now_utc = datetime.now(timezone.utc)
            
            for s in stocks:
                try:
                    ticker = yf.Ticker(f"{s.symbol}.NS")
                    fast = ticker.fast_info
                    if fast and fast.last_price:
                        price = float(fast.last_price)
                        s.current_price = price
                        s.updated_at = now_utc
                        
                        # Record live tick
                        new_tick = StockTick(
                            symbol=s.symbol,
                            timestamp=now_utc,
                            price=price,
                            open=price,
                            high=price,
                            low=price,
                            close=price,
                            volume=float(fast.last_volume or 1000.0),
                            vwap=price
                        )
                        session.add(new_tick)
                except Exception as e:
                    # Log silently or handle transient API failure
                    pass
            await session.commit()
            self.last_poll_time = now_utc

    async def start_background_loop(self, interval_seconds: int = 10):
        """Main background worker running continuously with dynamic simulation speed."""
        self.is_running = True
        await self.initialize()
        
        while self.is_running:
            try:
                if self.is_market_open_now() and not self.is_replay_mode:
                    await self.poll_live_market()
                else:
                    await self.advance_replay_tick()
            except Exception as e:
                print(f"[MarketService] Background tick error: {e}")
            
            # Dynamic sleep based on simulation speed (Safe range: 1.0s to 15s)
            dynamic_sleep = max(1.0, float(interval_seconds) / max(0.5, self.simulation_speed))
            await asyncio.sleep(dynamic_sleep)

market_service = MarketStateService()
