import asyncio
from app.core.database import engine, Base
import app.models.schemas # load models

async def init_db():
    print("Connecting to Neon PostgreSQL...")
    async with engine.begin() as conn:
        print("Creating tables if they do not exist...")
        await conn.run_sync(Base.metadata.create_all)
    print("Tables initialized successfully in Neon DB!")

if __name__ == "__main__":
    asyncio.run(init_db())
