# DataMatrix - Docker Production Deployment Guide

DataMatrix comes containerized using Docker and Docker Compose with high-availability configurations, isolated networking, non-root user execution, and an Nginx reverse proxy.

---

## 1. Prerequisites

- Docker Engine 24.0+
- Docker Compose v2.20+

Verify installations:
```bash
docker --version
docker compose version
```

---

## 2. Quick Start Deployment

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Generate secure 32-character secret keys and update `.env`:
   ```bash
   openssl rand -hex 32
   ```
   Set `SECRET_KEY`, `ENCRYPTION_MASTER_KEY`, and `POSTGRES_PASSWORD` to strong unique values.

3. Build and launch containers in detached mode:
   ```bash
   docker compose up --build -d
   ```

4. Verify running container health:
   ```bash
   docker compose ps
   ```

5. Open your web browser and navigate to `http://<server-ip-or-domain>`.
6. Complete the **Setup Wizard** to initialize the Super Admin account.

---

## 3. Container Topology

| Service Container | Image / Base | Internal Port | Description |
|---|---|---|---|
| `datamatrix_postgres` | `postgres:16-alpine` | `5432` | Relational PostgreSQL 16 database storing schemas, JSONB records, versions, and audit logs. |
| `datamatrix_backend` | `python:3.12-slim` | `8000` | FastAPI ASGI service running with Uvicorn multi-workers as an unprivileged user. |
| `datamatrix_frontend` | `nginx:1.25-alpine` | `80` | Production React SPA served via optimized Nginx with gzip compression. |
| `datamatrix_proxy` | `nginx:1.25-alpine` | `80` / `443` | Edge reverse proxy handling API routing (`/api/v1`), static files, security headers, and body size limits. |

---

## 4. Production Management Commands

### Viewing Real-Time Logs
```bash
# All containers
docker compose logs -f

# Backend service only
docker compose logs -f backend

# PostgreSQL service only
docker compose logs -f postgres
```

### Applying Schema Migrations Inside Container
```bash
docker compose exec backend alembic upgrade head
```

### Stopping and Starting the Cluster
```bash
# Graceful stop
docker compose down

# Start existing cluster
docker compose up -d
```

### Updating to New Release
```bash
git pull origin main
docker compose down
docker compose up --build -d
docker compose exec backend alembic upgrade head
```
