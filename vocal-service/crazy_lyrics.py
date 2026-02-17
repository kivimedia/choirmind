"""
Crazy Lyrics Generator — uses Claude Haiku to generate absurd alternative lyrics
that match the syllable structure of the original.
"""

import json
import logging
import re

import anthropic

logger = logging.getLogger(__name__)


def _count_hebrew_syllables(word: str) -> int:
    """Rough Hebrew syllable count based on vowel letters (א, ה, ו, י, ע).

    Hebrew syllable counting is complex. This is a simple heuristic:
    count vowel-bearing consonant clusters. For non-Hebrew, count vowels.
    """
    # Strip nikkud (diacritics)
    cleaned = re.sub(r'[\u0591-\u05C7]', '', word)

    # Check if the word is Hebrew
    if any('\u0590' <= c <= '\u05FF' for c in cleaned):
        # Hebrew: roughly 1 syllable per consonant (min 1)
        consonants = sum(1 for c in cleaned if '\u05D0' <= c <= '\u05EA')
        return max(1, consonants)
    else:
        # Non-Hebrew: count vowel groups
        vowels = len(re.findall(r'[aeiouAEIOU]+', cleaned))
        return max(1, vowels)


def generate_crazy_lyrics(
    original_lines: list[list[str]],
    language: str = "he",
) -> list[list[str]]:
    """Generate absurd replacement lyrics matching word counts per line.

    Args:
        original_lines: List of lines, each a list of words.
        language: Language code (he, en, fr, etc.)

    Returns:
        List of lines with replacement words, same shape as input.
    """
    if not original_lines:
        return []

    # Build the prompt
    lang_name = {
        "he": "Hebrew (עברית)",
        "en": "English",
        "fr": "French",
        "mixed": "Hebrew (עברית)",
    }.get(language, "Hebrew (עברית)")

    # Build line descriptions
    line_specs = []
    for i, line in enumerate(original_lines):
        if not line:
            line_specs.append(f"Line {i + 1}: (empty)")
            continue
        word_count = len(line)
        syllable_counts = [_count_hebrew_syllables(w) for w in line]
        line_specs.append(
            f"Line {i + 1}: {word_count} words, "
            f"syllables per word: {syllable_counts}, "
            f"original: {' '.join(line)}"
        )

    prompt = f"""Generate funny, absurd, grammatically-correct {lang_name} replacement lyrics.

RULES:
1. Each line MUST have EXACTLY the same number of words as the original
2. Try to roughly match syllable counts per word (±1 syllable is fine)
3. The lyrics should be silly, absurd, and fun — think random topics like food, animals, aliens, everyday objects
4. Keep it family-friendly
5. Make them grammatically coherent enough to sing (they should flow naturally)
6. Do NOT use the same words as the original

INPUT LINES:
{chr(10).join(line_specs)}

Respond with ONLY a JSON array of arrays of strings. Each inner array is one line of replacement words.
Example: [["word1", "word2"], ["word3", "word4", "word5"]]

IMPORTANT: The number of words in each line MUST match exactly. Empty lines should be empty arrays []."""

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )

        # Extract JSON from response
        text = response.content[0].text.strip()
        # Try to find JSON array in the response
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            result = json.loads(match.group())
        else:
            result = json.loads(text)

        # Validate structure
        if not isinstance(result, list):
            raise ValueError("Expected a list")

        # Ensure each line has correct word count
        validated = []
        for i, line in enumerate(result):
            if i >= len(original_lines):
                break
            if not original_lines[i]:
                validated.append([])
                continue
            if not isinstance(line, list):
                validated.append(original_lines[i])
                continue
            expected_count = len(original_lines[i])
            if len(line) == expected_count:
                validated.append([str(w) for w in line])
            elif len(line) > expected_count:
                validated.append([str(w) for w in line[:expected_count]])
            else:
                # Pad with original words if too few
                padded = [str(w) for w in line]
                while len(padded) < expected_count:
                    padded.append(original_lines[i][len(padded)])
                validated.append(padded)

        # Pad with original lines if response was too short
        while len(validated) < len(original_lines):
            validated.append(original_lines[len(validated)])

        logger.info(
            "Generated crazy lyrics: %d lines, validated structure OK",
            len(validated),
        )
        return validated

    except Exception as exc:
        logger.error("Crazy lyrics generation failed: %s", exc)
        # Fallback: return original lines
        return original_lines
