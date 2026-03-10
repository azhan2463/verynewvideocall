import { useState } from "react";

export default function VoicePage() {
  const [status, setStatus] = useState("idle"); // idle | listening | loading | done | error
  const [speechText, setSpeechText] = useState("");
  const [data, setData]             = useState(null);
  const [error, setError]           = useState("");

  const start = async () => {
    setStatus("listening");
    setSpeechText(""); setData(null); setError("");
    await new Promise(r => setTimeout(r, 900));
    setStatus("loading");
    try {
      const res = await fetch("http://localhost:5000/voice");
      if (!res.ok) throw new Error();
      const result = await res.json();
      setSpeechText(result.text || "");
      setData(result.data || result);
      setStatus("done");
    } catch {
      setError("Could not reach backend. Run: python app.py");
      setStatus("error");
    }
  };

  const reset = () => { setStatus("idle"); setSpeechText(""); setData(null); setError(""); };

  const isActive = status === "listening" || status === "loading";

  return (
    <main style={{
      paddingTop: "56px", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{ maxWidth: "560px", width: "100%", padding: "2rem", textAlign: "center" }}>

        {/* Header */}
        <p className="fu" style={{ fontSize: "0.72rem", letterSpacing: "0.18em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.75rem" }}>
          Voice Recognition
        </p>
        <h1 className="fu2" style={{ fontFamily: "var(--serif)", fontSize: "clamp(2rem,5vw,3rem)", color: "var(--text)", fontWeight: 400, marginBottom: "0.75rem" }}>
          Speak to register
        </h1>
        <p className="fu3" style={{ fontSize: "0.85rem", fontWeight: 300, color: "var(--muted)", lineHeight: 1.75, marginBottom: "3.5rem" }}>
          Say your name, age, and weight in Hindi.<br />The system will extract and store your information.
        </p>

        {/* Mic button */}
        <div className="fu4" style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "2rem" }}>
          <div style={{ position: "relative", width: "90px", height: "90px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {status === "listening" && (
              <>
                <div className="mic-ring"  style={{ width: "90px", height: "90px" }} />
                <div className="mic-ring-2" style={{ width: "90px", height: "90px" }} />
              </>
            )}
            <button
              onClick={!isActive ? (status === "done" || status === "error" ? reset : start) : undefined}
              disabled={isActive}
              style={{
                width: "64px", height: "64px", borderRadius: "50%",
                border: `1px solid ${status === "listening" ? "rgba(200,240,220,0.35)" : status === "error" ? "rgba(240,120,120,0.3)" : status === "done" ? "rgba(200,240,220,0.3)" : "var(--border)"}`,
                background: status === "listening" ? "rgba(200,240,220,0.05)" : "var(--surface)",
                cursor: isActive ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s ease", position: "relative", zIndex: 1
              }}
            >
              {status === "loading" ? (
                <span style={{ width: "16px", height: "16px", borderRadius: "50%", border: "1.5px solid var(--muted)", borderTopColor: "var(--text)", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
              ) : (
                <span style={{
                  display: "block", width: "18px", height: "24px", borderRadius: "9px",
                  background: status === "done" ? "rgba(200,240,220,0.6)" : status === "error" ? "rgba(240,120,120,0.4)" : "var(--muted)",
                  margin: "0 auto", position: "relative"
                }}>
                  <span style={{
                    position: "absolute", bottom: "-8px", left: "50%", transform: "translateX(-50%)",
                    width: "26px", height: "14px", borderRadius: "0 0 13px 13px",
                    border: "1.5px solid", borderColor: "inherit",
                    borderTop: "none", display: "block"
                  }} />
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Status label */}
        <p style={{
          fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase",
          color: status === "done" ? "var(--accent)" : status === "error" ? "rgba(240,140,140,0.7)" : "var(--muted)",
          marginBottom: "2.5rem",
          animation: status === "listening" ? "blink 1.4s ease infinite" : "none"
        }}>
          {status === "idle"      && "Click to start"}
          {status === "listening" && "Listening"}
          {status === "loading"   && "Processing"}
          {status === "done"      && "Done — click to reset"}
          {status === "error"     && "Error — click to retry"}
        </p>

        {/* Result */}
        {status === "done" && (
          <div className="fu card" style={{ textAlign: "left", marginBottom: "1.5rem" }}>
            {speechText && (
              <div style={{ marginBottom: "1.5rem" }}>
                <p style={{ fontSize: "0.68rem", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>Recognized</p>
                <p style={{ fontSize: "0.9rem", fontWeight: 300, color: "rgba(232,233,236,0.75)", lineHeight: 1.7 }}>{speechText}</p>
              </div>
            )}
            {data && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem" }}>
                {[
                  { label: "Name",   val: data.name },
                  { label: "Age",    val: data.age },
                  { label: "Weight", val: data.weight ? `${data.weight} kg` : null },
                ].filter(x => x.val != null).map(({ label, val }) => (
                  <div key={label} style={{
                    padding: "1rem 0.75rem", borderRadius: "8px", textAlign: "center",
                    background: "var(--bg)", border: "1px solid var(--border)"
                  }}>
                    <p style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.4rem" }}>{label}</p>
                    <p style={{ fontFamily: "var(--serif)", fontSize: "1.1rem", color: "var(--text)" }}>{val}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div style={{
            padding: "1rem 1.25rem", borderRadius: "8px", marginBottom: "1.5rem",
            background: "rgba(240,80,80,0.06)", border: "1px solid rgba(240,80,80,0.15)",
            fontSize: "0.8rem", fontWeight: 300, color: "rgba(240,160,160,0.7)", lineHeight: 1.6
          }}>{error}</div>
        )}

        {/* Example */}
        <div style={{ marginTop: "2rem", paddingTop: "2rem", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "0.72rem", letterSpacing: "0.18em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.75rem" }}>Example</p>
          <p style={{ fontSize: "0.85rem", fontWeight: 300, color: "rgba(232,233,236,0.35)", lineHeight: 1.8, fontStyle: "italic" }}>
            "Mera naam Azhan hai, meri umar 25 saal hai, mera wajan 70 kilo hai"
          </p>
        </div>

      </div>
    </main>
  );
}
