# ── Stage 1: build the React frontend ──
FROM node:20-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev
COPY . .
RUN npx vite build

# ── Stage 2: run the Python backend ──
FROM python:3.11-slim
WORKDIR /app

# Copy built frontend
COPY --from=frontend /app/dist ./dist

# Copy backend
COPY backend/ ./backend/
RUN pip install --no-cache-dir flask flask-cors flask-socketio eventlet

EXPOSE 5000
CMD ["python", "backend/app.py"]
