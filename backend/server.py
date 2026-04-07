"""
Synapse AI — FastAPI Backend Server

Endpoints:
  POST /api/analyze        Upload audio file → emotion + intent prediction
  GET  /api/history        List past analyses
  GET  /api/history/{id}   Full analysis details
  GET  /api/stats          Dashboard summary statistics
"""

import os
import uuid
import tempfile
from pathlib import Path

import torch
import torch.nn.functional as F
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from Model import JointSpeechModel
from audio_utils import preprocess_audio, extract_waveform_for_viz, extract_spectrogram, SAMPLE_RATE
import database as db

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Synapse AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_PATH = Path(__file__).parent.parent / "best_joint_model.pt"

model = None
idx_to_action = {}
idx_to_object = {}
idx_to_emotion = {}

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@app.on_event("startup")
async def load_model():
    global model, idx_to_action, idx_to_object, idx_to_emotion

    if not MODEL_PATH.exists():
        print(f"⚠️  Model not found at {MODEL_PATH}")
        return

    print(f"🧠 Loading model from {MODEL_PATH} on {DEVICE}...")
    ckpt = torch.load(str(MODEL_PATH), map_location=DEVICE, weights_only=False)

    model = JointSpeechModel(
        num_actions=ckpt["num_actions"],
        num_objects=ckpt["num_objects"],
        num_emotions=ckpt["num_emotions"],
    ).to(DEVICE)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    # Label maps
    label_maps = ckpt["label_maps"]
    idx_to_action = label_maps["idx_to_action"]
    idx_to_object = label_maps["idx_to_object"]
    idx_to_emotion = label_maps["idx_to_emotion"]

    num_e = ckpt["num_emotions"]
    num_a = ckpt["num_actions"]
    num_o = ckpt["num_objects"]
    print(f"✅ Model loaded — {num_e} emotions, {num_a} actions, {num_o} objects")


# ---------------------------------------------------------------------------
# Inference helper
# ---------------------------------------------------------------------------
def run_inference(audio_path: str) -> dict:
    """Run the joint model on an audio file."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    wav, mask = preprocess_audio(audio_path)
    wav = wav.unsqueeze(0).to(DEVICE)
    mask = mask.unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        action_logits, object_logits, emotion_logits = model(wav, mask, task="both")

    # Softmax → probabilities
    action_probs = F.softmax(action_logits, dim=-1)[0]
    object_probs = F.softmax(object_logits, dim=-1)[0]
    emotion_probs = F.softmax(emotion_logits, dim=-1)[0]

    action_idx = action_probs.argmax().item()
    object_idx = object_probs.argmax().item()
    emotion_idx = emotion_probs.argmax().item()

    # Confidence thresholding for emotion (< 0.28 → neutral)
    # With 4 classes, random chance = 25%, so 28% is just above noise
    emotion_conf = emotion_probs[emotion_idx].item()
    emotion_label = idx_to_emotion[str(emotion_idx)]
    if emotion_conf < 0.28:
        emotion_label = "neutral"

    num_emotions = len(idx_to_emotion)
    emotion_scores = {
        idx_to_emotion[str(i)]: round(emotion_probs[i].item(), 4)
        for i in range(num_emotions)
    }

    num_actions = len(idx_to_action)
    action_scores = {
        idx_to_action[str(i)]: round(action_probs[i].item(), 4)
        for i in range(num_actions)
    }

    num_objects = len(idx_to_object)
    object_scores = {
        idx_to_object[str(i)]: round(object_probs[i].item(), 4)
        for i in range(num_objects)
    }

    return {
        "emotion": {
            "prediction": emotion_label,
            "confidence": round(emotion_conf, 4),
            "all_scores": emotion_scores,
        },
        "intent": {
            "action": idx_to_action[str(action_idx)],
            "action_confidence": round(action_probs[action_idx].item(), 4),
            "action_scores": action_scores,
            "object": idx_to_object[str(object_idx)],
            "object_confidence": round(object_probs[object_idx].item(), 4),
            "object_scores": object_scores,
            "combined": f"{idx_to_action[str(action_idx)]} {idx_to_object[str(object_idx)]}",
        },
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None, "device": DEVICE}


@app.post("/api/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    """Upload an audio file and get emotion + intent predictions."""
    # Validate file type
    allowed = {".wav", ".mp3", ".flac", ".ogg", ".webm", ".m4a"}
    ext = Path(file.filename or "audio.wav").suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported format: {ext}. Allowed: {allowed}")

    # Save uploaded file
    file_id = uuid.uuid4().hex[:12]
    save_path = UPLOAD_DIR / f"{file_id}{ext}"
    content = await file.read()
    file_size = len(content)

    with open(save_path, "wb") as f:
        f.write(content)

    try:
        # Run inference
        result = run_inference(str(save_path))

        # Extract visualization data
        waveform_data = extract_waveform_for_viz(str(save_path))
        spectrogram_data = extract_spectrogram(str(save_path))

        # Save to database
        analysis_id = db.save_analysis(
            filename=file.filename or "recording.wav",
            file_size=file_size,
            duration=waveform_data["duration"],
            sample_rate=SAMPLE_RATE,
            emotion_result=result["emotion"],
            intent_result=result["intent"],
            waveform_data=waveform_data,
            spectrogram_data=spectrogram_data,
        )

        return {
            "id": analysis_id,
            "filename": file.filename,
            "duration": waveform_data["duration"],
            **result,
            "waveform": waveform_data,
            "spectrogram": spectrogram_data,
        }

    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {str(e)}")
    finally:
        # Clean up uploaded file
        if save_path.exists():
            save_path.unlink()


@app.get("/api/history")
async def get_history(limit: int = 50, offset: int = 0):
    """List past analyses."""
    analyses = db.get_all_analyses(limit=limit, offset=offset)
    return {"analyses": analyses, "total": len(analyses)}


@app.get("/api/history/{analysis_id}")
async def get_analysis(analysis_id: int):
    """Get full details for a single analysis."""
    analysis = db.get_analysis_by_id(analysis_id)
    if not analysis:
        raise HTTPException(404, "Analysis not found")
    return analysis


@app.get("/api/stats")
async def get_stats():
    """Get dashboard summary statistics."""
    return db.get_summary_stats()


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=False)
