# ── Stage 1: build the React frontend ──
FROM node:20 AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: run the Python backend ──
FROM python:3.11-slim
WORKDIR /app

COPY --from=frontend /app/dist ./dist
COPY backend/ ./backend/
RUN pip install --no-cache-dir flask flask-cors flask-socketio eventlet

EXPOSE 5000
CMD ["python", "backend/app.py"]
