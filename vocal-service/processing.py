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
    import time as _time
    logger.info("Extracting features from %s (sr=%d)", audio_path, sr)

    t0 = _time.time()
    y, sr = librosa.load(audio_path, sr=sr)
    duration_s = len(y) / sr
    logger.info("[FEAT] librosa.load: %.1fs", _time.time() - t0)

    # -- Pitch extraction via Parselmouth (Praat) --
    # Use 0.02s time step (50fps) instead of 0.01s — halves frames, minimal quality loss
    t1 = _time.time()
    snd = parselmouth.Sound(y, sampling_frequency=sr)  # reuse loaded audio, avoid re-reading file
    pitch_obj = snd.to_pitch(time_step=0.02)
    pitch_values = pitch_obj.selected_array["frequency"]
    pitch_times = pitch_obj.xs()
    logger.info("[FEAT] praat pitch: %.1fs (%d frames)", _time.time() - t1, len(pitch_values))

    # Replace unvoiced (0 Hz) with NaN for downstream processing
    pitch_values_clean = np.where(pitch_values == 0, np.nan, pitch_values)

    # -- Onset detection --
    t2 = _time.time()
    onset_frames = librosa.onset.onset_detect(
        y=y, sr=sr, units="frames",
        delta=0.05,        # moderate threshold (default 0.07) — catches real attacks, ignores minor fluctuations
        backtrack=True,     # snap onsets to nearest energy minimum
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)
    logger.info("[FEAT] onsets: %.1fs (%d onsets)", _time.time() - t2, len(onset_times))

    # -- RMS energy --
    t3 = _time.time()
    rms = librosa.feature.rms(y=y)[0]
    rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
    logger.info("[FEAT] rms: %.1fs", _time.time() - t3)

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

    Uses a 3-layer defense against alignment drift:
      Layer 1: Detect and trim leading noise/gibberish before DTW
      Layer 2: Multi-feature DTW (pitch + voicing + energy) instead of pitch-only
      Layer 3: Post-DTW path sanity check (logging only for V1)

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
            - path_sanity:     dict with drift detection results
    """
    logger.info("Running DTW alignment")

    user_dur = user_features.get("duration_s", 0)
    ref_dur = ref_features.get("duration_s", 0)

    # --- (a) Trim reference to user duration + 20% margin ---
    max_ref_dur = user_dur * 1.2 + 5.0  # e.g. 20s recording → 29s of ref
    ref_pitch_raw = ref_features["pitch_values"]
    ref_times_raw = ref_features.get("pitch_times", [])
    if ref_dur > max_ref_dur and ref_times_raw:
        cut_idx = next(
            (i for i, t in enumerate(ref_times_raw) if t > max_ref_dur),
            len(ref_times_raw),
        )
        ref_pitch_raw = ref_pitch_raw[:cut_idx]
        logger.info(
            "Trimmed reference from %.1fs (%d frames) to %.1fs (%d frames)",
            ref_dur, len(ref_features["pitch_values"]), max_ref_dur, cut_idx,
        )
    else:
        cut_idx = None

    # --- (b) Build pitch arrays ---
    user_pitch = np.array(user_features["pitch_values"])
    ref_pitch = np.array(ref_pitch_raw)

    # --- (c) Build time and RMS arrays (moved before onset detection) ---
    user_times = np.array(user_features["pitch_times"])
    ref_times = np.array(ref_times_raw[:cut_idx] if cut_idx else ref_times_raw)

    user_rms = np.array(user_features["rms_values"])
    user_rms_times = np.array(user_features["rms_times"])

    ref_rms_raw = ref_features["rms_values"]
    ref_rms_times_raw = ref_features["rms_times"]
    if cut_idx and ref_rms_times_raw:
        rms_cut = next(
            (i for i, t in enumerate(ref_rms_times_raw) if t > max_ref_dur),
            len(ref_rms_times_raw),
        )
        ref_rms = np.array(ref_rms_raw[:rms_cut])
        ref_rms_times = np.array(ref_rms_times_raw[:rms_cut])
    else:
        ref_rms = np.array(ref_rms_raw)
        ref_rms_times = np.array(ref_rms_times_raw)

    # --- (d) Layer 1: Detect singing onset (leading noise trimming) ---
    singing_onset = _detect_singing_onset(
        user_pitch, user_times, ref_pitch, ref_times,
    )

    # --- (e) Trim user arrays if singing_onset > 0.2s ---
    user_frame_offset = 0
    if singing_onset > 0.2 and len(user_times) > 0:
        trim_idx = next(
            (i for i, t in enumerate(user_times) if t >= singing_onset),
            0,
        )
        if 0 < trim_idx < len(user_pitch):
            user_frame_offset = trim_idx
            user_pitch_dtw = user_pitch[trim_idx:]
            user_times_dtw = user_times[trim_idx:]
            logger.info(
                "Layer 1: Trimmed %d leading frames (%.2fs) — singing onset at %.2fs",
                trim_idx, singing_onset, singing_onset,
            )
        else:
            user_pitch_dtw = user_pitch
            user_times_dtw = user_times
    else:
        user_pitch_dtw = user_pitch
        user_times_dtw = user_times
        if singing_onset > 0:
            logger.info(
                "Layer 1: Singing onset at %.2fs (below 0.2s threshold, no trim)",
                singing_onset,
            )
        else:
            logger.info("Layer 1: Singing starts immediately, no trimming needed")

    # --- (f) Layer 2: Build 3D feature vectors [log_pitch, voicing, rms] ---
    user_rms_dtw_interp = np.interp(user_times_dtw, user_rms_times, user_rms)
    ref_rms_interp = np.interp(ref_times, ref_rms_times, ref_rms)

    user_seq = _build_dtw_features(user_pitch_dtw, user_rms_dtw_interp)
    ref_seq = _build_dtw_features(ref_pitch, ref_rms_interp)

    # --- (g) Run FastDTW on 3D vectors ---
    distance, path = fastdtw(user_seq, ref_seq, dist=euclidean, radius=50)

    # --- (h) Shift path indices back by user_frame_offset ---
    if user_frame_offset > 0:
        path = [(u_idx + user_frame_offset, r_idx) for u_idx, r_idx in path]
        logger.info(
            "Shifted DTW path indices by +%d to restore original coordinates",
            user_frame_offset,
        )

    # --- (i) Compute per-pair deviations (uses original full arrays) ---
    pitch_deviations = []  # in cents
    raw_timing_offsets = []  # in seconds (before normalization)
    energy_ratios = []  # user/ref ratio

    for u_idx, r_idx in path:
        # -- Pitch deviation in cents --
        u_f = user_pitch[u_idx] if u_idx < len(user_pitch) else np.nan
        r_f = ref_pitch[r_idx] if r_idx < len(ref_pitch) else np.nan

        if np.isnan(u_f) or np.isnan(r_f) or u_f <= 0 or r_f <= 0:
            pitch_deviations.append(None)  # unvoiced
        else:
            cents_raw = 1200.0 * np.log2(u_f / r_f)
            cents = ((cents_raw + 600) % 1200) - 600  # fold to nearest octave
            pitch_deviations.append(round(float(cents), 2))

        # -- Timing offset (raw, before normalization) --
        u_t = user_times[u_idx] if u_idx < len(user_times) else 0.0
        r_t = ref_times[r_idx] if r_idx < len(ref_times) else 0.0
        raw_timing_offsets.append(float(u_t - r_t))

        # -- Energy ratio --
        u_rms_idx = _nearest_idx(user_rms_times, u_t) if u_idx < len(user_times) else 0
        r_rms_idx = _nearest_idx(ref_rms_times, r_t) if r_idx < len(ref_times) else 0

        u_e = user_rms[u_rms_idx] if u_rms_idx < len(user_rms) else 0.0
        r_e = ref_rms[r_rms_idx] if r_rms_idx < len(ref_rms) else 0.0

        if r_e > 1e-6:
            energy_ratios.append(round(float(u_e / r_e), 4))
        else:
            energy_ratios.append(None)

    # --- (j) Deduplicate path by user index ---
    # DTW with mismatched lengths creates many ref frames bunched onto single
    # user frames.  Keep only one pair per unique user index (smallest pitch
    # deviation) so timing offsets reflect true 1:1 alignment quality.
    dedup: dict[int, int] = {}  # u_idx -> best pair_idx
    for pair_idx, (u_idx, r_idx) in enumerate(path):
        if u_idx not in dedup:
            dedup[u_idx] = pair_idx
        else:
            existing_dev = pitch_deviations[dedup[u_idx]]
            current_dev = pitch_deviations[pair_idx]
            ex_abs = abs(existing_dev) if existing_dev is not None else 999
            cu_abs = abs(current_dev) if current_dev is not None else 999
            if cu_abs < ex_abs:
                dedup[u_idx] = pair_idx

    keep = sorted(dedup.values())
    path_dedup = [path[i] for i in keep]
    pitch_deviations = [pitch_deviations[i] for i in keep]
    raw_timing_offsets = [raw_timing_offsets[i] for i in keep]
    energy_ratios = [energy_ratios[i] for i in keep]

    logger.info(
        "DTW deduplication: %d pairs -> %d unique user frames",
        len(path), len(keep),
    )

    # --- (k) Normalize timing offsets ---
    # Subtract the median baseline offset (constant shift from chunk start
    # vs full-song reference position).
    raw_arr = np.array(raw_timing_offsets)
    baseline = float(np.median(raw_arr))
    timing_offsets = [round(float(v - baseline), 4) for v in raw_timing_offsets]
    logger.info(
        "Timing normalization: baseline=%.3fs (subtracted from all offsets)",
        baseline,
    )

    # --- (l) Layer 3: Post-DTW path sanity check (diagnostic) ---
    path_sanity = _check_path_sanity(path_dedup, user_times, ref_times)
    if not path_sanity["is_sane"]:
        logger.warning(
            "Layer 3: DTW path drift detected! avg_slope=%.3f, %d drift regions: %s",
            path_sanity["avg_slope"],
            len(path_sanity["drift_regions"]),
            path_sanity["drift_regions"],
        )
    else:
        logger.info(
            "Layer 3: DTW path sanity OK (avg_slope=%.3f)", path_sanity["avg_slope"],
        )

    # --- (m) Build alignment dict ---
    alignment = {
        "path": [(int(u), int(r)) for u, r in path_dedup],
        "dtw_distance": round(float(distance), 4),
        "pitch_deviations": pitch_deviations,
        "timing_offsets": timing_offsets,
        "energy_ratios": energy_ratios,
        "path_sanity": path_sanity,
    }
    logger.info(
        "Alignment complete: %d pairs, DTW distance=%.2f, singing_onset=%.2fs",
        len(path_dedup),
        distance,
        singing_onset,
    )
    return alignment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _nearest_idx(arr: np.ndarray, value: float) -> int:
    """Return the index of the element in *arr* closest to *value*."""
    return int(np.argmin(np.abs(arr - value)))


def _first_sustained_voicing(pitch: np.ndarray, min_consecutive: int = 5) -> int:
    """Return index of the first run of N consecutive voiced frames.

    A frame is "voiced" if its pitch value is > 0 and not NaN.
    Returns 0 if no such run is found (conservative fallback).
    """
    voiced = (~np.isnan(pitch)) & (pitch > 0)
    run_start = 0
    run_len = 0
    for i, v in enumerate(voiced):
        if v:
            if run_len == 0:
                run_start = i
            run_len += 1
            if run_len >= min_consecutive:
                return run_start
        else:
            run_len = 0
    return 0


def _detect_singing_onset(
    user_pitch: np.ndarray,
    user_times: np.ndarray,
    ref_pitch: np.ndarray,
    ref_times: np.ndarray,
    frame_dur: float = 0.02,
    window_s: float = 1.0,
    max_search_s: float = 5.0,
    voicing_thresh: float = 0.30,
    stability_thresh_cents: float = 200.0,
    pitch_match_cents: float = 500.0,
) -> float:
    """Detect where real singing begins by sliding a window over the start.

    Returns the timestamp (seconds) of the first window that passes:
      1. Voicing ratio >= voicing_thresh
      2. Pitch stability (std dev < stability_thresh_cents)
      3. Pitch range match with reference (octave-folded, within pitch_match_cents)

    Returns 0.0 if the first window already passes or no good window is found.
    """
    if len(user_pitch) == 0 or len(ref_pitch) == 0 or len(user_times) == 0:
        return 0.0

    # Cap search to actual recording length
    max_search_s = min(max_search_s, float(user_times[-1]))

    window_frames = max(1, int(window_s / frame_dur))
    max_search_frames = min(len(user_pitch), int(max_search_s / frame_dur))

    # Find the reference's first voiced region median pitch (first 5s)
    ref_first_5s_idx = next(
        (i for i, t in enumerate(ref_times) if t > 5.0),
        len(ref_times),
    )
    ref_first_voiced = ref_pitch[:ref_first_5s_idx]
    ref_first_voiced = ref_first_voiced[
        (~np.isnan(ref_first_voiced)) & (ref_first_voiced > 0)
    ]
    if len(ref_first_voiced) == 0:
        # No voiced frames in reference — can't do pitch matching
        return 0.0
    ref_median_hz = float(np.median(ref_first_voiced))

    step = max(1, window_frames // 4)  # 25% overlap
    for start in range(0, max_search_frames, step):
        end = min(start + window_frames, len(user_pitch))
        window = user_pitch[start:end]

        if len(window) == 0:
            continue

        voiced = window[(~np.isnan(window)) & (window > 0)]

        # Check 1: enough voicing
        voicing_ratio = len(voiced) / len(window)
        if voicing_ratio < voicing_thresh:
            continue

        # Check 2: pitch stability (std dev in cents)
        if len(voiced) < 3:
            continue
        median_hz = float(np.median(voiced))
        if median_hz <= 0:
            continue
        cents_from_median = 1200.0 * np.log2(voiced / median_hz)
        stability = float(np.std(cents_from_median))
        if stability > stability_thresh_cents:
            continue

        # Check 3: pitch range match (octave-folded)
        cents_diff = 1200.0 * np.log2(median_hz / ref_median_hz)
        cents_diff_folded = abs(((cents_diff + 600) % 1200) - 600)
        if cents_diff_folded > pitch_match_cents:
            continue

        # All checks passed — this is singing onset
        onset_time = float(user_times[start]) if start < len(user_times) else 0.0
        return onset_time

    # No good window found — don't trim (conservative)
    return 0.0


def _build_dtw_features(
    pitch: np.ndarray,
    rms_interp: np.ndarray,
    weights: tuple = (1.0, 0.5, 0.3),
) -> np.ndarray:
    """Build weighted 3D feature vectors for DTW: [log_pitch, voicing, rms].

    Normalises each dimension to [0, 1] before applying weights so that
    the euclidean distance respects the intended importance ratios.
    """
    voiced = (~np.isnan(pitch)) & (pitch > 0)

    # Log pitch normalised to [0, 1] using human singing range (50–2000 Hz)
    log_min, log_max = np.log2(50.0), np.log2(2000.0)
    log_p = np.where(voiced, np.log2(np.maximum(pitch, 50.0)), 0.0)
    log_p_norm = np.where(voiced, (log_p - log_min) / (log_max - log_min), 0.0)
    log_p_norm = np.clip(log_p_norm, 0.0, 1.0)

    voicing = voiced.astype(float)

    # RMS is already [0, 1] from extract_features normalisation
    rms = np.clip(rms_interp, 0.0, 1.0)

    return np.column_stack([
        log_p_norm * weights[0],
        voicing * weights[1],
        rms * weights[2],
    ])


def _check_path_sanity(
    path: list,
    user_times: np.ndarray,
    ref_times: np.ndarray,
    sample_interval_s: float = 1.0,
    slope_warn_lo: float = 0.5,
    slope_warn_hi: float = 2.0,
) -> dict:
    """Sample the DTW warping path and check for drift.

    Returns dict with:
        - is_sane: bool — True if no drift regions detected
        - drift_regions: list of {user_time, ref_time, slope}
        - avg_slope: float
    """
    if len(path) < 2:
        return {"is_sane": True, "drift_regions": [], "avg_slope": 1.0}

    # Sample path at ~1s intervals (in user time)
    samples = []
    last_user_time = -999.0
    for u_idx, r_idx in path:
        u_t = float(user_times[u_idx]) if u_idx < len(user_times) else 0.0
        r_t = float(ref_times[r_idx]) if r_idx < len(ref_times) else 0.0
        if u_t - last_user_time >= sample_interval_s:
            samples.append((u_t, r_t))
            last_user_time = u_t

    if len(samples) < 2:
        return {"is_sane": True, "drift_regions": [], "avg_slope": 1.0}

    slopes = []
    drift_regions = []
    for i in range(1, len(samples)):
        du = samples[i][0] - samples[i - 1][0]
        dr = samples[i][1] - samples[i - 1][1]
        if abs(dr) < 1e-6:
            slope = float("inf")
        else:
            slope = du / dr
        slopes.append(slope)

        if slope < slope_warn_lo or slope > slope_warn_hi:
            drift_regions.append({
                "user_time": round(samples[i][0], 2),
                "ref_time": round(samples[i][1], 2),
                "slope": round(slope, 3),
            })

    finite_slopes = [s for s in slopes if np.isfinite(s)]
    avg_slope = float(np.mean(finite_slopes)) if finite_slopes else 1.0

    return {
        "is_sane": len(drift_regions) == 0,
        "drift_regions": drift_regions,
        "avg_slope": round(avg_slope, 3),
    }


def features_to_json(features: dict) -> str:
    """Serialise features dict to a compact JSON string."""
    return json.dumps(features, separators=(",", ":"))


def features_from_json(json_str: str) -> dict:
    """Deserialise features dict from JSON string."""
    return json.loads(json_str)
