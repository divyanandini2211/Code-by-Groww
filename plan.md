# Groww CODE 2026: Smart Market Watchlist - Architecture & Engineering Plan

## 1. Problem Understanding & Core Vision

Standard watchlists simply present a passive table of tickers, LTP (Last Traded Price), and % change for the day. In real trading/investing scenarios, users check periodically (e.g. morning open, lunch break, market close, or after days). 

### The Core Question
> *"What has **meaningfully changed** since I last checked, and what deserves my attention now?"*

To stand out in this challenge, we must excel in **judgement, depth, architecture, resilience, and thoughtful trade-offs**.

---

## 2. Defining "Meaningful Change" (The Intelligence Layer)

Rather than just green/red numbers, meaningful change is multi-dimensional:
1. **Delta Since Last Visit (`Since Last Seen`)**:
   - Compare current snapshot with the user's persisted `last_visited_at` or last acknowledged state snapshot.
   - Surface: Price movement, volume anomaly, or volatility surge specifically *during the time away*.
2. **Breakouts & Threshold Crossings**:
   - 52-week High / Low proximity or breakthrough.
   - Key support/resistance or user-defined triggers / dynamic ATR boundaries.
3. **Unusual Volume / Activity Multipliers**:
   - Volume exceeding $2\times$ or $3\times$ the 20-day average volume (institutional interest/unusual participation).
4. **Attention Score & Ranking (Priority Engine)**:
   - Rank watchlist items not just alphabetically or by % change, but by an **Attention Score** ($A_s$):
     $$A_s = w_1 \cdot |\Delta P_{\text{since\_visit}}| + w_2 \cdot \frac{V_{\text{actual}}}{V_{\text{avg}}} + w_3 \cdot \mathbb{I}_{\text{event/breakout}} + w_4 \cdot \text{News/Sentiment}$$
5. **Digest Summary ("What you missed")**:
   - Natural language bullet points or executive summary cards (e.g., *"2 stocks reached 52W highs, 1 experienced high-volume dump, 3 traded flat"*).

---

## 3. High-Level Architecture

```
                 +-----------------------------------------------+
                 |              React + Vite Frontend            |
                 |  (Groww Design System: Clean, Dark/Light mode,|
                 |   Attention Feed, Time-travel / Diff slider)   |
                 +-----------------------+-----------------------+
                                         |
                                WebSocket / REST
                                         |
                 +-----------------------v-----------------------+
                 |              FastAPI / Node Backend           |
                 +-----------------------+-----------------------+
                     |                   |                   |
            +--------v--------+ +--------v--------+ +--------v--------+
            |  Watchlist &    | | Market Engine & | | Change Detection|
            |  User Session   | | Feed Simulator/ | | & Attention     |
            |  Service        | | Provider        | | Scoring Engine  |
            +--------+--------+ +--------+--------+ +--------+--------+
                     |                   |                   |
            +--------v-------------------v-------------------v--------+
            |                  SQLite / PostgreSQL                    |
            |  (User watchlists, snapshot checkpoints, audit trail)  |
            +---------------------------------------------------------+
```

---

## 4. Engineering Trade-offs & Resilience Strategies

| Challenge | Trade-off / Strategy | Rationale |
| :--- | :--- | :--- |
| **Market Data Ingestion** | Hybrid Live Stream + Periodic Tick Batching | Prevents frontend re-render storms while maintaining real-time responsiveness. |
| **Stale / Conflicting Data** | Heartbeat & Vector Clocks / Timestamps | Explicit UI state indicators: "Stale data (last updated 3m ago)" with graceful degradation. |
| **State Across Devices** | Server-side Session Checkpoints (`UserSnapshot`) | If a user opens on phone then web, the diff is calculated against their global last-active checkpoint or per-device cursor. |
| **Scalability** | Pre-computed Attention Metrics + Memory Cache (LRU) | Calculating attention scores on the fly for thousands of tickers is cached and event-driven. |

---

## 5. Project Directory Structure

```text
Code-by-Groww/
├── docs/
│   ├── ARCHITECTURE.md
│   └── API_SPEC.md
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── watchlist.py
│   │   │       ├── market.py
│   │   │       └── intelligence.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   ├── models/
│   │   │   ├── stock.py
│   │   │   ├── watchlist.py
│   │   │   └── snapshot.py
│   │   ├── services/
│   │   │   ├── attention_engine.py      # Computes "meaningful change" score
│   │   │   ├── market_feed.py           # Real-time / mock high-frequency simulator
│   │   │   └── state_manager.py         # Session persistence & diffing
│   │   └── main.py
│   ├── requirements.txt
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── common/                  # Buttons, Badges, Modals
│   │   │   ├── watchlist/               # Smart Watchlist table, cards
│   │   │   ├── attention-feed/          # "What Changed Since You Left" cards
│   │   │   └── market-ticker/           # Live status & breadcrumbs
│   │   ├── hooks/
│   │   │   ├── useWatchlist.ts
│   │   │   └── useMarketStream.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.ts
│   └── README.md
├── plan.md                              # This high-level roadmap and plan
└── README.md                            # Main project overview & pitch document
```

---

## 6. Implementation Phases

1. **Phase 1: Project Scaffolding & Directory Setup**
   - Create directories and initial configuration templates.
2. **Phase 2: Backend Data & Intelligence Engine**
   - Define data schemas (Stock, Watchlist, Snapshot/Visit checkpoint).
   - Implement the Market Feed & Attention Scoring Algorithm.
3. **Phase 3: Groww-Inspired High-Aesthetic Frontend**
   - Clean dark/light theme, modern typography (Inter/Outfit).
   - Smart Watchlist view with "Since Last Checked" diff toggle.
   - Attention cards highlighting anomalies and actionable insights.
4. **Phase 4: Resilience & Edge-case Handling**
   - Stale data simulator / network drop resilience.
   - Session checkpointing across simulated returns.
5. **Phase 5: Documentation & Pitch Readiness**
   - Architecture diagram, demo scripts, trade-off rationale writeup.
