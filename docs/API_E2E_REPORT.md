# Groww Smart Market Watchlist - API End-to-End Capabilities & Test Report
*Generated on: 2026-09-05 | Author: DIVYA NANDINI R*

This document provides a complete showcase of the backend capabilities implemented and verified against our live FastAPI server and Neon PostgreSQL database.

---

## System Capabilities Overview

1. **Intraday Market State Detection**: Automatically detects whether NSE/BSE markets are OPEN (Mon-Fri 09:15-15:30 IST) or CLOSED.
2. **Session Replay Engine**: Replays 1-minute historical intraday candles during after-hours/weekends with live tick progression.
3. **Multi-Variate ML Attention Scoring**: Evaluates Price Velocity, Volume Surge Ratio, and Proximity to 52-Week High/Low.
4. **"What Changed Since You Left" Intelligence**: Compares current market state against the user's remote session checkpoint.
5. **AI Narrative Digest (Google Gemini + NLG Fallback)**: Synthesizes top-ranked market anomalies into an executive summary.
6. **Watchlist & Stock Portfolio Management**: Full CRUD for creating custom watchlists, adding/removing tickers, and tracking quotes.

---

## End-to-End Endpoint Verification (Input & Output Logs)

### 1. Root Health Check
- **Endpoint**: `GET /`
- **Purpose**: Verifies server responsiveness and points to API documentation.
- **Status**: `200 OK`
- **Output**:
```json
{
  "project": "Groww Smart Market Watchlist API",
  "status": "healthy",
  "docs_url": "/docs"
}
```

---

### 2. Market Status & Session Mode
- **Endpoint**: `GET /api/v1/market/status`
- **Purpose**: Checks market state, current IST time, and virtual simulation timestamp.
- **Status**: `200 OK`
- **Output**:
```json
{
  "status": "CLOSED",
  "current_time_ist": "2026-09-05 15:28:02 IST",
  "virtual_market_time": "2026-09-04 10:39:00 IST",
  "is_replay_mode": true,
  "total_intraday_candles": 361,
  "replay_cursor_index":  84,
  "message": "Market is CLOSED. Replaying latest Friday session sequence."
}
```

---

### 3. All Market Stocks & Quotes
- **Endpoint**: `GET /api/v1/market/stocks`
- **Purpose**: Returns quotes for the expanded 29 high-liquidity stocks across NSE & BSE.
- **Status**: `200 OK`
- **Sample Output (4 stocks of 29)**:
```json
[
  {
    "symbol": "AXISBANK",
    "name": "Axis Bank",
    "sector": "Banking",
    "exchange": "NSE",
    "current_price": 1046.2,
    "previous_close": 1032.5,
    "pct_change": 1.33,
    "fifty_two_week_high": 1339.65,
    "fifty_two_week_low": 991.0
  },
  {
    "symbol": "BAJAJ-AUTO",
    "name": "Bajaj Auto",
    "sector": "Auto",
    "exchange": "NSE",
    "current_price": 9850.0,
    "previous_close": 9811.55,
    "pct_change": 0.39,
    "fifty_two_week_high": 12774.0,
    "fifty_two_week_low": 8303.85
  },
  {
    "symbol": "BAJFINANCE",
    "name": "Bajaj Finance",
    "sector": "Financials",
    "exchange": "NSE",
    "current_price": 1027.65,
    "previous_close": 1020.15,
    "pct_change": 0.74,
    "fifty_two_week_high": 1109.95,
    "fifty_two_week_low": 819.0
  },
  {
    "symbol": "BHARTIARTL",
    "name": "Bharti Airtel",
    "sector": "Telecom",
    "exchange": "NSE",
    "current_price": 1860.5,
    "previous_close": 1840.0,
    "pct_change": 1.11,
    "fifty_two_week_high": 1969.5,
    "fifty_two_week_low": 1450.0
  }
]
```

---

### 4. Stock Candle History (Time Series)
- **Endpoint**: `GET /api/v1/market/stocks/RELIANCE/history?limit=5`
- **Purpose**: Returns 1-minute historical candles (OHLCV) for charting and trend analysis.
- **Status**: `200 OK`
- **Output**:
```json
[
  { "timestamp": "10:35", "open": 1324.9, "high": 1325.8, "low": 1324.2, "close": 1325.0, "volume": 3215.0 },
  { "timestamp": "10:36", "open": 1325.0, "high": 1326.0, "low": 1324.8, "close": 1325.5, "volume": 2980.0 },
  { "timestamp": "10:37", "open": 1325.5, "high": 1325.8, "low": 1324.9, "close": 1325.1, "volume": 2100.0 },
  { "timestamp": "10:38", "open": 1325.1, "high": 1326.2, "low": 1325.0, "close": 1326.0, "volume": 4120.0 },
  { "timestamp": "10:39", "open": 1326.0, "high": 1326.5, "low": 1325.8, "close": 1326.2, "volume": 3450.0 }
]
```

---

### 5. Create a Custom Watchlist
- **Endpoint**: `POST /api/v1/watchlists/`
- **Input**:
```json
{
  "name": "My Tech Alpha",
  "description": "High momentum tech & financial stocks"
}
```
- **Status**: `200 OK`
- **Output**:
```json
{
  "id": "e8e1694f-4d39-4467-b895-3bc29aa246a4",
  "name": "My Tech Alpha",
  "description": "High momentum tech & financial stocks"
}
```

---

### 6. Add Stocks to Custom Watchlist
- **Endpoint**: `POST /api/v1/watchlists/{watchlist_id}/stocks`
- **Input 1**: `{"symbol": "TCS"}` $\to$ Response: `{"message": "Added TCS to watchlist"}`
- **Input 2**: `{"symbol": "PAYTM"}` $\to$ Response: `{"message": "Added PAYTM to watchlist"}`

---

### 7. User Checkpoint ("Last Seen" Timestamp)
- **Endpoint**: `POST /api/v1/watchlists/checkpoint?user_id=divya_test`
- **Purpose**: Marks the user's current session in Neon DB so when they return later, the system knows what has changed since this instant.
- **Status**: `200 OK`
- **Output**:
```json
{
  "status": "checkpoint_saved",
  "last_visited_at": "2026-09-04T05:09:00+00:00"
}
```

---

### 8. Core Intelligence & "What Changed" Analysis
- **Endpoint**: `GET /api/v1/watchlists/{watchlist_id}/intelligence?since_minutes_ago=60`
- **Purpose**: Computes multi-variate Attention Score, delta since last seen, and generates an executive AI summary.
- **Status**: `200 OK`
- **Executive AI Narrative Digest**:
  > *"During your 60 minutes absence, COALINDIA saw the highest activity, moving up 0.77% with 1.09x volume. Overall, 0 stocks in your watchlist showed notable shifts."*
- **Sample Ranked Stock Breakdown**:
```json
{
  "symbol": "COALINDIA",
  "name": "Coal India",
  "sector": "Energy",
  "current_price": 388.95,
  "price_at_last_seen": 386.0,
  "pct_change_since_seen": 0.77,
  "volume_surge_ratio": 1.09,
  "attention_score": 0.23,
  "signals": []
},
{
  "symbol": "TATASTEEL",
  "name": "Tata Steel",
  "sector": "Metals",
  "current_price": 147.85,
  "price_at_last_seen": 148.5,
  "pct_change_since_seen": -0.44,
  "volume_surge_ratio": 0.95,
  "attention_score": 0.169,
  "signals": []
},
{
  "symbol": "PAYTM",
  "name": "One97 Communications",
  "sector": "Fintech",
  "current_price": 745.2,
  "price_at_last_seen": 748.1,
  "pct_change_since_seen": -0.39,
  "volume_surge_ratio": 0.88,
  "attention_score": 0.155,
  "signals": []
}
```

---

### 9. Interactive Replay Time-Travel Control
- **Endpoint**: `POST /api/v1/market/replay/seek?index=150`
- **Purpose**: Allows judges or users to fast-forward the market by minutes/hours during demonstrations.
- **Status**: `200 OK`
- **Output**:
```json
{
  "current_index": 150,
  "timestamp": "11:45:00 IST"
}
```
