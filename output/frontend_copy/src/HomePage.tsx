import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260308_114720_3dabeb9e-2c39-4907-b747-bc3544e2d5b7.mp4";

export const HomePage = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setVideoReady] = useState(false);

  // Video fade-in/out loop
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let animId: number;
    const FADE = 0.5;

    const loop = () => {
      if (video.duration) {
        const t = video.currentTime;
        const d = video.duration;
        let o = 1;
        if (t < FADE) o = t / FADE;
        else if (t > d - FADE) o = (d - t) / FADE;
        video.style.opacity = String(Math.min(1, Math.max(0, o)));
      }
      animId = requestAnimationFrame(loop);
    };

    video.addEventListener("canplay", () => setVideoReady(true));
    video.addEventListener("ended", () => {
      video.style.opacity = "0";
      setTimeout(() => {
        video.currentTime = 0;
        video.play().catch(() => {});
      }, 100);
    });

    video.play().catch(() => {});
    loop();
    return () => cancelAnimationFrame(animId);
  }, []);

  // Particle canvas background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      r: number; a: number; h: number;
    }
    let mx = 0, my = 0;
    const N = 55;
    const particles: Particle[] = [];

    const resize = () => {
      const p = canvas.parentElement;
      if (p) { canvas.width = p.offsetWidth; canvas.height = p.offsetHeight; }
    };
    resize();
    window.addEventListener("resize", resize);
    const onMouse = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    document.addEventListener("mousemove", onMouse);

    for (let i = 0; i < N; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: 1.2 + Math.random() * 2,
        a: 0.1 + Math.random() * 0.2,
        h: 248 + Math.random() * 55,
      });
    }

    let animId: number;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const grd = ctx.createRadialGradient(mx, my, 0, mx, my, 350);
      grd.addColorStop(0, "rgba(100,50,200,0.06)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      }

      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(167,139,250,${((1 - d / 130) * 0.09).toFixed(3)})`;
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.h},65%,68%,${p.a})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("mousemove", onMouse);
    };
  }, []);

  // Parallax on headline
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!headlineRef.current) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 12;
      const y = (e.clientY / window.innerHeight - 0.5) * 6;
      headlineRef.current.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`;
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  const features = [
    { icon: "🧠", title: "Emotion Recognition", desc: "Wav2Vec2-powered detection of happy, sad, angry, neutral — with confidence scoring and probability distributions.", color: "rgba(124,58,237,0.15)" },
    { icon: "🎯", title: "Intent Detection", desc: "Joint action-object classification identifies what the speaker wants — across 6 actions and 14 object classes in real-time.", color: "rgba(96,165,250,0.15)" },
    { icon: "📊", title: "Audio Visualization", desc: "Real-time frequency visualization during recording, waveform analysis, and mel-spectrogram data — all rendered live.", color: "rgba(52,211,153,0.15)" },
    { icon: "⚡", title: "Real-Time Inference", desc: "Lightning-fast GPU-accelerated pipeline. Upload or record audio and get results in seconds, with 100% local processing.", color: "rgba(251,191,36,0.15)" },
    { icon: "📈", title: "Analysis Dashboard", desc: "Track every analysis with emotion distribution trends, confidence metrics, and a complete searchable history.", color: "rgba(248,113,113,0.15)" },
    { icon: "🔒", title: "Privacy First", desc: "All processing happens on your machine. Zero data leaves your network. Complete privacy with no external API calls.", color: "rgba(232,121,249,0.15)" },
  ];

  return (
    <div className="page-enter">
      {/* ═══════ HERO ═══════ */}
      <section
        className="relative w-full overflow-hidden flex flex-col"
        style={{ minHeight: "100vh", background: "hsl(260,87%,3%)" }}
      >
        {/* Particle canvas (behind video) */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />

        {/* Video background */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          loop
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 0, opacity: 0 }}
        >
          <source src={VIDEO_SRC} type="video/mp4" />
        </video>

        {/* Gradient overlays */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            background: "linear-gradient(to bottom, rgba(3,1,14,0.7) 0%, rgba(3,1,14,0.35) 35%, rgba(3,1,14,0.2) 50%, rgba(3,1,14,0.35) 70%, rgba(3,1,14,0.85) 100%)",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            background: "radial-gradient(ellipse at center 40%, transparent 0%, transparent 30%, rgba(3,1,14,0.5) 65%, rgba(3,1,14,0.85) 100%)",
          }}
        />

        {/* Noise texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 2,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
            opacity: 0.4,
          }}
        />

        {/* Hero content */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-4 text-center" style={{ zIndex: 5 }}>
          <h1
            ref={headlineRef}
            className="pointer-events-none select-none"
            style={{
              fontSize: "clamp(72px, 14vw, 210px)",
              fontWeight: 400,
              lineHeight: 1.02,
              letterSpacing: "-0.024em",
              backgroundImage: "linear-gradient(223deg, #E8E8E9 0%, #3A7BBF 104.15%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontFamily: "var(--sans)",
              transition: "transform 0.1s ease-out",
              textShadow: "0 0 60px rgba(3,1,14,0.8), 0 0 120px rgba(3,1,14,0.5)",
            }}
          >
            SYNAPSE
          </h1>

          <p
            className="max-w-[420px] mt-4 opacity-80"
            style={{
              color: "hsl(40,6%,82%)",
              fontSize: 18,
              lineHeight: 2,
              fontWeight: 400,
              textShadow: "0 2px 20px rgba(3,1,14,0.9)",
            }}
          >
            The most powerful audio analysis tool
            <br />
            ever built for the web
          </p>

          <button
            onClick={() => navigate("/analyze")}
            className="liquid-glass rounded-full mt-8 mb-16"
            style={{
              padding: "18px 29px",
              fontSize: 15,
              fontWeight: 500,
              color: "hsl(40,6%,95%)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--sans)",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
            id="hero-cta"
          >
            Start Analyzing ↓
          </button>
        </div>

        {/* Scroll hint */}
        <div
          className="absolute bottom-7 left-1/2 flex flex-col items-center gap-2"
          style={{
            transform: "translateX(-50%)",
            zIndex: 10,
            opacity: 0.25,
            animation: "floatY 2s ease-in-out infinite",
          }}
        >
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--text2)" }}>SCROLL</span>
          <div style={{ width: 1, height: 28, background: "linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)" }} />
        </div>
      </section>

      {/* ═══════ FEATURES ═══════ */}
      <section className="max-w-[1280px] mx-auto px-7 py-24" style={{ background: "var(--bg)" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div className="section-eyebrow">CAPABILITIES</div>
          <h2 className="section-title" style={{ textAlign: "center", width: "100%" }}>Powered by deep learning</h2>
          <p style={{ color: "var(--text2)", lineHeight: 1.8, fontSize: 14, maxWidth: 480, margin: "12px auto 0", textAlign: "center" }}>
            A unified Wav2Vec2 backbone with joint emotion and intent classification heads.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="feature-card fade-in text-center flex flex-col items-center" style={{ transitionDelay: `${i * 0.1}s` }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 text-xl" style={{ background: f.color }}>
                {f.icon}
              </div>
              <div className="text-lg font-bold mb-2.5 tracking-tight" style={{ color: "var(--text)", letterSpacing: "-0.01em" }}>
                {f.title}
              </div>
              <div className="text-sm max-w-[280px]" style={{ color: "var(--text2)", lineHeight: 1.7, fontWeight: 400 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>


      </section>

      {/* Footer */}
      <footer className="max-w-[1280px] mx-auto px-7 py-7 flex items-center justify-between" style={{ borderTop: "1px solid var(--b)" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", letterSpacing: "0.06em" }}>
          SYNAPSE &nbsp;·&nbsp; Wav2Vec2 &nbsp;·&nbsp; FastAPI &nbsp;·&nbsp; Local Processing
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
          © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
};
