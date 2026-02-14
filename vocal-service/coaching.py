"""
Claude Haiku coaching tips generator.

Analyses scoring results and problem areas to produce 3-5 specific,
actionable coaching tips in Hebrew for choir members.
"""

import json
import logging
from typing import Optional

import anthropic

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a vocal coach for an Israeli choir app called Choirmind. "
    "Give 3-5 specific, actionable coaching tips in Hebrew. "
    "Be encouraging but direct. Focus on the weakest areas. "
    "Each tip should be one or two sentences. "
    "Do not number the tips or add prefixes -- return a plain JSON array of strings. "
    "Reply ONLY with the JSON array, no markdown fences or other text."
)


def generate_coaching_tips(
    scores: dict,
    problem_areas: list[dict],
    voice_part: str,
    song_title: Optional[str] = None,
) -> list[str]:
    """Call Claude Haiku to generate Hebrew coaching tips.

    Args:
        scores:        Dict with overallScore, pitchScore, timingScore, dynamicsScore.
        problem_areas: List of problem area dicts (up to 3) with issues and metrics.
        voice_part:    User's voice part (soprano, alto, tenor, bass, etc.).
        song_title:    Optional song title for context.

    Returns:
        List of 3-5 Hebrew coaching tip strings.
    """
    user_message = _build_user_message(scores, problem_areas, voice_part, song_title)

    logger.info("Requesting coaching tips from Claude Haiku")

    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw_text = response.content[0].text.strip()
    except Exception as exc:
        # Convert Anthropic SDK exceptions to plain exceptions
        # so Modal can serialize them across containers
        logger.error("Anthropic API error: %s", exc)
        raise RuntimeError(f"Anthropic API error: {exc}") from None

    # Strip markdown fences if Claude added them despite prompt
    raw_text = _strip_markdown_fences(raw_text)

    # Parse the JSON array
    try:
        tips = json.loads(raw_text)
        if not isinstance(tips, list):
            raise ValueError("Expected JSON array")
        # Ensure we have strings and cap at 5
        tips = [str(t) for t in tips[:5]]
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning(
            "Failed to parse Claude response as JSON array: %s. Raw: %s",
            exc,
            raw_text[:500],
        )
        # Fallback: split by newlines and clean up
        tips = _fallback_parse(raw_text)

    logger.info("Generated %d coaching tips", len(tips))
    return tips


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences that Claude sometimes adds."""
    import re
    # Match ```json ... ``` or ``` ... ```
    m = re.search(r'```(?:json)?\s*\n?(.*?)```', text, re.DOTALL)
    if m:
        return m.group(1).strip()
    # Also handle case where only opening fence exists
    if text.startswith('```'):
        text = text.split('\n', 1)[-1] if '\n' in text else text[3:]
    if text.endswith('```'):
        text = text[:-3]
    return text.strip()


def _build_user_message(
    scores: dict,
    problem_areas: list[dict],
    voice_part: str,
    song_title: Optional[str],
) -> str:
    """Build a structured prompt for Claude with all scoring context."""
    parts = [
        f"Voice part: {voice_part}",
    ]
    if song_title:
        parts.append(f"Song: {song_title}")

    parts.append("")
    parts.append("Scores (0-100):")
    parts.append(f"  Overall:  {scores.get('overallScore', '?')}")
    parts.append(f"  Pitch:    {scores.get('pitchScore', '?')}")
    parts.append(f"  Timing:   {scores.get('timingScore', '?')}")
    parts.append(f"  Dynamics: {scores.get('dynamicsScore', '?')}")

    if problem_areas:
        parts.append("")
        parts.append("Problem areas:")
        for i, area in enumerate(problem_areas, 1):
            issues = ", ".join(area.get("issues", []))
            start = area.get("startTime", "?")
            end = area.get("endTime", "?")
            dev = area.get("avgPitchDevCents", "?")
            off = area.get("avgTimingOffsetMs", "?")
            ratio = area.get("avgEnergyRatio", "?")
            parts.append(
                f"  {i}. {start}s-{end}s  issues=[{issues}]  "
                f"pitch_dev={dev} cents  timing_off={off}ms  energy_ratio={ratio}"
            )

    section_scores = scores.get("sectionScores", [])
    if section_scores:
        parts.append("")
        parts.append("Section scores:")
        for sec in section_scores:
            parts.append(
                f"  Section {sec.get('sectionIndex', '?')} "
                f"({sec.get('startTime', '?')}s-{sec.get('endTime', '?')}s): "
                f"overall={sec.get('overallScore', '?')} "
                f"pitch={sec.get('pitchScore', '?')} "
                f"timing={sec.get('timingScore', '?')} "
                f"dynamics={sec.get('dynamicsScore', '?')}"
            )

    parts.append("")
    parts.append("Generate 3-5 coaching tips in Hebrew as a JSON array of strings.")

    return "\n".join(parts)


def _fallback_parse(raw_text: str) -> list[str]:
    """Best-effort extraction of tips from non-JSON Claude responses."""
    lines = raw_text.strip().split("\n")
    tips = []
    for line in lines:
        cleaned = line.strip().lstrip("0123456789.-) ").strip()
        if cleaned and len(cleaned) > 5:
            tips.append(cleaned)
    # Ensure 3-5
    return tips[:5] if tips else [
        "נסה לשמור על יציבות בגובה הצליל לאורך כל הביצוע.",
        "שים לב לתזמון -- הקפד להיכנס יחד עם ההפניה.",
        "עבוד על דינמיקה: תנודות בעוצמה חשובות להבעה מוזיקלית.",
    ]
