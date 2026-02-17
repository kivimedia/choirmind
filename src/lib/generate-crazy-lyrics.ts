/**
 * Shared crazy-lyrics generation logic.
 * Calls Claude Haiku (directly or via vocal service) to produce absurd
 * replacement lyrics that match the original word counts per line.
 */

const LANG_NAMES: Record<string, string> = {
  he: 'Hebrew (עברית)',
  en: 'English',
  fr: 'French',
  mixed: 'Hebrew (עברית)',
}

/**
 * Generate crazy replacement lyrics for the given lines.
 * @param lines - Array of lines, each line is an array of words
 * @param language - Song language code (he, en, fr, mixed, etc.)
 * @param songTitle - Optional song title for diagnostic logging
 * @returns Validated array of replacement lines with correct word counts
 */
export async function generateCrazyLyrics(
  lines: string[][],
  language: string,
  songTitle?: string,
): Promise<string[][]> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const vocalServiceUrl = process.env.VOCAL_SERVICE_URL

  const langName = LANG_NAMES[language] ?? LANG_NAMES['he']
  const lineSpecs = lines.map((line, i) =>
    `${i + 1}. [${line.length}w] ${line.join(' ')}`
  ).join('\n')

  const prompt = `Generate funny, absurd ${langName} replacement lyrics.

RULES:
1. Each line MUST have EXACTLY the same number of words as the original
2. Be silly and fun — food, animals, aliens, everyday objects
3. Family-friendly, grammatically coherent enough to sing
4. Do NOT reuse original words

LINES (number, [word count], original):
${lineSpecs}

Respond with ONLY a JSON array of arrays. Example: [["w1","w2"],["w3","w4","w5"]]
Empty lines = [].`

  let result: string[][]

  if (anthropicKey) {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text().catch(() => 'API error')
      throw new Error(`Anthropic API error: ${err}`)
    }

    const anthropicData = await anthropicRes.json()
    const raw = anthropicData.content?.[0]?.text?.trim() ?? ''
    // Strip markdown fences (```json ... ```) that Haiku sometimes adds
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response')
    }
    result = JSON.parse(jsonMatch[0])
  } else if (vocalServiceUrl) {
    const res = await fetch(`${vocalServiceUrl}/api/v1/crazy-lyrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, language }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Generation failed' }))
      throw new Error(err.detail || 'Generation failed')
    }
    const data = await res.json()
    result = data.crazy_lines
  } else {
    throw new Error('No AI service configured')
  }

  // Validate and fix structure — ensure each line has correct word count
  const validated: string[][] = []
  let trimmed = 0, padded = 0, fallen = 0
  for (let i = 0; i < lines.length; i++) {
    const original = lines[i]
    const crazy = result[i]
    if (!crazy || !Array.isArray(crazy)) {
      validated.push(original)
      fallen++
    } else if (crazy.length === original.length) {
      validated.push(crazy.map(String))
    } else if (crazy.length > original.length) {
      validated.push(crazy.slice(0, original.length).map(String))
      trimmed++
    } else {
      const p = crazy.map(String)
      while (p.length < original.length) {
        p.push(original[p.length])
      }
      validated.push(p)
      padded++
    }
  }

  if (trimmed > 0 || padded > 0 || fallen > 0) {
    const label = songTitle || `${language}/${lines.length}lines`
    console.warn(
      `[crazy-lyrics] ${label}: trimmed ${trimmed}, padded ${padded}, fallback ${fallen} of ${lines.length} lines`
    )
  }

  return validated
}

/**
 * Extract lines-of-words from chunks' wordTimestamps JSON.
 */
export function extractLinesFromChunks(
  chunks: { wordTimestamps: string | null }[],
): string[][] {
  const lines: string[][] = []
  for (const chunk of chunks) {
    if (!chunk.wordTimestamps) continue
    const parsed = JSON.parse(chunk.wordTimestamps) as { word: string }[][]
    for (const line of parsed) {
      if (line.length > 0) {
        lines.push(line.map((w) => w.word))
      }
    }
  }
  return lines
}
