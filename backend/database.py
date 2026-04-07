"""SQLite database for storing analysis history."""

import sqlite3
import json
import os
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "synapse_history.db"


def get_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            file_size INTEGER,
            duration REAL,
            sample_rate INTEGER,
            created_at TEXT NOT NULL,
            
            -- Emotion results
            emotion_prediction TEXT,
            emotion_confidence REAL,
            emotion_scores TEXT,  -- JSON
            
            -- Intent results
            action_prediction TEXT,
            action_confidence REAL,
            object_prediction TEXT,
            object_confidence REAL,
            intent_combined TEXT,
            
            -- Visualization data
            waveform_data TEXT,    -- JSON
            spectrogram_data TEXT  -- JSON
        )
    """)
    conn.commit()
    conn.close()


def save_analysis(
    filename: str,
    file_size: int,
    duration: float,
    sample_rate: int,
    emotion_result: dict,
    intent_result: dict,
    waveform_data: dict | None = None,
    spectrogram_data: dict | None = None,
) -> int:
    """Save an analysis result and return its ID."""
    conn = get_connection()
    cursor = conn.execute(
        """
        INSERT INTO analyses (
            filename, file_size, duration, sample_rate, created_at,
            emotion_prediction, emotion_confidence, emotion_scores,
            action_prediction, action_confidence,
            object_prediction, object_confidence, intent_combined,
            waveform_data, spectrogram_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            filename,
            file_size,
            duration,
            sample_rate,
            datetime.utcnow().isoformat(),
            emotion_result["prediction"],
            emotion_result["confidence"],
            json.dumps(emotion_result["all_scores"]),
            intent_result["action"],
            intent_result["action_confidence"],
            intent_result["object"],
            intent_result["object_confidence"],
            intent_result["combined"],
            json.dumps(waveform_data) if waveform_data else None,
            json.dumps(spectrogram_data) if spectrogram_data else None,
        ),
    )
    conn.commit()
    row_id = cursor.lastrowid
    conn.close()
    return row_id


def get_all_analyses(limit: int = 50, offset: int = 0) -> list[dict]:
    """Get all analyses, most recent first."""
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT id, filename, file_size, duration, sample_rate, created_at,
               emotion_prediction, emotion_confidence, emotion_scores,
               action_prediction, action_confidence,
               object_prediction, object_confidence, intent_combined
        FROM analyses
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    ).fetchall()
    conn.close()

    results = []
    for row in rows:
        d = dict(row)
        d["emotion_scores"] = json.loads(d["emotion_scores"]) if d["emotion_scores"] else {}
        results.append(d)
    return results


def get_analysis_by_id(analysis_id: int) -> dict | None:
    """Get a single analysis with full data including visualizations."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    conn.close()

    if not row:
        return None

    d = dict(row)
    d["emotion_scores"] = json.loads(d["emotion_scores"]) if d["emotion_scores"] else {}
    d["waveform_data"] = json.loads(d["waveform_data"]) if d["waveform_data"] else None
    d["spectrogram_data"] = json.loads(d["spectrogram_data"]) if d["spectrogram_data"] else None
    return d


def get_summary_stats() -> dict:
    """Get aggregate statistics for the dashboard."""
    conn = get_connection()

    total = conn.execute("SELECT COUNT(*) FROM analyses").fetchone()[0]
    avg_confidence = conn.execute(
        "SELECT AVG(emotion_confidence) FROM analyses"
    ).fetchone()[0]
    avg_duration = conn.execute("SELECT AVG(duration) FROM analyses").fetchone()[0]

    emotion_counts = {}
    rows = conn.execute(
        "SELECT emotion_prediction, COUNT(*) as cnt FROM analyses GROUP BY emotion_prediction"
    ).fetchall()
    for row in rows:
        emotion_counts[row["emotion_prediction"]] = row["cnt"]

    action_counts = {}
    rows = conn.execute(
        "SELECT action_prediction, COUNT(*) as cnt FROM analyses GROUP BY action_prediction"
    ).fetchall()
    for row in rows:
        action_counts[row["action_prediction"]] = row["cnt"]

    conn.close()

    most_common_emotion = max(emotion_counts, key=emotion_counts.get) if emotion_counts else "N/A"

    return {
        "total_recordings": total,
        "avg_confidence": round(avg_confidence or 0, 4),
        "avg_duration": round(avg_duration or 0, 2),
        "most_common_emotion": most_common_emotion,
        "emotion_distribution": emotion_counts,
        "action_distribution": action_counts,
    }


# Initialize on import
init_db()
