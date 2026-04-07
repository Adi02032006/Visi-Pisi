import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { getHealth, type HealthResult } from "./api";

export const Navbar = () => {
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/";

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {});
    const interval = setInterval(() => {
      getHealth().then(setHealth).catch(() => setHealth(null));
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const showBg = !isHome || scrolled;

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 transition-all duration-300"
        style={{
          zIndex: 50,
          background: showBg ? "rgba(3,1,14,0.85)" : "transparent",
          backdropFilter: showBg ? "blur(16px)" : "none",
          WebkitBackdropFilter: showBg ? "blur(16px)" : "none",
        }}
      >
        <div className="flex items-center justify-between" style={{ padding: "20px 32px" }}>
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-2.5 no-underline">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-extrabold text-white"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
            >
              S
            </div>
            <span
              className="font-extrabold tracking-[0.1em]"
              style={{
                fontSize: 15,
                background: "linear-gradient(120deg, #a78bfa 0%, #60a5fa 50%, #a78bfa 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "shimmer 4s linear infinite",
              }}
            >
              SYNAPSE
            </span>
          </NavLink>

          {/* Center nav items */}
          <div className="hidden md:flex items-center gap-0.5">
            {[
              { label: "Home", to: "/" },
              { label: "Analyze", to: "/analyze" },
              { label: "Dashboard", to: "/dashboard" },
            ].map(({ label, to }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `no-underline transition-all duration-150`
                }
                style={({ isActive }) => ({
                  fontSize: 15,
                  fontWeight: 500,
                  color: isActive ? "#fff" : "rgba(255,255,255,0.85)",
                  background: isActive ? "rgba(255,255,255,0.05)" : "transparent",
                  padding: "8px 14px",
                  borderRadius: 8,
                  fontFamily: "var(--sans)",
                  cursor: "pointer",
                })}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#fff";
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                }}
                onMouseLeave={(e) => {
                  // Let NavLink re-evaluate active state on next render
                  const isActive = e.currentTarget.classList.contains("active");
                  e.currentTarget.style.color = isActive ? "#fff" : "rgba(255,255,255,0.85)";
                  e.currentTarget.style.background = isActive ? "rgba(255,255,255,0.05)" : "transparent";
                }}
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            {/* Status */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--b)" }}>
              <div className="w-[6px] h-[6px] rounded-full" style={{
                background: health?.model_loaded ? "#34d399" : health ? "#fbbf24" : "#f87171",
                boxShadow: health?.model_loaded ? "0 0 8px #34d399" : "none",
              }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.08em", color: "var(--text3)" }}>
                {health?.model_loaded ? `LIVE · ${health.device.toUpperCase()}` : health ? "LOADING" : "OFFLINE"}
              </span>
            </div>

            {/* CTA */}
            <NavLink
              to="/analyze"
              className="no-underline"
              style={{
                padding: "8px 22px",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                boxShadow: "0 4px 18px rgba(124,58,237,0.35)",
                fontFamily: "var(--sans)",
                transition: "transform 0.15s, box-shadow 0.2s",
                display: "inline-block",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.03)";
                e.currentTarget.style.boxShadow = "0 6px 24px rgba(124,58,237,0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 18px rgba(124,58,237,0.35)";
              }}
            >
              Start Analysis
            </NavLink>
          </div>
        </div>

        {/* Divider — only on home */}
        {isHome && (
          <div
            className="w-full h-px"
            style={{
              background: "linear-gradient(to right, transparent, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.12) 70%, transparent)",
              marginTop: 3,
            }}
          />
        )}
      </nav>

      {/* Spacer for non-home pages */}
      {!isHome && <div style={{ height: 72 }} />}
    </>
  );
};
