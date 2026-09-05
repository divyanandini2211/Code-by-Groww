import yfinance as yf
import pandas as pd
from datetime import datetime
import pytz

IST = pytz.timezone("Asia/Kolkata")

SYMBOLS = [
    "RELIANCE.NS",
    "TCS.NS",
    "INFY.NS",
    "HDFCBANK.NS",
    "TATAMOTORS.NS",
    "ICICIBANK.NS",
    "SBIN.NS",
    "ITC.NS",
    "BHARTIARTL.NS",
    "LT.NS"
]

def test_fetch():
    print(f"Fetching Friday intraday 1-minute candles for {len(SYMBOLS)} stocks...")
    for sym in SYMBOLS:
        ticker = yf.Ticker(sym)
        # 1m data for last 5 days
        df = ticker.history(period="5d", interval="1m")
        if df.empty:
            print(f"[-] {sym}: No 1m data returned.")
            continue
        
        # Convert index to IST
        df.index = df.index.tz_convert(IST)
        
        # Filter to the most recent trading date (Friday)
        latest_date = df.index.date.max()
        friday_df = df[df.index.date == latest_date]
        
        info = ticker.fast_info
        print(f"[+] {sym:15} | Latest Date: {latest_date} | Candles: {len(friday_df)} | Last Price: {info.last_price:.2f}")

if __name__ == "__main__":
    test_fetch()
