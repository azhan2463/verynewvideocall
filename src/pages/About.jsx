export default function AboutPage() {
  return (
    <main style={{ paddingTop: "56px", minHeight: "100vh" }}>
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "5rem 2rem" }}>

        <p className="fu" style={{ fontSize: "0.72rem", letterSpacing: "0.18em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.75rem" }}>
          About
        </p>

        <h1 className="fu2" style={{
          fontFamily: "var(--serif)", fontSize: "clamp(2.5rem, 6vw, 4rem)",
          color: "var(--text)", fontWeight: 400, lineHeight: 1.05,
          marginBottom: "3rem"
        }}>
          SilentTalk
        </h1>

        <p className="fu3" style={{ fontSize: "1rem", fontWeight: 300, color: "var(--muted)", lineHeight: 1.9, marginBottom: "2rem" }}>
          SilentTalk is built around a simple belief — that communication
          barriers should not determine who gets access to opportunity.
        </p>

        <p className="fu4" style={{ fontSize: "1rem", fontWeight: 300, color: "var(--muted)", lineHeight: 1.9, marginBottom: "4rem" }}>
          Deaf, mute, and illiterate individuals deserve the same tools
          that everyone else takes for granted. This platform combines
          real-time video, sign language recognition, and voice-driven
          job registration into a single, accessible experience.
        </p>

        <div className="fu5" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1px", background: "var(--border)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden", marginBottom: "4rem" }}>
          {[
            { n: "4+",  label: "Core features" },
            { n: "P2P", label: "Video encryption" },
            { n: "0",   label: "Accounts needed" },
          ].map(({ n, label }) => (
            <div key={label} style={{ padding: "2rem 1.5rem", background: "var(--surface)", textAlign: "center" }}>
              <p style={{ fontFamily: "var(--serif)", fontSize: "2rem", color: "var(--text)", marginBottom: "0.35rem" }}>{n}</p>
              <p style={{ fontSize: "0.72rem", fontWeight: 300, color: "var(--muted)", letterSpacing: "0.05em" }}>{label}</p>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "3rem" }}>
          <p style={{ fontSize: "0.72rem", letterSpacing: "0.18em", color: "var(--muted)", textTransform: "uppercase", marginBottom: "1.5rem" }}>
            The stack
          </p>
          {[
            ["Frontend",  "React + Vite"],
            ["Styling",   "Plain CSS with CSS variables"],
            ["Video",     "WebRTC (BroadcastChannel signaling)"],
            ["Voice",     "Python Flask + Google Speech API"],
            ["Language",  "Hindi (hi-IN)"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.85rem 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 300, color: "var(--muted)" }}>{k}</span>
              <span style={{ fontSize: "0.82rem", fontWeight: 400, color: "rgba(232,233,236,0.65)" }}>{v}</span>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}
