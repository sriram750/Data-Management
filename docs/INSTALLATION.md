# DataMatrix - Local & Production Installation Guide

This document outlines the step-by-step procedures for installing and running the DataMatrix platform locally for development or directly on bare-metal servers.

---

## 1. System Requirements

- **Operating System**: Windows 10/11, Windows Server 2019/2022, Ubuntu 22.04 LTS / Debian 12, or macOS 13+
- **Python**: Version 3.12.x
- **Node.js**: Version 20.x+ or 22.x LTS
- **PostgreSQL Database**: Version 15 or 16
- **Hardware**:
  - Minimum: 2 CPU cores, 4 GB RAM, 20 GB SSD
  - Recommended: 4+ CPU cores, 8+ GB RAM, 50 GB NVMe SSD

---

## 2. Local Development Setup

### A. Clone & Prepare Directory
```bash
git clone <repository_url> datamatrix
cd datamatrix
```

### B. Backend Setup
1. Navigate to `backend`:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   # Linux / macOS
   python3 -m venv .venv
   source .venv/bin/activate

   # Windows PowerShell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```
3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure `.env` in `backend/`:
   ```bash
   cp ../.env.example .env
   ```
5. Apply Alembic database migrations:
   ```bash
   alembic upgrade head
   ```
6. Start the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

### C. Frontend Setup
1. Open a second terminal and navigate to `frontend`:
   ```bash
   cd frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Access the web interface at `http://localhost:5173`.

---

## 3. First-Time Administrator Provisioning

When running DataMatrix on a fresh database:
1. Navigate your browser to `http://localhost:5173`.
2. The application will detect 0 existing accounts and automatically display the **Setup Wizard**.
3. Provide your Super Administrator username, full name, email, and master password.
4. Upon submission, the platform creates the root admin user, seeds the 6 system roles (`SUPER_ADMIN`, `APPLICATION_ADMIN`, `MANAGER`, `DATA_ENTRY`, `VIEWER`, `AUDITOR`) and 22 system permissions, and locks the setup endpoint.
5. You will be automatically redirected to the dashboard.

---

## 4. Running Automated Tests

To execute the backend pytest test suite:
```bash
cd backend
python -m pytest tests/ -v
```
All 10 test suites should pass cleanly in under 5 seconds.
