export default function Navbar({ page, setPage }) {
  const links = [
    { id: "home",  label: "Home"  },
    { id: "video", label: "Video" },
    { id: "voice", label: "Voice" },
    { id: "about", label: "About" },
  ];

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      background: "rgba(14,15,17,0.9)", backdropFilter: "blur(16px)",
      borderBottom: "1px solid var(--border)",
      height: "56px", display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "0 2.5rem"
    }}>
      <button onClick={() => setPage("home")} style={{
        background: "none", border: "none", cursor: "pointer", padding: 0,
        fontFamily: "var(--serif)", fontSize: "1.1rem",
        color: "var(--text)", letterSpacing: "0.01em"
      }}>
        SilentTalk
      </button>

      <nav style={{ display: "flex", gap: "0.1rem" }}>
        {links.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={`nav-link${page === id ? " active" : ""}`}
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
