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

            # file_attachments migration
            res_att = connection.execute(text("PRAGMA table_info(file_attachments)"))
            att_info = {row[1]: row for row in res_att.fetchall()}
            if att_info:
                if "version" not in att_info:
                    connection.execute(text("ALTER TABLE file_attachments ADD COLUMN version INTEGER NOT NULL DEFAULT 1"))
                if "table_id" in att_info and att_info["table_id"][3] == 1:
                    connection.execute(text("PRAGMA foreign_keys = OFF;"))
                    connection.execute(text("""
                        CREATE TABLE file_attachments_new (
                            id CHAR(36) PRIMARY KEY,
                            table_id CHAR(36),
                            record_id CHAR(36),
                            column_id CHAR(36),
                            original_filename VARCHAR(255) NOT NULL,
                            stored_filename VARCHAR(255) NOT NULL UNIQUE,
                            file_size_bytes BIGINT NOT NULL,
                            content_type VARCHAR(128) NOT NULL,
                            sha256_hash VARCHAR(64) NOT NULL,
                            version INTEGER NOT NULL DEFAULT 1,
                            uploaded_by_id CHAR(36),
                            created_at DATETIME NOT NULL,
                            updated_at DATETIME NOT NULL,
                            FOREIGN KEY(table_id) REFERENCES data_tables(id) ON DELETE CASCADE,
                            FOREIGN KEY(record_id) REFERENCES data_records(id) ON DELETE CASCADE,
                            FOREIGN KEY(column_id) REFERENCES data_columns(id) ON DELETE CASCADE,
                            FOREIGN KEY(uploaded_by_id) REFERENCES users(id) ON DELETE SET NULL
                        );
                    """))
                    connection.execute(text("""
                        INSERT INTO file_attachments_new (
                            id, table_id, record_id, column_id, original_filename, stored_filename,
                            file_size_bytes, content_type, sha256_hash, version, uploaded_by_id, created_at, updated_at
                        )
                        SELECT
                            id, table_id, record_id, column_id, original_filename, stored_filename,
                            file_size_bytes, content_type, sha256_hash, version, uploaded_by_id, created_at, updated_at
                        FROM file_attachments;
                    """))
                    connection.execute(text("DROP TABLE file_attachments;"))
                    connection.execute(text("ALTER TABLE file_attachments_new RENAME TO file_attachments;"))
                    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_file_attachments_table_id ON file_attachments(table_id);"))
                    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_file_attachments_record_id ON file_attachments(record_id);"))
                    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_file_attachments_column_id ON file_attachments(column_id);"))
                    connection.execute(text("PRAGMA foreign_keys = ON;"))

            res_att_info = connection.execute(text("PRAGMA table_info(file_attachments)"))
            att_cols_sqlite = {row[1] for row in res_att_info.fetchall()}
            if att_cols_sqlite:
                if "is_deleted" not in att_cols_sqlite:
                    connection.execute(text("ALTER TABLE file_attachments ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT 0"))
                if "deleted_at" not in att_cols_sqlite:
                    connection.execute(text("ALTER TABLE file_attachments ADD COLUMN deleted_at DATETIME NULL"))
                if "deleted_by_id" not in att_cols_sqlite:
                    connection.execute(text("ALTER TABLE file_attachments ADD COLUMN deleted_by_id CHAR(36) NULL"))

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

            # file_attachments migration
            try:
                res_att = connection.execute(text(
                    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'file_attachments'"
                ))
                att_cols = {row[0]: row[1] for row in res_att.fetchall()}
                if att_cols:
                    if "version" not in att_cols:
                        connection.execute(text("ALTER TABLE file_attachments ADD COLUMN version INTEGER NOT NULL DEFAULT 1"))
                    if "is_deleted" not in att_cols:
                        connection.execute(text("ALTER TABLE file_attachments ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE"))
                    if "deleted_at" not in att_cols:
                        connection.execute(text("ALTER TABLE file_attachments ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE NULL"))
                    if "deleted_by_id" not in att_cols:
                        connection.execute(text("ALTER TABLE file_attachments ADD COLUMN deleted_by_id UUID NULL"))
                    elif att_cols.get("deleted_by_id") in ("character", "character varying"):
                        try:
                            connection.execute(text("ALTER TABLE file_attachments ALTER COLUMN deleted_by_id TYPE UUID USING deleted_by_id::uuid"))
                        except Exception:
                            pass
                    try:
                        connection.execute(text("ALTER TABLE file_attachments ALTER COLUMN table_id DROP NOT NULL"))
                    except Exception as tid_err:
                        logger.warning(f"Notice dropping not-null on table_id: {tid_err}")
            except Exception as e:
                logger.warning(f"File attachments migration notice: {e}")

            # attachment_versions table migration
            try:
                res_ver = connection.execute(text("SELECT to_regclass('attachment_versions')"))
                if not res_ver.scalar():
                    connection.execute(text("""
                        CREATE TABLE IF NOT EXISTS attachment_versions (
                            id UUID PRIMARY KEY,
                            attachment_id UUID NOT NULL REFERENCES file_attachments(id) ON DELETE CASCADE,
                            version_number INTEGER NOT NULL,
                            stored_filename VARCHAR(255) NOT NULL,
                            file_size_bytes BIGINT NOT NULL,
                            sha256_hash VARCHAR(64) NOT NULL,
                            change_summary VARCHAR(255) NULL,
                            created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
                            created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                            updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                        )
                    """))
                    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_attachment_versions_attachment_id ON attachment_versions(attachment_id)"))
            except Exception as e:
                logger.warning(f"Attachment versions table migration notice: {e}")

        # Ensure all columns have non-empty display_name and name
        try:
            connection.execute(text("UPDATE data_columns SET display_name = name WHERE display_name = '' OR display_name IS NULL"))
            connection.execute(text("UPDATE data_columns SET display_name = 'Column' WHERE display_name = '' OR display_name IS NULL"))
            connection.execute(text("UPDATE data_columns SET name = 'col_' || substr(id, 1, 8) WHERE name = '' OR name IS NULL"))
        except Exception as col_fix_err:
            logger.warning(f"Column display_name fix notice: {col_fix_err}")
    except Exception as e:
        logger.warning(f"Schema migration check notice: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from sqlalchemy import text
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}...")

    # 1. PostgreSQL Enum Migration outside transaction block (PostgreSQL forbids ALTER TYPE ADD VALUE in transaction)
    try:
        async with async_engine.connect() as conn:
            if conn.dialect.name == "postgresql":
                await conn.execution_options(isolation_level="AUTOCOMMIT")
                res_type = await conn.execute(text("SELECT oid FROM pg_type WHERE typname = 'auditaction'"))
                type_row = res_type.fetchone()
                if type_row:
                    res_enum = await conn.execute(
                        text("SELECT enumlabel FROM pg_enum WHERE enumtypid = :oid"),
                        {"oid": type_row[0]}
                    )
                    existing_enums = {row[0] for row in res_enum.fetchall()}
                    for action_val in ("DOCUMENT_VIEWED", "DOCUMENT_EDITED", "DOCUMENT_REVERTED", "DOCUMENT_DELETED"):
                        if action_val not in existing_enums:
                            try:
                                await conn.execute(text(f"ALTER TYPE auditaction ADD VALUE '{action_val}'"))
                                logger.info(f"Successfully added '{action_val}' to PostgreSQL auditaction enum.")
                            except Exception as enum_err:
                                logger.warning(f"Notice adding enum value {action_val}: {enum_err}")
    except Exception as e:
        logger.warning(f"PostgreSQL enum migration notice: {e}")

    # 2. Initialize database tables and schema migrations
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
