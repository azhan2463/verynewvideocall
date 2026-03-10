import { useState, useRef, useEffect, useCallback } from "react";
import { io } from "socket.io-client";

// ── Point this at your deployed backend (or localhost for dev) ──
const BACKEND = import.meta.env.DEV ? "http://localhost:5000" : window.location.origin;

export default function VideoPage() {
  const [inputId, setInputId]       = useState("");
  const [roomId, setRoomId]         = useState("");
  const [callState, setCallState]   = useState("idle"); // idle | setup | calling | connected | ended
  const [isMuted, setIsMuted]       = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [statusMsg, setStatusMsg]   = useState("");

  const localRef   = useRef(null);
  const remoteRef  = useRef(null);
  const pcRef      = useRef(null);
  const streamRef  = useRef(null);
  const socketRef  = useRef(null);
  const roomRef    = useRef("");

  // Cleanup everything on unmount
  useEffect(() => () => cleanup(), []);

  const cleanup = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (socketRef.current) {
      if (roomRef.current) {
        socketRef.current.emit("leave", { room: roomRef.current });
      }
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    roomRef.current = "";
  };

  // ── Step 1: turn on camera ──────────────────────────────────
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

  // ── Create RTCPeerConnection ────────────────────────────────
  const createPC = useCallback((socket, room) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    // Attach local tracks
    streamRef.current?.getTracks().forEach(t => pc.addTrack(t, streamRef.current));

    // Send ICE candidates to peer via server
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit("signal", { room, type: "candidate", candidate });
      }
    };

    // Show remote video when tracks arrive
    pc.ontrack = ({ streams }) => {
      if (remoteRef.current && streams[0]) {
        remoteRef.current.srcObject = streams[0];
        setCallState("connected");
        setStatusMsg("Connected.");
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (["disconnected", "failed"].includes(pc.iceConnectionState)) {
        setStatusMsg("Connection lost.");
        setCallState("ended");
      }
    };

    return pc;
  }, []);

  // ── Step 2: join room ───────────────────────────────────────
  const joinRoom = async () => {
    const id = inputId.trim().toUpperCase();
    if (!id) { setStatusMsg("Please enter a room ID."); return; }

    setRoomId(id);
    roomRef.current = id;
    setCallState("calling");
    setStatusMsg(`Joining room ${id}…`);

    // Connect socket
    const socket = io(BACKEND, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join", { room: id });
    });

    socket.on("connect_error", () => {
      setStatusMsg("Cannot reach signaling server. Is the backend running?");
      setCallState("ended");
    });

    // ── Signaling message handler ──
    socket.on("signal", async (m) => {
      const pc = pcRef.current;
      if (!pc || !m) return;

      if (m.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(m));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { room: id, ...answer });
        setCallState("connected");
        setStatusMsg("Connected.");
      }

      if (m.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(m));
        setCallState("connected");
        setStatusMsg("Connected.");
      }

      if (m.type === "candidate") {
        try { await pc.addIceCandidate(new RTCIceCandidate(m.candidate)); } catch {}
      }
    });

    // Peer left
    socket.on("peer-left", () => {
      setStatusMsg("The other participant left.");
      setCallState("ended");
    });

    // ── If a peer is already in the room, server fires "peer-joined" back
    //    to the *existing* peer. We are the newcomer, so we wait for an offer.
    //    The existing peer sends us an offer when they see "peer-joined".
    socket.on("peer-joined", async () => {
      // We are the host — create offer for the new joiner
      const pc = createPC(socket, id);
      pcRef.current = pc;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("signal", { room: id, ...offer });
      setStatusMsg(`Room ${id} — peer joined, connecting…`);
    });

    // Create PC now (as potential answerer)
    const pc = createPC(socket, id);
    pcRef.current = pc;

    setStatusMsg(`Room ${id} — waiting for someone to join…`);
  };

  // ── Hang up ─────────────────────────────────────────────────
  const hangUp = () => {
    cleanup();
    setCallState("idle");
    setRoomId(""); setInputId(""); setStatusMsg("");
    setIsMuted(false); setIsVideoOff(false);
  };

  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    setIsMuted(m => !m);
  };

  const toggleVideo = () => {
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = isVideoOff; });
    setIsVideoOff(v => !v);
  };

  // ── UI ───────────────────────────────────────────────────────
  return (
    <main style={{ paddingTop: "56px", minHeight: "100vh" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "4rem 2rem" }}>

        {/* Header */}
        <div className="fu" style={{ marginBottom: "3rem" }}>
          <p style={{ fontSize: "0.72rem", letterSpacing: "0.18em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            WebRTC · Peer to peer
          </p>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(2rem,5vw,3rem)", color: "var(--text)", fontWeight: 400 }}>
            Video Call
          </h1>
        </div>

        {/* Video grid */}
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
                <span style={{
                  fontSize: "0.72rem", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase",
                  animation: callState === "calling" ? "blink 1.4s ease infinite" : "none"
                }}>
                  {callState === "calling" ? "Waiting…" : "Remote"}
                </span>
              </div>
            )}
            <span style={{ position: "absolute", bottom: "10px", left: "12px", fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--muted)", textTransform: "uppercase" }}>Remote</span>
          </div>
        </div>

        {/* Status */}
        {statusMsg && (
          <p className="fu3" style={{
            fontSize: "0.8rem", fontWeight: 300,
            color: callState === "connected" ? "var(--accent)" : callState === "ended" ? "rgba(240,160,160,0.7)" : "var(--muted)",
            marginBottom: "1.5rem"
          }}>
            {statusMsg}
          </p>
        )}

        {/* Controls */}
        <div className="fu4" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          {(callState === "idle" || callState === "setup") && (
            <div style={{ display: "flex", gap: "0.75rem", maxWidth: "420px" }}>
              <input
                className="input"
                placeholder="Room ID"
                value={inputId}
                onChange={e => setInputId(e.target.value.toUpperCase())}
                maxLength={8}
              />
              <button className="btn-ghost" style={{ whiteSpace: "nowrap", padding: "0.7rem 1.1rem" }}
                onClick={() => setInputId(Math.random().toString(36).substring(2, 8).toUpperCase())}
              >
                Random
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            {callState === "idle" && (
              <button className="btn-primary" onClick={enableCamera}>Enable camera</button>
            )}
            {callState === "setup" && (
              <button className="btn-primary" onClick={joinRoom}>Join room</button>
            )}
            {(callState === "calling" || callState === "connected") && (
              <>
                <button className="btn-ghost" onClick={toggleMute} style={{
                  padding: "0.7rem 1.2rem",
                  color: isMuted ? "rgba(240,180,120,0.8)" : "var(--muted)",
                  borderColor: isMuted ? "rgba(240,180,120,0.3)" : "var(--border)"
                }}>
                  {isMuted ? "Unmute" : "Mute"}
                </button>
                <button className="btn-ghost" onClick={toggleVideo} style={{
                  padding: "0.7rem 1.2rem",
                  color: isVideoOff ? "rgba(240,180,120,0.8)" : "var(--muted)",
                  borderColor: isVideoOff ? "rgba(240,180,120,0.3)" : "var(--border)"
                }}>
                  {isVideoOff ? "Show video" : "Hide video"}
                </button>
                <button onClick={hangUp} style={{
                  fontFamily: "var(--sans)", fontSize: "0.82rem", fontWeight: 400,
                  padding: "0.7rem 1.5rem", borderRadius: "8px", cursor: "pointer",
                  background: "rgba(240,80,80,0.1)", border: "1px solid rgba(240,80,80,0.25)",
                  color: "rgba(240,140,140,0.9)", transition: "all 0.18s"
                }}>
                  End call
                </button>
              </>
            )}
            {callState === "ended" && (
              <button className="btn-ghost" onClick={hangUp}>New call</button>
            )}
          </div>

          {roomId && (
            <p style={{ fontSize: "0.78rem", fontWeight: 300, color: "var(--muted)" }}>
              Room: <span style={{ color: "var(--text)", fontWeight: 400 }}>{roomId}</span>
              <span style={{ marginLeft: "1rem", fontSize: "0.72rem" }}>Share this ID with the other person</span>
            </p>
          )}
        </div>

        {/* How it works */}
        <div style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "0.72rem", letterSpacing: "0.18em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "1.5rem" }}>
            How it works
          </p>
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
            Signaling via Socket.IO · Video streamed peer-to-peer via WebRTC · No video passes through the server
          </p>
        </div>

      </div>
    </main>
  );
}
