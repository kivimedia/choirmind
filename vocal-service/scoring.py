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

    section_scores = _compute_section_scores(alignment, ref_features)
    problem_areas = _identify_problem_areas(alignment, ref_features)

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

def _compute_section_scores(alignment: dict, ref_features: dict) -> list[dict]:
    """Split the reference timeline into NUM_SECTIONS equal segments
    and compute sub-scores for each."""
    ref_times = ref_features.get("pitch_times", [])
    if not ref_times:
        return []

    duration = ref_times[-1]
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
            if r_idx >= len(ref_times):
                continue
            t = ref_times[r_idx]
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
    ref_features: dict,
    window_s: float = 2.0,
) -> list[dict]:
    """Identify up to 3 worst time windows in the recording.

    Slides a *window_s*-second window across the reference timeline
    and finds the windows with the lowest combined scores.
    """
    ref_times = ref_features.get("pitch_times", [])
    if not ref_times:
        return []

    duration = ref_times[-1]
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

        for pair_idx, (u_idx, r_idx) in enumerate(path):
            if r_idx >= len(ref_times):
                continue
            rt = ref_times[r_idx]
            if rt < t_start or rt >= t_end:
                continue

            dev = alignment["pitch_deviations"][pair_idx]
            if dev is not None:
                w_pitch.append(abs(dev))
            w_timing.append(abs(alignment["timing_offsets"][pair_idx]))
            er = alignment["energy_ratios"][pair_idx]
            if er is not None:
                w_dynamics.append(er)

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
                windows.append({
                    "startTime": round(t_start, 2),
                    "endTime": round(t_end, 2),
                    "issues": issues,
                    "avgPitchDevCents": round(avg_dev, 1),
                    "avgTimingOffsetMs": round(avg_off * 1000, 1),
                    "avgEnergyRatio": round(avg_ratio, 3),
                    "badness": badness,
                })

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
