#!/bin/bash
# Stop DataMatrix local servers on Linux/macOS

echo "Stopping DataMatrix local processes..."

# Kill port 8000 (Backend)
fuser -k 8000/tcp 2>/dev/null || true

# Kill port 5173 (Frontend)
fuser -k 5173/tcp 2>/dev/null || true

echo "All local servers stopped."
