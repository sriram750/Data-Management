import asyncio
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Set test environment
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-unit-testing-32-chars-long"
os.environ["ENCRYPTION_KEY"] = "test-encryption-key-for-aes256gcm-testing"

from app.core.database import Base, get_db
from app.main import app

test_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    echo=False,
    future=True,
)

TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@pytest_asyncio.fixture(scope="function")
async def db_session():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestingSessionLocal() as session:
        yield session
        await session.rollback()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def super_admin_auth(client: AsyncClient):
    """Initializes the admin wizard and returns (admin_user_data, auth_headers)."""
    setup_payload = {
        "username": "superadmin",
        "full_name": "Super Administrator",
        "email": "admin@enterprise.internal",
        "password": "SecurePassword123!",
        "confirm_password": "SecurePassword123!",
    }
    setup_res = await client.post("/api/v1/setup/initialize-admin", json=setup_payload)
    assert setup_res.status_code == 200

    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": "superadmin", "password": "SecurePassword123!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    return login_res.json()["user"], headers
