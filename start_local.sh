#!/bin/bash
# Start DataMatrix locally on Linux/macOS

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "===================================================="
echo " Starting DataMatrix Enterprise Platform Locally... "
echo "===================================================="

# Start Backend
cd "$DIR/backend"
source .venv/bin/activate 2>/dev/null || true
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
echo "Backend running on PID $BACKEND_PID (http://127.0.0.1:8000)"

# Start Frontend
cd "$DIR/frontend"
npm run dev &
FRONTEND_PID=$!
echo "Frontend running on PID $FRONTEND_PID (http://localhost:5173)"

echo "Web App URL: http://localhost:5173"
