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

// ---------------------------------------------------------------------------
// Syllable estimation (rough heuristic — good enough for prompt hints)
// ---------------------------------------------------------------------------

/** Rough Hebrew syllable count: count vowel-like clusters. */
function hebrewSyllables(word: string): number {
  // Hebrew vowels are mostly implicit, but we can estimate from consonant clusters.
  // Rough heuristic: each consonant letter usually has one vowel → ~1 syllable per
  // 1-2 consonants. A simpler approach: count Hebrew letters, divide by ~2.
  const hebrewLetters = word.replace(/[^\u05D0-\u05EA]/g, '').length
  if (hebrewLetters > 0) return Math.max(1, Math.round(hebrewLetters / 2))
  // Fallback for non-Hebrew words in a Hebrew song
  return latinSyllables(word)
}

/** Rough Latin-script syllable count: count vowel clusters. */
function latinSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-zà-ÿ]/g, '')
  if (cleaned.length <= 2) return 1
  const vowelGroups = cleaned.match(/[aeiouyàâäéèêëïîôùûüÿœæ]+/gi)
  let count = vowelGroups ? vowelGroups.length : 1
  // Silent trailing e (English)
  if (cleaned.endsWith('e') && count > 1) count--
  return Math.max(1, count)
}

function estimateSyllables(word: string, language: string): number {
  if (language === 'he' || language === 'mixed') return hebrewSyllables(word)
  return latinSyllables(word)
}

function lineSyllables(words: string[], language: string): number {
  return words.reduce((sum, w) => sum + estimateSyllables(w, language), 0)
}

// ---------------------------------------------------------------------------
// Comedy scenarios (one is picked at random per generation)
// ---------------------------------------------------------------------------

const SCENARIOS = [
  'A very serious penguin is trying to order pizza but the toppings keep arguing with each other',
  'Two fish are having a heated argument about which couch to buy for their underwater apartment',
  'A cat is running for mayor and giving passionate campaign speeches about nap rights',
  'A dog has been promoted to CEO and is holding his first all-hands meeting about treats',
  'A pigeon is writing a strongly worded complaint letter to the city about bread quality',
  'An octopus is trying to get dressed for a job interview but has too many arms for any shirt',
  'A hamster is a personal trainer screaming motivational quotes at much larger animals',
  'Two snails are in a high-speed car chase that is actually extremely slow',
  'A parrot is a therapist who keeps accidentally repeating his patients\' problems back to them',
  'A giraffe is trying to hide in a game of hide and seek and failing spectacularly',
  'A sandwich is giving a tearful farewell speech before being eaten',
  'Someone is passionately describing their hummus to a therapist as if it were a relationship',
  'Two falafel balls are falling in love inside a pita and the tahini is jealous',
  'A banana is having a midlife crisis and considering becoming a smoothie',
  'The vegetables in the fridge are staging a revolution against the chocolate cake',
  'A pizza slice is on trial for being too delicious and the judge is a salad',
  'Someone is narrating a cooking show but every ingredient refuses to cooperate',
  'A watermelon is auditioning for a talent show and its only skill is being round',
  'The spices in the kitchen cabinet are having a meeting about who smells the best',
  'A piece of toast keeps trying to propose to a jar of peanut butter but gets too nervous',
  'Someone is trying to explain to an alien why we stand in line at the post office for three hours',
  'A reservist is giving a dramatic military briefing but the mission is finding parking in Tel Aviv',
  'Two people are having an epic argument about the correct way to make shakshuka',
  'Someone is negotiating with a taxi driver as if it were a Middle East peace summit',
  'A Bissli bag is delivering an inspirational graduation speech to a class of Bamba bags',
  'Someone is describing their experience at the DMV as if it were a survival horror movie',
  'A person is dramatically narrating their morning commute on the number 5 bus like a nature documentary',
  'Two grandmothers are in a competitive cooking battle and both claim the other\'s rice is too dry',
  'Someone is writing a love letter to their air conditioner during August in Israel',
  'A person is giving a TED talk about the correct amount of time to wait before honking at a green light',
  'Aliens have landed on Earth and their only demand is the recipe for chocolate cake',
  'An astronaut is floating in space and realizes he forgot to buy milk',
  'A robot is trying to understand why humans cry at movies and keeps short-circuiting',
  'Someone is giving a guided tour of Mars but it is extremely boring and there is nothing there',
  'Two planets are gossiping about Earth behind its back',
  'A spaceship\'s GPS keeps giving wrong directions and the crew is very lost',
  'An alien exchange student is writing home about the bizarre ritual humans call "breakfast"',
  'Two socks who got separated in the laundry are having an emotional reunion',
  'Someone is narrating their morning routine as if it were an action movie with explosions',
  'A chair is writing in its diary about the existential burden of being sat on every day',
  'Someone left their phone at home and is describing the experience as a survival thriller',
  'A traffic light is having an identity crisis because it can never decide between red and green',
  'Two elevators in the same building are competing for who can carry more people',
  'Someone is giving a dramatic courtroom closing argument about who ate the last cookie',
  'A person is attempting to assemble furniture from the instructions and slowly losing their mind',
  'A person is describing doing their laundry with the intensity of narrating a battle scene',
  'Someone is grocery shopping but treating every item like a life-or-death decision',
  'A person is brushing their teeth and giving a halftime motivational speech to their own reflection',
  'Two neighbors are having a dramatic standoff about whose turn it is to take out the garbage',
  'Someone is writing an epic poem about waiting for the bus and it is 20 minutes late',
]

function pickScenario(): string {
  return SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

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
  const scenario = pickScenario()

  const lineSpecs = lines.map((line, i) => {
    const syl = lineSyllables(line, language)
    return `${i + 1}. [${line.length}w ~${syl}syl] ${line.join(' ')}`
  }).join('\n')

  const prompt = `Generate funny, absurd ${langName} replacement lyrics.

SCENARIO: The song is actually telling the story of: "${scenario}"
Weave this scenario into the replacement lyrics. The lyrics should follow this storyline.

RULES:
1. Each line MUST have EXACTLY the same number of words as the original
2. Try to match the approximate syllable count of each line (shown as ~Nsyl) so it's singable. This is a soft goal — close enough is fine.
3. If the original lyrics are emotional or dramatic, make replacements aggressively mundane (grocery lists, plumbing problems, parking tickets). If the original is casual, make replacements absurdly dramatic and epic.
4. Make exactly ONE line near the middle sound completely normal and sincere — a "straight man" line. Every other line should be absurd. The sudden sanity in a sea of nonsense is the funniest part.
5. Family-friendly, grammatically coherent enough to sing
6. Do NOT reuse original words
7. CRITICAL — EVERY word MUST be a real, standard dictionary word in the target language. No made-up words, no neologisms, no gibberish, no invented verbs. If in Hebrew, use only real Hebrew words (מילים אמיתיות בלבד). Double-check each word exists.
8. CRITICAL — ZERO profanity, vulgarity, or near-profanity. Avoid any word that sounds like, rhymes with, or is one letter away from a curse word or sexual term in the target language. In Hebrew this specifically includes avoiding words that sound like or resemble: זיון, זונה, חרא, כוס, זין, תחת (in vulgar sense), and ANY conjugation or variation that could be misread as these. When in doubt, pick a completely different word.

LINES (number, [word count, ~syllable count], original):
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

  const label = songTitle || `${language}/${lines.length}lines`
  if (trimmed > 0 || padded > 0 || fallen > 0) {
    console.warn(
      `[crazy-lyrics] ${label}: trimmed ${trimmed}, padded ${padded}, fallback ${fallen} of ${lines.length} lines`
    )
  }
  console.log(`[crazy-lyrics] ${label}: scenario="${scenario.slice(0, 60)}..."`)

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
