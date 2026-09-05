import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from datetime import datetime, timezone
import json
import httpx
from app.core.config import settings

class MLEngine:
    def __init__(self):
        # Isolation Forest instance for multi-variate market anomaly detection
        self.clf = IsolationForest(
            n_estimators=100,
            contamination=0.08, # Top 8% of extreme movements flagged as significant
            random_state=42
        )

    def calculate_attention_score(
        self,
        current_price: float,
        reference_price: float,
        current_volume: float,
        avg_volume_1m: float,
        fifty_two_high: float,
        fifty_two_low: float
    ) -> dict:
        """
        Computes composite Attention Score (0.0 to 1.0) and detects regime triggers.
        """
        # 1. Delta since reference (e.g. last visit)
        pct_change = ((current_price - reference_price) / (reference_price or 1.0)) * 100.0
        abs_pct = abs(pct_change)

        # 2. Volume surge factor
        volume_ratio = current_volume / (avg_volume_1m if avg_volume_1m > 0 else 1.0)

        # 3. Proximity to 52-week High/Low
        dist_to_high_pct = abs((fifty_two_high - current_price) / (fifty_two_high or 1.0)) * 100.0
        dist_to_low_pct = abs((current_price - fifty_two_low) / (fifty_two_low or 1.0)) * 100.0

        # Heuristic scoring components normalized
        p_score = min(abs_pct / 3.0, 1.0) * 0.40 # 40% weight on price velocity
        v_score = min(volume_ratio / 3.0, 1.0) * 0.35 # 35% weight on volume surge
        
        breakout_bonus = 0.0
        signals = []

        if dist_to_high_pct < 0.75:
            breakout_bonus += 0.25
            signals.append("NEAR_52W_HIGH")
        elif dist_to_low_pct < 0.75:
            breakout_bonus += 0.25
            signals.append("NEAR_52W_LOW")

        if volume_ratio >= 2.0:
            signals.append("VOLUME_SURGE")
        
        if abs_pct >= 1.5:
            signals.append("MOMENTUM_EXPANSION" if pct_change > 0 else "SHARP_PULLBACK")

        raw_score = p_score + v_score + breakout_bonus
        normalized_score = min(round(raw_score, 3), 1.0)

        return {
            "attention_score": normalized_score,
            "pct_change_since_seen": round(pct_change, 2),
            "volume_surge_ratio": round(volume_ratio, 2),
            "signals": signals
        }

    async def generate_ai_digest(self, insights_list: list, away_duration_str: str) -> str:
        """
        Uses Google Gemini (via GEMINI_API_KEY) with fallback to generate a clean,
        human-readable executive summary of what changed while the user was away.
        """
        top_movers = sorted(insights_list, key=lambda x: x["attention_score"], reverse=True)[:3]
        
        # Prepare context
        summary_bullets = []
        for m in top_movers:
            sig_str = ", ".join(m["signals"]) if m["signals"] else "Normal Variance"
            summary_bullets.append(
                f"- {m['symbol']}: {m['pct_change_since_seen']:+.2f}% change, "
                f"Volume {m['volume_surge_ratio']:.1f}x normal | Signals: {sig_str}"
            )
        bullet_text = "\n".join(summary_bullets)

        # 1. If Gemini API key is available, call Gemini API
        if settings.GEMINI_API_KEY:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
                prompt = f"""You are Groww's Smart Market Watchlist AI.
A user returned to their watchlist after {away_duration_str}.
Here are the top market movements detected:
{bullet_text}

Generate a concise, elegant 2-sentence executive summary telling the user what meaningfully changed and where to direct their attention. Tone: professional, confident, simple."""

                payload = {
                    "contents": [{"parts": [{"text": prompt}]}]
                }
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        ai_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                        return ai_text
            except Exception as e:
                pass # Gracefully fall through to deterministic NLG

        # 2. High quality deterministic NLG fallback
        if not top_movers:
            return f"Markets have remained quiet during your {away_duration_str} absence with minimal volatility."
        
        leader = top_movers[0]
        direction = "up" if leader["pct_change_since_seen"] >= 0 else "down"
        return (
            f"During your {away_duration_str} absence, {leader['symbol']} saw the highest activity, "
            f"moving {direction} {abs(leader['pct_change_since_seen'])}% with {leader['volume_surge_ratio']}x volume. "
            f"Overall, {len([x for x in insights_list if x['attention_score'] >= 0.5])} stocks in your watchlist showed notable shifts."
        )

ml_engine = MLEngine()
