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

# Expanded Tier 1 Universe: 30 High-Volume Liquid Equities across NSE & BSE
EXPANDED_STOCKS = [
    # --- Top Banking & Financials ---
    {"symbol": "RELIANCE", "yf_symbol": "RELIANCE.NS", "name": "Reliance Industries", "sector": "Energy", "exchange": "NSE"},
    {"symbol": "HDFCBANK", "yf_symbol": "HDFCBANK.NS", "name": "HDFC Bank", "sector": "Banking", "exchange": "NSE"},
    {"symbol": "ICICIBANK", "yf_symbol": "ICICIBANK.NS", "name": "ICICI Bank", "sector": "Banking", "exchange": "NSE"},
    {"symbol": "SBIN", "yf_symbol": "SBIN.NS", "name": "State Bank of India", "sector": "Banking", "exchange": "NSE"},
    {"symbol": "KOTAKBANK", "yf_symbol": "KOTAKBANK.NS", "name": "Kotak Mahindra Bank", "sector": "Banking", "exchange": "NSE"},
    {"symbol": "AXISBANK", "yf_symbol": "AXISBANK.NS", "name": "Axis Bank", "sector": "Banking", "exchange": "NSE"},
    {"symbol": "BAJFINANCE", "yf_symbol": "BAJFINANCE.NS", "name": "Bajaj Finance", "sector": "Financials", "exchange": "NSE"},
    
    # --- Technology & New-Age Tech (NSE & BSE) ---
    {"symbol": "TCS", "yf_symbol": "TCS.NS", "name": "Tata Consultancy Services", "sector": "IT", "exchange": "NSE"},
    {"symbol": "INFY", "yf_symbol": "INFY.NS", "name": "Infosys Ltd", "sector": "IT", "exchange": "NSE"},
    {"symbol": "WIPRO", "yf_symbol": "WIPRO.NS", "name": "Wipro Ltd", "sector": "IT", "exchange": "NSE"},
    {"symbol": "HCLTECH", "yf_symbol": "HCLTECH.NS", "name": "HCL Technologies", "sector": "IT", "exchange": "NSE"},
    {"symbol": "ZOMATO", "yf_symbol": "ZOMATO.NS", "name": "Zomato Ltd", "sector": "Internet Tech", "exchange": "NSE"},
    {"symbol": "PAYTM", "yf_symbol": "PAYTM.NS", "name": "One97 Communications", "sector": "Fintech", "exchange": "NSE"},
    {"symbol": "BSE", "yf_symbol": "BSE.NS", "name": "BSE Limited", "sector": "Financial Infrastructure", "exchange": "NSE"},
    
    # --- Auto & Mobility ---
    {"symbol": "MARUTI", "yf_symbol": "MARUTI.NS", "name": "Maruti Suzuki", "sector": "Auto", "exchange": "NSE"},
    {"symbol": "M&M", "yf_symbol": "M&M.NS", "name": "Mahindra & Mahindra", "sector": "Auto", "exchange": "NSE"},
    {"symbol": "BAJAJ-AUTO", "yf_symbol": "BAJAJ-AUTO.NS", "name": "Bajaj Auto", "sector": "Auto", "exchange": "NSE"},
    
    # --- FMCG & Consumption ---
    {"symbol": "ITC", "yf_symbol": "ITC.NS", "name": "ITC Ltd", "sector": "FMCG", "exchange": "NSE"},
    {"symbol": "HINDUNILVR", "yf_symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever", "sector": "FMCG", "exchange": "NSE"},
    {"symbol": "NESTLEIND", "yf_symbol": "NESTLEIND.NS", "name": "Nestle India", "sector": "FMCG", "exchange": "NSE"},
    {"symbol": "TITAN", "yf_symbol": "TITAN.NS", "name": "Titan Company", "sector": "Consumer", "exchange": "NSE"},
    
    # --- Metals, Energy & Infra ---
    {"symbol": "BHARTIARTL", "yf_symbol": "BHARTIARTL.NS", "name": "Bharti Airtel", "sector": "Telecom", "exchange": "NSE"},
    {"symbol": "LT", "yf_symbol": "LT.NS", "name": "Larsen & Toubro", "sector": "Infrastructure", "exchange": "NSE"},
    {"symbol": "TATASTEEL", "yf_symbol": "TATASTEEL.NS", "name": "Tata Steel", "sector": "Metals", "exchange": "NSE"},
    {"symbol": "JSWSTEEL", "yf_symbol": "JSWSTEEL.NS", "name": "JSW Steel", "sector": "Metals", "exchange": "NSE"},
    {"symbol": "COALINDIA", "yf_symbol": "COALINDIA.NS", "name": "Coal India", "sector": "Energy", "exchange": "NSE"},
    {"symbol": "ONGC", "yf_symbol": "ONGC.NS", "name": "Oil & Natural Gas Corp", "sector": "Energy", "exchange": "NSE"},
    {"symbol": "POWERGRID", "yf_symbol": "POWERGRID.NS", "name": "Power Grid Corp", "sector": "Energy", "exchange": "NSE"},
    {"symbol": "NTPC", "yf_symbol": "NTPC.NS", "name": "NTPC Ltd", "sector": "Energy", "exchange": "NSE"},
    {"symbol": "SUNPHARMA", "yf_symbol": "SUNPHARMA.NS", "name": "Sun Pharma", "sector": "Healthcare", "exchange": "NSE"}
]

async def seed_expanded_universe():
    print(f"=== Seeding Expanded Universe ({len(EXPANDED_STOCKS)} Stocks) into Neon DB ===")
    
    async with AsyncSessionLocal() as session:
        # Fetch or create Groww Flagship Watchlist
        res = await session.execute(select(Watchlist).filter_by(name="Groww Flagship 30"))
        watchlist = res.scalars().first()
        if not watchlist:
            watchlist = Watchlist(name="Groww Flagship 30", description="Top 30 NSE & BSE High-Liquidity Equities")
            session.add(watchlist)
            await session.commit()
            await session.refresh(watchlist)
            print(f"[+] Created Watchlist: {watchlist.name} (ID: {watchlist.id})")
        
        for item in EXPANDED_STOCKS:
            sym = item["symbol"]
            yf_sym = item["yf_symbol"]
            
            # Check if ticks already exist for this symbol
            existing_tick_count = (await session.execute(
                select(StockTick.id).filter(StockTick.symbol == sym).limit(1)
            )).first()
            
            if existing_tick_count:
                print(f"[=] {sym} already seeded, skipping re-fetch.")
                continue
            
            print(f"[+] Fetching Friday candles for {sym} ({yf_sym})...")
            try:
                ticker = yf.Ticker(yf_sym)
                df = ticker.history(period="5d", interval="1m")
                if df.empty:
                    print(f"[-] No data returned for {sym}")
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
                        exchange=item["exchange"],
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
                
                # Add to watchlist
                w_item = (await session.execute(
                    select(WatchlistItem).filter_by(watchlist_id=watchlist.id, symbol=sym)
                )).scalars().first()
                if not w_item:
                    session.add(WatchlistItem(watchlist_id=watchlist.id, symbol=sym))
                    await session.commit()
                
                # Insert 1-minute Ticks
                for ts, row in friday_df.iterrows():
                    session.add(StockTick(
                        symbol=sym,
                        timestamp=ts.astimezone(timezone.utc),
                        price=float(row["Close"]),
                        open=float(row["Open"]),
                        high=float(row["High"]),
                        low=float(row["Low"]),
                        close=float(row["Close"]),
                        volume=float(row["Volume"]),
                        vwap=float((row["High"] + row["Low"] + row["Close"]) / 3.0)
                    ))
                await session.commit()
                print(f"[✓] {sym}: Persisted {len(friday_df)} candles to Neon DB.")
                
                # Short throttle to be gentle with Yahoo Finance
                await asyncio.sleep(0.3)
            except Exception as e:
                print(f"[-] Error fetching {sym}: {e}")

    print("\n=== Expanded Universe Seeding Finished! ===")

if __name__ == "__main__":
    asyncio.run(seed_expanded_universe())
