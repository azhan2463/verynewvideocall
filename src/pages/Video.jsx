import { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";

const BACKEND = import.meta.env.DEV ? "http://localhost:5000" : window.location.origin;

// ── ASL common word map ────────────────────────────────────────
const COMMON_WORDS = {
  "HELLO":"Hello","HELP":"Help","WATER":"Water","FOOD":"Food",
  "YES":"Yes","NO":"No","GOOD":"Good","BAD":"Bad","PAIN":"Pain",
  "NAME":"Name","AGE":"Age","HOME":"Home","WORK":"Work",
  "MONEY":"Money","THANK":"Thank you","SORRY":"Sorry",
  "STOP":"Stop","GO":"Go","COME":"Come","CALL":"Call",
};

// ── TTS helper ────────────────────────────────────────────────
function speakText(text) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "en-US"; utt.rate = 0.9; utt.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const pref = voices.find(v => v.lang === "en-US" && v.name.includes("Google")) || voices[0];
  if (pref) utt.voice = pref;
  window.speechSynthesis.speak(utt);
}

// ── Sign Language Hook ────────────────────────────────────────
// onSentenceReady(sentence) → called when sentence complete
function useSignLanguage(videoRef, enabled, onSentenceReady) {
  const [detectedLetter, setDetectedLetter] = useState("");
  const [sentence, setSentence]             = useState("");
  const [isModelLoaded, setIsModelLoaded]   = useState(false);

  const letterBufferRef = useRef([]);
  const currentWordRef  = useRef("");
  const currentSentRef  = useRef("");
  const lastLetterRef   = useRef("");
  const pauseTimerRef   = useRef(null);
  const noHandTimerRef  = useRef(null);
  const handsRef        = useRef(null);
  const cameraRef       = useRef(null);
  const rafRef          = useRef(null);
  const onReadyRef      = useRef(onSentenceReady);
  useEffect(() => { onReadyRef.current = onSentenceReady; }, [onSentenceReady]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const loadLibs = async () => {
      try {
        if (!window.tf) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.13.0/dist/tf.min.js");
        if (!window.Hands) {
          await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
          await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
        }
        if (cancelled) return;
        const hands = new window.Hands({
          locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
        });
        hands.setOptions({ maxNumHands:1, modelComplexity:1, minDetectionConfidence:0.75, minTrackingConfidence:0.65 });
        hands.onResults(onHandResults);
        await hands.initialize();
        handsRef.current = hands;
        if (!cancelled) setIsModelLoaded(true);
      } catch(e) { console.error("Sign load error:", e); }
    };
    loadLibs();
    return () => { cancelled = true; stopCamera(); };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isModelLoaded || !videoRef.current || !handsRef.current) return;
    startCamera();
    return () => stopCamera();
  }, [enabled, isModelLoaded]);

  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width:320, height:240 } });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      cameraRef.current = stream;
      processFrame();
    } catch(e) { console.error("Sign camera error:", e); }
  };

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    cameraRef.current?.getTracks().forEach(t => t.stop());
    cameraRef.current = null;
  };

  const processFrame = async () => {
    if (!videoRef.current || !handsRef.current) return;
    if (videoRef.current.readyState >= 2)
      await handsRef.current.send({ image: videoRef.current });
    rafRef.current = requestAnimationFrame(processFrame);
  };

  // ── Fire sentence → calls onSentenceReady so caller can send via socket ──
  const fireSentence = () => {
    const word = currentWordRef.current;
    if (word) {
      const spoken = COMMON_WORDS[word] || word;
      currentSentRef.current = (currentSentRef.current + " " + spoken).trim();
      currentWordRef.current = "";
    }
    if (currentSentRef.current) {
      const final = currentSentRef.current;
      setSentence(""); setDetectedLetter("");
      currentSentRef.current = "";
      // ── KEY: call parent's callback (sends via socket to remote) ──
      onReadyRef.current(final);
    }
  };

  const onHandResults = (results) => {
    if (!results.multiHandLandmarks?.length) {
      clearTimeout(noHandTimerRef.current);
      noHandTimerRef.current = setTimeout(() => {
        if (currentWordRef.current) {
          const word = currentWordRef.current;
          const spoken = COMMON_WORDS[word] || word;
          currentSentRef.current = (currentSentRef.current + " " + spoken).trim();
          currentWordRef.current = "";
          setSentence(currentSentRef.current);
          setDetectedLetter("");
          clearTimeout(pauseTimerRef.current);
          pauseTimerRef.current = setTimeout(fireSentence, 2500);
        }
      }, 800);
      return;
    }
    clearTimeout(noHandTimerRef.current);
    const letter = classifyFromLandmarks(results.multiHandLandmarks[0]);
    if (!letter) return;

    letterBufferRef.current.push(letter);
    if (letterBufferRef.current.length > 8) letterBufferRef.current.shift();
    const counts = {};
    letterBufferRef.current.forEach(l => counts[l] = (counts[l] || 0) + 1);
    const [best, votes] = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];

    if (votes >= 5 && best !== lastLetterRef.current) {
      lastLetterRef.current = best;
      currentWordRef.current += best;
      setDetectedLetter(best);
      setSentence((currentSentRef.current + " " + currentWordRef.current).trim());
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(fireSentence, 3000);
    }
  };

  // ── Geometry-based A–Z classifier ────────────────────────────
  const classifyFromLandmarks = (lm) => {
    const w = lm[0];
    const n = lm.map(p => ({ x: p.x - w.x, y: p.y - w.y, z: p.z - w.z }));
    const tips = [4, 8, 12, 16, 20];
    const mcps = [2, 5,  9, 13, 17];
    const ext = tips.map((tip, i) => {
      if (i === 0) return Math.abs(n[4].x) > Math.abs(n[3].x) * 1.2;
      return n[tip].y < n[mcps[i]].y - 0.02;
    });
    const [thumb, index, middle, ring, pinky] = ext;
    const sp = Math.hypot(n[8].x - n[12].x, n[8].y - n[12].y);
    const iC = n[8].y - n[5].y;

    if (!thumb && !index && !middle && !ring && !pinky) return iC > 0.05 ? "M" : (iC < -0.05 ? "N" : "A");
    if (!thumb &&  index &&  middle &&  ring  &&  pinky && sp < 0.08) return "B";
    if ( thumb &&  index &&  middle && !ring  && !pinky && sp > 0.1)  return "C";
    if (!thumb &&  index &&  middle &&  ring  &&  pinky && sp > 0.1)  return "D";
    if (!thumb && !index && !middle && !ring  &&  pinky) return "I";
    if (!thumb &&  index && !middle && !ring  && !pinky) return "G";
    if (!thumb &&  index &&  middle && !ring  && !pinky && sp < 0.08) return "H";
    if ( thumb && !index && !middle && !ring  &&  pinky) return "J";
    if ( thumb &&  index && !middle && !ring  && !pinky && n[8].y > n[4].y) return "K";
    if ( thumb &&  index && !middle && !ring  && !pinky && n[8].y < n[4].y) return "L";
    if ( thumb &&  index &&  middle &&  ring  && !pinky) return "O";
    if (!thumb &&  index &&  middle &&  ring  && !pinky) return "P";
    if ( thumb &&  index && !middle && !ring  &&  pinky) return "Y";
    if (!thumb &&  index &&  middle && !ring  && !pinky && sp > 0.09) return "F";
    if (!thumb &&  index &&  middle &&  ring  &&  pinky && sp > 0.12) return "V";
    if ( thumb &&  index &&  middle &&  ring  &&  pinky && sp > 0.15) return "W";
    if (!thumb && !index &&  middle &&  ring  &&  pinky) return "X";
    if (!thumb &&  index && !middle &&  ring  &&  pinky) return "R";
    if ( thumb && !index && !middle && !ring  && !pinky) return "T";
    if (!thumb &&  index &&  middle &&  ring  &&  pinky) return "U";
    if ( thumb &&  index &&  middle &&  ring  &&  pinky) return "Z";
    return "S";
  };

  const clearSentence = () => {
    currentWordRef.current = ""; currentSentRef.current = "";
    lastLetterRef.current = ""; letterBufferRef.current = [];
    setSentence(""); setDetectedLetter("");
    window.speechSynthesis?.cancel();
  };

  return { detectedLetter, sentence, isModelLoaded, clearSentence };
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function VideoPage() {
  const [inputId, setInputId]           = useState("");
  const [roomId, setRoomId]             = useState("");
  const [callState, setCallState]       = useState("idle");
  const [isMuted, setIsMuted]           = useState(false);
  const [isVideoOff, setIsVideoOff]     = useState(false);
  const [statusMsg, setStatusMsg]       = useState("");
  const [signEnabled, setSignEnabled]   = useState(false);
  const [showSignPanel, setShowSignPanel] = useState(false);
  // ── Received sign text from REMOTE peer ──────────────────────
  const [remoteSignText, setRemoteSignText] = useState("");
  const [remoteSignFlash, setRemoteSignFlash] = useState(false);

  const localRef        = useRef(null);
  const remoteRef       = useRef(null);
  const signVideoRef    = useRef(null);
  const pcRef           = useRef(null);
  const streamRef       = useRef(null);
  const socketRef       = useRef(null);
  const roomRef         = useRef("");
  const remoteStreamRef = useRef(new MediaStream());

  // ── When LOCAL user completes a sentence → send to REMOTE ────
  const handleSentenceReady = (sentence) => {
    // Send via Socket.IO to remote peer
    if (socketRef.current && roomRef.current) {
      socketRef.current.emit("sign_text", {
        room: roomRef.current,
        text: sentence,
      });
    }
    // DO NOT speak locally — remote peer speaks it
    // Just show it on local side as "sent"
  };

  const { detectedLetter, sentence, isModelLoaded, clearSentence } =
    useSignLanguage(signVideoRef, signEnabled, handleSentenceReady);

  useEffect(() => () => cleanup(), []);

  const cleanup = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    remoteStreamRef.current = new MediaStream();
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (socketRef.current) {
      if (roomRef.current) socketRef.current.emit("leave", { room: roomRef.current });
      socketRef.current.disconnect(); socketRef.current = null;
    }
    roomRef.current = "";
  };

  const enableCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
      streamRef.current = s;
      if (localRef.current) localRef.current.srcObject = s;
      setCallState("setup");
      setStatusMsg("Camera ready. Enter a room ID and join.");
    } catch {
      setStatusMsg("Camera access denied. Please allow permissions and try again.");
    }
  };

  const makePC = async (socket, room) => {
    let iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];
    try {
      const res = await fetch("https://silenttalk.metered.live/api/v1/turn/credentials?apiKey=YOUR_METERED_API_KEY");
      const turnServers = await res.json();
      iceServers = [...iceServers, ...turnServers];
    } catch {
      iceServers.push(
        { urls:"turn:a.relay.metered.ca:80",                username:"openrelayproject", credential:"openrelayproject" },
        { urls:"turn:a.relay.metered.ca:443",               username:"openrelayproject", credential:"openrelayproject" },
        { urls:"turn:a.relay.metered.ca:443?transport=tcp", username:"openrelayproject", credential:"openrelayproject" }
      );
    }
    const pc = new RTCPeerConnection({ iceServers });
    streamRef.current.getTracks().forEach(track => pc.addTrack(track, streamRef.current));
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("signal", { room, type:"candidate", candidate });
    };
    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach(t => remoteStreamRef.current.addTrack(t));
      if (remoteRef.current) {
        remoteRef.current.srcObject = remoteStreamRef.current;
        remoteRef.current.play().catch(() => {});
      }
      setCallState("connected"); setStatusMsg("Connected.");
    };
    pc.onconnectionstatechange = () => {
      if (["disconnected","failed","closed"].includes(pc.connectionState)) {
        setStatusMsg("Connection lost."); setCallState("ended");
      }
    };
    return pc;
  };

  const joinRoom = async () => {
    const id = inputId.trim().toUpperCase();
    if (!id) { setStatusMsg("Please enter a room ID."); return; }
    setRoomId(id); roomRef.current = id;
    setCallState("calling"); setStatusMsg(`Joining room ${id}…`);
    remoteStreamRef.current = new MediaStream();

    const socket = io(BACKEND, { transports:["websocket"] });
    socketRef.current = socket;

    socket.on("connect_error", () => {
      setStatusMsg("Cannot reach signaling server."); setCallState("ended");
    });

    // ── Receive sign text sent by REMOTE peer ─────────────────
    // Remote signed → their browser sent it here → WE speak it
    socket.on("sign_text", ({ text }) => {
      if (!text) return;
      setRemoteSignText(text);
      setRemoteSignFlash(true);
      setTimeout(() => setRemoteSignFlash(false), 300);
      // ── Speak it on this (receiver) side ──
      speakText(text);
    });

    socket.on("peer-joined", async () => {
      const pc = await makePC(socket, id);
      pcRef.current = pc;
      const offer = await pc.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:true });
      await pc.setLocalDescription(offer);
      socket.emit("signal", { room:id, type:"offer", sdp:offer.sdp });
    });

    socket.on("signal", async (m) => {
      if (m.type === "offer") {
        const pc = await makePC(socket, id);
        pcRef.current = pc;
        await pc.setRemoteDescription(new RTCSessionDescription({ type:"offer", sdp:m.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { room:id, type:"answer", sdp:answer.sdp });
      }
      if (m.type === "answer" && pcRef.current)
        await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type:"answer", sdp:m.sdp }));
      if (m.type === "candidate" && pcRef.current)
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(m.candidate)); } catch {}
    });

    socket.on("peer-left", () => { setStatusMsg("The other participant left."); setCallState("ended"); });

    socket.emit("join", { room:id });
    setStatusMsg(`Room ${id} — waiting for someone to join…`);
  };

  const hangUp = () => {
    cleanup(); setSignEnabled(false); setShowSignPanel(false);
    clearSentence(); setRemoteSignText("");
    setCallState("idle"); setRoomId(""); setInputId(""); setStatusMsg("");
    setIsMuted(false); setIsVideoOff(false);
  };

  const toggleMute  = () => { streamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; }); setIsMuted(m => !m); };
  const toggleVideo = () => { streamRef.current?.getVideoTracks().forEach(t => { t.enabled = isVideoOff; }); setIsVideoOff(v => !v); };
  const toggleSign  = () => {
    const next = !signEnabled;
    setSignEnabled(next); setShowSignPanel(next);
    if (!next) clearSentence();
  };

  return (
    <main style={{ paddingTop:"56px", minHeight:"100vh" }}>
      <div style={{ maxWidth:"960px", margin:"0 auto", padding:"4rem 2rem" }}>

        {/* Header */}
        <div className="fu" style={{ marginBottom:"3rem" }}>
          <p style={{ fontSize:"0.72rem", letterSpacing:"0.18em", color:"var(--muted)", textTransform:"uppercase", marginBottom:"0.75rem" }}>
            WebRTC · Peer to peer
          </p>
          <h1 style={{ fontFamily:"var(--serif)", fontSize:"clamp(2rem,5vw,3rem)", color:"var(--text)", fontWeight:400 }}>
            Video Call
          </h1>
        </div>

        {/* Video Grid */}
        <div className="fu2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem", marginBottom:"2rem" }}>
          <div className="video-frame">
            <video ref={localRef} autoPlay muted playsInline style={{ transform:"scaleX(-1)" }} />
            {callState === "idle" && (
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:"0.72rem", letterSpacing:"0.15em", color:"var(--muted)", textTransform:"uppercase" }}>Your camera</span>
              </div>
            )}
            <span style={{ position:"absolute", bottom:"10px", left:"12px", fontSize:"0.6rem", letterSpacing:"0.12em", color:"var(--muted)", textTransform:"uppercase" }}>You</span>
          </div>

          <div className="video-frame">
            <video ref={remoteRef} autoPlay playsInline />
            {callState !== "connected" && (
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:"0.72rem", letterSpacing:"0.15em", color:"var(--muted)", textTransform:"uppercase", animation: callState === "calling" ? "blink 1.4s ease infinite" : "none" }}>
                  {callState === "calling" ? "Waiting…" : "Remote"}
                </span>
              </div>
            )}
            <span style={{ position:"absolute", bottom:"10px", left:"12px", fontSize:"0.6rem", letterSpacing:"0.12em", color:"var(--muted)", textTransform:"uppercase" }}>Remote</span>

            {/* ── Remote sign text overlay on remote video ── */}
            {remoteSignText && (
              <div style={{
                position:"absolute", bottom:"32px", left:0, right:0,
                display:"flex", justifyContent:"center", padding:"0 12px"
              }}>
                <div style={{
                  background: remoteSignFlash ? "rgba(200,240,220,0.25)" : "rgba(0,0,0,0.65)",
                  border:"1px solid rgba(200,240,220,0.4)",
                  borderRadius:"8px", padding:"6px 14px",
                  backdropFilter:"blur(8px)",
                  transition:"background 0.2s ease",
                  maxWidth:"100%"
                }}>
                  <p style={{ fontSize:"0.8rem", color:"var(--accent)", margin:0, textAlign:"center" }}>
                    🤟 {remoteSignText}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        {statusMsg && (
          <p className="fu3" style={{
            fontSize:"0.8rem", fontWeight:300,
            color: callState === "connected" ? "var(--accent)" : callState === "ended" ? "rgba(240,160,160,0.7)" : "var(--muted)",
            marginBottom:"1.5rem"
          }}>{statusMsg}</p>
        )}

        {/* Controls */}
        <div className="fu4" style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          {(callState === "idle" || callState === "setup") && (
            <div style={{ display:"flex", gap:"0.75rem", maxWidth:"420px" }}>
              <input className="input" placeholder="Room ID" value={inputId}
                onChange={e => setInputId(e.target.value.toUpperCase())} maxLength={8} />
              <button className="btn-ghost" style={{ whiteSpace:"nowrap", padding:"0.7rem 1.1rem" }}
                onClick={() => setInputId(Math.random().toString(36).substring(2,8).toUpperCase())}>
                Random
              </button>
            </div>
          )}

          <div style={{ display:"flex", gap:"0.75rem", alignItems:"center", flexWrap:"wrap" }}>
            {callState === "idle" && <button className="btn-primary" onClick={enableCamera}>Enable camera</button>}
            {callState === "setup" && <button className="btn-primary" onClick={joinRoom}>Join room</button>}
            {(callState === "calling" || callState === "connected") && (<>
              <button className="btn-ghost" onClick={toggleMute} style={{ padding:"0.7rem 1.2rem", color: isMuted ? "rgba(240,180,120,0.8)":"var(--muted)", borderColor: isMuted ? "rgba(240,180,120,0.3)":"var(--border)" }}>
                {isMuted ? "Unmute" : "Mute"}
              </button>
              <button className="btn-ghost" onClick={toggleVideo} style={{ padding:"0.7rem 1.2rem", color: isVideoOff ? "rgba(240,180,120,0.8)":"var(--muted)", borderColor: isVideoOff ? "rgba(240,180,120,0.3)":"var(--border)" }}>
                {isVideoOff ? "Show video" : "Hide video"}
              </button>
              {/* Sign Language toggle */}
              <button onClick={toggleSign} style={{
                fontFamily:"var(--sans)", fontSize:"0.82rem", fontWeight:400,
                padding:"0.7rem 1.4rem", borderRadius:"8px", cursor:"pointer",
                background: signEnabled ? "rgba(200,240,220,0.1)" : "transparent",
                border:`1px solid ${signEnabled ? "rgba(200,240,220,0.4)" : "var(--border)"}`,
                color: signEnabled ? "var(--accent)" : "var(--muted)",
                transition:"all 0.2s"
              }}>
                {signEnabled ? "🤟 Sign ON" : "🤟 Sign OFF"}
              </button>
              <button onClick={hangUp} style={{
                fontFamily:"var(--sans)", fontSize:"0.82rem", fontWeight:400,
                padding:"0.7rem 1.5rem", borderRadius:"8px", cursor:"pointer",
                background:"rgba(240,80,80,0.1)", border:"1px solid rgba(240,80,80,0.25)",
                color:"rgba(240,140,140,0.9)"
              }}>End call</button>
            </>)}
            {callState === "ended" && <button className="btn-ghost" onClick={hangUp}>New call</button>}
          </div>

          {roomId && (
            <p style={{ fontSize:"0.78rem", fontWeight:300, color:"var(--muted)" }}>
              Room: <span style={{ color:"var(--text)", fontWeight:400 }}>{roomId}</span>
              <span style={{ marginLeft:"1rem", fontSize:"0.72rem" }}>Share this ID with the other person</span>
            </p>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            SIGN LANGUAGE PANEL (sender side only)
        ══════════════════════════════════════════════════════ */}
        {showSignPanel && (
          <div className="fu" style={{
            marginTop:"2rem", background:"var(--surface)",
            border:"1px solid var(--border)", borderRadius:"14px", overflow:"hidden"
          }}>
            {/* Panel header */}
            <div style={{ padding:"1rem 1.5rem", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
                <span style={{ fontSize:"1.2rem" }}>🤟</span>
                <div>
                  <p style={{ fontSize:"0.82rem", fontWeight:500, color:"var(--text)" }}>Sign Language → Speech</p>
                  <p style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:"2px" }}>
                    Sign A–Z · pause for space · 3s pause = sent to receiver
                  </p>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
                <span style={{ width:"8px", height:"8px", borderRadius:"50%", background: isModelLoaded ? "var(--accent)" : "rgba(240,180,120,0.8)", display:"inline-block" }} />
                <span style={{ fontSize:"0.7rem", color:"var(--muted)" }}>{isModelLoaded ? "Model ready" : "Loading…"}</span>
              </div>
            </div>

            <div style={{ padding:"1.5rem", display:"grid", gridTemplateColumns:"280px 1fr", gap:"1.5rem" }}>
              {/* Sign camera */}
              <div>
                <p style={{ fontSize:"0.68rem", letterSpacing:"0.15em", color:"var(--muted)", textTransform:"uppercase", marginBottom:"0.5rem" }}>
                  Your Sign Camera
                </p>
                <div style={{ position:"relative", borderRadius:"10px", overflow:"hidden", background:"#0a0b0d", border:"1px solid var(--border)", aspectRatio:"4/3" }}>
                  <video ref={signVideoRef} autoPlay muted playsInline style={{ width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)" }} />
                  {detectedLetter && (
                    <div style={{ position:"absolute", top:"10px", right:"10px", width:"48px", height:"48px", borderRadius:"10px", background:"rgba(200,240,220,0.15)", border:"1px solid rgba(200,240,220,0.4)", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(8px)" }}>
                      <span style={{ fontFamily:"var(--serif)", fontSize:"1.8rem", color:"var(--accent)", lineHeight:1 }}>{detectedLetter}</span>
                    </div>
                  )}
                  {!isModelLoaded && (
                    <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"0.5rem", background:"rgba(0,0,0,0.6)" }}>
                      <span style={{ width:"20px", height:"20px", borderRadius:"50%", border:"2px solid var(--muted)", borderTopColor:"var(--accent)", display:"inline-block", animation:"spin 0.7s linear infinite" }} />
                      <span style={{ fontSize:"0.7rem", color:"var(--muted)" }}>Loading…</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right panel */}
              <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
                {/* Building text */}
                <div>
                  <p style={{ fontSize:"0.68rem", letterSpacing:"0.15em", color:"var(--muted)", textTransform:"uppercase", marginBottom:"0.5rem" }}>
                    Spelling now
                  </p>
                  <div style={{ minHeight:"48px", padding:"0.75rem 1rem", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:"8px", display:"flex", alignItems:"center", flexWrap:"wrap", gap:"2px" }}>
                    {sentence ? (
                      sentence.split("").map((ch, i) => (
                        <span key={i} style={{ fontFamily:"var(--serif)", fontSize:"1.4rem", color: ch===" " ? "transparent" : "var(--text)", minWidth: ch===" " ? "0.5rem" : "auto", animation: i===sentence.length-1 ? "fadeUp 0.2s ease" : "none" }}>{ch}</span>
                      ))
                    ) : (
                      <span style={{ fontSize:"0.78rem", color:"rgba(232,233,236,0.2)" }}>Show hand gesture to sign camera…</span>
                    )}
                  </div>
                </div>

                {/* How it works for receiver */}
                <div style={{ padding:"0.75rem 1rem", background:"rgba(200,240,220,0.05)", border:"1px solid rgba(200,240,220,0.15)", borderRadius:"8px" }}>
                  <p style={{ fontSize:"0.72rem", color:"var(--accent)", marginBottom:"4px", fontWeight:500 }}>🔊 How receiver hears you</p>
                  <p style={{ fontSize:"0.75rem", color:"var(--muted)", lineHeight:1.6 }}>
                    When you pause for 3 seconds, the translated text is sent to the other person's device.
                    Their browser speaks it aloud automatically. They also see the text overlaid on your video.
                  </p>
                </div>

                {/* Common words */}
                <div>
                  <p style={{ fontSize:"0.68rem", letterSpacing:"0.15em", color:"var(--muted)", textTransform:"uppercase", marginBottom:"0.5rem" }}>Common words</p>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"0.4rem" }}>
                    {Object.keys(COMMON_WORDS).map(w => (
                      <span key={w} style={{ fontSize:"0.65rem", padding:"0.2rem 0.5rem", borderRadius:"4px", background:"var(--bg)", border:"1px solid var(--border)", color:"var(--muted)" }}>{w}</span>
                    ))}
                  </div>
                </div>

                <button onClick={clearSentence} className="btn-ghost" style={{ alignSelf:"flex-start", padding:"0.5rem 1rem", fontSize:"0.75rem" }}>
                  Clear
                </button>
              </div>
            </div>

            {/* Steps */}
            <div style={{ padding:"1rem 1.5rem", borderTop:"1px solid var(--border)", display:"flex", gap:"2rem", flexWrap:"wrap" }}>
              {[["01","Show A–Z gesture to sign camera"],["02","Letters build into words automatically"],["03","Lower hand = space between words"],["04","3 second pause = text sent to receiver's device → spoken aloud"]].map(([n,t]) => (
                <div key={n} style={{ display:"flex", gap:"0.75rem", alignItems:"baseline" }}>
                  <span style={{ fontFamily:"var(--serif)", fontSize:"0.9rem", color:"var(--border)" }}>{n}</span>
                  <span style={{ fontSize:"0.75rem", color:"var(--muted)", fontWeight:300 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        <div style={{ marginTop:"4rem", paddingTop:"2rem", borderTop:"1px solid var(--border)" }}>
          <p style={{ fontSize:"0.72rem", letterSpacing:"0.18em", color:"var(--muted)", textTransform:"uppercase", marginBottom:"1.5rem" }}>How it works</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:"1.5rem" }}>
            {[{n:"01",t:"Enable camera"},{n:"02",t:"Enter or generate a room ID"},{n:"03",t:"Share the ID with another person"},{n:"04",t:"Both join — connected instantly"}].map(({n,t}) => (
              <div key={n} style={{ display:"flex", gap:"1rem", alignItems:"baseline" }}>
                <span style={{ fontFamily:"var(--serif)", fontSize:"1.1rem", color:"var(--border)", minWidth:"28px" }}>{n}</span>
                <span style={{ fontSize:"0.82rem", fontWeight:300, color:"var(--muted)", lineHeight:1.6 }}>{t}</span>
              </div>
            ))}
          </div>
          <p style={{ marginTop:"1.5rem", fontSize:"0.75rem", fontWeight:300, color:"rgba(232,233,236,0.2)", lineHeight:1.7 }}>
            Signaling via Socket.IO · Video P2P via WebRTC · Sign language via MediaPipe · Text sent via Socket.IO → TTS on receiver's device
          </p>
        </div>

      </div>
    </main>
  );
}
