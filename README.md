# Groww Smart Watchlist & AI Copilot 📈✨

> **Intelligent Real-Time Equities Watchlist with ML Attention Scoring, Market Replay Simulation, and a Grounded AI Copilot.**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.3+-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/Neon%20DB-PostgreSQL%2016-336791.svg?style=flat&logo=postgresql&logoColor=white)](https://neon.tech)
[![AWS](https://img.shields.io/badge/AWS-EC2%20Deployed-FF9900.svg?style=flat&logo=amazon-aws&logoColor=white)](https://aws.amazon.com)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-3.5%20Flash%20Lite-4285F4.svg?style=flat&logo=google&logoColor=white)](https://ai.google.dev)

---

## 🌟 Overview

When retail traders and investors check their watchlists, they are often bombarded by raw numbers without context. **Groww Smart Watchlist** solves the "What happened while I was away?" problem. 

Instead of showing static tables, the platform uses a **Machine Learning Attention Engine** to rank equities by meaningful deltas, volume anomalies, and breakout signals since the user's last session checkpoint. Combined with an **Intelligent Watchlist AI Copilot** and an **Off-Market Historical Replay Simulator**, users can monitor, query, and analyze their equities 24/7.

---

## 📸 Visual Showcase

### 1. Interactive Dashboard & Smart Ranked Watchlist
![Smart Watchlist Dashboard](<img width="1917" height="862" alt="Screenshot 2026-09-06 182549" src="https://github.com/user-attachments/assets/68a1fc72-4fc3-468f-b8db-4c32402689ce" />
)
*Real-time ranked equities table, ML Attention badges, volume surge multipliers, and interactive PixelCanvas background.*

---

### 2. Grounded Watchlist AI Copilot (Drawer & Cartoon Animations)
![Watchlist AI Copilot](docs/screenshots/watchlist_ai_copilot.png)
*High rate-limit Gemini 3.5 Flash Lite assistant grounded strictly in active watchlist metrics with multi-layer guardrails.*

---

### 3. Financial Japanese Candlestick & Area Interactive Chart
![Interactive Candlestick Chart](docs/screenshots/interactive_chart.png)
*Intraday 1-minute candlestick and area chart with dynamic zoom levels (15m, 25m, 40m, 60m), reference price baseline, and volume bars.*

---

### 4. Off-Market Replay Simulation & Smart Prompts
![Simulation Modal](docs/screenshots/market_simulation_modal.png)
*Every-login market closed prompt enabling virtual trading replay with real historical 1-minute tick data.*

---

### 5. Cloud Architecture & Neon Database
![Neon Database Console](docs/screenshots/neon_db_schema.png)
*Neon Serverless PostgreSQL connection handling users, auth tokens, watchlists, and tick streams.*

---

## 🚀 Key Features

### 1. 🧠 ML Attention & Anomaly Engine
* **Dynamic Attention Score**: Computes price volatility, volume surges, and distance from 20-day moving averages.
* **Breakout & Anomaly Detection**: Highlights stocks experiencing unusual price expansion or >2.0x volume surges.
* **Intelligent Narrative Digest**: Automatically compiles an executive narrative summary explaining why stocks moved during the user's absence.

### 2. 🤖 Grounded Real-Time AI Copilot
* **Multi-Layer Guardrails**:
  * **Layer 1**: Instant regex pre-flight intent scanner rejecting non-financial questions without consuming LLM quota.
  * **Layer 2**: Strict system framing bounding the AI strictly to the user's active watchlist.
  * **Layer 3**: Quantitative context grounding with live prices, percentage deltas, and surge multipliers.
  * **Layer 4**: Local deterministic natural language engine that answers instantly if third-party APIs are unreachable.
* **High Rate-Limit Architecture**: Primary model `gemini-3.5-flash-lite` with fallback to `gemini-3.1-flash-lite`.
* **Cartoonish Pop-Out Drawer**: Smooth bouncy animations with a "Try me! ✨" speech bubble anchored above DEMO CONTROLS.

### 3. 📊 Advanced Candlestick & Volume Charting
* True Japanese Candlesticks with prominent bodies and visible wicks.
* Toggle between **Candlesticks** and **Multi-tone Area Line Chart**.
* **Dynamic Time Horizons**: Instant zoom toggles (15m, 25m, 40m, All 60m) with dedicated lower 25% volume zone.
* Visual **Checkpoint Baseline (CKPT)** showing exact price at the user's last session checkpoint.

### 4. ⚡ 24/7 Market Replay Simulation
* Automatically triggers when live exchanges are closed (weekends or after 3:30 PM IST).
* Streams real historical 1-minute tick data via WebSockets with configurable speed multipliers (1x to 10x).
* **Demo Shock Controls**: Test ML attention and anomaly detection on-demand with `+2.8% Spike` or `-3.2% Dump`.

---

## 🏗 Architecture

```mermaid
graph TD
    Client[React + TypeScript + Vite SPA] <--> |WebSocket /ws/market| Nginx[Nginx Reverse Proxy]
    Client <--> |REST API /api/v1| Nginx
    Nginx <--> |HTTP /ws Proxy| FastAPI[FastAPI Backend Server]
    FastAPI <--> |Asyncpg / SQLAlchemy 2.0| NeonDB[(Neon Serverless PostgreSQL)]
    FastAPI <--> |HTTPX / Google GenAI SDK| Gemini[Gemini 3.5 Flash Lite API]
    FastAPI <--> |Exchange Polling / Replay| MarketService[Market State Engine]
```

---

## 🛠 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Vanilla CSS, Lucide Icons, Custom PixelCanvas |
| **Backend** | FastAPI, Python 3.10+, Uvicorn, Pydantic v2, HTTPX, Scikit-learn, Pandas |
| **Database** | Neon Serverless PostgreSQL, SQLAlchemy 2.0, Asyncpg |
| **AI / LLM** | Google Gemini 3.5 Flash Lite (`google-genai`), Custom NLG Fallback Engine |
| **DevOps & Cloud** | AWS EC2 (`c7i-flex.large`), Ubuntu 24.04 LTS, Systemd, Nginx |

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```ini
# Google Gemini API
GEMINI_API_KEY="your-gemini-api-key"

# Neon PostgreSQL Database
DATABASE_URL="postgresql://user:password@ep-xyz.aws.neon.tech/neondb?sslmode=require"
DATABASE_URL_POOLED="postgresql://user:password@ep-xyz-pooler.aws.neon.tech/neondb?sslmode=require"

# JWT Auth Secret
SECRET_KEY="your-cryptographically-secure-random-secret-key"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

---

## 💻 Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/divyanandini2211/Code-by-Groww.git
cd Code-by-Groww
```

### 2. Backend Setup
```bash
cd backend
python -m venv .venv

# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## ☁️ Production Deployment (AWS EC2)

The application is deployed on AWS EC2 behind an Nginx reverse proxy.

### Systemd Backend Service (`/etc/systemd/system/groww-backend.service`)
```ini
[Unit]
Description=Groww Smart Watchlist FastAPI Backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/app/backend
EnvironmentFile=/home/ubuntu/app/.env
ExecStart=/home/ubuntu/app/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Nginx Reverse Proxy (`/etc/nginx/sites-available/groww`)
```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80 default_server;
    server_name _;

    root /home/ubuntu/app/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

---

## 🔒 Security Architecture

* **SQL Injection**: 100% parameterized queries via SQLAlchemy 2.0 and `asyncpg` with zero raw string interpolation.
* **Authentication**: PBKDF2 HMAC-SHA256 password hashing with 100,000 iterations and 16-byte random salts.
* **Timing Attack Prevention**: `secrets.compare_digest` for secure password matching.
* **Tenant Isolation**: Database queries strictly filter resources by verified `user_id` from the Bearer token.
* **XSS Defense**: Fully escaped React JSX bindings with zero `dangerouslySetInnerHTML`.
* **AI Safety**: Multi-layer prompt injection defense and numerical context grounding.

---

## 👥 Contributors
Developed for the **Groww Coding Hackathon**.
* **Divya Nandini R** ([@divyanandini2211](https://github.com/divyanandini2211))
