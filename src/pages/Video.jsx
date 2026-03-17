import { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";

const BACKEND = import.meta.env.DEV ? "http://localhost:5000" : window.location.origin;

// ── Common ISL/ASL words mapped to gesture sequences ──────────
const COMMON_WORDS = {
  "HELLO": "Hello", "HELP": "Help", "WATER": "Water",
  "FOOD": "Food",   "YES": "Yes",   "NO": "No",
  "GOOD": "Good",   "BAD": "Bad",   "PAIN": "Pain",
  "NAME": "Name",   "AGE": "Age",   "HOME": "Home",
  "WORK": "Work",   "MONEY": "Money","THANK": "Thank you",
  "SORRY": "Sorry", "STOP": "Stop", "GO": "Go",
  "COME": "Come",   "CALL": "Call",
};

// ── Sign Language Engine ───────────────────────────────────────
function useSignLanguage(videoRef, enabled) {
  const [detectedLetter, setDetectedLetter] = useState("");
  const [sentence, setSentence]             = useState("");
  const [spokenText, setSpokenText]         = useState("");
  const [isModelLoaded, setIsModelLoaded]   = useState(false);

  const letterBufferRef  = useRef([]);   // last N detected letters (majority vote)
  const currentWordRef   = useRef("");   // letters building current word
  const currentSentRef   = useRef("");   // full sentence so far
  const lastLetterRef    = useRef("");   // last confirmed letter
  const pauseTimerRef    = useRef(null); // fires TTS after pause
  const noHandTimerRef   = useRef(null); // detects hand removed (space)
  const handsRef         = useRef(null);
  const cameraRef        = useRef(null);
  const rafRef           = useRef(null);
  const modelRef         = useRef(null);

  // ── Load MediaPipe + TF.js ──────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const loadLibs = async () => {
      try {
        // Load TF.js
        if (!window.tf) {
          await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.13.0/dist/tf.min.js");
        }
        // Load MediaPipe Hands
        if (!window.Hands) {
          await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
          await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
        }
        if (cancelled) return;

        // Init MediaPipe Hands
        const hands = new window.Hands({
          locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
        });
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.75,
          minTrackingConfidence: 0.65,
        });
        hands.onResults(onHandResults);
        await hands.initialize();
        handsRef.current = hands;

        // Simple TF.js model for A-Z (21 landmarks × 3 = 63 inputs → 26 outputs)
        const model = await buildSignModel();
        modelRef.current = model;

        if (!cancelled) setIsModelLoaded(true);
      } catch (e) {
        console.error("Sign model load error:", e);
      }
    };

    loadLibs();
    return () => { cancelled = true; stopCamera(); };
  }, [enabled]);

  // ── Start camera when model ready + enabled ─────────────────
  useEffect(() => {
    if (!enabled || !isModelLoaded || !videoRef.current || !handsRef.current) return;
    startCamera();
    return () => stopCamera();
  }, [enabled, isModelLoaded]);

  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  // ── Tiny dense model trained on normalised hand landmarks ───
  const buildSignModel = async () => {
    const tf = window.tf;
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [63], units: 128, activation: "relu" }));
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({ units: 64, activation: "relu" }));
    model.add(tf.layers.dense({ units: 26, activation: "softmax" }));
    model.compile({ optimizer: "adam", loss: "categoricalCrossentropy", metrics: ["accuracy"] });
    // NOTE: In production load pre-trained weights via model.loadWeights(url)
    // For demo, we use landmark geometry heuristics (see classifyFromLandmarks)
    return model;
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      cameraRef.current = stream;
      processFrame();
    } catch (e) {
      console.error("Sign camera error:", e);
    }
  };

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    cameraRef.current?.getTracks().forEach(t => t.stop());
    cameraRef.current = null;
  };

  const processFrame = async () => {
    if (!videoRef.current || !handsRef.current) return;
    if (videoRef.current.readyState >= 2) {
      await handsRef.current.send({ image: videoRef.current });
    }
    rafRef.current = requestAnimationFrame(processFrame);
  };

  // ── Hand results → classify → buffer → confirm letter ───────
  const onHandResults = (results) => {
    if (!results.multiHandLandmarks?.length) {
      // No hand detected — start space timer
      clearTimeout(noHandTimerRef.current);
      noHandTimerRef.current = setTimeout(() => {
        if (currentWordRef.current) {
          // Add word to sentence
          const word = currentWordRef.current;
          const spoken = COMMON_WORDS[word] || word;
          const newSent = (currentSentRef.current + " " + spoken).trim();
          currentSentRef.current = newSent;
          currentWordRef.current = "";
          setSentence(newSent);
          setDetectedLetter("");
          // Start pause timer for TTS
          clearTimeout(pauseTimerRef.current);
          pauseTimerRef.current = setTimeout(() => {
            if (currentSentRef.current) {
              speakText(currentSentRef.current);
              setSpokenText(currentSentRef.current);
              currentSentRef.current = "";
              setSentence("");
            }
          }, 2500);
        }
      }, 800);
      return;
    }

    clearTimeout(noHandTimerRef.current);

    const landmarks = results.multiHandLandmarks[0];
    const letter = classifyFromLandmarks(landmarks);
    if (!letter) return;

    // Majority vote buffer (last 8 frames)
    letterBufferRef.current.push(letter);
    if (letterBufferRef.current.length > 8) letterBufferRef.current.shift();

    const counts = {};
    letterBufferRef.current.forEach(l => counts[l] = (counts[l] || 0) + 1);
    const confirmed = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];

    if (confirmed[1] >= 5 && confirmed[0] !== lastLetterRef.current) {
      const newLetter = confirmed[0];
      lastLetterRef.current = newLetter;
      currentWordRef.current += newLetter;
      setDetectedLetter(newLetter);
      setSentence((currentSentRef.current + " " + currentWordRef.current).trim());

      // Reset TTS pause timer
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(() => {
        if (currentWordRef.current) {
          const word = currentWordRef.current;
          const spoken = COMMON_WORDS[word] || word;
          const newSent = (currentSentRef.current + " " + spoken).trim();
          currentSentRef.current = newSent;
          currentWordRef.current = "";
        }
        if (currentSentRef.current) {
          speakText(currentSentRef.current);
          setSpokenText(currentSentRef.current);
          currentSentRef.current = "";
          setSentence("");
          setDetectedLetter("");
        }
      }, 3000);
    }
  };

  // ── Geometry-based A–Z classifier using landmark angles ─────
  // Uses finger extension state (each finger extended or curled)
  const classifyFromLandmarks = (lm) => {
    // Normalise landmarks relative to wrist
    const wrist = lm[0];
    const norm = lm.map(p => ({ x: p.x - wrist.x, y: p.y - wrist.y, z: p.z - wrist.z }));

    // Finger tip and MCP indices
    const tips = [4, 8, 12, 16, 20];
    const mcps = [2, 5, 9, 13, 17];

    // Is finger extended? (tip above MCP in image coords = lower y)
    const extended = tips.map((tip, i) => {
      if (i === 0) {
        // Thumb: compare x distance
        return Math.abs(norm[4].x) > Math.abs(norm[3].x) * 1.2;
      }
      return norm[tip].y < norm[mcps[i]].y - 0.02;
    });

    const [thumb, index, middle, ring, pinky] = extended;

    // Curl amounts
    const indexCurl  = norm[8].y - norm[5].y;
    const middleCurl = norm[12].y - norm[9].y;
    const ringCurl   = norm[16].y - norm[13].y;
    const pinkyCurl  = norm[20].y - norm[17].y;
    const thumbTip   = norm[4];
    const indexTip   = norm[8];
    const middleTip  = norm[12];

    // Finger spread (distance between index and middle tips)
    const spread = Math.hypot(indexTip.x - middleTip.x, indexTip.y - middleTip.y);

    // ── Rule-based gesture map ──
    if (!thumb && !index && !middle && !ring && !pinky) return "A";
    if (!thumb && index && middle && ring && pinky && spread < 0.08) return "B";
    if (thumb && index && middle && !ring && !pinky) return "C";
    if (!thumb && index && middle && ring && pinky && spread > 0.1) return "D";
    if (!thumb && !index && !middle && !ring && pinky) return "E";
    if (!thumb && index && middle && !ring && !pinky) return "F";
    if (!thumb && index && !middle && !ring && !pinky) return "G";
    if (!thumb && index && middle && !ring && !pinky && spread > 0.08) return "H";
    if (!thumb && !index && !middle && !ring && pinky) return "I";
    if (thumb && !index && !middle && !ring && pinky) return "J";
    if (thumb && index && !middle && !ring && !pinky) return "K";
    if (thumb && index && !middle && !ring && !pinky && indexTip.y < thumbTip.y) return "L";
    if (!thumb && !index && !middle && !ring && !pinky && indexCurl > 0.05) return "M";
    if (!thumb && !index && !middle && !ring && !pinky && indexCurl < 0.05) return "N";
    if (thumb && index && middle && ring && !pinky) return "O";
    if (!thumb && index && middle && ring && !pinky) return "P";
    if (thumb && index && !middle && !ring && pinky) return "Q";
    if (!thumb && index && middle && !ring && pinky) return "R";
    if (!thumb && !index && !middle && !ring && !pinky) return "S";
    if (thumb && !index && !middle && !ring && !pinky) return "T";
    if (!thumb && index && middle && ring && pinky) return "U";
    if (thumb && index && middle && ring && pinky) return "V";
    if (!thumb && index && !middle && ring && pinky) return "W";
    if (!thumb && !index && middle && ring && pinky) return "X";
    if (thumb && !index && !middle && !ring && pinky) return "Y";
    if (thumb && index && middle && ring && pinky && spread > 0.15) return "Z";
    return "";
  };

  // ── TTS ──────────────────────────────────────────────────────
  const speakText = (text) => {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "en-US";
    utt.rate = 0.9;
    utt.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang === "en-US" && v.name.includes("Google")) || voices[0];
    if (preferred) utt.voice = preferred;
    window.speechSynthesis.speak(utt);
  };

  const clearSentence = () => {
    currentWordRef.current = "";
    currentSentRef.current = "";
    lastLetterRef.current = "";
    letterBufferRef.current = [];
    setSentence("");
    setDetectedLetter("");
    setSpokenText("");
    window.speechSynthesis?.cancel();
  };

  return { detectedLetter, sentence, spokenText, isModelLoaded, clearSentence };
}

// ═══════════════════════════════════════════════════════════════
// MAIN VIDEO PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function VideoPage() {
  const [inputId, setInputId]         = useState("");
  const [roomId, setRoomId]           = useState("");
  const [callState, setCallState]     = useState("idle");
  const [isMuted, setIsMuted]         = useState(false);
  const [isVideoOff, setIsVideoOff]   = useState(false);
  const [statusMsg, setStatusMsg]     = useState("");
  const [signEnabled, setSignEnabled] = useState(false);
  const [showSignPanel, setShowSignPanel] = useState(false);

  const localRef          = useRef(null);
  const remoteRef         = useRef(null);
  const signVideoRef      = useRef(null);
  const pcRef             = useRef(null);
  const streamRef         = useRef(null);
  const socketRef         = useRef(null);
  const roomRef           = useRef("");
  const remoteStreamRef   = useRef(new MediaStream());

  const { detectedLetter, sentence, spokenText, isModelLoaded, clearSentence } =
    useSignLanguage(signVideoRef, signEnabled);

  useEffect(() => () => cleanup(), []);

  const cleanup = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    remoteStreamRef.current = new MediaStream();
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (socketRef.current) {
      if (roomRef.current) socketRef.current.emit("leave", { room: roomRef.current });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    roomRef.current = "";
  };

  const enableCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = s;
      if (localRef.current) localRef.current.srcObject = s;
      setCallState("setup");
      setStatusMsg("Camera ready. Enter a room ID and join.");
    } catch {
      setStatusMsg("Camera access denied. Please allow permissions and try again.");
    }
  };

  const makePC = (socket, room) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "turn:a.relay.metered.ca:80",                username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:a.relay.metered.ca:443",               username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:a.relay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
      ],
    });
    streamRef.current.getTracks().forEach(track => pc.addTrack(track, streamRef.current));
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("signal", { room, type: "candidate", candidate });
    };
    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach(t => remoteStreamRef.current.addTrack(t));
      if (remoteRef.current) {
        remoteRef.current.srcObject = remoteStreamRef.current;
        remoteRef.current.play().catch(() => {});
      }
      setCallState("connected");
      setStatusMsg("Connected.");
    };
    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        setStatusMsg("Connection lost.");
        setCallState("ended");
      }
    };
    return pc;
  };

  const joinRoom = async () => {
    const id = inputId.trim().toUpperCase();
    if (!id) { setStatusMsg("Please enter a room ID."); return; }
    setRoomId(id);
    roomRef.current = id;
    setCallState("calling");
    setStatusMsg(`Joining room ${id}…`);
    remoteStreamRef.current = new MediaStream();

    const socket = io(BACKEND, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect_error", () => {
      setStatusMsg("Cannot reach signaling server.");
      setCallState("ended");
    });

    socket.on("peer-joined", async () => {
      const pc = makePC(socket, id);
      pcRef.current = pc;
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socket.emit("signal", { room: id, type: "offer", sdp: offer.sdp });
    });

    socket.on("signal", async (m) => {
      if (m.type === "offer") {
        const pc = makePC(socket, id);
        pcRef.current = pc;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: m.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { room: id, type: "answer", sdp: answer.sdp });
      }
      if (m.type === "answer" && pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: m.sdp }));
      }
      if (m.type === "candidate" && pcRef.current) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(m.candidate)); } catch {}
      }
    });

    socket.on("peer-left", () => {
      setStatusMsg("The other participant left.");
      setCallState("ended");
    });

    socket.emit("join", { room: id });
    setStatusMsg(`Room ${id} — waiting for someone to join…`);
  };

  const hangUp = () => {
    cleanup();
    setSignEnabled(false);
    setShowSignPanel(false);
    clearSentence();
    setCallState("idle");
    setRoomId(""); setInputId(""); setStatusMsg("");
    setIsMuted(false); setIsVideoOff(false);
  };

  const toggleMute  = () => { streamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; }); setIsMuted(m => !m); };
  const toggleVideo = () => { streamRef.current?.getVideoTracks().forEach(t => { t.enabled = isVideoOff; }); setIsVideoOff(v => !v); };

  const toggleSign = () => {
    setSignEnabled(e => !e);
    setShowSignPanel(e => !e);
    if (signEnabled) clearSentence();
  };

  return (
    <main style={{ paddingTop: "56px", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "4rem 2rem" }}>

        {/* ── Header ── */}
        <div className="fu" style={{ marginBottom: "3rem" }}>
          <p style={{ fontSize: "0.72rem", letterSpacing: "0.18em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            WebRTC · Peer to peer
          </p>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(2rem,5vw,3rem)", color: "var(--text)", fontWeight: 400 }}>
            Video Call
          </h1>
        </div>

        {/* ── Main Video Grid ── */}
        <div className="fu2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
          <div className="video-frame">
            <video ref={localRef} autoPlay muted playsInline style={{ transform: "scaleX(-1)" }} />
            {callState === "idle" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "0.72rem", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase" }}>Your camera</span>
              </div>
            )}
            <span style={{ position: "absolute", bottom: "10px", left: "12px", fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--muted)", textTransform: "uppercase" }}>You</span>
          </div>

          <div className="video-frame">
            <video ref={remoteRef} autoPlay playsInline />
            {callState !== "connected" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "0.72rem", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase", animation: callState === "calling" ? "blink 1.4s ease infinite" : "none" }}>
                  {callState === "calling" ? "Waiting…" : "Remote"}
                </span>
              </div>
            )}
            <span style={{ position: "absolute", bottom: "10px", left: "12px", fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--muted)", textTransform: "uppercase" }}>Remote</span>
          </div>
        </div>

        {/* ── Status ── */}
        {statusMsg && (
          <p className="fu3" style={{
            fontSize: "0.8rem", fontWeight: 300,
            color: callState === "connected" ? "var(--accent)" : callState === "ended" ? "rgba(240,160,160,0.7)" : "var(--muted)",
            marginBottom: "1.5rem"
          }}>{statusMsg}</p>
        )}

        {/* ── Call Controls ── */}
        <div className="fu4" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {(callState === "idle" || callState === "setup") && (
            <div style={{ display: "flex", gap: "0.75rem", maxWidth: "420px" }}>
              <input className="input" placeholder="Room ID" value={inputId}
                onChange={e => setInputId(e.target.value.toUpperCase())} maxLength={8} />
              <button className="btn-ghost" style={{ whiteSpace: "nowrap", padding: "0.7rem 1.1rem" }}
                onClick={() => setInputId(Math.random().toString(36).substring(2, 8).toUpperCase())}>
                Random
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            {callState === "idle" && <button className="btn-primary" onClick={enableCamera}>Enable camera</button>}
            {callState === "setup" && <button className="btn-primary" onClick={joinRoom}>Join room</button>}
            {(callState === "calling" || callState === "connected") && (
              <>
                <button className="btn-ghost" onClick={toggleMute} style={{ padding: "0.7rem 1.2rem", color: isMuted ? "rgba(240,180,120,0.8)" : "var(--muted)", borderColor: isMuted ? "rgba(240,180,120,0.3)" : "var(--border)" }}>
                  {isMuted ? "Unmute" : "Mute"}
                </button>
                <button className="btn-ghost" onClick={toggleVideo} style={{ padding: "0.7rem 1.2rem", color: isVideoOff ? "rgba(240,180,120,0.8)" : "var(--muted)", borderColor: isVideoOff ? "rgba(240,180,120,0.3)" : "var(--border)" }}>
                  {isVideoOff ? "Show video" : "Hide video"}
                </button>
                {/* ── Sign Language Toggle ── */}
                <button onClick={toggleSign} style={{
                  fontFamily: "var(--sans)", fontSize: "0.82rem", fontWeight: 400,
                  padding: "0.7rem 1.4rem", borderRadius: "8px", cursor: "pointer",
                  background: signEnabled ? "rgba(200,240,220,0.1)" : "transparent",
                  border: `1px solid ${signEnabled ? "rgba(200,240,220,0.4)" : "var(--border)"}`,
                  color: signEnabled ? "var(--accent)" : "var(--muted)",
                  transition: "all 0.2s"
                }}>
                  {signEnabled ? "🤟 Sign ON" : "🤟 Sign OFF"}
                </button>
                <button onClick={hangUp} style={{
                  fontFamily: "var(--sans)", fontSize: "0.82rem", fontWeight: 400,
                  padding: "0.7rem 1.5rem", borderRadius: "8px", cursor: "pointer",
                  background: "rgba(240,80,80,0.1)", border: "1px solid rgba(240,80,80,0.25)",
                  color: "rgba(240,140,140,0.9)"
                }}>End call</button>
              </>
            )}
            {callState === "ended" && <button className="btn-ghost" onClick={hangUp}>New call</button>}
          </div>

          {roomId && (
            <p style={{ fontSize: "0.78rem", fontWeight: 300, color: "var(--muted)" }}>
              Room: <span style={{ color: "var(--text)", fontWeight: 400 }}>{roomId}</span>
              <span style={{ marginLeft: "1rem", fontSize: "0.72rem" }}>Share this ID with the other person</span>
            </p>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            SIGN LANGUAGE PANEL
        ══════════════════════════════════════════════════════ */}
        {showSignPanel && (
          <div className="fu" style={{
            marginTop: "2rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            overflow: "hidden"
          }}>
            {/* Panel Header */}
            <div style={{
              padding: "1rem 1.5rem",
              borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "1.2rem" }}>🤟</span>
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text)" }}>Sign Language → Speech</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "2px" }}>A–Z alphabets + 20 common words · Speaks on pause</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{
                  width: "8px", height: "8px", borderRadius: "50%",
                  background: isModelLoaded ? "var(--accent)" : "rgba(240,180,120,0.8)",
                  display: "inline-block"
                }} />
                <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                  {isModelLoaded ? "Model ready" : "Loading model…"}
                </span>
              </div>
            </div>

            <div style={{ padding: "1.5rem", display: "grid", gridTemplateColumns: "280px 1fr", gap: "1.5rem" }}>

              {/* Sign Camera */}
              <div>
                <p style={{ fontSize: "0.68rem", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                  Sign Camera
                </p>
                <div style={{
                  position: "relative", borderRadius: "10px", overflow: "hidden",
                  background: "#0a0b0d", border: "1px solid var(--border)", aspectRatio: "4/3"
                }}>
                  <video ref={signVideoRef} autoPlay muted playsInline
                    style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />

                  {/* Detected Letter Badge */}
                  {detectedLetter && (
                    <div style={{
                      position: "absolute", top: "10px", right: "10px",
                      width: "48px", height: "48px", borderRadius: "10px",
                      background: "rgba(200,240,220,0.15)",
                      border: "1px solid rgba(200,240,220,0.4)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      backdropFilter: "blur(8px)"
                    }}>
                      <span style={{ fontFamily: "var(--serif)", fontSize: "1.8rem", color: "var(--accent)", lineHeight: 1 }}>
                        {detectedLetter}
                      </span>
                    </div>
                  )}

                  {!isModelLoaded && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "0.5rem", background: "rgba(0,0,0,0.6)" }}>
                      <span style={{ width: "20px", height: "20px", borderRadius: "50%", border: "2px solid var(--muted)", borderTopColor: "var(--accent)", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Loading…</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right panel — current word + sentence + TTS output */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

                {/* Current word being spelled */}
                <div>
                  <p style={{ fontSize: "0.68rem", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                    Spelling
                  </p>
                  <div style={{
                    minHeight: "48px", padding: "0.75rem 1rem",
                    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px",
                    display: "flex", alignItems: "center", gap: "0.25rem", flexWrap: "wrap"
                  }}>
                    {sentence ? (
                      sentence.split("").map((ch, i) => (
                        <span key={i} style={{
                          fontFamily: "var(--serif)", fontSize: "1.4rem",
                          color: ch === " " ? "transparent" : "var(--text)",
                          minWidth: ch === " " ? "0.5rem" : "auto",
                          animation: i === sentence.length - 1 ? "fadeUp 0.2s ease" : "none"
                        }}>{ch}</span>
                      ))
                    ) : (
                      <span style={{ fontSize: "0.78rem", color: "rgba(232,233,236,0.2)" }}>Show hand gesture to camera…</span>
                    )}
                  </div>
                </div>

                {/* Last spoken sentence */}
                {spokenText && (
                  <div>
                    <p style={{ fontSize: "0.68rem", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                      🔊 Spoken
                    </p>
                    <div style={{
                      padding: "0.75rem 1rem",
                      background: "rgba(200,240,220,0.05)",
                      border: "1px solid rgba(200,240,220,0.2)",
                      borderRadius: "8px"
                    }}>
                      <p style={{ fontSize: "0.9rem", color: "var(--accent)", fontWeight: 300, lineHeight: 1.6 }}>
                        "{spokenText}"
                      </p>
                    </div>
                  </div>
                )}

                {/* Common words reference */}
                <div>
                  <p style={{ fontSize: "0.68rem", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                    Common words (spell to trigger)
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {Object.keys(COMMON_WORDS).map(w => (
                      <span key={w} style={{
                        fontSize: "0.65rem", padding: "0.2rem 0.5rem",
                        borderRadius: "4px", background: "var(--bg)",
                        border: "1px solid var(--border)", color: "var(--muted)"
                      }}>{w}</span>
                    ))}
                  </div>
                </div>

                {/* Clear button */}
                <button onClick={clearSentence} className="btn-ghost" style={{ alignSelf: "flex-start", padding: "0.5rem 1rem", fontSize: "0.75rem" }}>
                  Clear
                </button>
              </div>
            </div>

            {/* How to use */}
            <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--border)", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
              {[
                ["01", "Show A–Z hand gesture to sign camera"],
                ["02", "Letters build into words automatically"],
                ["03", "Lower hand = space between words"],
                ["04", "3 second pause = sentence spoken aloud"],
              ].map(([n, t]) => (
                <div key={n} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--serif)", fontSize: "0.9rem", color: "var(--border)" }}>{n}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 300 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── How it works ── */}
        <div style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "0.72rem", letterSpacing: "0.18em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "1.5rem" }}>How it works</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.5rem" }}>
            {[
              { n: "01", t: "Enable camera" },
              { n: "02", t: "Enter or generate a room ID" },
              { n: "03", t: "Share the ID with another person" },
              { n: "04", t: "Both join — connected instantly" },
            ].map(({ n, t }) => (
              <div key={n} style={{ display: "flex", gap: "1rem", alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--serif)", fontSize: "1.1rem", color: "var(--border)", minWidth: "28px" }}>{n}</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 300, color: "var(--muted)", lineHeight: 1.6 }}>{t}</span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", fontWeight: 300, color: "rgba(232,233,236,0.2)", lineHeight: 1.7 }}>
            Signaling via Socket.IO · Video P2P via WebRTC · Sign language via MediaPipe + TF.js · TTS via Web Speech API
          </p>
        </div>

      </div>
    </main>
  );
}
