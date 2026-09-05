import os
import re
from pathlib import Path
import httpx
from typing import List, Dict, Any, Optional
from app.core.config import settings

# Layer 1: Disallowed off-topic patterns (non-financial, general coding, creative writing, etc.)
OFF_TOPIC_PATTERNS = [
    r"\b(recipe|cook|baking|food|diet)\b",
    r"\b(write a poem|write a story|write lyrics|song|joke)\b",
    r"\b(python code|javascript code|html code|write code to|debug this code)\b",
    r"\b(president|election|prime minister|politics|war|treaty)\b",
    r"\b(movie|cinema|actor|celebrity|oscar)\b",
    r"\b(homework|algebra|essay|thesis)\b",
    r"\b(football|cricket match|ipl score|fifa|world cup)\b",
]

OFF_TOPIC_REJECTION = (
    "I am your dedicated Groww Watchlist Assistant. I can only assist with real-time analysis, "
    "price movements, volume surges, and technical anomaly signals for the stocks in your active watchlist. "
    "Please ask a question related to your watchlist equities."
)

class WatchlistChatService:
    def __init__(self):
        self.primary_model = "gemini-3.5-flash-lite"
        self.fallback_model = "gemini-3.1-flash-lite"

    def _get_api_key(self) -> Optional[str]:
        gemini_key = os.environ.get("GEMINI_API_KEY") or settings.GEMINI_API_KEY
        if not gemini_key:
            from dotenv import dotenv_values
            for candidate in [Path(".env"), Path("../.env"), Path(__file__).resolve().parent / ".env"]:
                if candidate.exists():
                    env_dict = dotenv_values(str(candidate))
                    gemini_key = env_dict.get("GEMINI_API_KEY")
                    if gemini_key:
                        break
        return gemini_key

    def check_layer1_guardrail(self, query: str) -> Optional[str]:
        """Layer 1: Pre-flight intent guardrail. Rejects completely off-topic questions without consuming API quota."""
        lowered = query.lower().strip()
        for pattern in OFF_TOPIC_PATTERNS:
            if re.search(pattern, lowered):
                return OFF_TOPIC_REJECTION
        return None

    def build_watchlist_context(self, watchlist_name: str, insights: List[Dict[str, Any]], away_duration: str) -> str:
        """Layer 2: Formats live real-time metrics for each stock into grounded context."""
        lines = [
            f"Active Watchlist: {watchlist_name}",
            f"User Absence / Tracking Window: {away_duration}",
            "Current Watchlist Equities State:"
        ]
        for item in insights:
            sym = item.get("symbol", "")
            price = item.get("current_price", 0.0)
            ref_price = item.get("price_at_last_seen", price)
            pct = item.get("pct_change_since_seen", 0.0)
            vol_ratio = item.get("volume_surge_ratio", 1.0)
            score = item.get("attention_score", 0.0)
            signals = ", ".join(item.get("signals", [])) or "None"
            lines.append(
                f"- Symbol: {sym} | Price: ₹{price:,.2f} (Ref: ₹{ref_price:,.2f}) | "
                f"Delta: {pct:+.2f}% | Vol Surge: {vol_ratio:.2f}x | Attention Score: {score:.2f} | Signals: [{signals}]"
            )
        return "\n".join(lines)

    def generate_deterministic_fallback(self, query: str, insights: List[Dict[str, Any]], watchlist_name: str) -> str:
        """Layer 4: High-reliability deterministic engine if LLM API is unavailable."""
        q = query.lower()
        if not insights:
            return f"Your watchlist '{watchlist_name}' currently has no equities to evaluate."

        # Sort by attention score / volume / delta
        by_attention = sorted(insights, key=lambda x: x.get("attention_score", 0), reverse=True)
        by_delta = sorted(insights, key=lambda x: abs(x.get("pct_change_since_seen", 0)), reverse=True)
        by_volume = sorted(insights, key=lambda x: x.get("volume_surge_ratio", 0), reverse=True)

        top_attention = by_attention[0]
        top_delta = by_delta[0]
        top_vol = by_volume[0]

        # Check for specific stock query
        for item in insights:
            sym = item.get("symbol", "").lower()
            if sym in q:
                return (
                    f"**{item['symbol']}** is currently trading at **₹{item['current_price']:,.2f}** "
                    f"({item['pct_change_since_seen']:+.2f}% change). Its volume surge multiplier is **{item['volume_surge_ratio']:.2f}x** "
                    f"with an anomaly attention score of **{item['attention_score']:.2f}**. "
                    f"Active signals: {', '.join(item.get('signals', [])) or 'Normal Range'}."
                )

        if "highest" in q or "mover" in q or "most" in q or "gain" in q or "loss" in q:
            return (
                f"The highest mover in '{watchlist_name}' is **{top_delta['symbol']}** with a "
                f"**{top_delta['pct_change_since_seen']:+.2f}%** move at ₹{top_delta['current_price']:,.2f}. "
                f"Top volume activity was observed in **{top_vol['symbol']}** ({top_vol['volume_surge_ratio']:.2f}x average volume)."
            )

        if "volume" in q or "surge" in q or "spike" in q:
            surging = [x for x in insights if x.get("volume_surge_ratio", 1.0) >= 1.5]
            if surging:
                names = ", ".join([f"**{x['symbol']}** ({x['volume_surge_ratio']:.2f}x)" for x in surging])
                return f"Significant volume surges detected in: {names}."
            return f"No extreme volume spikes currently detected. Highest is **{top_vol['symbol']}** at {top_vol['volume_surge_ratio']:.2f}x."

        if "breakout" in q or "52" in q or "high" in q:
            breakouts = [x for x in insights if "NEAR_52W_HIGH" in x.get("signals", []) or "NEAR_52W_LOW" in x.get("signals", [])]
            if breakouts:
                b_str = ", ".join([f"**{x['symbol']}**" for x in breakouts])
                return f"Stocks near 52-week extremes: {b_str}."
            return "None of your watchlist stocks are currently in breakout proximity to their 52-week high or low."

        # General summary
        return (
            f"Watchlist **{watchlist_name}** summary: Highest attention is on **{top_attention['symbol']}** "
            f"(Score: {top_attention['attention_score']:.2f}, Delta: {top_attention['pct_change_since_seen']:+.2f}%, Volume: {top_attention['volume_surge_ratio']:.2f}x). "
            f"Overall market conditions in your watchlist are stable."
        )

    async def answer_watchlist_question(
        self,
        query: str,
        watchlist_name: str,
        insights: List[Dict[str, Any]],
        away_duration: str,
        history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Executes multi-layered question answering strictly constrained to the user's watchlist.
        """
        # --- LAYER 1: Pre-flight Intent Guardrail ---
        l1_rejection = self.check_layer1_guardrail(query)
        if l1_rejection:
            return {
                "reply": l1_rejection,
                "model_used": "guardrail_layer1",
                "status": "filtered"
            }

        # --- LAYER 2: Context Injection & Strict System Prompt ---
        watchlist_context = self.build_watchlist_context(watchlist_name, insights, away_duration)

        valid_symbols = [x.get("symbol", "").upper() for x in insights]
        symbols_list_str = ", ".join(valid_symbols)

        system_instruction = f"""You are the Groww Smart Watchlist AI Assistant.
Your job is to answer questions strictly about the user's active watchlist.

[STRICT MULTI-LAYER GUARDRAIL RULES]
1. DOMAIN BOUNDARY: You may ONLY answer questions related to the user's active watchlist '{watchlist_name}', its stocks ({symbols_list_str}), their price action, volume surges, attention scores, 52-week levels, or Indian equity market concepts directly relevant to this watchlist.
2. OUT-OF-WATCHLIST QUERIES: If the user asks about a stock that is NOT in their watchlist, politely inform them: "That stock is not currently in your '{watchlist_name}' watchlist. You can add it using the Search bar."
3. FACTUAL GROUNDING: Rely strictly on the real-time watchlist metrics provided below. Do not fabricate quotes, news, or ungrounded statistics.
4. NO DIRECT BUY/SELL RECOMMENDATIONS: Provide objective data analysis and market intelligence, never direct financial advice (SEBI compliance).
5. FORMATTING: Present answers cleanly and concisely. Use standard bullet points (e.g. • Symbol: WIPRO) when listing metrics. Bold key metrics naturally like **WIPRO** or **2.32x**. Never double-wrap or spam asterisks (e.g. avoid '**Symbol:** **WIPRO**' or wrapping entire sentences in asterisks). Keep responses crisp, sharp, and easy to read.

[REAL-TIME WATCHLIST SNAPSHOT]
{watchlist_context}
"""

        # Build message history
        conversation_parts = [{"text": system_instruction}]
        if history:
            for item in history[-4:]: # Keep last 4 turns for context efficiency
                role = "user" if item.get("role") == "user" else "model"
                text = item.get("text", "")
                if text:
                    conversation_parts.append({"text": f"{role.upper()}: {text}"})

        conversation_parts.append({"text": f"USER QUESTION: {query}\nASSISTANT:"})

        gemini_key = self._get_api_key()

        # --- LAYER 3: Ultra-High Rate Limit Model with Cascading Fallback ---
        if gemini_key:
            for model_name in [self.primary_model, self.fallback_model]:
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
                    payload = {
                        "contents": [{"parts": conversation_parts}],
                        "generationConfig": {
                            "temperature": 0.2,
                            "maxOutputTokens": 400
                        }
                    }
                    async with httpx.AsyncClient(timeout=8.0) as client:
                        resp = await client.post(url, json=payload)
                        if resp.status_code == 200:
                            data = resp.json()
                            candidates = data.get("candidates", [])
                            if candidates:
                                text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                                if text_content:
                                    # Post-processing disclaimer note if discussing forward outlook
                                    return {
                                        "reply": text_content,
                                        "model_used": model_name,
                                        "status": "success"
                                    }
                except Exception as e:
                    continue # Try fallback model in cascade

        # --- LAYER 4: Deterministic Grounded Engine Fallback ---
        deterministic_reply = self.generate_deterministic_fallback(query, insights, watchlist_name)
        return {
            "reply": deterministic_reply,
            "model_used": "deterministic_engine",
            "status": "success"
        }

watchlist_chat_service = WatchlistChatService()
