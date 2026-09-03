# DataMatrix - Secure Dynamic Data Management Platform

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg?logo=typescript)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1.svg?logo=postgresql)](https://www.postgresql.org)
[![AG Grid](https://img.shields.io/badge/AG_Grid-Enterprise-00E676.svg)](https://www.ag-grid.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker)](https://www.docker.com)

A self-hosted, centralized, and secure web application engineered to replace disparate, uncontrolled Excel spreadsheets across organizations with dynamic schemas, granular role-based access control (RBAC), column-level AES-256-GCM encryption, point-in-time version history, and tamper-resistant audit trails.

---

## 🌟 Key Highlights

- **Dynamic Table Architecture**: No hardcoded entity models. Support for arbitrary schemas with 17 distinct column data types.
- **Smart Excel (.xlsx) Import Wizard**: 4-step wizard with worksheet picker, type inference, row validation breakdown (valid/warning/error rows), and ACID transactional import.
- **Enterprise AG Grid Experience**: High-performance data grid with server-side pagination, multi-column sorting, column reordering/hiding, full-screen mode, and inline editing.
- **Point-in-Time Revision History**: Every record update creates an immutable snapshot with visual field diffs and 1-click restore.
- **Military-Grade Field Security**: Authenticated AES-256-GCM encryption for secrets and passwords with masked UI displays and `PASSWORD_VIEWED` audit trails.
- **Granular RBAC System**: 6 built-in roles, 22 permissions, and column-level access control (`VIEW_EDIT`, `VIEW`, `DENIED`).
- **Live Real-Time Dashboard**: PostgreSQL-computed statistics with **zero fake data** and pristine empty states.
- **Enterprise Single Sign-On Ready**: Built-in Active Directory / LDAP authentication provider.
- **Automated Backup & Disaster Recovery**: Shell and PowerShell scripts for point-in-time PostgreSQL backup and restoration.

---

## 🚀 Quick Start with Docker

```bash
# 1. Clone repository
git clone <repo_url> datamatrix
cd datamatrix

# 2. Configure environment
cp .env.example .env

# 3. Launch Docker Compose stack
docker compose up --build -d

# 4. Access the web interface
# Open http://localhost in your browser
```

Complete the **Setup Wizard** to initialize the Super Administrator account.

---

## 💻 Local Development Setup

### Backend (Python 3.12 + FastAPI)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Or .\.venv\Scripts\Activate.ps1 on Windows
pip install -r requirements.txt
cp ../.env.example .env
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (React 19 + TypeScript + Vite)
```bash
cd frontend
npm install
npm run dev
```

### Run Test Suite
```bash
cd backend
python -m pytest tests/ -v
```

---

## 📚 Complete Documentation Suite

Comprehensive technical guides are available in [`docs/`](./docs/):

- 📖 [**Installation Guide**](./docs/INSTALLATION.md)
- 🐳 [**Docker Production Deployment**](./docs/DOCKER_DEPLOYMENT.md)
- 🗄️ [**Database & Dynamic Schema Design**](./docs/DATABASE.md)
- 💾 [**Backup & Disaster Recovery**](./docs/BACKUP_RESTORE.md)
- 🔐 [**Role-Based Access Control (RBAC) Guide**](./docs/RBAC_GUIDE.md)
- 📥 [**Excel Import Guide & Wizard Walkthrough**](./docs/EXCEL_IMPORT_GUIDE.md)
- 📤 [**Excel & CSV Export Guide**](./docs/EXCEL_EXPORT_GUIDE.md)
- 🛡️ [**Security & Cryptographic Architecture**](./docs/SECURITY_GUIDE.md)
- 🏢 [**Active Directory / LDAP Integration**](./docs/LDAP_INTEGRATION_GUIDE.md)
- 📡 [**REST API Documentation**](./docs/API_DOCUMENTATION.md)
- 🔧 [**Troubleshooting & Diagnostics**](./docs/TROUBLESHOOTING.md)

---

## 🛡️ Security & Zero Fake Data Guarantee

1. **Zero Fake Data Guarantee**: The production database initializes with exactly zero business records. Dashboards, tables, records, activity streams, and logs reflect live PostgreSQL state with pristine empty states.
2. **First-Time Setup Provisioning**: No default passwords (`admin/admin123`) exist. The initial admin is provisioned via the secure setup wizard, which locks upon completion.
3. **Argon2id Hashing**: Credentials are protected using state-of-the-art Argon2id password hashing.
4. **AES-256-GCM Encryption**: Password and sensitive columns are encrypted using authenticated AES-256-GCM cipher with HKDF key derivation.
5. **Zero-Leak Logging**: Plaintext passwords, tokens, and secrets are automatically scrubbed from application logs.

---

## 📄 License

Proprietary enterprise data management platform. All rights reserved.
