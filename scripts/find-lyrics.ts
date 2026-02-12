/**
 * Find and populate lyrics for songs in the ChoirMind database.
 *
 * Phase 1: Copy lyrics from duplicate songs (MILA songs that share a title
 *          with an original song that already has lyrics).
 * Phase 2: Search Shironet for remaining songs that still lack lyrics.
 *
 * Usage:
 *   npx tsx scripts/find-lyrics.ts              (full run)
 *   npx tsx scripts/find-lyrics.ts --dry-run    (preview without writing)
 */

import { PrismaClient } from '@prisma/client'
import { autoDetectChunks } from '../src/lib/auto-chunk'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry-run')

const prisma = new PrismaClient()

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const SHIRONET_BASE = 'https://shironet.mako.co.il'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** True if a song's chunks contain meaningful lyrics (more than 10 chars total). */
function songHasLyrics(
  chunks: { lyrics: string | null }[],
): boolean {
  const totalLen = chunks.reduce(
    (sum, c) => sum + (c.lyrics?.trim().length ?? 0),
    0,
  )
  return totalLen >= 10
}

/**
 * Normalize a title for comparison: lowercase, strip punctuation, collapse
 * whitespace. Works for both Hebrew and English titles.
 */
function normalizeTitle(title: string): string {
  return title
    .trim()
    .replace(/["""''`.,!?;:\-–—()[\]{}/\\]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Decode HTML entities like &amp;, &#1234;, etc. */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&lrm;': '',
    '&rlm;': '',
  }
  let result = text
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char)
  }
  // Handle numeric entities like &#1234;
  result = result.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10)),
  )
  return result
}

// ---------------------------------------------------------------------------
// Phase 1: Copy lyrics from duplicate songs
// ---------------------------------------------------------------------------

async function phase1CopyFromDuplicates(): Promise<number> {
  console.log('\n========================================')
  console.log('PHASE 1: Copy lyrics from duplicate songs')
  console.log('========================================\n')

  // Load all active songs with their chunks
  const allSongs = await prisma.song.findMany({
    where: { archivedAt: null },
    include: {
      chunks: {
        select: {
          id: true,
          label: true,
          chunkType: true,
          lyrics: true,
          order: true,
          textDirection: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  })

  // Separate songs with and without lyrics
  const songsWithLyrics = allSongs.filter((s) => songHasLyrics(s.chunks))
  const milaSongsWithoutLyrics = allSongs.filter(
    (s) => s.source === 'mila' && !songHasLyrics(s.chunks),
  )

  console.log(`Total active songs: ${allSongs.length}`)
  console.log(`Songs with lyrics: ${songsWithLyrics.length}`)
  console.log(`MILA songs without lyrics: ${milaSongsWithoutLyrics.length}`)

  // Build a lookup by normalized title for songs that have lyrics
  const titleToSongWithLyrics = new Map<
    string,
    (typeof songsWithLyrics)[0]
  >()
  for (const s of songsWithLyrics) {
    const norm = normalizeTitle(s.title)
    // Prefer the first match (non-MILA sources first, then MILA)
    if (!titleToSongWithLyrics.has(norm)) {
      titleToSongWithLyrics.set(norm, s)
    }
  }

  let copied = 0

  for (const milaSong of milaSongsWithoutLyrics) {
    const norm = normalizeTitle(milaSong.title)
    const donor = titleToSongWithLyrics.get(norm)

    if (!donor) continue

    console.log(
      `\n  [MATCH] "${milaSong.title}" <- copying from "${donor.title}" (${donor.chunks.length} chunks)`,
    )

    if (DRY_RUN) {
      for (const chunk of donor.chunks) {
        const preview = chunk.lyrics?.substring(0, 60)?.replace(/\n/g, ' ') ?? ''
        console.log(
          `    chunk ${chunk.order}: [${chunk.chunkType}] "${chunk.label}" - ${preview}...`,
        )
      }
      copied++
      continue
    }

    // Delete existing empty chunks for this MILA song
    await prisma.chunk.deleteMany({
      where: { songId: milaSong.id },
    })

    // Create new chunks copied from the donor
    for (const chunk of donor.chunks) {
      await prisma.chunk.create({
        data: {
          songId: milaSong.id,
          label: chunk.label,
          chunkType: chunk.chunkType,
          lyrics: chunk.lyrics,
          order: chunk.order,
          textDirection: chunk.textDirection,
        },
      })
    }

    console.log(`    -> Copied ${donor.chunks.length} chunks`)
    copied++
  }

  console.log(`\nPhase 1 complete: ${copied} songs ${DRY_RUN ? 'would be' : ''} updated from duplicates`)
  return copied
}

// ---------------------------------------------------------------------------
// Phase 2: Search Shironet for remaining songs
// ---------------------------------------------------------------------------

/**
 * Search Shironet for a song title and return the first matching lyrics page URL.
 */
async function searchShironet(title: string): Promise<string | null> {
  const searchUrl = `${SHIRONET_BASE}/search?q=${encodeURIComponent(title)}&type=songs`

  console.log(`    Searching: ${searchUrl}`)

  const response = await fetch(searchUrl, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    console.log(`    Search failed: HTTP ${response.status}`)
    return null
  }

  const html = await response.text()

  // Look for song links in search results.
  // Shironet song links look like: /artist?type=lyrics&lang=1&prfid=XXX&wrkid=YYY
  const linkPattern = /href="(\/artist\?type=lyrics&lang=1&prfid=\d+&wrkid=\d+)"/g
  const matches: string[] = []
  let match: RegExpExecArray | null

  while ((match = linkPattern.exec(html)) !== null) {
    matches.push(match[1])
  }

  if (matches.length === 0) {
    console.log(`    No song links found in search results`)
    return null
  }

  // Return the first match (most relevant)
  const lyricsPath = matches[0]
  console.log(`    Found ${matches.length} result(s), using first: ${lyricsPath}`)
  return `${SHIRONET_BASE}${lyricsPath}`
}

/**
 * Fetch a Shironet lyrics page and extract the lyrics text.
 */
async function fetchShironetLyrics(url: string): Promise<string | null> {
  console.log(`    Fetching lyrics page: ${url}`)

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    console.log(`    Lyrics page failed: HTTP ${response.status}`)
    return null
  }

  const html = await response.text()

  // Shironet lyrics are in elements with class containing "artist_lyrics_text".
  // We look for the content inside these elements.
  // Pattern: <span/div/p with class="...artist_lyrics_text...">LYRICS</span/div/p>
  const lyricsPattern =
    /class="[^"]*artist_lyrics_text[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p|td)/gi

  const lyricsBlocks: string[] = []
  let lyricsMatch: RegExpExecArray | null

  while ((lyricsMatch = lyricsPattern.exec(html)) !== null) {
    const raw = lyricsMatch[1]
    // Convert <br> to newlines, strip other tags
    const text = raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim()

    if (text.length > 0) {
      lyricsBlocks.push(decodeHtmlEntities(text))
    }
  }

  if (lyricsBlocks.length === 0) {
    console.log(`    Could not extract lyrics from page`)
    return null
  }

  const fullLyrics = lyricsBlocks.join('\n\n')
  console.log(
    `    Extracted ${fullLyrics.length} chars of lyrics (${lyricsBlocks.length} block(s))`,
  )
  return fullLyrics
}

/**
 * Split lyrics into chunks using autoDetectChunks, with a blank-line fallback.
 */
function splitIntoChunks(
  lyricsText: string,
): { label: string; chunkType: string; lyrics: string }[] {
  // Try autoDetectChunks first
  const detected = autoDetectChunks(lyricsText)

  if (detected.length > 0) {
    console.log(
      `    autoDetectChunks returned ${detected.length} chunk(s)`,
    )
    return detected.map((c) => ({
      label: c.label,
      chunkType: c.chunkType,
      lyrics: c.lyrics,
    }))
  }

  // Fallback: split by blank lines manually
  console.log(`    autoDetectChunks returned empty, falling back to blank-line split`)

  const paragraphs = lyricsText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  if (paragraphs.length === 0) {
    // Last resort: treat the entire text as one chunk
    return [
      {
        label: '\u05D1\u05D9\u05EA 1', // "בית 1"
        chunkType: 'verse',
        lyrics: lyricsText.trim(),
      },
    ]
  }

  return paragraphs.map((p, i) => ({
    label: `\u05D1\u05D9\u05EA ${i + 1}`, // "בית N"
    chunkType: 'verse',
    lyrics: p,
  }))
}

async function phase2SearchShironet(): Promise<number> {
  console.log('\n========================================')
  console.log('PHASE 2: Search Shironet for lyrics')
  console.log('========================================\n')

  // Reload songs to pick up phase 1 changes
  const allSongs = await prisma.song.findMany({
    where: { archivedAt: null },
    include: {
      chunks: {
        select: { id: true, lyrics: true },
      },
    },
  })

  const songsNeedingLyrics = allSongs.filter(
    (s) => !songHasLyrics(s.chunks),
  )

  // Filter to songs that have some metadata (composer or lyricist)
  const candidates = songsNeedingLyrics.filter(
    (s) => s.composer || s.lyricist,
  )

  const skipped = songsNeedingLyrics.filter(
    (s) => !s.composer && !s.lyricist,
  )

  console.log(`Songs still needing lyrics: ${songsNeedingLyrics.length}`)
  console.log(`Candidates with metadata: ${candidates.length}`)
  console.log(`Skipping (no metadata): ${skipped.length}`)

  if (skipped.length > 0) {
    for (const s of skipped) {
      console.log(`  [SKIP] "${s.title}" - no composer/lyricist metadata`)
    }
  }

  let found = 0

  for (const song of candidates) {
    console.log(`\n  --- "${song.title}" ---`)
    console.log(
      `    Metadata: ${[song.composer && `composer: ${song.composer}`, song.lyricist && `lyricist: ${song.lyricist}`].filter(Boolean).join(', ')}`,
    )

    try {
      // Search Shironet
      const lyricsUrl = await searchShironet(song.title)

      if (!lyricsUrl) {
        console.log(`    -> No results found on Shironet`)
        await sleep(1000)
        continue
      }

      // Respect rate limiting
      await sleep(1500)

      // Fetch lyrics
      const lyricsText = await fetchShironetLyrics(lyricsUrl)

      if (!lyricsText) {
        console.log(`    -> Could not extract lyrics`)
        await sleep(1000)
        continue
      }

      // Split into chunks
      const chunks = splitIntoChunks(lyricsText)

      if (chunks.length === 0) {
        console.log(`    -> No chunks produced`)
        await sleep(1000)
        continue
      }

      console.log(`    -> ${chunks.length} chunk(s) ready:`)
      for (let i = 0; i < chunks.length; i++) {
        const preview =
          chunks[i].lyrics.substring(0, 60).replace(/\n/g, ' ')
        console.log(
          `       ${i}: [${chunks[i].chunkType}] "${chunks[i].label}" - ${preview}...`,
        )
      }

      if (DRY_RUN) {
        found++
        await sleep(1000)
        continue
      }

      // Delete old empty chunks
      await prisma.chunk.deleteMany({
        where: { songId: song.id },
      })

      // Create new chunks
      for (let i = 0; i < chunks.length; i++) {
        await prisma.chunk.create({
          data: {
            songId: song.id,
            label: chunks[i].label,
            chunkType: chunks[i].chunkType,
            lyrics: chunks[i].lyrics,
            order: i,
            textDirection: 'rtl',
          },
        })
      }

      console.log(`    -> Saved ${chunks.length} chunks to database`)
      found++
    } catch (err) {
      console.error(`    -> ERROR: ${err}`)
    }

    // Delay between songs
    await sleep(1500)
  }

  console.log(
    `\nPhase 2 complete: ${found} songs ${DRY_RUN ? 'would be' : ''} updated from Shironet`,
  )
  return found
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== find-lyrics.ts ===')
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (writing to database)'}`)

  const phase1Count = await phase1CopyFromDuplicates()

  // Phase 2 disabled: Shironet blocks automated requests with CAPTCHA.
  // Run with --phase2 to attempt anyway.
  let phase2Count = 0
  if (process.argv.includes('--phase2')) {
    phase2Count = await phase2SearchShironet()
  } else {
    console.log('\n(Phase 2 skipped — run with --phase2 to attempt Shironet search)')
  }

  console.log('\n========================================')
  console.log('SUMMARY')
  console.log('========================================')
  console.log(`Phase 1 (duplicates): ${phase1Count} songs`)
  console.log(`Phase 2 (Shironet):   ${phase2Count} songs`)
  console.log(`Total updated:        ${phase1Count + phase2Count} songs`)
  if (DRY_RUN) {
    console.log('\n(Dry run - no changes were made to the database)')
  }
  console.log('========================================\n')

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
