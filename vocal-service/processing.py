"""
Audio processing pipeline for vocal analysis.

Handles:
- Demucs vocal isolation (GPU-accelerated)
- Feature extraction (pitch, onsets, energy)
- DTW alignment between user recording and reference
"""

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

import librosa
import numpy as np
import parselmouth
from fastdtw import fastdtw
from scipy.spatial.distance import euclidean

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Vocal isolation
# ---------------------------------------------------------------------------

def isolate_vocals(
    audio_path: str,
    output_dir: str,
    model: str = "htdemucs_ft",
) -> tuple[str, str]:
    """Run Demucs to separate vocals from a mix.

    Args:
        audio_path: Path to the input audio file.
        output_dir: Directory where separated stems will be written.
        model:      Demucs model name (default: htdemucs_ft for best quality).

    Returns:
        Tuple of (vocal_path, accompaniment_path) — paths to the isolated
        vocal and no_vocals (accompaniment) WAV files.
    """
    logger.info("Running Demucs vocal isolation: model=%s, input=%s", model, audio_path)

    # demucs.separate expects sys.argv-style args
    from demucs.separate import main as demucs_main

    args = [
        "--two-stems", "vocals",
        "-n", model,
        "-o", output_dir,
        "--filename", "{stem}.{ext}",
        audio_path,
    ]

    try:
        demucs_main(args)
    except SystemExit:
        # demucs calls sys.exit(0) on success
        pass

    # The output tree is: <output_dir>/<model>/<track_name>/vocals.wav
    # and <output_dir>/<model>/<track_name>/no_vocals.wav
    track_name = Path(audio_path).stem
    vocal_path = os.path.join(output_dir, model, track_name, "vocals.wav")
    accompaniment_path = os.path.join(output_dir, model, track_name, "no_vocals.wav")

    if not os.path.isfile(vocal_path):
        # Search for any vocals file in the output directory
        logger.warning("Expected vocal file not at %s, searching...", vocal_path)
        found = None
        for root, dirs, files in os.walk(output_dir):
            for f in files:
                if f.lower() == "vocals.wav":
                    found = os.path.join(root, f)
                    break
            if found:
                break
        if found:
            vocal_path = found
            logger.info("Found vocal file at: %s", vocal_path)
        else:
            # List what was actually produced for debugging
            all_files = []
            for root, dirs, files in os.walk(output_dir):
                for f in files:
                    all_files.append(os.path.join(root, f))
            raise FileNotFoundError(
                f"Demucs did not produce vocal file. Output dir contents: {all_files}"
            )

    if not os.path.isfile(accompaniment_path):
        # Search for no_vocals file
        logger.warning("Expected accompaniment not at %s, searching...", accompaniment_path)
        found = None
        for root, dirs, files in os.walk(output_dir):
            for f in files:
                if "no_vocal" in f.lower():
                    found = os.path.join(root, f)
                    break
            if found:
                break
        if found:
            accompaniment_path = found
            logger.info("Found accompaniment at: %s", accompaniment_path)
        else:
            logger.warning("No accompaniment file found — will return empty path")
            accompaniment_path = ""

    logger.info("Vocal isolation complete: vocals=%s, accompaniment=%s", vocal_path, accompaniment_path)
    return vocal_path, accompaniment_path


# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

def extract_features(audio_path: str, sr: int = 22050) -> dict:
    """Extract pitch, onset, and energy features from an audio file.

    Args:
        audio_path: Path to WAV/MP3 audio.
        sr:         Target sample rate.

    Returns:
        Dictionary with pitch_values, pitch_times, onset_times,
        rms_values, rms_times, and duration_s.
    """
    logger.info("Extracting features from %s (sr=%d)", audio_path, sr)

    y, sr = librosa.load(audio_path, sr=sr)
    duration_s = len(y) / sr

    # -- Pitch extraction via Parselmouth (Praat) --
    snd = parselmouth.Sound(audio_path)
    pitch_obj = snd.to_pitch(time_step=0.01)
    pitch_values = pitch_obj.selected_array["frequency"]
    pitch_times = pitch_obj.xs()

    # Replace unvoiced (0 Hz) with NaN for downstream processing
    pitch_values_clean = np.where(pitch_values == 0, np.nan, pitch_values)

    # -- Onset detection --
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units="frames")
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)

    # -- RMS energy --
    rms = librosa.feature.rms(y=y)[0]
    rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr)

    # Normalise RMS to 0-1 range for comparability
    rms_max = rms.max()
    rms_norm = (rms / rms_max).tolist() if rms_max > 0 else rms.tolist()

    features = {
        "pitch_values": pitch_values_clean.tolist(),
        "pitch_times": pitch_times.tolist(),
        "onset_times": onset_times.tolist(),
        "rms_values": rms_norm,
        "rms_times": rms_times.tolist(),
        "duration_s": round(duration_s, 4),
    }
    logger.info(
        "Features extracted: %d pitch frames, %d onsets, %.1fs duration",
        len(pitch_values),
        len(onset_times),
        duration_s,
    )
    return features


# ---------------------------------------------------------------------------
# DTW alignment
# ---------------------------------------------------------------------------

def align_features(user_features: dict, ref_features: dict) -> dict:
    """Align a user recording to a reference using Dynamic Time Warping.

    The alignment is performed on pitch contours.  Unvoiced frames (NaN)
    are temporarily set to 0 for DTW distance computation but flagged
    separately so the scorer can handle them.

    Args:
        user_features: Feature dict from extract_features (user recording).
        ref_features:  Feature dict from extract_features (reference).

    Returns:
        Dictionary with:
            - path:            list of (user_idx, ref_idx) tuples
            - dtw_distance:    raw DTW distance
            - pitch_deviations: per-aligned-pair pitch deviation in cents
            - timing_offsets:  per-aligned-pair time offset in seconds
            - energy_ratios:   per-aligned-pair energy ratio (user/ref)
    """
    logger.info("Running DTW alignment")

    user_pitch = np.array(user_features["pitch_values"])
    ref_pitch = np.array(ref_features["pitch_values"])

    # Replace NaN with 0 for DTW (we track voicing separately)
    user_pitch_dtw = np.nan_to_num(user_pitch, nan=0.0)
    ref_pitch_dtw = np.nan_to_num(ref_pitch, nan=0.0)

    # Reshape for FastDTW (needs 2-D)
    user_seq = user_pitch_dtw.reshape(-1, 1)
    ref_seq = ref_pitch_dtw.reshape(-1, 1)

    distance, path = fastdtw(user_seq, ref_seq, dist=euclidean, radius=50)

    # Pre-compute per-pair deviations
    user_times = np.array(user_features["pitch_times"])
    ref_times = np.array(ref_features["pitch_times"])

    user_rms = np.array(user_features["rms_values"])
    ref_rms = np.array(ref_features["rms_values"])
    user_rms_times = np.array(user_features["rms_times"])
    ref_rms_times = np.array(ref_features["rms_times"])

    pitch_deviations = []  # in cents
    raw_timing_offsets = []  # in seconds (before normalization)
    energy_ratios = []     # user/ref ratio

    for u_idx, r_idx in path:
        # -- Pitch deviation in cents --
        u_f = user_pitch[u_idx] if u_idx < len(user_pitch) else np.nan
        r_f = ref_pitch[r_idx] if r_idx < len(ref_pitch) else np.nan

        if np.isnan(u_f) or np.isnan(r_f) or u_f <= 0 or r_f <= 0:
            pitch_deviations.append(None)  # unvoiced
        else:
            cents = 1200.0 * np.log2(u_f / r_f)
            pitch_deviations.append(round(float(cents), 2))

        # -- Timing offset (raw, before normalization) --
        u_t = user_times[u_idx] if u_idx < len(user_times) else 0.0
        r_t = ref_times[r_idx] if r_idx < len(ref_times) else 0.0
        raw_timing_offsets.append(float(u_t - r_t))

        # -- Energy ratio --
        # Map pitch-frame index to nearest RMS frame
        u_rms_idx = _nearest_idx(user_rms_times, u_t) if u_idx < len(user_times) else 0
        r_rms_idx = _nearest_idx(ref_rms_times, r_t) if r_idx < len(ref_times) else 0

        u_e = user_rms[u_rms_idx] if u_rms_idx < len(user_rms) else 0.0
        r_e = ref_rms[r_rms_idx] if r_rms_idx < len(ref_rms) else 0.0

        if r_e > 1e-6:
            energy_ratios.append(round(float(u_e / r_e), 4))
        else:
            energy_ratios.append(None)

    # Normalize timing offsets: subtract the median baseline offset.
    # When comparing a chunk (starts at 0s) against a full-song reference
    # (where the matching section starts at e.g. 28s), the raw offsets are
    # all ~-28s. The median captures this constant shift; deviations from
    # the median represent actual timing errors (early/late entries).
    raw_arr = np.array(raw_timing_offsets)
    baseline = float(np.median(raw_arr))
    timing_offsets = [round(float(v - baseline), 4) for v in raw_timing_offsets]
    logger.info(
        "Timing normalization: baseline=%.3fs (subtracted from all offsets)",
        baseline,
    )

    alignment = {
        "path": [(int(u), int(r)) for u, r in path],
        "dtw_distance": round(float(distance), 4),
        "pitch_deviations": pitch_deviations,
        "timing_offsets": timing_offsets,
        "energy_ratios": energy_ratios,
    }
    logger.info(
        "Alignment complete: %d pairs, DTW distance=%.2f",
        len(path),
        distance,
    )
    return alignment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _nearest_idx(arr: np.ndarray, value: float) -> int:
    """Return the index of the element in *arr* closest to *value*."""
    return int(np.argmin(np.abs(arr - value)))


def features_to_json(features: dict) -> str:
    """Serialise features dict to a compact JSON string."""
    return json.dumps(features, separators=(",", ":"))


def features_from_json(json_str: str) -> dict:
    """Deserialise features dict from JSON string."""
    return json.loads(json_str)
