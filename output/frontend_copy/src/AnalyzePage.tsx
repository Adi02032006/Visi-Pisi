import { useState, useRef, useCallback, useEffect } from "react";
import { analyzeAudio, type AnalysisResult } from "./api";
import { audioBufferToWav } from "./wavEncoder";

const EMOTION_COLORS: Record<string, string> = {
  happy: "#fbbf24", sad: "#60a5fa", angry: "#f87171", neutral: "#a78bfa",
  fear: "#e879f9", disgust: "#34d399", surprise: "#fb923c",
};
const EMOTION_ICONS: Record<string, string> = {
  happy: "😊", sad: "😢", angry: "😠", neutral: "😐",
  fear: "😨", disgust: "🤢", surprise: "😲",
};

function getColor(e: string) { return EMOTION_COLORS[e?.toLowerCase()] || "#a78bfa"; }
function getIcon(e: string) { return EMOTION_ICONS[e?.toLowerCase()] || "🎭"; }

export const AnalyzePage = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pad = (n: number) => String(n).padStart(2, "0");

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // -- VISUALIZER --
  const drawVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(10,8,16,0.92)";
      ctx.fillRect(0, 0, W, H);

      const barCount = 72;
      const barWidth = (W - 48) / barCount - 1.5;
      const maxH = H - 40;

      // Grid
      ctx.strokeStyle = "rgba(167,139,250,0.03)";
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 4; i++) {
        const gy = 20 + (maxH / 4) * i;
        ctx.beginPath(); ctx.moveTo(24, gy); ctx.lineTo(W - 24, gy); ctx.stroke();
      }

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[Math.floor((i * dataArray.length) / barCount)] / 255;
        const bH = val * maxH;
        const x = 24 + i * (barWidth + 1.5);
        const y = H - 20 - bH;
        const hue = 220 + (i / barCount) * 120;
        const sat = 70 + val * 20;
        const lig = 45 + val * 25;

        const grad = ctx.createLinearGradient(x, y, x, H - 20);
        grad.addColorStop(0, `hsla(${hue},${sat}%,${lig}%,0.95)`);
        grad.addColorStop(0.6, `hsla(${hue},${sat}%,${lig}%,0.35)`);
        grad.addColorStop(1, `hsla(${hue},${sat}%,${lig}%,0.05)`);
        ctx.fillStyle = grad;

        const radius = Math.min(barWidth / 2, 3);
        ctx.beginPath();
        ctx.moveTo(x, H - 20);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.lineTo(x + barWidth - radius, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
        ctx.lineTo(x + barWidth, H - 20);
        ctx.fill();

        if (val > 0.7) {
          ctx.shadowColor = `hsla(${hue},90%,70%,0.8)`;
          ctx.shadowBlur = 12;
          ctx.fillStyle = `hsla(${hue},90%,75%,0.6)`;
          ctx.fillRect(x, y, barWidth, 2);
          ctx.shadowBlur = 0;
        }
      }
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  const drawIdle = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "rgba(10,8,16,1)";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(167,139,250,0.03)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Idle waveform
    ctx.save();
    ctx.strokeStyle = "rgba(167,139,250,0.06)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const y = H / 2 + Math.sin(x * 0.02) * 8 + Math.sin(x * 0.005) * 15;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.font = '500 13px "DM Mono", monospace';
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.textAlign = "center";
    ctx.fillText("AWAITING AUDIO INPUT", W / 2, H / 2 - 30);
    ctx.font = '400 10px "DM Mono", monospace';
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillText("RECORD · DROP FILE · UPLOAD", W / 2, H / 2 - 12);
  }, []);

  useEffect(() => { const t = setTimeout(drawIdle, 200); return () => clearTimeout(t); }, [drawIdle]);

  // -- DRAW WAVEFORM FROM RESULT --
  useEffect(() => {
    if (!result?.waveform) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "rgba(10,8,16,1)";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(167,139,250,0.03)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    const points = result.waveform.points;
    const p = 28;
    const dW = W - p * 2;

    const grad = ctx.createLinearGradient(p, 0, W - p, 0);
    grad.addColorStop(0, "rgba(167,139,250,0.3)");
    grad.addColorStop(0.5, "rgba(96,165,250,0.3)");
    grad.addColorStop(1, "rgba(167,139,250,0.3)");

    ctx.beginPath();
    ctx.moveTo(p, H / 2);
    for (let i = 0; i < points.length; i++) {
      const x = p + (i / points.length) * dW;
      const amp = points[i].amplitude;
      ctx.lineTo(x, H / 2 - amp * (H * 0.4));
    }
    ctx.lineTo(W - p, H / 2);
    for (let i = points.length - 1; i >= 0; i--) {
      const x = p + (i / points.length) * dW;
      const amp = points[i].amplitude;
      ctx.lineTo(x, H / 2 + amp * (H * 0.4));
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    const lineGrad = ctx.createLinearGradient(p, 0, W - p, 0);
    lineGrad.addColorStop(0, "#a78bfa");
    lineGrad.addColorStop(0.5, "#60a5fa");
    lineGrad.addColorStop(1, "#a78bfa");
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.shadowColor = "#a78bfa";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = p + (i / points.length) * dW;
      const amp = points[i].amplitude;
      const y = H / 2 - amp * (H * 0.35) * (i % 2 === 0 ? 1 : -1);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    const emotionC = getColor(result.emotion.prediction);
    ctx.font = '700 15px "Syne", sans-serif';
    ctx.fillStyle = emotionC;
    ctx.textAlign = "left";
    ctx.fillText(`${getIcon(result.emotion.prediction)} ${result.emotion.prediction.toUpperCase()}`, p + 8, p + 18);

    ctx.font = '400 11px "DM Mono", monospace';
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.textAlign = "right";
    ctx.fillText(`${result.duration.toFixed(1)}s · ${(result.waveform.sampleRate / 1000).toFixed(1)}kHz`, W - p - 8, p + 18);
  }, [result]);

  // -- RECORDING --
  const startRecording = async () => {
    setError(null);
    setResult(null);
    try {
      // IMPORTANT: Disable all browser DSP processing.
      // The Wav2Vec2 model was trained on RAW audio — applying browser-side
      // noise suppression or auto-gain-control creates a distribution shift
      // that causes false emotion predictions. Let the backend pipeline
      // (librosa trim + Wav2Vec2FeatureExtractor) do all the processing.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Native sample rate AudioContext — avoid any browser resampling artifacts.
      // The backend's torchaudio.Resample handles downsampling to 16kHz correctly.
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;

      setIsRecording(true);
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
      drawVisualizer();
    } catch {
      setError("Microphone access denied. Please allow mic permissions.");
    }
  };

  const stopRecording = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder) return;
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setIsRecording(false);
      mediaRecorder.stream.getTracks().forEach((t) => t.stop());

      try {
        const arrayBuffer = await blob.arrayBuffer();
        const audioCtx = new AudioContext();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const wavBlob = audioBufferToWav(audioBuffer);
        audioCtx.close();
        await handleAnalyze(wavBlob, `recording_${Date.now()}.wav`);
      } catch {
        setError("Failed to convert recording. Try uploading a file instead.");
      }

      audioCtxRef.current?.close();
    };
    mediaRecorder.stop();
  };

  // -- FILE UPLOAD --
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("audio/")) { setError("Please select an audio file"); return; }
    setSelectedFile(file);
    setError(null);
    setResult(null);
    handleAnalyze(file);
  };

  // -- ANALYZE --
  const handleAnalyze = async (fileOrBlob: File | Blob, filename?: string) => {
    setIsAnalyzing(true);
    setError(null);
    drawIdle();
    try {
      const res = await analyzeAudio(fileOrBlob, filename);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed. Is the backend running?");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const statusText = isRecording
    ? "LIVE — RECORDING"
    : isAnalyzing
      ? "PROCESSING AUDIO..."
      : result
        ? "ANALYSIS COMPLETE"
        : "IDLE — AWAITING AUDIO";

  const statusColor = isRecording
    ? "var(--red)"
    : isAnalyzing
      ? "var(--yellow)"
      : result
        ? "var(--green)"
        : "#444";

  return (
    <div className="page-enter" style={{ minHeight: "100vh", paddingTop: 100, paddingBottom: 80 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>

        {/* ═══ HEADER ═══ */}
        <div className="fade-in-up" style={{ textAlign: "center", marginBottom: 56 }}>
          <div className="section-eyebrow">AUDIO ANALYZER</div>
          <h1 className="section-title" style={{ marginBottom: 12 }}>Analyze your audio</h1>
          <p style={{
            color: "var(--text2)", fontSize: 15, lineHeight: 1.8,
            maxWidth: 520, margin: "0 auto",
          }}>
            Record from your microphone or upload a file. Our Wav2Vec2 model
            detects emotions and recognizes intent in real-time.
          </p>
        </div>

        {/* ═══ INPUT PANELS — RECORD + UPLOAD side by side ═══ */}
        <div className="fade-in-up-delay-1" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 20,
        }}>
          {/* Record Card */}
          <div className="synapse-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 24px 32px", textAlign: "center" }}>
            <div className="card-label" style={{ alignSelf: "flex-start" }}>RECORD AUDIO</div>
            <div style={{ position: "relative", width: 88, height: 88, marginBottom: 16 }}>
              <div style={{
                position: "absolute", inset: -8, borderRadius: "50%",
                border: `1.5px solid ${isRecording ? "rgba(220,38,38,0.4)" : "rgba(124,58,237,0.12)"}`,
                animation: isRecording ? "rpulse 1.4s ease-in-out infinite" : "none",
                pointerEvents: "none",
              }} />
              <button className={`record-btn ${isRecording ? "recording" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isAnalyzing} id="record-button"
                style={{ width: 88, height: 88 }}>
                <div className="rec-icon" />
              </button>
            </div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 32, fontWeight: 600,
              color: isRecording ? "var(--red)" : "var(--text)",
              letterSpacing: "-0.02em", marginBottom: 6,
            }}>
              {pad(Math.floor(recSeconds / 60))}:{pad(recSeconds % 60)}
            </div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 10,
              letterSpacing: "0.14em", color: "var(--text3)",
            }}>
              {isRecording ? "TAP TO STOP" : isAnalyzing ? "PROCESSING..." : "TAP TO RECORD"}
            </div>
          </div>

          {/* Upload Card */}
          <div className="synapse-card" style={{ display: "flex", flexDirection: "column", padding: "36px 24px 32px" }}>
            <div className="card-label">UPLOAD FILE</div>
            <div
              className={`drop-zone ${dragOver ? "drag-over" : ""}`}
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                borderRadius: 16, padding: "32px 20px",
                minHeight: 140,
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" ref={fileInputRef} accept="audio/*" className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)} id="file-upload-input" />
              <svg style={{ marginBottom: 14, opacity: 0.2, width: 36, height: 36 }} viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, textAlign: "center" }}>
                <strong style={{ color: "rgba(167,139,250,0.9)" }}>Drop audio files</strong>
                <br />or click to browse
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginTop: 8, letterSpacing: "0.06em" }}>
                WAV · MP3 · FLAC · OGG
              </div>
            </div>
            {selectedFile && (
              <div style={{
                marginTop: 14, display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 12,
                background: "rgba(255,255,255,0.02)", border: "1px solid var(--b)",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "linear-gradient(135deg, #a78bfa, #60a5fa)", flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedFile.name}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", flexShrink: 0 }}>
                  {(selectedFile.size / 1024).toFixed(0)} KB
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ═══ STATUS + VISUALIZER (full width) ═══ */}
        <div className="synapse-card fade-in-up-delay-2" style={{
          padding: 0, overflow: "hidden", marginBottom: 20,
        }}>
          {/* Status bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 22px",
            borderBottom: "1px solid var(--b)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: statusColor,
                boxShadow: isRecording ? `0 0 12px ${statusColor}` : "none",
                animation: isRecording ? "blink 1.2s ease-in-out infinite" : "none",
              }} />
              <span style={{
                fontFamily: "var(--mono)", fontSize: 11,
                letterSpacing: "0.1em", color: "var(--text2)",
              }}>
                {statusText}
              </span>
            </div>
            {result && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 14px", borderRadius: 999,
                background: `${getColor(result.emotion.prediction)}10`,
                border: `1px solid ${getColor(result.emotion.prediction)}22`,
              }}>
                <span style={{ fontSize: 13 }}>{getIcon(result.emotion.prediction)}</span>
                <span style={{
                  fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
                  color: getColor(result.emotion.prediction), textTransform: "capitalize",
                }}>
                  {result.emotion.prediction}
                </span>
              </div>
            )}
          </div>
          {/* Canvas */}
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: 280 }} />
        </div>

        {/* ═══ PROCESSING INDICATOR ═══ */}
        {isAnalyzing && (
          <div className="synapse-card" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 14, padding: "28px 0", marginBottom: 20,
            animation: "glow-pulse 2s ease-in-out infinite",
          }}>
            <div className="spinner" />
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)", letterSpacing: "0.12em" }}>
              RUNNING INFERENCE...
            </span>
          </div>
        )}

        {/* ═══ ERROR ═══ */}
        {error && (
          <div className="synapse-card" style={{
            borderColor: "rgba(248,113,113,0.2)", marginBottom: 20,
            textAlign: "center", padding: "18px 24px",
          }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--red)" }}>
              ⚠ {error}
            </span>
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        {result && (
          <div className="fade-in-up" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 20, marginTop: 4,
          }}>
            {/* Emotion */}
            <div className="synapse-card result-glow">
              <div className="card-label">EMOTION DETECTED</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <div style={{
                  width: 60, height: 60, borderRadius: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, flexShrink: 0,
                  background: `${getColor(result.emotion.prediction)}10`,
                  border: `1px solid ${getColor(result.emotion.prediction)}20`,
                }}>
                  {getIcon(result.emotion.prediction)}
                </div>
                <div>
                  <div style={{
                    fontSize: 24, fontWeight: 700,
                    color: getColor(result.emotion.prediction),
                    textTransform: "capitalize", lineHeight: 1.1,
                  }}>
                    {result.emotion.prediction}
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                    {(result.emotion.confidence * 100).toFixed(1)}% confidence
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(result.emotion.all_scores).sort(([, a], [, b]) => b - a).map(([emotion, score]) => (
                  <div key={emotion} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)",
                      width: 56, textTransform: "uppercase", flexShrink: 0,
                    }}>{emotion}</span>
                    <div className="confidence-bar" style={{ flex: 1 }}>
                      <div className="confidence-bar-fill" style={{ width: `${score * 100}%`, background: getColor(emotion) }} />
                    </div>
                    <span style={{
                      fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)",
                      width: 36, textAlign: "right", flexShrink: 0,
                    }}>{(score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Intent */}
            <div className="synapse-card result-glow">
              <div className="card-label">INTENT RECOGNIZED</div>
              <div style={{ marginBottom: 24 }}>
                <div style={{
                  fontSize: 20, fontWeight: 700, color: "var(--accent2)",
                  lineHeight: 1.2, marginBottom: 4,
                }}>
                  {result.intent.combined}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
                  Action + Object
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em" }}>ACTION</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>{result.intent.action}</span>
                  </div>
                  <div className="confidence-bar">
                    <div className="confidence-bar-fill" style={{ width: `${result.intent.action_confidence * 100}%`, background: "var(--green)" }} />
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", marginTop: 4, textAlign: "right" }}>
                    {(result.intent.action_confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em" }}>OBJECT</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--yellow)" }}>{result.intent.object}</span>
                  </div>
                  <div className="confidence-bar">
                    <div className="confidence-bar-fill" style={{ width: `${result.intent.object_confidence * 100}%`, background: "var(--yellow)" }} />
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", marginTop: 4, textAlign: "right" }}>
                    {(result.intent.object_confidence * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Audio Details */}
            <div className="synapse-card result-glow">
              <div className="card-label">AUDIO DETAILS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                <div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text3)", marginBottom: 8 }}>DURATION</div>
                  <div className="stat-val">{result.duration.toFixed(1)}<span style={{ fontSize: 14, color: "var(--text3)", marginLeft: 2 }}>s</span></div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text3)", marginBottom: 8 }}>SAMPLE RATE</div>
                  <div className="stat-val">{(result.waveform.sampleRate / 1000).toFixed(1)}<span style={{ fontSize: 14, color: "var(--text3)", marginLeft: 2 }}>kHz</span></div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text3)", marginBottom: 8 }}>SAMPLES</div>
                  <div className="stat-val" style={{ fontSize: 18 }}>{result.waveform.totalSamples.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text3)", marginBottom: 8 }}>FILE</div>
                  <div className="stat-val" style={{ fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={result.filename}>
                    {result.filename?.slice(0, 12)}
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--text3)", marginBottom: 10 }}>SPECTROGRAM</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    padding: "6px 12px", borderRadius: 10,
                    background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.12)",
                    fontFamily: "var(--mono)", fontSize: 10, color: "var(--accent-raw)",
                  }}>
                    {result.spectrogram.n_mels} mel bands
                  </span>
                  <span style={{
                    padding: "6px 12px", borderRadius: 10,
                    background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.12)",
                    fontFamily: "var(--mono)", fontSize: 10, color: "var(--accent2)",
                  }}>
                    {result.spectrogram.minDb} → {result.spectrogram.maxDb} dB
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
