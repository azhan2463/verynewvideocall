import { useState, useEffect } from "react";
import Navbar    from "./components/Navbar";
import Footer    from "./components/Footer";
import HomePage  from "./pages/Home";
import VideoPage from "./pages/Video";
import VoicePage from "./pages/Voice";
import AboutPage from "./pages/About";

export default function App() {
  const [page, setPage] = useState("home");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar page={page} setPage={setPage} />

      <div style={{ flex: 1 }}>
        {page === "home"  && <HomePage  setPage={setPage} />}
        {page === "video" && <VideoPage />}
        {page === "voice" && <VoicePage />}
        {page === "about" && <AboutPage />}
      </div>

      <Footer setPage={setPage} />
    </div>
  );
}
