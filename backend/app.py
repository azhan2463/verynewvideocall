import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room, emit

# Vite builds to ../dist (one level up from backend/)
DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "dist")

app = Flask(__name__, static_folder=DIST_DIR, static_url_path="/")
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

# ─── Serve React frontend ─────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    full = os.path.join(DIST_DIR, path)
    if path and os.path.exists(full):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")

# ─── Voice route ──────────────────────────────────────────────

@app.route("/voice")
def voice():
    return jsonify({
        "text": "मेरा नाम Azhan है, मेरी उम्र 25 साल है, मेरा वजन 70 किलो है",
        "data": {"name": "Azhan", "age": 25, "weight": 70}
    })

# ─── WebSocket signaling ──────────────────────────────────────

@socketio.on("join")
def on_join(data):
    room = data.get("room", "").strip().upper()
    if not room:
        return
    join_room(room)
    emit("peer-joined", {"room": room}, to=room, skip_sid=request.sid)

@socketio.on("signal")
def on_signal(data):
    room = data.get("room", "").strip().upper()
    if not room:
        return
    emit("signal", data, to=room, skip_sid=request.sid)

@socketio.on("leave")
def on_leave(data):
    room = data.get("room", "").strip().upper()
    if not room:
        return
    leave_room(room)
    emit("peer-left", {"room": room}, to=room, skip_sid=request.sid)

# ─── Entry point ──────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=False)
