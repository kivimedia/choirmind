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
# Thresholds and weights
# ---------------------------------------------------------------------------

WEIGHT_PITCH = 0.50
WEIGHT_TIMING = 0.30
WEIGHT_DYNAMICS = 0.20

# Pitch: up to 50 cents deviation = 100 score; > 200 cents = 0
PITCH_PERFECT_CENTS = 50.0
PITCH_ZERO_CENTS = 200.0

# Timing: up to 30 ms offset = 100 score; > 200 ms = 0
TIMING_PERFECT_S = 0.030
TIMING_ZERO_S = 0.200

# Dynamics: ratio 0.8-1.2 = perfect; outside 0.3-2.5 = 0
DYNAMICS_PERFECT_LOW = 0.8
DYNAMICS_PERFECT_HIGH = 1.2
DYNAMICS_ZERO_LOW = 0.3
DYNAMICS_ZERO_HIGH = 2.5

# Number of equal-length sections to compute section scores
NUM_SECTIONS = 4


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

    section_scores = _compute_section_scores(alignment, user_features)
    problem_areas = _identify_problem_areas(alignment, user_features, ref_features)

    result = {
        "overallScore": round(overall, 1),
        "pitchScore": round(pitch_score, 1),
        "timingScore": round(timing_score, 1),
        "dynamicsScore": round(dynamics_score, 1),
        "sectionScores": section_scores,
        "problemAreas": problem_areas[:3],
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

def _compute_section_scores(alignment: dict, user_features: dict) -> list[dict]:
    """Split the user recording timeline into NUM_SECTIONS equal segments
    and compute sub-scores for each."""
    user_times = user_features.get("pitch_times", [])
    if not user_times:
        return []

    duration = user_times[-1]
    section_dur = duration / NUM_SECTIONS
    path = alignment["path"]

    sections = []
    for sec_idx in range(NUM_SECTIONS):
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

        p = _score_pitch(sec_alignment)
        t = _score_timing(sec_alignment)
        d = _score_dynamics(sec_alignment)
        overall = p * WEIGHT_PITCH + t * WEIGHT_TIMING + d * WEIGHT_DYNAMICS

        sections.append({
            "sectionIndex": sec_idx,
            "startTime": round(t_start, 2),
            "endTime": round(t_end, 2),
            "overallScore": round(overall, 1),
            "pitchScore": round(p, 1),
            "timingScore": round(t, 1),
            "dynamicsScore": round(d, 1),
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
        section_dur = duration / NUM_SECTIONS
        rms_times = np.array(user_features["rms_times"])
        pitch_times = np.array(user_features["pitch_times"])

        for sec_idx in range(NUM_SECTIONS):
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
