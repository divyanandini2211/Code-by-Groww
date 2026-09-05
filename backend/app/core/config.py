from pydantic_settings import BaseSettings
from pydantic import Field
import os
from pathlib import Path

class Settings(BaseSettings):
    PROJECT_NAME: str = "Groww Smart Market Watchlist API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Neon PostgreSQL database URL
    DATABASE_URL: str = Field(
        default="postgresql://neondb_owner:npg_aqx4dbtuhfm2@ep-icy-cake-b39qfr61.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
    )
    DATABASE_URL_POOLED: str | None = None
    
    # Google Gemini AI Key
    GEMINI_API_KEY: str | None = None
    
    # Simulation & Market Settings
    SIMULATION_TICK_INTERVAL_SEC: int = 15 # Simulated market step in seconds
    ANOMALY_THRESHOLD: float = 0.70
    
    class Config:
        env_file = (".env", "../.env", "../../.env")
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()

def get_async_db_url() -> str:
    url = settings.DATABASE_URL
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    # Strip channel_binding if present for asyncpg compatibility
    if "channel_binding=" in url:
        parts = url.split("channel_binding=")
        url = parts[0].rstrip("&?") + ("" if len(parts) == 1 or "&" not in parts[1] else "&" + parts[1].split("&", 1)[1])
    return url
