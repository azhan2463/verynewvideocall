import os, re
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room, emit
import sqlite3
import requests

DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "dist")

app = Flask(__name__, static_folder=DIST_DIR, static_url_path="/")
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

# ─── Database setup ───────────────────────────────────────────

def get_db():
    db_path = os.path.join(os.path.dirname(__file__), "patients.db")
    return sqlite3.connect(db_path)

with get_db() as conn:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT,
            age      INTEGER,
            weight   INTEGER,
            symptoms TEXT,
            followup TEXT
        )
    """)
    conn.commit()

# ─── SMS via Fast2SMS ─────────────────────────────────────────

# ── Twilio credentials — replace with yours from twilio.com ──
TWILIO_SID   = "YOUR_ACCOUNT_SID"
TWILIO_TOKEN = "YOUR_AUTH_TOKEN"
TWILIO_FROM  = "+1XXXXXXXXXX"   # your Twilio number

def send_sms(phone, name, followup):
    try:
        from twilio.rest import Client
        msg = f"Namaste {name}, aapka agla follow-up: {followup}. - SilentTalk"
        # Add +91 if not already present
        if not phone.startswith("+"):
            phone = "+91" + phone
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        message = client.messages.create(
            body=msg,
            from_=TWILIO_FROM,
            to=phone
        )
        print("SMS sent:", message.sid)
        return True, None
    except Exception as e:
        print("SMS error:", str(e))
        return False, str(e)

# ─── Data extraction from Hindi text ─────────────────────────

def extract(text):
    d = {}
    m = re.search(r"नाम\s+(.+?)\s+है", text) or re.search(r"naam\s+(\w+)", text, re.I)
    if m: d["name"] = m.group(1)

    m = re.search(r"(\d+)\s*साल", text) or re.search(r"(\d+)\s*saal", text, re.I)
    if m: d["age"] = int(m.group(1))

    m = re.search(r"(\d+)\s*किलो", text) or re.search(r"(\d+)\s*kilo", text, re.I)
    if m: d["weight"] = int(m.group(1))

    for s in ["बुखार", "bukhaar", "खांसी", "khansi", "दर्द", "dard", "कमजोरी", "kamzori", "सर्दी", "sardi"]:
        if s.lower() in text.lower():
            d["symptoms"] = s
            break

    m = re.search(r"(\d+)\s*दिन", text) or re.search(r"(\d+)\s*din", text, re.I)
    if m: d["followup"] = m.group(1) + " din baad"

    return d

# ─── HTTP routes ──────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    full = os.path.join(DIST_DIR, path)
    if path and os.path.exists(full):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")

@app.route("/save_voice", methods=["POST"])
def save_voice():
    text = request.json.get("text", "")
    data = extract(text)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO patients (name, age, weight, symptoms, followup) VALUES (?,?,?,?,?)",
            (data.get("name","Unknown"), data.get("age",0), data.get("weight",0),
             data.get("symptoms","Not specified"), data.get("followup","None"))
        )
        conn.commit()
    return jsonify({"status": "saved", "data": data})

@app.route("/get_patients")
def get_patients():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM patients").fetchall()
    return jsonify(rows)

@app.route("/send_followup_sms", methods=["POST"])
def send_followup_sms():
    d = request.json
    phone = d.get("phone","").strip()
    if not phone:
        return jsonify({"status": False, "error": "Phone missing"}), 400
    ok, err = send_sms(phone, d.get("name","Patient"), d.get("followup","Next appointment"))
    return jsonify({"status": ok, "error": err})

# ─── WebSocket signaling ──────────────────────────────────────

@socketio.on("join")
def on_join(data):
    room = data.get("room","").strip().upper()
    if not room: return
    join_room(room)
    emit("peer-joined", {"room": room}, to=room, skip_sid=request.sid)

@socketio.on("signal")
def on_signal(data):
    room = data.get("room","").strip().upper()
    if not room: return
    emit("signal", data, to=room, skip_sid=request.sid)

@socketio.on("sign_text")
def on_sign_text(data):
    room = data.get("room", "").strip().upper()
    if not room:
        return
    # Relay sign text to all OTHER peers in the room
    emit("sign_text", data, to=room, skip_sid=request.sid)

@socketio.on("leave")
def on_leave(data):
    room = data.get("room","").strip().upper()
    if not room: return
    leave_room(room)
    emit("peer-left", {"room": room}, to=room, skip_sid=request.sid)

# ─── Entry point ──────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=False)
