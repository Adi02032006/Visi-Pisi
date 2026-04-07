/**
 * Synapse AI — API Client
 * Connects the React frontend to the FastAPI backend.
 */

const API_BASE = "http://localhost:8001/api";

export interface EmotionResult {
  prediction: string;
  confidence: number;
  all_scores: Record<string, number>;
}

export interface IntentResult {
  action: string;
  action_confidence: number;
  action_scores: Record<string, number>;
  object: string;
  object_confidence: number;
  object_scores: Record<string, number>;
  combined: string;
}

export interface WaveformData {
  points: { time: number; amplitude: number }[];
  duration: number;
  sampleRate: number;
  totalSamples: number;
}

export interface SpectrogramData {
  data: number[][];
  n_mels: number;
  timeSteps: number;
  minDb: number;
  maxDb: number;
}

export interface AnalysisResult {
  id: number;
  filename: string;
  duration: number;
  emotion: EmotionResult;
  intent: IntentResult;
  waveform: WaveformData;
  spectrogram: SpectrogramData;
}

export interface HistoryItem {
  id: number;
  filename: string;
  file_size: number;
  duration: number;
  sample_rate: number;
  created_at: string;
  emotion_prediction: string;
  emotion_confidence: number;
  emotion_scores: Record<string, number>;
  action_prediction: string;
  action_confidence: number;
  object_prediction: string;
  object_confidence: number;
  intent_combined: string;
}

export interface StatsResult {
  total_recordings: number;
  avg_confidence: number;
  avg_duration: number;
  most_common_emotion: string;
  emotion_distribution: Record<string, number>;
  action_distribution: Record<string, number>;
}

export interface HealthResult {
  status: string;
  model_loaded: boolean;
  device: string;
}

export async function analyzeAudio(file: File | Blob, filename?: string): Promise<AnalysisResult> {
  const formData = new FormData();
  if (file instanceof Blob && !(file instanceof File)) {
    formData.append("file", file, filename || "recording.webm");
  } else {
    formData.append("file", file);
  }

  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Analysis failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function getHistory(limit = 50, offset = 0): Promise<{ analyses: HistoryItem[]; total: number }> {
  const res = await fetch(`${API_BASE}/history?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getStats(): Promise<StatsResult> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getHealth(): Promise<HealthResult> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getAnalysisById(id: number): Promise<HistoryItem> {
  const res = await fetch(`${API_BASE}/history/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
