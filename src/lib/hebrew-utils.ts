/**
 * Hebrew text processing utilities for ChoirMind.
 *
 * Handles nikkud (vowel marks), maqaf (Hebrew hyphen), directionality detection,
 * and language detection for Hebrew/English content.
 */

// ---------------------------------------------------------------------------
// Unicode ranges
// ---------------------------------------------------------------------------

/** Hebrew consonants: U+05D0 - U+05EA */
const HEBREW_LETTER_RANGE = /[\u05D0-\u05EA]/;

/** Hebrew nikkud (cantillation marks + vowel points): U+0591 - U+05C7 */
const NIKKUD_REGEX = /[\u0591-\u05C7]/g;

/** Hebrew maqaf (the Hebrew hyphen character): U+05BE */
const MAQAF = '\u05BE';

/** Latin/ASCII letter range */
const LATIN_LETTER_RANGE = /[A-Za-z]/;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Split Hebrew text into word tokens.
 *
 * - Standard whitespace splits words.
 * - Maqaf-joined words (e.g., "כל\u05BEהעם") are kept as a single token.
 * - Empty strings between delimiters are filtered out.
 */
export function tokenizeHebrew(text: string): string[] {
  if (!text) return [];

  // Split on whitespace only. Maqaf is NOT a split point — words joined
  // by maqaf are treated as a single token.
  return text
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

// ---------------------------------------------------------------------------
// First letter extraction
// ---------------------------------------------------------------------------

/**
 * Extract the first *letter* from a word, optionally preserving any nikkud
 * (vowel marks) that follow it.
 *
 * @param word       The input word (may contain nikkud, maqaf, punctuation).
 * @param withNikkud If true, include the nikkud marks attached to the first letter.
 */
export function extractFirstLetter(
  word: string,
  withNikkud: boolean = false,
): string {
  if (!word) return '';

  // Walk through the string to find the first actual letter (Hebrew or Latin),
  // skipping any leading nikkud, punctuation, or whitespace.
  for (let i = 0; i < word.length; i++) {
    const char = word[i];

    const isHebrewLetter = HEBREW_LETTER_RANGE.test(char);
    const isLatinLetter = LATIN_LETTER_RANGE.test(char);

    if (isHebrewLetter || isLatinLetter) {
      if (!withNikkud) {
        return char;
      }

      // Collect trailing nikkud marks that belong to this letter
      let result = char;
      for (let j = i + 1; j < word.length; j++) {
        if (NIKKUD_REGEX.test(word[j])) {
          result += word[j];
          // Reset lastIndex since we use the regex in a test (global flag side-effect)
          NIKKUD_REGEX.lastIndex = 0;
        } else {
          break;
        }
      }
      NIKKUD_REGEX.lastIndex = 0;
      return result;
    }
  }

  // Fallback: return the first character even if it's not a letter
  return word[0] || '';
}

// ---------------------------------------------------------------------------
// Strip nikkud
// ---------------------------------------------------------------------------

/**
 * Remove all nikkud (vowel/cantillation) marks from text, leaving consonants
 * and punctuation intact.
 */
export function stripNikkud(text: string): string {
  if (!text) return '';
  return text.replace(NIKKUD_REGEX, '');
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

export type DetectedLanguage = 'he' | 'en' | 'mixed';

/**
 * Detect the dominant language of a text string by scanning for Hebrew and
 * Latin characters.
 *
 * Returns:
 * - 'he'    if only Hebrew letters are found (or no letters at all — default)
 * - 'en'    if only Latin letters are found
 * - 'mixed' if both Hebrew and Latin letters are present
 */
export function detectLanguage(text: string): DetectedLanguage {
  if (!text) return 'he';

  let hasHebrew = false;
  let hasLatin = false;

  for (const char of text) {
    if (HEBREW_LETTER_RANGE.test(char)) {
      hasHebrew = true;
    } else if (LATIN_LETTER_RANGE.test(char)) {
      hasLatin = true;
    }

    // Early exit if we already know it's mixed
    if (hasHebrew && hasLatin) {
      return 'mixed';
    }
  }

  if (hasHebrew) return 'he';
  if (hasLatin) return 'en';

  // Default to Hebrew (Hebrew-first app)
  return 'he';
}

// ---------------------------------------------------------------------------
// Text direction detection
// ---------------------------------------------------------------------------

export type TextDirection = 'rtl' | 'ltr';

/**
 * Determine the text direction based on the first strong directional character.
 *
 * Hebrew characters produce 'rtl'; Latin characters produce 'ltr'.
 * Defaults to 'rtl' (Hebrew-first app) when no strong directional character
 * is found.
 */
export function detectTextDirection(text: string): TextDirection {
  if (!text) return 'rtl';

  for (const char of text) {
    if (HEBREW_LETTER_RANGE.test(char)) {
      return 'rtl';
    }
    if (LATIN_LETTER_RANGE.test(char)) {
      return 'ltr';
    }
  }

  // Default: RTL for a Hebrew-first app
  return 'rtl';
}
