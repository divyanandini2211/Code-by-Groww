# Groww CODE 2026: Architecture Decisions & Engineering Trade-offs Log
*Author: DIVYA NANDINI R*

This document tracks every critical architectural decision, engineering trade-off, and domain justification made during the design and implementation of the Smart Market Watchlist. This serves as the primary reference for defending the system design during the technical presentation at Groww.

---

## 1. Market Data Universe: Tiered Ingestion vs. Full-Market Polling

### The Dilemma
Should we ingest all ~2,000+ listed NSE & BSE tickers, or restrict the pre-computed universe?

### Decision: Tiered Hybrid Architecture
- **Tier 1 (High-Liquidity Core: 30-50 Bluechips across NSE & BSE)**:
  - Continuously polled and pre-persisted with 1-minute historical intraday candles in Neon PostgreSQL.
  - Multi-variate ML anomaly scoring and attention ranking computed in real-time ($<10\text{ms}$ query latency).
- **Tier 2 (Long-Tail Equities)**:
  - On-demand lazy hydration via search endpoint (`GET /api/v1/market/search?query=XYZ`).

### Engineering Rationale & Trade-offs
1. **Database I/O & Cloud Storage Budget**:
   - $2,000 \text{ stocks} \times 361 \text{ candles/day} \times 5 \text{ days} \approx 3.6 \text{ million rows}$. Ingestion at this volume exceeds free-tier limits (Neon 500 MB) and introduces indexing bloat.
   - Tier 1 ($~30\text{--}50$ stocks $\approx 18,000$ rows) guarantees sub-millisecond B-tree index lookups on `(symbol, timestamp)`.
2. **Upstream Rate-Limiting Resilience**:
   - Polling 2,000 stocks at 1-minute intervals triggers upstream HTTP `429 Too Many Requests` bans. Tier 1 polling runs well within safe rate thresholds.
3. **Product Intent**:
   - Retail investors track high-volume, liquid assets in daily watchlists. Real alpha and attention anomalies occur in stocks with active institutional participation.

---

## 2. Weekend & After-Hours Market Handling: Stateful Session Replay

### The Dilemma
Real Indian equity markets operate 9:15 AM to 3:30 PM IST on weekdays. The hackathon evaluation occurs over the weekend and on Monday evening. An application relying solely on live feeds will either display a static flatline or crash outside market hours.

### Decision: Dual-Engine Market Clock
- **State Aware**: Built-in IST market schedule detector (`09:15 <= time <= 15:30` on Mon–Fri).
- **Live Mode (Market Open)**: Background worker polls live 1-minute ticks from the exchange, commits to Neon DB, and recalculates streaming metrics.
- **Replay Mode (Market Closed)**: The engine detects market closure, switches to **Session Replay Mode**, and replays the most recent complete trading session (e.g. Friday intraday sequence) minute-by-minute with full ML anomaly evaluation.
- **Judge Time-Travel API**: Interactive controls (`/api/v1/market/replay/seek`) enable judges to simulate time passing and step away for 30 minutes, 1 hour, or 4 hours to immediately test the change detection engine.

---

## 3. The "Meaningful Change" Intelligence Formula

### The Dilemma
Standard watchlists only show 24-hour percentage change ($P_{\text{current}} - P_{\text{prev\_close}}$). A user who checks at 1:00 PM and returns at 1:30 PM doesn't care about what happened at 9:30 AM; they care about what changed **during their 30 minutes away**.

### Decision: Multi-Variate Attention Scoring Engine ($A_s$)
We calculate a composite score ($0.0 \to 1.0$) per ticker:
$$A_s = w_1 \cdot \text{Price Velocity} + w_2 \cdot \text{Volume Surge Ratio} + w_3 \cdot \text{Breakout Proximity}$$

- **Price Velocity**: Delta relative to the user's exact session checkpoint (`last_visited_at`), not day open.
- **Volume Surge Ratio**: $V_{\text{1m}} / \mu_{\text{20m rolling avg}}$ (flags institutional volume accumulation).
- **Breakout Proximity**: Proximity to 52-week High/Low triggers breakout alerts.
- **AI Executive Narrative**: Synthesizes the top-ranked anomalies into a clean 2-sentence natural language digest using Google Gemini (with deterministic rule-based NLG fallback for zero-downtime resilience).

---

## 4. Cross-Device State Persistence: Server-Side Checkpoints

### The Dilemma
LocalStorage only tracks state on a single browser. If a user logs in on a mobile phone and later on a desktop, local checkpoints desync.

### Decision: Remote Session Checkpoints in Neon DB
- The user's last acknowledged state timestamp (`last_visited_at`) is persisted in the `user_sessions` table in Neon PostgreSQL.
- Any client querying `GET /api/v1/watchlists/{id}/intelligence` receives a consistent, server-authoritative delta regardless of which device or browser they use.
