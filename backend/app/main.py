from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import (
    attachments,
    audit,
    auth,
    columns,
    dashboard,
    exports,
    imports,
    records,
    roles,
    settings as settings_router,
    setup,
    tables,
    users,
)
from app.core.config import settings
from app.core.database import Base, async_engine
from app.core.exceptions import AppException
from app.core.logging import logger


def _ensure_schema_migrations(connection):
    from sqlalchemy import text
    try:
        if connection.dialect.name == "sqlite":
            res = connection.execute(text("PRAGMA table_info(data_tables)"))
            existing_cols = {row[1] for row in res.fetchall()}
            if existing_cols:
                if "is_private" not in existing_cols:
                    connection.execute(text("ALTER TABLE data_tables ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT 0"))
                if "is_locked" not in existing_cols:
                    connection.execute(text("ALTER TABLE data_tables ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT 0"))
                if "password_hash" not in existing_cols:
                    connection.execute(text("ALTER TABLE data_tables ADD COLUMN password_hash VARCHAR(255) NULL"))
        elif connection.dialect.name == "postgresql":
            res = connection.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'data_tables'"
            ))
            existing_cols = {row[0] for row in res.fetchall()}
            if existing_cols:
                if "is_private" not in existing_cols:
                    connection.execute(text("ALTER TABLE data_tables ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT FALSE"))
                if "is_locked" not in existing_cols:
                    connection.execute(text("ALTER TABLE data_tables ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT FALSE"))
                if "password_hash" not in existing_cols:
                    connection.execute(text("ALTER TABLE data_tables ADD COLUMN password_hash VARCHAR(255) NULL"))
    except Exception as e:
        logger.warning(f"Schema migration check notice: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}...")
    # Initialize database tables
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_schema_migrations)
    logger.info("Database schemas verified.")
    yield
    logger.info("Shutting down application...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handler for standardized application errors
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=exc.headers,
    )


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME, "version": settings.VERSION}


# Include all v1 routers under API_V1_STR
api_prefix = settings.API_V1_STR
app.include_router(setup.router, prefix=api_prefix)
app.include_router(auth.router, prefix=api_prefix)
app.include_router(users.router, prefix=api_prefix)
app.include_router(roles.router, prefix=api_prefix)
app.include_router(tables.router, prefix=api_prefix)
app.include_router(columns.router, prefix=api_prefix)
app.include_router(records.router, prefix=api_prefix)
app.include_router(imports.router, prefix=api_prefix)
app.include_router(exports.router, prefix=api_prefix)
app.include_router(audit.router, prefix=api_prefix)
app.include_router(dashboard.router, prefix=api_prefix)
app.include_router(attachments.router, prefix=api_prefix)
app.include_router(settings_router.router, prefix=api_prefix)
