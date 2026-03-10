export default function HomePage({ setPage }) {
  const features = [
    { title: "Video Calling",      desc: "Peer-to-peer encrypted video directly in the browser. No installs, no accounts." },
    { title: "Sign Language",      desc: "Computer vision converts hand gestures to text in real time for deaf and mute users." },
    { title: "Voice Registration", desc: "Speak in Hindi — the system captures your name, age, and skills automatically." },
    { title: "Job Matching",       desc: "Companies search candidates by skill, not literacy. Opportunity for everyone." },
  ];

  return (
    <main style={{ paddingTop: "56px" }}>

      {/* Hero */}
      <section style={{
        minHeight: "88vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        padding: "4rem 2rem",
        background: "radial-gradient(ellipse at 50% 60%, rgba(200,240,220,0.04) 0%, transparent 65%)"
      }}>
        <p className="fu" style={{
          fontFamily: "var(--sans)", fontSize: "0.75rem", fontWeight: 400,
          letterSpacing: "0.18em", color: "var(--muted)",
          textTransform: "uppercase", marginBottom: "2rem"
        }}>
          Inclusive Communication Platform
        </p>

        <h1 className="fu2" style={{
          fontFamily: "var(--serif)",
          fontSize: "clamp(3.5rem, 9vw, 7rem)",
          lineHeight: 1, letterSpacing: "-0.01em",
          color: "var(--text)", marginBottom: "2rem", maxWidth: "820px"
        }}>
          Where silence<br />
          <em style={{ color: "var(--muted)" }}>finds its voice</em>
        </h1>

        <p className="fu3" style={{
          fontFamily: "var(--sans)", fontSize: "1rem", fontWeight: 300,
          color: "var(--muted)", lineHeight: 1.8,
          maxWidth: "480px", marginBottom: "3rem"
        }}>
          SilentTalk breaks communication barriers for deaf, mute, and
          illiterate individuals — connecting people to opportunity.
        </p>

        <div className="fu4" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button className="btn-primary" onClick={() => setPage("video")}>
            Start a call
          </button>
          <button className="btn-ghost" onClick={() => setPage("voice")}>
            Try voice input
          </button>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "0 2rem 6rem", maxWidth: "1100px", margin: "0 auto" }}>
        <p style={{
          fontFamily: "var(--sans)", fontSize: "0.72rem", letterSpacing: "0.18em",
          color: "var(--muted)", textTransform: "uppercase", marginBottom: "3rem"
        }}>
          Features
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1px", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
          {features.map(({ title, desc }, i) => (
            <div key={title} style={{
              padding: "2rem 1.75rem",
              background: "var(--surface)",
              borderRight: i % 2 === 0 ? "1px solid var(--border)" : "none",
              borderBottom: i < 2 ? "1px solid var(--border)" : "none"
            }}>
              <h3 style={{
                fontFamily: "var(--serif)", fontSize: "1.15rem",
                color: "var(--text)", marginBottom: "0.75rem", fontWeight: 400
              }}>{title}</h3>
              <p style={{ fontSize: "0.85rem", fontWeight: 300, color: "var(--muted)", lineHeight: 1.75 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About strip */}
      <section style={{
        borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
        padding: "5rem 2rem", textAlign: "center",
        background: "var(--surface)"
      }}>
        <p style={{
          fontFamily: "var(--serif)", fontSize: "clamp(1.4rem, 3vw, 2rem)",
          color: "var(--text)", lineHeight: 1.6, maxWidth: "680px", margin: "0 auto",
          fontWeight: 400
        }}>
          Most platforms solve one problem. SilentTalk solves{" "}
          <em>all of them</em> — video, voice, and sign language in a single, unified place.
        </p>
      </section>

      {/* Roadmap */}
      <section style={{ padding: "5rem 2rem", maxWidth: "680px", margin: "0 auto" }}>
        <p style={{
          fontFamily: "var(--sans)", fontSize: "0.72rem", letterSpacing: "0.18em",
          color: "var(--muted)", textTransform: "uppercase", marginBottom: "2.5rem"
        }}>
          Roadmap
        </p>
        {[
          "Advanced sign language AI recognition",
          "Real-time sign to speech translation",
          "AI-powered job recommendation engine",
          "Mobile app for Android and iOS",
          "Offline support for low-connectivity areas",
        ].map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "baseline", gap: "1.5rem",
            padding: "1.25rem 0", borderBottom: "1px solid var(--border)"
          }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: "0.7rem", color: "var(--muted)", minWidth: "24px", fontWeight: 300 }}>
              0{i + 1}
            </span>
            <span style={{ fontSize: "0.9rem", fontWeight: 300, color: "rgba(232,233,236,0.65)" }}>{item}</span>
          </div>
        ))}
      </section>

    </main>
  );
}
