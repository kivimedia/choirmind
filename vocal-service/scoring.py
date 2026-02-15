"""
Scoring engine for vocal practice recordings.

Compares user features against reference features using DTW alignment
and produces scores across three dimensions:
  - Pitch accuracy  (50% weight)
  - Timing accuracy (30% weight)
  - Dynamics match  (20% weight)
"""

import logging
import math
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Note name helpers
# ---------------------------------------------------------------------------

_NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']


def _hz_to_note(freq_hz: float) -> Optional[str]:
    """Convert a frequency in Hz to the nearest musical note name (e.g. 'A4', 'F#3')."""
    if freq_hz is None or freq_hz <= 0 or math.isnan(freq_hz):
        return None
    semitones = 12 * math.log2(freq_hz / 440.0)
    midi = round(semitones) + 69
    return f"{_NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def _hz_to_midi(freq_hz: float) -> Optional[int]:
    """Convert Hz to MIDI note number."""
    if freq_hz is None or freq_hz <= 0 or math.isnan(freq_hz):
        return None
    return round(12 * math.log2(freq_hz / 440.0)) + 69


def _note_class(note_str: Optional[str]) -> Optional[str]:
    """Extract pitch class from note string, e.g. 'A3' -> 'A', 'F#4' -> 'F#'."""
    if not note_str:
        return None
    i = len(note_str)
    while i > 0 and (note_str[i - 1].isdigit() or note_str[i - 1] == '-'):
        i -= 1
    return note_str[:i] if i > 0 else None


def _octave_num(note_str: Optional[str]) -> Optional[int]:
    """Extract octave number from note string, e.g. 'A3' -> 3, 'F#4' -> 4."""
    if not note_str:
        return None
    i = len(note_str)
    while i > 0 and (note_str[i - 1].isdigit() or note_str[i - 1] == '-'):
        i -= 1
    try:
        return int(note_str[i:])
    except (ValueError, IndexError):
        return None


def _median_note(pitch_values: list, pitch_times: list, t_start: float, t_end: float) -> Optional[str]:
    """Get the dominant note in a time window from pitch arrays."""
    freqs = []
    for freq, t in zip(pitch_values, pitch_times):
        if t < t_start or t >= t_end:
            continue
        if freq is not None and not math.isnan(freq) and freq > 0:
            freqs.append(freq)
    if not freqs:
        return None
    return _hz_to_note(float(np.median(freqs)))


# ---------------------------------------------------------------------------
# Note extraction & alignment (note-by-note comparison)
# ---------------------------------------------------------------------------

def _extract_notes(
    pitch_values: list,
    pitch_times: list,
    onset_times: list | None = None,
    rms_values: list | None = None,
    rms_times: list | None = None,
    min_duration_s: float = 0.12,
    cents_threshold: float = 100.0,
    max_time_s: float | None = None,
) -> list[dict]:
    """Extract individual note events from a pitch contour.

    Groups consecutive voiced frames into notes, splitting when:
    1. Pitch changes by more than *cents_threshold* (~semitone)
    2. A librosa onset is detected (catches repeated same-pitch notes)
    3. An energy dip is detected (RMS drops then rises — note re-attack)
    Filters out notes shorter than *min_duration_s*.
    """
    notes: list[dict] = []
    current_freqs: list[float] = []
    current_start: float | None = None

    # Pre-build a set of frame indices that coincide with detected onsets.
    # This lets us split repeated same-pitch notes (e.g. Do4 Do4) that
    # have no silence gap but DO have distinct attacks.
    onset_frames: set[int] = set()
    if onset_times and pitch_times:
        pt_arr = np.array(pitch_times)
        for ot in onset_times:
            idx = int(np.argmin(np.abs(pt_arr - ot)))
            # Widen tolerance to 50ms (pitch step is 20ms)
            if abs(pitch_times[idx] - ot) < 0.05:
                onset_frames.add(idx)

    # Pre-build energy-dip detector: find pitch-frame indices where RMS
    # dips then rises (indicating a note re-attack even when pitch is constant).
    energy_dip_frames: set[int] = set()
    if rms_values and rms_times and pitch_times:
        rms_arr = np.array(rms_values)
        rms_t_arr = np.array(rms_times)
        pt_arr = np.array(pitch_times)
        # Find local minima in RMS (frames where energy drops >30% from neighbors)
        for ri in range(1, len(rms_arr) - 1):
            prev_e = rms_arr[ri - 1]
            cur_e = rms_arr[ri]
            next_e = rms_arr[ri + 1]
            if prev_e > 0 and cur_e < prev_e * 0.7 and next_e > cur_e * 1.3:
                # Map this RMS dip time to the nearest pitch frame
                dip_time = rms_t_arr[ri]
                pidx = int(np.argmin(np.abs(pt_arr - dip_time)))
                if abs(pitch_times[pidx] - dip_time) < 0.05:
                    energy_dip_frames.add(pidx)

    for frame_idx, (freq, t) in enumerate(zip(pitch_values, pitch_times)):
        if max_time_s is not None and t > max_time_s:
            break

        is_voiced = freq is not None and not math.isnan(freq) and freq > 0

        if not is_voiced:
            # End current note if any
            if current_freqs and current_start is not None:
                dur = t - current_start
                if dur >= min_duration_s:
                    median_hz = float(np.median(current_freqs))
                    notes.append({
                        "startTime": round(current_start, 3),
                        "endTime": round(t, 3),
                        "note": _hz_to_note(median_hz),
                        "hz": round(median_hz, 1),
                    })
                current_freqs = []
                current_start = None
            continue

        if current_start is None:
            # Start new note
            current_start = t
            current_freqs = [freq]
        else:
            # Check for onset-based or energy-dip split
            note_dur = t - current_start
            has_onset = frame_idx in onset_frames and note_dur >= min_duration_s
            has_energy_dip = frame_idx in energy_dip_frames and note_dur >= min_duration_s

            # Check if pitch changed significantly
            median_hz = np.median(current_freqs)
            if median_hz > 0:
                cents_diff = abs(1200 * math.log2(freq / median_hz))
            else:
                cents_diff = 0

            if cents_diff > cents_threshold or has_onset or has_energy_dip:
                # End current note, start new one
                dur = t - current_start
                if dur >= min_duration_s:
                    notes.append({
                        "startTime": round(current_start, 3),
                        "endTime": round(t, 3),
                        "note": _hz_to_note(float(np.median(current_freqs))),
                        "hz": round(float(np.median(current_freqs)), 1),
                    })
                current_start = t
                current_freqs = [freq]
            else:
                current_freqs.append(freq)

    # End last note
    if current_freqs and current_start is not None:
        last_t = pitch_times[-1] if pitch_times else current_start
        dur = last_t - current_start
        if dur >= min_duration_s:
            median_hz = float(np.median(current_freqs))
            notes.append({
                "startTime": round(current_start, 3),
                "endTime": round(last_t, 3),
                "note": _hz_to_note(median_hz),
                "hz": round(median_hz, 1),
            })

    return notes


def _cents_between(hz_a: float, hz_b: float) -> float:
    """Absolute cents distance between two frequencies."""
    if hz_a <= 0 or hz_b <= 0:
        return 9999.0
    return abs(1200.0 * math.log2(hz_a / hz_b))


# Match thresholds for note comparison (generous for amateur singers):
# - Within 100 cents (1 semitone): "noteMatch" (green) — you hit the right note
# - Within 150 cents but same pitch class: "pitchClassMatch" (yellow) — right note, wrong octave
# - Beyond that: wrong note (red)
_NOTE_MATCH_CENTS = 100.0


def _align_notes(
    ref_notes: list[dict],
    user_notes: list[dict],
    tolerance_s: float = 2.0,
) -> list[dict]:
    """Align reference notes to user notes sequentially.

    For each reference note, find the best matching user note within
    a timing tolerance window.  Returns a list of aligned pairs.

    Matching is Hz-based (within 100 cents = 1 semitone) rather than
    exact note-name comparison, so a singer who is 50 cents flat still
    gets credit for hitting the right note.
    """
    aligned: list[dict] = []
    u_start = 0

    for r_idx, ref in enumerate(ref_notes):
        best_match: int | None = None
        best_time_diff = float("inf")

        # Search ahead in user notes for a match
        for j in range(u_start, min(u_start + 8, len(user_notes))):
            time_diff = abs(user_notes[j]["startTime"] - ref["startTime"])
            if time_diff <= tolerance_s and time_diff < best_time_diff:
                best_match = j
                best_time_diff = time_diff

        ref_class = _note_class(ref["note"])
        ref_oct = _octave_num(ref["note"])

        if best_match is not None:
            user = user_notes[best_match]
            user_class = _note_class(user["note"])
            user_oct = _octave_num(user["note"])

            # Hz-based matching: compare actual frequencies, not note names
            cents_off = _cents_between(ref.get("hz", 0), user.get("hz", 0))
            note_match = cents_off <= _NOTE_MATCH_CENTS

            # Pitch class match: same note name regardless of octave
            pitch_class_match = (ref_class == user_class) if ref_class and user_class else None

            # If Hz match but note names differ (edge case at semitone boundary),
            # still count as pitch class match
            if note_match and not pitch_class_match:
                pitch_class_match = True

            octave_diff = (user_oct - ref_oct) if user_oct is not None and ref_oct is not None else None

            aligned.append({
                "noteIndex": r_idx,
                "refNote": ref["note"],
                "refStartTime": ref["startTime"],
                "refEndTime": ref["endTime"],
                "userNote": user["note"],
                "userStartTime": user["startTime"],
                "userEndTime": user["endTime"],
                "noteMatch": note_match,
                "pitchClassMatch": pitch_class_match,
                "octaveDiff": octave_diff,
                "centsOff": round(cents_off, 1),
                "timingOffsetMs": round((user["startTime"] - ref["startTime"]) * 1000),
            })
            u_start = best_match + 1
        else:
            aligned.append({
                "noteIndex": r_idx,
                "refNote": ref["note"],
                "refStartTime": ref["startTime"],
                "refEndTime": ref["endTime"],
                "userNote": None,
                "userStartTime": None,
                "userEndTime": None,
                "noteMatch": False,
                "pitchClassMatch": None,
                "octaveDiff": None,
                "centsOff": None,
                "timingOffsetMs": None,
            })

    return aligned


# ---------------------------------------------------------------------------
# Thresholds and weights
# ---------------------------------------------------------------------------

WEIGHT_PITCH = 0.70
WEIGHT_TIMING = 0.15
WEIGHT_DYNAMICS = 0.15

# Pitch: up to 100 cents (~semitone) = 100 score; > 400 cents = 0
# Relaxed for amateur choir singers — singing the right note is what
# matters most, not perfect intonation.
PITCH_PERFECT_CENTS = 100.0
PITCH_ZERO_CENTS = 400.0

# Timing: up to 500 ms offset = 100 score; > 2s = 0
# Very relaxed — DTW alignment has inherent jitter and amateur singers
# are often late/early by hundreds of milliseconds.
TIMING_PERFECT_S = 0.500
TIMING_ZERO_S = 2.000

# Dynamics: ratio 0.5-2.0 = perfect; outside 0.2-3.0 = 0
# Very relaxed — microphone distance and gain vary wildly.
DYNAMICS_PERFECT_LOW = 0.5
DYNAMICS_PERFECT_HIGH = 2.0
DYNAMICS_ZERO_LOW = 0.2
DYNAMICS_ZERO_HIGH = 3.0

# Section granularity: 1 section per second of recording
SECTION_DURATION_S = 1.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def score_recording(
    user_features: dict,
    ref_features: dict,
    alignment: dict,
) -> dict:
    """Score a user recording against a reference.

    Returns:
        dict with overallScore, pitchScore, timingScore, dynamicsScore,
        sectionScores, and problemAreas (up to 3).
    """
    pitch_score = _score_pitch(alignment)
    timing_score = _score_timing(alignment)
    dynamics_score = _score_dynamics(alignment)

    overall = (
        pitch_score * WEIGHT_PITCH
        + timing_score * WEIGHT_TIMING
        + dynamics_score * WEIGHT_DYNAMICS
    )

    section_scores = _compute_section_scores(alignment, user_features, ref_features)
    problem_areas = _identify_problem_areas(alignment, user_features, ref_features)

    # Note-by-note comparison
    note_comparison: list[dict] = []
    if ref_features:
        user_dur = user_features.get("duration_s", 0)
        max_ref_t = user_dur * 1.2 + 5.0

        ref_notes = _extract_notes(
            ref_features.get("pitch_values", []),
            ref_features.get("pitch_times", []),
            onset_times=ref_features.get("onset_times"),
            rms_values=ref_features.get("rms_values"),
            rms_times=ref_features.get("rms_times"),
            max_time_s=max_ref_t,
        )
        user_notes = _extract_notes(
            user_features.get("pitch_values", []),
            user_features.get("pitch_times", []),
            onset_times=user_features.get("onset_times"),
            rms_values=user_features.get("rms_values"),
            rms_times=user_features.get("rms_times"),
        )
        note_comparison = _align_notes(ref_notes, user_notes)
        logger.info(
            "Note comparison: %d ref notes, %d user notes, %d aligned pairs",
            len(ref_notes), len(user_notes), len(note_comparison),
        )

    result = {
        "overallScore": round(overall, 1),
        "pitchScore": round(pitch_score, 1),
        "timingScore": round(timing_score, 1),
        "dynamicsScore": round(dynamics_score, 1),
        "sectionScores": section_scores,
        "problemAreas": problem_areas[:3],
        "noteComparison": note_comparison,
    }
    logger.info(
        "Scored recording: overall=%.1f  pitch=%.1f  timing=%.1f  dynamics=%.1f",
        result["overallScore"],
        result["pitchScore"],
        result["timingScore"],
        result["dynamicsScore"],
    )
    return result


# ---------------------------------------------------------------------------
# Sub-scorers
# ---------------------------------------------------------------------------

def _score_pitch(alignment: dict) -> float:
    """Score pitch accuracy as 0-100 based on cent deviations."""
    deviations = alignment["pitch_deviations"]
    scores = []
    for dev in deviations:
        if dev is None:
            # Unvoiced frame -- skip
            continue
        abs_dev = abs(dev)
        if abs_dev <= PITCH_PERFECT_CENTS:
            scores.append(100.0)
        elif abs_dev >= PITCH_ZERO_CENTS:
            scores.append(0.0)
        else:
            # Linear interpolation between perfect and zero
            ratio = (abs_dev - PITCH_PERFECT_CENTS) / (PITCH_ZERO_CENTS - PITCH_PERFECT_CENTS)
            scores.append(100.0 * (1.0 - ratio))
    return float(np.mean(scores)) if scores else 50.0


def _score_timing(alignment: dict) -> float:
    """Score timing accuracy as 0-100 based on time offsets."""
    offsets = alignment["timing_offsets"]
    scores = []
    for off in offsets:
        abs_off = abs(off)
        if abs_off <= TIMING_PERFECT_S:
            scores.append(100.0)
        elif abs_off >= TIMING_ZERO_S:
            scores.append(0.0)
        else:
            ratio = (abs_off - TIMING_PERFECT_S) / (TIMING_ZERO_S - TIMING_PERFECT_S)
            scores.append(100.0 * (1.0 - ratio))
    return float(np.mean(scores)) if scores else 50.0


def _score_dynamics(alignment: dict) -> float:
    """Score dynamics match as 0-100 based on energy ratios."""
    ratios = alignment["energy_ratios"]
    scores = []
    for ratio in ratios:
        if ratio is None:
            continue
        if DYNAMICS_PERFECT_LOW <= ratio <= DYNAMICS_PERFECT_HIGH:
            scores.append(100.0)
        elif ratio < DYNAMICS_ZERO_LOW or ratio > DYNAMICS_ZERO_HIGH:
            scores.append(0.0)
        elif ratio < DYNAMICS_PERFECT_LOW:
            # Too quiet
            frac = (ratio - DYNAMICS_ZERO_LOW) / (DYNAMICS_PERFECT_LOW - DYNAMICS_ZERO_LOW)
            scores.append(100.0 * frac)
        else:
            # Too loud
            frac = (DYNAMICS_ZERO_HIGH - ratio) / (DYNAMICS_ZERO_HIGH - DYNAMICS_PERFECT_HIGH)
            scores.append(100.0 * frac)
    return float(np.mean(scores)) if scores else 50.0


# ---------------------------------------------------------------------------
# Section scores
# ---------------------------------------------------------------------------

def _compute_section_scores(alignment: dict, user_features: dict, ref_features: dict | None = None) -> list[dict]:
    """Split the user recording timeline into 1-second segments
    and compute sub-scores for each."""
    user_times = user_features.get("pitch_times", [])
    if not user_times:
        return []

    user_pitch_vals = user_features.get("pitch_values", [])
    ref_pitch_vals = ref_features.get("pitch_values", []) if ref_features else []
    ref_pitch_times = ref_features.get("pitch_times", []) if ref_features else []

    duration = user_times[-1]
    num_sections = max(1, round(duration / SECTION_DURATION_S))
    section_dur = duration / num_sections
    path = alignment["path"]

    sections = []
    for sec_idx in range(num_sections):
        t_start = sec_idx * section_dur
        t_end = (sec_idx + 1) * section_dur

        # Gather indices for pairs that fall within this section
        sec_pitch_devs = []
        sec_timing_offs = []
        sec_energy_rats = []

        for pair_idx, (u_idx, r_idx) in enumerate(path):
            if u_idx >= len(user_times):
                continue
            t = user_times[u_idx]
            if t < t_start or t >= t_end:
                continue

            dev = alignment["pitch_deviations"][pair_idx]
            if dev is not None:
                sec_pitch_devs.append(dev)

            sec_timing_offs.append(alignment["timing_offsets"][pair_idx])

            er = alignment["energy_ratios"][pair_idx]
            if er is not None:
                sec_energy_rats.append(er)

        # Build a mini-alignment for section scoring
        sec_alignment = {
            "pitch_deviations": sec_pitch_devs,
            "timing_offsets": sec_timing_offs,
            "energy_ratios": sec_energy_rats,
        }

        # Compute notes for this second
        user_note = _median_note(user_pitch_vals, user_times, t_start, t_end)
        ref_note = _median_note(ref_pitch_vals, ref_pitch_times, t_start, t_end)

        # If no voiced pitch data in this second, mark as quiet
        has_voiced = len(sec_pitch_devs) > 0

        if has_voiced:
            p = _score_pitch(sec_alignment)
            t = _score_timing(sec_alignment) if sec_timing_offs else 0.0
            d = _score_dynamics(sec_alignment)
            overall = p * WEIGHT_PITCH + t * WEIGHT_TIMING + d * WEIGHT_DYNAMICS
        else:
            p = None
            t = None
            d = None
            overall = None

        # Octave-aware note comparison
        note_match = (ref_note == user_note) if ref_note and user_note else None
        pitch_class_match = None
        octave_diff = None
        if ref_note and user_note:
            ref_cls = _note_class(ref_note)
            user_cls = _note_class(user_note)
            pitch_class_match = (ref_cls == user_cls)
            r_oct = _octave_num(ref_note)
            u_oct = _octave_num(user_note)
            if r_oct is not None and u_oct is not None:
                octave_diff = u_oct - r_oct

        sections.append({
            "sectionIndex": sec_idx,
            "startTime": round(t_start, 2),
            "endTime": round(t_end, 2),
            "overallScore": round(overall, 1) if overall is not None else None,
            "pitchScore": round(p, 1) if p is not None else None,
            "timingScore": round(t, 1) if t is not None else None,
            "dynamicsScore": round(d, 1) if d is not None else None,
            "refNote": ref_note,
            "userNote": user_note,
            "noteMatch": note_match,
            "pitchClassMatch": pitch_class_match,
            "octaveDiff": octave_diff,
        })

    return sections


# ---------------------------------------------------------------------------
# Problem area detection
# ---------------------------------------------------------------------------

def _identify_problem_areas(
    alignment: dict,
    user_features: dict,
    ref_features: dict | None = None,
    window_s: float = 2.0,
) -> list[dict]:
    """Identify up to 3 worst time windows in the recording.

    Slides a *window_s*-second window across the user recording timeline
    and finds the windows with the lowest combined scores.
    Also maps each window to the corresponding reference vocal timestamps
    so the frontend can play both clips side by side.
    """
    user_times = user_features.get("pitch_times", [])
    if not user_times:
        return []

    ref_times = ref_features.get("pitch_times", []) if ref_features else []
    duration = user_times[-1]
    step = window_s / 2  # 50 % overlap
    path = alignment["path"]

    windows: list[dict] = []
    t = 0.0
    while t + window_s <= duration + 0.01:
        t_start = t
        t_end = t + window_s

        w_pitch = []
        w_timing = []
        w_dynamics = []
        w_ref_times = []  # corresponding reference timestamps

        for pair_idx, (u_idx, r_idx) in enumerate(path):
            if u_idx >= len(user_times):
                continue
            ut = user_times[u_idx]
            if ut < t_start or ut >= t_end:
                continue

            dev = alignment["pitch_deviations"][pair_idx]
            if dev is not None:
                w_pitch.append(abs(dev))
            w_timing.append(abs(alignment["timing_offsets"][pair_idx]))
            er = alignment["energy_ratios"][pair_idx]
            if er is not None:
                w_dynamics.append(er)

            # Track the reference time for this aligned pair
            if r_idx < len(ref_times):
                w_ref_times.append(ref_times[r_idx])

        if w_pitch:
            avg_dev = float(np.mean(w_pitch))
            avg_off = float(np.mean(w_timing))
            avg_ratio = float(np.mean(w_dynamics)) if w_dynamics else 1.0

            # Determine dominant issue
            issues = []
            if avg_dev > PITCH_PERFECT_CENTS * 1.5:
                issues.append("pitch")
            if avg_off > TIMING_PERFECT_S * 3:
                issues.append("timing")
            if avg_ratio < DYNAMICS_PERFECT_LOW * 0.7 or avg_ratio > DYNAMICS_PERFECT_HIGH * 1.5:
                issues.append("dynamics")

            if issues:
                # Combined badness metric (higher = worse)
                badness = (
                    avg_dev / PITCH_ZERO_CENTS * WEIGHT_PITCH
                    + avg_off / TIMING_ZERO_S * WEIGHT_TIMING
                    + abs(1.0 - avg_ratio) * WEIGHT_DYNAMICS
                )
                entry = {
                    "startTime": round(t_start, 2),
                    "endTime": round(t_end, 2),
                    "issues": issues,
                    "avgPitchDevCents": round(avg_dev, 1),
                    "avgTimingOffsetMs": round(avg_off * 1000, 1),
                    "avgEnergyRatio": round(avg_ratio, 3),
                    "badness": badness,
                }
                # Add corresponding reference timestamps for playback
                if w_ref_times:
                    entry["refStartTime"] = round(min(w_ref_times), 2)
                    entry["refEndTime"] = round(max(w_ref_times), 2)
                windows.append(entry)

        t += step

    # Sort by badness descending
    windows.sort(key=lambda w: w["badness"], reverse=True)

    # Deduplicate overlapping windows (keep worst)
    selected: list[dict] = []
    for w in windows:
        if len(selected) >= 3:
            break
        overlap = any(
            w["startTime"] < s["endTime"] and w["endTime"] > s["startTime"]
            for s in selected
        )
        if not overlap:
            # Remove internal badness key before returning
            entry = {k: v for k, v in w.items() if k != "badness"}
            selected.append(entry)

    return selected


# ---------------------------------------------------------------------------
# Standalone scoring (no reference)
# ---------------------------------------------------------------------------


def score_standalone(user_features: dict) -> dict:
    """Score a recording without a reference (self-analysis).

    Evaluates:
    - Pitch: stability/consistency of F0 (low variance = good)
    - Timing: regularity of onsets
    - Dynamics: energy range utilization
    """
    pitch_values = np.array(user_features["pitch_values"])
    # Filter out NaN (unvoiced)
    voiced = pitch_values[~np.isnan(pitch_values)]

    # Pitch stability: coefficient of variation (lower = more stable = better)
    if len(voiced) > 10:
        # Convert to cents relative to median
        median_f0 = np.median(voiced)
        cents_from_median = 1200.0 * np.log2(voiced / median_f0)
        pitch_std_cents = float(np.std(cents_from_median))
        # Score: std of 80 cents or less = 100, std of 250+ = 30
        if pitch_std_cents <= 80:
            pitch_score = 100.0
        elif pitch_std_cents >= 250:
            pitch_score = 30.0
        else:
            pitch_score = 100.0 - (pitch_std_cents - 80) / (250 - 80) * 70.0
        # Bonus for good voicing ratio
        voicing_ratio = len(voiced) / len(pitch_values) if len(pitch_values) > 0 else 0
        pitch_score = pitch_score * (0.7 + 0.3 * voicing_ratio)
    else:
        pitch_score = 30.0

    # Timing: onset regularity
    onset_times = np.array(user_features["onset_times"])
    if len(onset_times) > 3:
        intervals = np.diff(onset_times)
        cv = float(np.std(intervals) / np.mean(intervals)) if np.mean(intervals) > 0 else 1.0
        # CV of 0 = perfect regularity = 100, CV of 1+ = 0
        timing_score = max(0.0, min(100.0, 100.0 * (1.0 - cv)))
        # Adjust: some irregularity is natural in music
        timing_score = min(100.0, timing_score * 1.3)
    else:
        timing_score = 50.0

    # Dynamics: energy range and variation
    rms_values = np.array(user_features["rms_values"])
    if len(rms_values) > 10:
        rms_cv = float(np.std(rms_values) / np.mean(rms_values)) if np.mean(rms_values) > 0 else 0
        # Good dynamics = some variation (not flat, not chaotic)
        if 0.15 <= rms_cv <= 0.6:
            dynamics_score = 90.0
        elif rms_cv < 0.15:
            dynamics_score = 50.0 + rms_cv / 0.15 * 40
        else:
            dynamics_score = max(20.0, 90.0 - (rms_cv - 0.6) / 0.4 * 70.0)
    else:
        dynamics_score = 50.0

    overall = pitch_score * WEIGHT_PITCH + timing_score * WEIGHT_TIMING + dynamics_score * WEIGHT_DYNAMICS

    # Generate section scores
    duration = user_features.get("duration_s", 0)
    section_scores: list[dict] = []
    if duration > 0:
        num_sections = max(1, round(duration / SECTION_DURATION_S))
        section_dur = duration / num_sections
        rms_times = np.array(user_features["rms_times"])
        pitch_times = np.array(user_features["pitch_times"])

        for sec_idx in range(num_sections):
            t_start = sec_idx * section_dur
            t_end = (sec_idx + 1) * section_dur

            # Section pitch
            sec_mask = (pitch_times >= t_start) & (pitch_times < t_end)
            sec_pitched = pitch_values[sec_mask]
            sec_voiced = sec_pitched[~np.isnan(sec_pitched)]
            if len(sec_voiced) > 5:
                sec_median_f0 = np.median(sec_voiced)
                sec_cents = 1200.0 * np.log2(sec_voiced / sec_median_f0)
                sec_std = float(np.std(sec_cents))
                if sec_std <= 80:
                    sec_p = 100.0
                elif sec_std >= 250:
                    sec_p = 30.0
                else:
                    sec_p = 100.0 - (sec_std - 80) / (250 - 80) * 70.0
            else:
                sec_p = 50.0

            # Section timing (onset regularity in this section)
            sec_onsets = onset_times[(onset_times >= t_start) & (onset_times < t_end)]
            if len(sec_onsets) > 2:
                sec_intervals = np.diff(sec_onsets)
                sec_cv = float(np.std(sec_intervals) / np.mean(sec_intervals)) if np.mean(sec_intervals) > 0 else 1.0
                sec_t = max(0.0, min(100.0, 100.0 * (1.0 - sec_cv) * 1.3))
            else:
                sec_t = 50.0

            # Section dynamics
            sec_rms_mask = (rms_times >= t_start) & (rms_times < t_end)
            sec_rms = rms_values[sec_rms_mask]
            if len(sec_rms) > 3:
                sec_rms_cv = float(np.std(sec_rms) / np.mean(sec_rms)) if np.mean(sec_rms) > 0 else 0
                if 0.15 <= sec_rms_cv <= 0.6:
                    sec_d = 90.0
                elif sec_rms_cv < 0.15:
                    sec_d = 50.0 + sec_rms_cv / 0.15 * 40
                else:
                    sec_d = max(20.0, 90.0 - (sec_rms_cv - 0.6) / 0.4 * 70.0)
            else:
                sec_d = 50.0

            sec_overall = sec_p * WEIGHT_PITCH + sec_t * WEIGHT_TIMING + sec_d * WEIGHT_DYNAMICS
            section_scores.append({
                "sectionIndex": sec_idx,
                "startTime": round(t_start, 2),
                "endTime": round(t_end, 2),
                "overallScore": round(sec_overall, 1),
                "pitchScore": round(sec_p, 1),
                "timingScore": round(sec_t, 1),
                "dynamicsScore": round(sec_d, 1),
            })

    # Problem areas: find sections with worst scores
    problem_areas: list[dict] = []
    for sec in sorted(section_scores, key=lambda s: s["overallScore"]):
        if sec["overallScore"] < 70 and len(problem_areas) < 3:
            issues: list[str] = []
            if sec["pitchScore"] < 60:
                issues.append("pitch")
            if sec["timingScore"] < 60:
                issues.append("timing")
            if sec["dynamicsScore"] < 60:
                issues.append("dynamics")
            if issues:
                problem_areas.append({
                    "startTime": sec["startTime"],
                    "endTime": sec["endTime"],
                    "issues": issues,
                    "avgPitchDevCents": round(100 - sec["pitchScore"], 1),
                    "avgTimingOffsetMs": round((100 - sec["timingScore"]) * 2, 1),
                    "avgEnergyRatio": 1.0,
                })

    result = {
        "overallScore": round(overall, 1),
        "pitchScore": round(pitch_score, 1),
        "timingScore": round(timing_score, 1),
        "dynamicsScore": round(dynamics_score, 1),
        "sectionScores": section_scores,
        "problemAreas": problem_areas,
    }
    logger.info(
        "Standalone scoring: overall=%.1f pitch=%.1f timing=%.1f dynamics=%.1f",
        result["overallScore"],
        result["pitchScore"],
        result["timingScore"],
        result["dynamicsScore"],
    )
    return result
