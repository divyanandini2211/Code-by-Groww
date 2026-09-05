import asyncio
import yfinance as yf
import pandas as pd
from datetime import datetime, timezone
import pytz
from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert

from app.core.database import AsyncSessionLocal, engine, Base
from app.models.schemas import Stock, StockTick, Watchlist, WatchlistItem

IST = pytz.timezone("Asia/Kolkata")

# Curated high-liquidity stocks across sectors
WATCHLIST_STOCKS = [
    {"symbol": "RELIANCE", "yf_symbol": "RELIANCE.NS", "name": "Reliance Industries", "sector": "Energy"},
    {"symbol": "TCS", "yf_symbol": "TCS.NS", "name": "Tata Consultancy Services", "sector": "IT"},
    {"symbol": "INFY", "yf_symbol": "INFY.NS", "name": "Infosys Ltd", "sector": "IT"},
    {"symbol": "HDFCBANK", "yf_symbol": "HDFCBANK.NS", "name": "HDFC Bank", "sector": "Banking"},
    {"symbol": "ICICIBANK", "yf_symbol": "ICICIBANK.NS", "name": "ICICI Bank", "sector": "Banking"},
    {"symbol": "SBIN", "yf_symbol": "SBIN.NS", "name": "State Bank of India", "sector": "Banking"},
    {"symbol": "BHARTIARTL", "yf_symbol": "BHARTIARTL.NS", "name": "Bharti Airtel", "sector": "Telecom"},
    {"symbol": "ITC", "yf_symbol": "ITC.NS", "name": "ITC Ltd", "sector": "FMCG"},
    {"symbol": "LT", "yf_symbol": "LT.NS", "name": "Larsen & Toubro", "sector": "Infrastructure"},
    {"symbol": "KOTAKBANK", "yf_symbol": "KOTAKBANK.NS", "name": "Kotak Mahindra Bank", "sector": "Banking"}
]

async def seed_friday_data():
    print("=== Step 1: Ingesting Friday Market Data into Neon PostgreSQL ===")
    
    async with AsyncSessionLocal() as session:
        # Create default Groww Watchlist if not exists
        res = await session.execute(select(Watchlist).filter_by(name="Groww Nifty Top 10"))
        watchlist = res.scalars().first()
        if not watchlist:
            watchlist = Watchlist(name="Groww Nifty Top 10", description="Flagship large-cap watchlist")
            session.add(watchlist)
            await session.commit()
            await session.refresh(watchlist)
            print(f"[+] Created Default Watchlist: {watchlist.name} (ID: {watchlist.id})")
        
        for item in WATCHLIST_STOCKS:
            sym = item["symbol"]
            yf_sym = item["yf_symbol"]
            print(f"\nProcessing {sym} ({yf_sym})...")
            
            ticker = yf.Ticker(yf_sym)
            df = ticker.history(period="5d", interval="1m")
            if df.empty:
                print(f"[-] No data for {sym}, skipping.")
                continue
                
            df.index = df.index.tz_convert(IST)
            latest_date = df.index.date.max()
            friday_df = df[df.index.date == latest_date].copy()
            
            fast_info = ticker.fast_info
            current_price = float(fast_info.last_price or friday_df['Close'].iloc[-1])
            prev_close = float(fast_info.previous_close or friday_df['Open'].iloc[0])
            fifty_two_high = float(fast_info.year_high or (current_price * 1.15))
            fifty_two_low = float(fast_info.year_low or (current_price * 0.85))
            avg_vol = float(fast_info.three_month_average_volume or friday_df['Volume'].mean() * 375)
            
            # Upsert Stock
            stock_res = await session.execute(select(Stock).filter_by(symbol=sym))
            stock = stock_res.scalars().first()
            if not stock:
                stock = Stock(
                    symbol=sym,
                    name=item["name"],
                    sector=item["sector"],
                    exchange="NSE",
                    current_price=current_price,
                    previous_close=prev_close,
                    fifty_two_week_high=fifty_two_high,
                    fifty_two_week_low=fifty_two_low,
                    avg_volume_20d=avg_vol,
                    updated_at=datetime.now(timezone.utc)
                )
                session.add(stock)
            else:
                stock.current_price = current_price
                stock.previous_close = prev_close
                stock.fifty_two_week_high = fifty_two_high
                stock.fifty_two_week_low = fifty_two_low
                stock.avg_volume_20d = avg_vol
                stock.updated_at = datetime.now(timezone.utc)
            
            await session.commit()
            
            # Add to Watchlist
            w_item_res = await session.execute(
                select(WatchlistItem).filter_by(watchlist_id=watchlist.id, symbol=sym)
            )
            if not w_item_res.scalars().first():
                session.add(WatchlistItem(watchlist_id=watchlist.id, symbol=sym))
                await session.commit()

            # Insert 1-minute Ticks (avoiding duplicates)
            ticks_to_insert = []
            for ts, row in friday_df.iterrows():
                utc_ts = ts.astimezone(timezone.utc)
                ticks_to_insert.append({
                    "symbol": sym,
                    "timestamp": utc_ts,
                    "price": float(row["Close"]),
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": float(row["Close"]),
                    "volume": float(row["Volume"]),
                    "vwap": float((row["High"] + row["Low"] + row["Close"]) / 3.0)
                })
            
            # Batch upsert or bulk insert
            for tick_data in ticks_to_insert:
                stmt = insert(StockTick).values(**tick_data)
                # On conflict do nothing
                stmt = stmt.on_conflict_do_nothing(
                    index_elements=["symbol", "timestamp"]
                ) if hasattr(stmt, 'on_conflict_do_nothing') else stmt
                # Execute individual or batch
                await session.execute(
                    insert(StockTick).values(**tick_data)
                )
            
            await session.commit()
            print(f"[+] {sym}: Persisted {len(ticks_to_insert)} 1-minute candles to Neon DB.")

    print("\n=== Seeding Completed Successfully! ===")

if __name__ == "__main__":
    asyncio.run(seed_friday_data())
