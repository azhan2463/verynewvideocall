export default function Footer({ setPage }) {
  return (
    <footer style={{
      borderTop: "1px solid var(--border)",
      padding: "2rem 2.5rem",
      display: "flex", justifyContent: "space-between",
      alignItems: "center", flexWrap: "wrap", gap: "1rem"
    }}>
      <span style={{ fontFamily: "var(--serif)", fontSize: "0.95rem", color: "var(--muted)" }}>
        SilentTalk
      </span>

      <div style={{ display: "flex", gap: "1.5rem" }}>
        {["home","video","voice","about"].map(p => (
          <button key={p} onClick={() => setPage(p)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "var(--sans)", fontSize: "0.78rem", fontWeight: 300,
            color: "var(--muted)", transition: "color 0.18s",
            textTransform: "capitalize"
          }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}
          >
            {p}
          </button>
        ))}
      </div>

      <span style={{ fontFamily: "var(--sans)", fontSize: "0.75rem", fontWeight: 300, color: "rgba(232,233,236,0.2)" }}>
        © 2025
      </span>
    </footer>
  );
}
