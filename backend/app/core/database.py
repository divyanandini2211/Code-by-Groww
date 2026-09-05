from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import get_async_db_url
import ssl

db_url = get_async_db_url()

# Handle Neon SSL requirement cleanly with asyncpg
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

# Strip sslmode=require from url since we pass connect_args ssl context
if "sslmode=require" in db_url:
    db_url = db_url.replace("sslmode=require", "").rstrip("?&")

engine = create_async_engine(
    db_url,
    echo=False,
    future=True,
    connect_args={"ssl": ssl_ctx},
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
