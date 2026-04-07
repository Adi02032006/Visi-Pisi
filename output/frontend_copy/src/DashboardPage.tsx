import { useState, useEffect, useCallback, useRef } from "react";
import { getHistory, getStats, type HistoryItem, type StatsResult } from "./api";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

/* ─── Color Maps ─── */
const EMOTION_COLORS: Record<string, string> = {
  happy: "#fbbf24", sad: "#60a5fa", angry: "#f87171", neutral: "#a78bfa",
  fear: "#e879f9", disgust: "#34d399", surprise: "#fb923c",
};
const EMOTION_GRADIENTS: Record<string, [string, string]> = {
  happy: ["#fbbf24", "#f59e0b"], sad: ["#60a5fa", "#3b82f6"],
  angry: ["#f87171", "#ef4444"], neutral: ["#a78bfa", "#8b5cf6"],
  fear: ["#e879f9", "#d946ef"], disgust: ["#34d399", "#10b981"],
  surprise: ["#fb923c", "#f97316"],
};
const EMOTION_ICONS: Record<string, string> = {
  happy: "😊", sad: "😢", angry: "😠", neutral: "😐",
  fear: "😨", disgust: "🤢", surprise: "😲",
};
const ACTION_COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#e879f9", "#fb923c", "#67e8f9"];

function getColor(e: string) { return EMOTION_COLORS[e?.toLowerCase()] || "#a78bfa"; }
function getIcon(e: string) { return EMOTION_ICONS[e?.toLowerCase()] || "🎭"; }
function getGradient(e: string) { return EMOTION_GRADIENTS[e?.toLowerCase()] || ["#a78bfa", "#8b5cf6"]; }

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr + "Z");
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ─── Custom Tooltip ─── */
const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color?: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(10,8,16,0.95)", border: "1px solid rgba(167,139,250,0.2)",
      borderRadius: 12, padding: "10px 14px", backdropFilter: "blur(12px)",
      fontFamily: "var(--mono)", fontSize: 11,
    }}>
      {label && <div style={{ color: "var(--text3)", fontSize: 9, marginBottom: 6, letterSpacing: "0.1em" }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "var(--text)", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color || "#a78bfa", flexShrink: 0 }} />
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

/* ─── Animated Counter ─── */
const AnimatedValue = ({ value, suffix = "", decimals = 0, duration = 1200 }: { value: number; suffix?: string; decimals?: number; duration?: number }) => {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>();

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value, duration]);

  return <>{display.toFixed(decimals)}{suffix}</>;
};

/* ─── Main Component ─── */
export const DashboardPage = () => {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([getStats(), getHistory(50)]);
      setStats(s);
      setHistory(h.analyses);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Derived chart data ─── */
  const emotionEntries = stats ? Object.entries(stats.emotion_distribution).sort(([, a], [, b]) => b - a) : [];
  const actionEntries = stats ? Object.entries(stats.action_distribution).sort(([, a], [, b]) => b - a) : [];
  const totalEmotions = emotionEntries.reduce((sum, [, c]) => sum + c, 0) || 1;

  // Pie chart data
  const pieData = emotionEntries.map(([name, value]) => ({ name, value }));

  // Radar chart data
  const radarData = emotionEntries.map(([name, value]) => ({
    emotion: name.charAt(0).toUpperCase() + name.slice(1),
    count: value,
    fullMark: Math.max(...emotionEntries.map(([, c]) => c)) || 1,
  }));

  // Bar chart data for actions
  const barData = actionEntries.map(([name, value]) => ({ name, value }));

  // Timeline / confidence trend from history
  const timelineData = [...history].reverse().map((item, i) => ({
    idx: i + 1,
    confidence: +(item.emotion_confidence * 100).toFixed(1),
    duration: +item.duration.toFixed(2),
    emotion: item.emotion_prediction,
  }));

  // Donut center label
  const topEmotion = emotionEntries[0];

  return (
    <div className="page-enter" style={{ minHeight: "100vh", paddingTop: 100, paddingBottom: 80 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>

        {/* ═══ HEADER ═══ */}
        <div className="fade-in-up" style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="section-eyebrow">DASHBOARD</div>
          <h1 className="section-title" style={{ marginBottom: 12 }}>Analysis Overview</h1>
          <p style={{ color: "var(--text2)", fontSize: 15, lineHeight: 1.8, maxWidth: 520, margin: "0 auto" }}>
            Visualize your emotion detection patterns, intent distributions,
            and confidence trends across all analyses.
          </p>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
            <div className="spinner" />
            <span style={{ marginLeft: 14, fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)", letterSpacing: "0.12em" }}>
              LOADING ANALYTICS...
            </span>
          </div>
        ) : error ? (
          <div className="synapse-card" style={{ textAlign: "center", padding: "60px 24px", maxWidth: 480, margin: "0 auto" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--red)", marginBottom: 8 }}>Backend Offline</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", marginBottom: 20 }}>
              Make sure the FastAPI server is running on port 8001
            </div>
            <button onClick={fetchData} style={{
              padding: "10px 28px", borderRadius: 999, fontSize: 12,
              background: "rgba(124,58,237,0.12)", color: "var(--accent-raw)",
              border: "1px solid rgba(124,58,237,0.2)", cursor: "pointer",
              fontFamily: "var(--mono)", letterSpacing: "0.08em",
              transition: "all 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(124,58,237,0.2)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(124,58,237,0.12)"; }}
            >
              RETRY CONNECTION
            </button>
          </div>
        ) : (
          <>
            {/* ═══ STAT CARDS ═══ */}
            <div className="fade-in-up-delay-1" style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24,
            }}>
              {[
                { label: "TOTAL ANALYSES", value: stats?.total_recordings ?? 0, suffix: "", decimals: 0, color: "var(--accent-raw)", icon: "📊" },
                { label: "AVG CONFIDENCE", value: (stats?.avg_confidence ?? 0) * 100, suffix: "%", decimals: 1, color: "var(--green)", icon: "🎯" },
                { label: "TOP EMOTION", value: 0, suffix: "", decimals: 0, color: getColor(stats?.most_common_emotion || ""), icon: getIcon(stats?.most_common_emotion || ""), isText: true, textValue: stats?.most_common_emotion ?? "—" },
                { label: "AVG DURATION", value: stats?.avg_duration ?? 0, suffix: "s", decimals: 1, color: "var(--accent2)", icon: "⏱" },
              ].map((s, i) => (
                <div key={i} className="synapse-card" style={{
                  padding: "28px 24px", textAlign: "center", position: "relative", overflow: "hidden",
                }}>
                  {/* Glow accent */}
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 2,
                    background: `linear-gradient(to right, transparent, ${s.color}, transparent)`,
                    opacity: 0.6,
                  }} />
                  <div style={{ fontSize: 24, marginBottom: 12 }}>{s.icon}</div>
                  <div style={{
                    fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.16em",
                    color: "var(--text3)", marginBottom: 10,
                  }}>{s.label}</div>
                  {'isText' in s && s.isText ? (
                    <div style={{
                      fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700,
                      color: s.color, textTransform: "capitalize", lineHeight: 1,
                    }}>{s.textValue}</div>
                  ) : (
                    <div style={{
                      fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700,
                      color: s.color, lineHeight: 1,
                    }}>
                      <AnimatedValue value={s.value} suffix={s.suffix} decimals={s.decimals} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ═══ CHARTS ROW 1 — Confidence Trend + Emotion Donut ═══ */}
            <div className="fade-in-up-delay-2" style={{
              display: "grid", gridTemplateColumns: "1fr 400px", gap: 16, marginBottom: 16,
            }}>
              {/* Confidence Trend Area Chart */}
              <div className="synapse-card" style={{ padding: "24px 24px 16px" }}>
                <div className="card-label">CONFIDENCE TREND</div>
                {timelineData.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
                    NO DATA — ANALYZE SOME AUDIO FIRST
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={timelineData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="idx" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "var(--mono)" }}
                        axisLine={{ stroke: "rgba(255,255,255,0.06)" }} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "var(--mono)" }}
                        axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="confidence" stroke="#a78bfa" strokeWidth={2.5}
                        fill="url(#confGrad)" name="Confidence"
                        dot={{ fill: "#a78bfa", strokeWidth: 0, r: 3 }}
                        activeDot={{ fill: "#a78bfa", stroke: "#fff", strokeWidth: 2, r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Emotion Donut Chart */}
              <div className="synapse-card" style={{ padding: "24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div className="card-label" style={{ alignSelf: "flex-start" }}>EMOTION DISTRIBUTION</div>
                {pieData.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
                    NO DATA
                  </div>
                ) : (
                  <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                          paddingAngle={3} dataKey="value" stroke="none"
                          animationBegin={200} animationDuration={1200}>
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={getColor(entry.name)}
                              style={{ filter: `drop-shadow(0 0 6px ${getColor(entry.name)}40)` }} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    {topEmotion && (
                      <div style={{
                        position: "absolute", top: "50%", left: "50%",
                        transform: "translate(-50%, -65%)", textAlign: "center", pointerEvents: "none",
                      }}>
                        <div style={{ fontSize: 28 }}>{getIcon(topEmotion[0])}</div>
                        <div style={{
                          fontFamily: "var(--mono)", fontSize: 10, color: getColor(topEmotion[0]),
                          textTransform: "capitalize", fontWeight: 600, marginTop: 2,
                        }}>{topEmotion[0]}</div>
                      </div>
                    )}
                    {/* Legend */}
                    <div style={{
                      display: "flex", flexWrap: "wrap", gap: "6px 16px",
                      justifyContent: "center", marginTop: 4,
                    }}>
                      {pieData.map(entry => (
                        <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: getColor(entry.name),
                            boxShadow: `0 0 6px ${getColor(entry.name)}40`,
                          }} />
                          <span style={{
                            fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)",
                            textTransform: "capitalize",
                          }}>
                            {entry.name} ({((entry.value / totalEmotions) * 100).toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ═══ CHARTS ROW 2 — Action Bar + Emotion Radar ═══ */}
            <div className="fade-in-up-delay-3" style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16,
            }}>
              {/* Action Distribution Bar Chart */}
              <div className="synapse-card" style={{ padding: "24px 24px 16px" }}>
                <div className="card-label">ACTION BREAKDOWN</div>
                {barData.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
                    NO DATA
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={barData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="20%">
                      <defs>
                        {barData.map((_, i) => (
                          <linearGradient key={i} id={`barGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={ACTION_COLORS[i % ACTION_COLORS.length]} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={ACTION_COLORS[i % ACTION_COLORS.length]} stopOpacity={0.3} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "var(--mono)" }}
                        axisLine={{ stroke: "rgba(255,255,255,0.06)" }} tickLine={false} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "var(--mono)" }}
                        axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(167,139,250,0.06)" }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Count"
                        animationBegin={400} animationDuration={1000}>
                        {barData.map((_, i) => (
                          <Cell key={i} fill={`url(#barGrad${i})`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Emotion Radar Chart */}
              <div className="synapse-card" style={{ padding: "24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div className="card-label" style={{ alignSelf: "flex-start" }}>EMOTION RADAR</div>
                {radarData.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
                    NO DATA
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="rgba(167,139,250,0.12)" />
                      <PolarAngleAxis dataKey="emotion"
                        tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "var(--mono)" }} />
                      <PolarRadiusAxis angle={30} domain={[0, 'auto']}
                        tick={{ fill: "rgba(255,255,255,0.15)", fontSize: 9 }}
                        axisLine={false} />
                      <Radar name="Count" dataKey="count" stroke="#a78bfa" fill="#a78bfa"
                        fillOpacity={0.2} strokeWidth={2}
                        animationBegin={600} animationDuration={1200}
                        dot={{ fill: "#a78bfa", stroke: "#1a1625", strokeWidth: 2, r: 4 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ═══ DURATION TREND ═══ */}
            {timelineData.length > 0 && (
              <div className="synapse-card fade-in-up" style={{ padding: "24px 24px 16px", marginBottom: 16 }}>
                <div className="card-label">DURATION TREND</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={timelineData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="durGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="idx" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "var(--mono)" }}
                      axisLine={{ stroke: "rgba(255,255,255,0.06)" }} tickLine={false} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "var(--mono)" }}
                      axisLine={false} tickLine={false} tickFormatter={v => `${v}s`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="duration" stroke="#60a5fa" strokeWidth={2}
                      fill="url(#durGrad)" name="Duration"
                      dot={{ fill: "#60a5fa", strokeWidth: 0, r: 2.5 }}
                      activeDot={{ fill: "#60a5fa", stroke: "#fff", strokeWidth: 2, r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ═══ EMOTION BAR BREAKDOWN (horizontal) ═══ */}
            {emotionEntries.length > 0 && (
              <div className="synapse-card fade-in-up" style={{ padding: "28px 28px 24px", marginBottom: 16 }}>
                <div className="card-label">EMOTION BREAKDOWN</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {emotionEntries.map(([emotion, count]) => {
                    const pct = (count / totalEmotions) * 100;
                    const [c1, c2] = getGradient(emotion);
                    return (
                      <div key={emotion} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: 11, color: getColor(emotion),
                          width: 72, textTransform: "capitalize", fontWeight: 600, flexShrink: 0,
                        }}>{emotion}</span>
                        <div style={{
                          flex: 1, height: 10, borderRadius: 5,
                          background: "rgba(255,255,255,0.04)", overflow: "hidden",
                          position: "relative",
                        }}>
                          <div style={{
                            height: "100%", borderRadius: 5,
                            background: `linear-gradient(90deg, ${c1}, ${c2})`,
                            width: `${pct}%`,
                            boxShadow: `0 0 12px ${c1}30`,
                            transition: "width 1.2s cubic-bezier(0.22,1,0.36,1)",
                          }} />
                        </div>
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)",
                          width: 48, textAlign: "right", flexShrink: 0,
                        }}>{pct.toFixed(0)}%</span>
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)",
                          width: 28, textAlign: "right", flexShrink: 0,
                        }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ═══ HISTORY TABLE ═══ */}
            <div className="synapse-card fade-in-up" style={{ padding: 0, overflow: "hidden" }}>
              {/* Table header */}
              <div style={{
                padding: "18px 28px", borderBottom: "1px solid var(--b)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div className="card-label" style={{ margin: 0 }}>RECENT ANALYSES</div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>
                  {history.length} RECORD{history.length !== 1 ? "S" : ""}
                </span>
              </div>

              {history.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: "60px 24px",
                  fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)",
                }}>
                  NO ANALYSES YET — HEAD TO THE ANALYZE PAGE TO GET STARTED
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{
                    width: "100%", borderCollapse: "collapse",
                    fontFamily: "var(--mono)", fontSize: 11,
                  }}>
                    <thead>
                      <tr>
                        {["#", "FILE", "EMOTION", "CONFIDENCE", "INTENT", "DURATION", "TIME"].map(h => (
                          <th key={h} style={{
                            padding: "12px 16px", textAlign: "left",
                            fontSize: 9, letterSpacing: "0.12em", color: "var(--text3)",
                            fontWeight: 400, borderBottom: "1px solid var(--b)",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item, index) => (
                        <tr key={item.id} className="history-row" style={{
                          borderBottom: "1px solid rgba(255,255,255,0.02)",
                          transition: "background 0.15s",
                        }}>
                          <td style={{ padding: "14px 16px", color: "var(--text3)", fontSize: 10 }}>
                            {index + 1}
                          </td>
                          <td style={{
                            padding: "14px 16px", color: "var(--text2)",
                            maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {item.filename?.slice(0, 20) || "—"}
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "4px 12px", borderRadius: 999,
                              background: `${getColor(item.emotion_prediction)}10`,
                              border: `1px solid ${getColor(item.emotion_prediction)}22`,
                              color: getColor(item.emotion_prediction),
                              fontSize: 10, fontWeight: 600, textTransform: "capitalize",
                            }}>
                              <span style={{ fontSize: 12 }}>{getIcon(item.emotion_prediction)}</span>
                              {item.emotion_prediction}
                            </span>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{
                                width: 48, height: 4, borderRadius: 2,
                                background: "rgba(255,255,255,0.06)", overflow: "hidden",
                              }}>
                                <div style={{
                                  height: "100%", borderRadius: 2,
                                  width: `${item.emotion_confidence * 100}%`,
                                  background: getColor(item.emotion_prediction),
                                }} />
                              </div>
                              <span style={{ color: "var(--text2)" }}>
                                {(item.emotion_confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px", color: "var(--accent2)", fontSize: 10 }}>
                            {item.intent_combined?.slice(0, 24) || "—"}
                          </td>
                          <td style={{ padding: "14px 16px", color: "var(--text2)" }}>
                            {item.duration?.toFixed(1)}s
                          </td>
                          <td style={{ padding: "14px 16px", color: "var(--text3)", fontSize: 10 }}>
                            {timeAgo(item.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
