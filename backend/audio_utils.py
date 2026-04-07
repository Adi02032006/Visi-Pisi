"""Audio preprocessing utilities — torchaudio-based (NOT librosa.load)."""

import os
# Force soundfile backend BEFORE importing torchaudio
os.environ["TORCHAUDIO_USE_BACKEND_DISPATCHER"] = "1"

import torch
import torch.nn.functional as F
import torchaudio
import torchaudio.transforms as T
import librosa
import soundfile as sf

# Force soundfile backend — avoids TorchCodec dependency
try:
    torchaudio.set_audio_backend("soundfile")
except Exception:
    pass  # Newer torchaudio versions handle this differently


def safe_load_audio(audio_path: str):
    """Load audio with soundfile directly — bypasses TorchCodec entirely."""
    try:
        wav, sr = torchaudio.load(audio_path, backend="soundfile")
    except Exception:
        # Direct soundfile fallback
        data, sr = sf.read(audio_path, dtype="float32")
        wav = torch.from_numpy(data)
        if wav.ndim == 1:
            wav = wav.unsqueeze(0)  # (1, samples)
        else:
            wav = wav.T  # (channels, samples)
    return wav, sr
import numpy as np
from transformers import Wav2Vec2FeatureExtractor

SAMPLE_RATE = 16000
MAX_SAMPLES = 64000  # 4 seconds at 16kHz

# Will be initialized once at import time
_feature_extractor = None


def get_feature_extractor():
    global _feature_extractor
    if _feature_extractor is None:
        _feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained("facebook/wav2vec2-base")
    return _feature_extractor


def preprocess_audio(audio_path: str):
    """
    Load and preprocess audio for inference.
    
    Pipeline:
      1. Load with torchaudio (NOT librosa — avoids distribution shift)
      2. Resample to 16kHz mono
      3. Trim silence with librosa.effects.trim
      4. Pad/trim to 4 seconds (64,000 samples)
      5. Normalize with Wav2Vec2FeatureExtractor
      6. Create attention mask (1 for real frames, 0 for padding)
    
    Returns: (waveform_tensor, attention_mask_tensor)
    """
    wav, sr = safe_load_audio(audio_path)

    # Resample to 16kHz
    if sr != SAMPLE_RATE:
        wav = T.Resample(sr, SAMPLE_RATE)(wav)

    # Stereo → mono
    if wav.shape[0] > 1:
        wav = wav.mean(dim=0)
    else:
        wav = wav.squeeze(0)

    # Trim silence
    wav_np = wav.numpy()
    wav_trimmed, _ = librosa.effects.trim(wav_np, top_db=20)
    wav = torch.from_numpy(wav_trimmed.copy())

    # Track real length for attention mask
    real_length = min(wav.shape[0], MAX_SAMPLES)

    # Pad/trim to exactly 4 seconds
    if wav.shape[0] > MAX_SAMPLES:
        wav = wav[:MAX_SAMPLES]
    elif wav.shape[0] < MAX_SAMPLES:
        wav = F.pad(wav, (0, MAX_SAMPLES - wav.shape[0]))

    # Create attention mask
    attention_mask = torch.zeros(MAX_SAMPLES)
    attention_mask[:real_length] = 1.0

    # Normalize with Wav2Vec2FeatureExtractor
    fe = get_feature_extractor()
    inputs = fe(wav.numpy(), sampling_rate=SAMPLE_RATE, return_tensors="pt")
    wav = inputs.input_values.squeeze(0)

    return wav, attention_mask


def extract_waveform_for_viz(audio_path: str, num_points: int = 200):
    """Extract downsampled waveform data for frontend visualization."""
    wav, sr = safe_load_audio(audio_path)
    if sr != SAMPLE_RATE:
        wav = T.Resample(sr, SAMPLE_RATE)(wav)
    if wav.shape[0] > 1:
        wav = wav.mean(dim=0)
    else:
        wav = wav.squeeze(0)

    wav_np = wav.numpy()
    duration = len(wav_np) / SAMPLE_RATE

    # Downsample for visualization
    chunk_size = max(1, len(wav_np) // num_points)
    points = []
    for i in range(0, len(wav_np), chunk_size):
        chunk = wav_np[i:i + chunk_size]
        points.append({
            "time": round(i / SAMPLE_RATE, 4),
            "amplitude": round(float(np.max(np.abs(chunk))), 4),
        })

    return {
        "points": points[:num_points],
        "duration": round(duration, 2),
        "sampleRate": SAMPLE_RATE,
        "totalSamples": len(wav_np),
    }


def extract_spectrogram(audio_path: str, n_mels: int = 64, hop_length: int = 512):
    """Extract mel-spectrogram data for visualization."""
    wav, sr = safe_load_audio(audio_path)
    if sr != SAMPLE_RATE:
        wav = T.Resample(sr, SAMPLE_RATE)(wav)
    if wav.shape[0] > 1:
        wav = wav.mean(dim=0, keepdim=True)

    mel_transform = T.MelSpectrogram(
        sample_rate=SAMPLE_RATE,
        n_mels=n_mels,
        hop_length=hop_length,
        n_fft=1024,
    )
    mel_spec = mel_transform(wav)
    mel_spec_db = T.AmplitudeToDB()(mel_spec)

    data = mel_spec_db.squeeze().numpy()

    return {
        "data": data.tolist(),
        "n_mels": n_mels,
        "timeSteps": data.shape[1],
        "minDb": round(float(data.min()), 2),
        "maxDb": round(float(data.max()), 2),
    }
