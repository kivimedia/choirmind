/**
 * Auto-chunk detection for Hebrew lyrics.
 *
 * Takes raw pasted lyrics and splits them into labelled chunks (verse, chorus,
 * bridge, etc.) using Hebrew section headers, numbered patterns, liturgical
 * markers, and blank-line fallback.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChunkType =
  | 'verse'
  | 'chorus'
  | 'bridge'
  | 'intro'
  | 'outro'
  | 'coda'
  | 'transition'
  | 'custom';

export interface DetectedChunk {
  /** Display label, e.g. "בית 1", "פזמון", "חזן:" */
  label: string;
  /** The lyrics text for this chunk (trimmed). */
  lyrics: string;
  /** The semantic type of the chunk. */
  chunkType: ChunkType;
}

// ---------------------------------------------------------------------------
// Hebrew section header definitions
// ---------------------------------------------------------------------------

interface SectionDef {
  pattern: RegExp;
  type: ChunkType;
  defaultLabel: string;
}

/**
 * Hebrew section headers that can appear at the start of a line. These are
 * tested in order — first match wins.
 */
const SECTION_HEADERS: SectionDef[] = [
  // "פזמון" (chorus) — possibly with a number
  {
    pattern: /^פזמון\s*(\d+|[א-ת]\.?)?[:.\s]*$/i,
    type: 'chorus',
    defaultLabel: 'פזמון',
  },
  // "בית" (verse) — possibly with a number
  {
    pattern: /^בית\s*(\d+|[א-ת]\.?)?[:.\s]*$/i,
    type: 'verse',
    defaultLabel: 'בית',
  },
  // "גשר" (bridge)
  {
    pattern: /^גשר\s*(\d+|[א-ת]\.?)?[:.\s]*$/i,
    type: 'bridge',
    defaultLabel: 'גשר',
  },
  // "פתיחה" (intro)
  {
    pattern: /^פתיחה\s*[:.\s]*$/i,
    type: 'intro',
    defaultLabel: 'פתיחה',
  },
  // "סיום" (outro)
  {
    pattern: /^סיום\s*[:.\s]*$/i,
    type: 'outro',
    defaultLabel: 'סיום',
  },
  // "קודה" (coda)
  {
    pattern: /^קודה\s*[:.\s]*$/i,
    type: 'coda',
    defaultLabel: 'קודה',
  },
];

// ---------------------------------------------------------------------------
// Numbered pattern detection (e.g., "1.", "א.")
// ---------------------------------------------------------------------------

/** Matches lines that are purely a number or Hebrew letter followed by a period. */
const NUMBERED_PATTERN = /^(\d+|[א-ת])\.?\s*$/;

// ---------------------------------------------------------------------------
// Liturgical marker detection (e.g., "חזן:", "קהל:", "יחד:")
// ---------------------------------------------------------------------------

const LITURGICAL_MARKERS: Record<string, string> = {
  'חזן': 'חזן',
  'קהל': 'קהל',
  'יחד': 'יחד',
};

const LITURGICAL_PATTERN = /^(חזן|קהל|יחד)\s*:\s*$/;

/**
 * Check if a line starts with a liturgical marker followed by a colon,
 * where the rest of the line is actual lyrics (inline marker).
 * e.g., "חזן: הללויה"
 */
const LITURGICAL_INLINE_PATTERN = /^(חזן|קהל|יחד)\s*:\s*(.+)$/;

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

/**
 * Automatically detect and split raw pasted lyrics into chunks.
 *
 * Detection priority:
 * 1. Hebrew section headers ("בית", "פזמון", "גשר", "סיום", "קודה", "פתיחה")
 * 2. Numbered patterns ("1.", "א.")
 * 3. Liturgical markers ("חזן:", "קהל:", "יחד:")
 * 4. Blank-line separation fallback
 *
 * @param lyricsText Raw lyrics text (may include section headers, blank lines, etc.)
 * @returns Array of detected chunks with labels and types.
 */
export function autoDetectChunks(lyricsText: string): DetectedChunk[] {
  if (!lyricsText || !lyricsText.trim()) {
    return [];
  }

  const lines = lyricsText.split(/\r?\n/);

  // First pass: try to detect structured content (headers, numbers, liturgical markers)
  const structuredChunks = detectStructuredChunks(lines);

  if (structuredChunks.length > 0) {
    return structuredChunks;
  }

  // Fallback: split by blank lines
  return splitByBlankLines(lines);
}

// ---------------------------------------------------------------------------
// Structured detection
// ---------------------------------------------------------------------------

function detectStructuredChunks(lines: string[]): DetectedChunk[] {
  const chunks: DetectedChunk[] = [];
  let currentLabel: string | null = null;
  let currentType: ChunkType = 'verse';
  let currentLines: string[] = [];
  let foundAnyHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines (they don't start new chunks in structured mode,
    // but we preserve them if they're inside a chunk's lyrics)
    if (trimmed === '') {
      // If we're collecting lines for a chunk, add a blank line to preserve
      // intra-chunk spacing
      if (currentLabel !== null && currentLines.length > 0) {
        currentLines.push('');
      }
      continue;
    }

    // Check for Hebrew section headers
    const sectionMatch = matchSectionHeader(trimmed);
    if (sectionMatch) {
      foundAnyHeader = true;

      // Save previous chunk if any
      if (currentLabel !== null && hasContent(currentLines)) {
        chunks.push(buildChunk(currentLabel, currentType, currentLines));
      }

      currentLabel = sectionMatch.label;
      currentType = sectionMatch.type;
      currentLines = [];
      continue;
    }

    // Check for numbered patterns (standalone line like "1." or "א.")
    const numberedMatch = trimmed.match(NUMBERED_PATTERN);
    if (numberedMatch) {
      foundAnyHeader = true;

      if (currentLabel !== null && hasContent(currentLines)) {
        chunks.push(buildChunk(currentLabel, currentType, currentLines));
      }

      const num = numberedMatch[1];
      currentLabel = `בית ${num}`;
      currentType = 'verse';
      currentLines = [];
      continue;
    }

    // Check for liturgical markers on their own line (e.g., "חזן:")
    const litMatch = trimmed.match(LITURGICAL_PATTERN);
    if (litMatch) {
      foundAnyHeader = true;

      if (currentLabel !== null && hasContent(currentLines)) {
        chunks.push(buildChunk(currentLabel, currentType, currentLines));
      }

      currentLabel = LITURGICAL_MARKERS[litMatch[1]] + ':';
      currentType = 'custom';
      currentLines = [];
      continue;
    }

    // Check for inline liturgical markers (e.g., "חזן: הללויה")
    const litInline = trimmed.match(LITURGICAL_INLINE_PATTERN);
    if (litInline) {
      foundAnyHeader = true;

      if (currentLabel !== null && hasContent(currentLines)) {
        chunks.push(buildChunk(currentLabel, currentType, currentLines));
      }

      currentLabel = LITURGICAL_MARKERS[litInline[1]] + ':';
      currentType = 'custom';
      currentLines = [litInline[2].trim()];
      continue;
    }

    // Regular lyrics line
    if (currentLabel === null && !foundAnyHeader) {
      // No headers found yet — this might not be structured
      // Continue collecting; we'll decide later if this is structured
      currentLines.push(trimmed);
    } else {
      if (currentLabel === null) {
        // Content before any header — label it as a generic verse
        currentLabel = 'בית 1';
        currentType = 'verse';
      }
      currentLines.push(trimmed);
    }
  }

  // Flush last chunk
  if (foundAnyHeader && currentLabel !== null && hasContent(currentLines)) {
    chunks.push(buildChunk(currentLabel, currentType, currentLines));
  }

  // If no structured headers were found at all, return empty to trigger
  // the blank-line fallback
  if (!foundAnyHeader) {
    return [];
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Section header matching
// ---------------------------------------------------------------------------

function matchSectionHeader(
  line: string,
): { label: string; type: ChunkType } | null {
  for (const def of SECTION_HEADERS) {
    const match = line.match(def.pattern);
    if (match) {
      const suffix = match[1] ? ` ${match[1].replace('.', '')}` : '';
      return {
        label: def.defaultLabel + suffix,
        type: def.type,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Blank-line fallback
// ---------------------------------------------------------------------------

function splitByBlankLines(lines: string[]): DetectedChunk[] {
  const chunks: DetectedChunk[] = [];
  let currentLines: string[] = [];
  let chunkIndex = 1;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      if (currentLines.length > 0) {
        chunks.push({
          label: `בית ${chunkIndex}`,
          lyrics: currentLines.join('\n').trim(),
          chunkType: 'verse',
        });
        chunkIndex++;
        currentLines = [];
      }
    } else {
      currentLines.push(trimmed);
    }
  }

  // Flush remaining
  if (currentLines.length > 0) {
    chunks.push({
      label: `בית ${chunkIndex}`,
      lyrics: currentLines.join('\n').trim(),
      chunkType: 'verse',
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasContent(lines: string[]): boolean {
  return lines.some((l) => l.trim().length > 0);
}

function buildChunk(
  label: string,
  type: ChunkType,
  lines: string[],
): DetectedChunk {
  // Trim trailing blank lines from the chunk
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  // Trim leading blank lines
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  return {
    label: label.trim(),
    lyrics: lines.join('\n'),
    chunkType: type,
  };
}
