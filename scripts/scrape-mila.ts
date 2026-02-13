/**
 * MILA Choirs Scraper
 *
 * Scrapes audio files, lyrics PDFs, and song metadata from milachoirs.com,
 * uploads MP3s to S3, and creates Song + AudioTrack + Chunk records.
 *
 * The MILA site is built on Wix and stores all audio data in a
 * <script type="application/json" id="wix-warmup-data"> tag containing
 * the "Repertoire" CMS collection. Each song has wix:audio:// URIs for
 * each voice part (soprano, alto, tenor, bass, mix, playback).
 *
 * Usage:
 *   npm run scrape:mila
 *   npm run scrape:mila -- --dry-run         (preview without writing)
 *   npm run scrape:mila -- --choir-id <id>   (specify choir to attach songs to)
 *   npm run scrape:mila -- --local <path>    (use a saved HTML file instead of fetching)
 *   npm run scrape:mila -- --rescan          (only import songs NOT already in DB)
 *   npm run scrape:mila -- --process-refs    (create Demucs references for tracks without READY refs)
 */

import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { parseBuffer } from 'music-metadata'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MILA_URL = 'https://www.milachoirs.com/reperoirezlileymenashe'

// Voice part fields in the Wix Repertoire collection
const VOICE_PART_FIELDS = ['soprano', 'alto', 'tenor', 'bass', 'mix', 'playback'] as const

// 1-second-of-silence placeholder — skip this file
const SILENCE_FILE_ID = '7fee58_7102f0c610934d27b103483f2d2320bd'
const PLACEHOLDER_FILE_ID = '7fee58_fffea4a62b2c46c389d2ac8982d8b878'

const DRY_RUN = process.argv.includes('--dry-run')
const RESCAN = process.argv.includes('--rescan')
const PROCESS_REFS = process.argv.includes('--process-refs')
const CHOIR_ID_FLAG = process.argv.indexOf('--choir-id')
const CHOIR_ID = CHOIR_ID_FLAG !== -1 ? process.argv[CHOIR_ID_FLAG + 1] : null
const LOCAL_FLAG = process.argv.indexOf('--local')
const LOCAL_PATH = LOCAL_FLAG !== -1 ? process.argv[LOCAL_FLAG + 1] : null

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const prisma = new PrismaClient()

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'eu-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
})

const S3_BUCKET = process.env.AWS_S3_BUCKET ?? ''

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepertoireItem {
  _id: string
  title: string
  credits?: string
  priority?: number
  active?: boolean
  soprano?: string
  alto?: string
  tenor?: string
  bass?: string
  mix?: string
  playback?: string
  audio?: string
}

interface ScrapedSong {
  title: string
  credits: { lyricist?: string; composer?: string; arranger?: string }
  audioPlayers: { voicePart: string; url: string; durationMs: number }[]
  milaId: string
}

interface Report {
  songsFound: number
  songsCreated: number
  tracksDownloaded: number
  tracksSkipped: number
  pdfsProcessed: number
  failures: string[]
}

// ---------------------------------------------------------------------------
// Wix audio URI parsing
// ---------------------------------------------------------------------------

/**
 * Convert a wix:audio:// URI to a playable https URL.
 *
 * Format: wix:audio://v1/{FILE_ID}.mp3/{DISPLAY_NAME}.mp3#duration={SECONDS}
 * Result: https://music.wixstatic.com/mp3/{FILE_ID}.mp3
 */
function wixAudioToUrl(uri: string): { url: string; fileId: string; durationMs: number } | null {
  if (!uri || !uri.startsWith('wix:audio://')) return null

  // Extract file ID from the URI path
  const match = uri.match(/wix:audio:\/\/v1\/(7fee58_[a-f0-9]+\.mp3)/)
  if (!match) return null

  const fileId = match[1].replace('.mp3', '')

  // Skip silence/placeholder files
  if (fileId === SILENCE_FILE_ID || fileId === PLACEHOLDER_FILE_ID) return null

  // Extract duration from fragment
  const durationMatch = uri.match(/#duration=(\d+)/)
  const durationMs = durationMatch ? parseInt(durationMatch[1]) * 1000 : 0

  return {
    url: `https://music.wixstatic.com/mp3/${fileId}.mp3`,
    fileId,
    durationMs,
  }
}

/**
 * Parse credits text like "מילים: פלוני / לחן: אלמוני / עיבוד: שם"
 */
function parseCredits(text?: string): { lyricist?: string; composer?: string; arranger?: string } {
  if (!text) return {}
  const result: { lyricist?: string; composer?: string; arranger?: string } = {}

  // Common Hebrew credit patterns
  const lyricistMatch = text.match(/מילים\s*[:：]\s*([^/\n]+)/)
  const composerMatch = text.match(/לחן\s*[:：]\s*([^/\n]+)/)
  const arrangerMatch = text.match(/עיבוד\s*[:：]\s*([^/\n]+)/)

  if (lyricistMatch) result.lyricist = lyricistMatch[1].trim()
  if (composerMatch) result.composer = composerMatch[1].trim()
  if (arrangerMatch) result.arranger = arrangerMatch[1].trim()

  return result
}

// ---------------------------------------------------------------------------
// Extract songs from warmup data
// ---------------------------------------------------------------------------

function extractSongsFromWarmupData(html: string): ScrapedSong[] {
  // Find the wix-warmup-data script tag content
  const warmupMatch = html.match(/<script[^>]+id="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/)
  if (!warmupMatch) {
    console.error('Could not find wix-warmup-data script tag')
    return []
  }

  let warmupData: any
  try {
    warmupData = JSON.parse(warmupMatch[1])
  } catch (err) {
    console.error('Failed to parse warmup data JSON:', err)
    return []
  }

  // The Repertoire collection data is deeply nested in the warmup data.
  // We search recursively for objects that look like Repertoire items
  // (they have _id, title, and at least one voice part field).
  const repertoireItems: RepertoireItem[] = []

  function findRepertoireItems(obj: any, depth = 0): void {
    if (depth > 15 || !obj || typeof obj !== 'object') return

    // Check if this object looks like a Repertoire item
    if (
      typeof obj._id === 'string' &&
      typeof obj.title === 'string' &&
      (obj.soprano || obj.alto || obj.tenor || obj.bass || obj.mix)
    ) {
      // Verify at least one field is a wix:audio:// URI
      const hasAudio = VOICE_PART_FIELDS.some(
        (f) => typeof obj[f] === 'string' && obj[f].startsWith('wix:audio://')
      )
      if (hasAudio) {
        repertoireItems.push(obj as RepertoireItem)
        return // Don't recurse into this item's children
      }
    }

    // Recurse into arrays and objects
    if (Array.isArray(obj)) {
      for (const item of obj) {
        findRepertoireItems(item, depth + 1)
      }
    } else {
      for (const key of Object.keys(obj)) {
        findRepertoireItems(obj[key], depth + 1)
      }
    }
  }

  findRepertoireItems(warmupData)

  // Deduplicate by _id (same item may appear in multiple places)
  const seen = new Set<string>()
  const unique: RepertoireItem[] = []
  for (const item of repertoireItems) {
    if (!seen.has(item._id)) {
      seen.add(item._id)
      unique.push(item)
    }
  }

  console.log(`Found ${unique.length} unique Repertoire items in warmup data`)

  // Convert to ScrapedSong format
  const songs: ScrapedSong[] = []
  for (const item of unique) {
    if (item.active === false) {
      console.log(`  Skipping inactive song: ${item.title}`)
      continue
    }

    const audioPlayers: ScrapedSong['audioPlayers'] = []

    for (const field of VOICE_PART_FIELDS) {
      const uri = item[field]
      if (!uri) continue
      const parsed = wixAudioToUrl(uri)
      if (!parsed) continue

      audioPlayers.push({
        voicePart: field,
        url: parsed.url,
        durationMs: parsed.durationMs,
      })
    }

    // Also check the generic 'audio' field
    if (item.audio) {
      const parsed = wixAudioToUrl(item.audio)
      if (parsed) {
        audioPlayers.push({
          voicePart: 'full',
          url: parsed.url,
          durationMs: parsed.durationMs,
        })
      }
    }

    if (audioPlayers.length === 0) {
      console.log(`  Skipping song with no audio: ${item.title}`)
      continue
    }

    songs.push({
      title: item.title,
      credits: parseCredits(item.credits),
      audioPlayers,
      milaId: item._id,
    })
  }

  // Sort by priority if available
  songs.sort((a, b) => {
    const aItem = unique.find((i) => i._id === a.milaId)
    const bItem = unique.find((i) => i._id === b.milaId)
    return (aItem?.priority ?? 999) - (bItem?.priority ?? 999)
  })

  return songs
}

// ---------------------------------------------------------------------------
// Download & store
// ---------------------------------------------------------------------------

async function downloadAndCheckAudio(url: string): Promise<{ buffer: Buffer; durationMs: number } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://www.milachoirs.com/',
        'Origin': 'https://www.milachoirs.com',
      },
    })
    if (!response.ok) {
      console.error(`  HTTP ${response.status} for: ${url}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Check duration
    const metadata = await parseBuffer(buffer, { mimeType: 'audio/mpeg' })
    let durationMs = (metadata.format.duration ?? 0) * 1000

    // Fallback: calculate from file size and bitrate for CBR MP3s without duration header
    if (durationMs === 0 && metadata.format.bitrate) {
      durationMs = (buffer.length * 8 / metadata.format.bitrate) * 1000
    }

    // Skip placeholder tracks (<=2 seconds)
    if (durationMs <= 2000) {
      console.log(`  Skipping short track (${Math.round(durationMs)}ms): ${url}`)
      return null
    }

    return { buffer, durationMs }
  } catch (err) {
    console.error(`  Failed to download/parse: ${url}`, err)
    return null
  }
}

async function uploadToS3(buffer: Buffer, songId: string, voicePart: string): Promise<string> {
  const key = `audio/${songId}/${voicePart}-${uuidv4()}.mp3`

  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'audio/mpeg',
  }))

  const region = process.env.AWS_REGION ?? 'eu-west-1'
  return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const report: Report = {
    songsFound: 0,
    songsCreated: 0,
    tracksDownloaded: 0,
    tracksSkipped: 0,
    pdfsProcessed: 0,
    failures: [],
  }

  console.log('Starting MILA scraper...')
  if (DRY_RUN) console.log('DRY RUN — no database or S3 writes')
  if (RESCAN) console.log('RESCAN MODE — only importing new songs not already in DB')
  if (PROCESS_REFS) console.log('PROCESS-REFS — will create reference vocals for tracks without READY references')
  if (CHOIR_ID) console.log(`Attaching songs to choir: ${CHOIR_ID}`)

  let html: string

  if (LOCAL_PATH) {
    // Use saved HTML file
    console.log(`Reading local HTML file: ${LOCAL_PATH}`)
    html = fs.readFileSync(LOCAL_PATH, 'utf-8')
  } else {
    // Fetch from live site via Playwright
    console.log(`Navigating to ${MILA_URL}...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      locale: 'he-IL',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    try {
      await page.goto(MILA_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      console.log('Waiting for page content to render...')
      await page.waitForTimeout(8000)
      html = await page.content()
    } finally {
      await browser.close()
    }
  }

  console.log(`HTML size: ${(html.length / 1024 / 1024).toFixed(1)}MB`)

  // Extract songs from the Wix warmup data
  let songs = extractSongsFromWarmupData(html)
  report.songsFound = songs.length
  console.log(`\nFound ${songs.length} songs\n`)

  // In --rescan mode, filter out songs that already exist
  if (RESCAN && !DRY_RUN) {
    const existingTitles = new Set(
      (await prisma.song.findMany({
        where: { source: 'mila' },
        select: { title: true },
      })).map((s) => s.title)
    )
    const beforeCount = songs.length
    songs = songs.filter((s) => !existingTitles.has(s.title))
    console.log(`Rescan: ${beforeCount - songs.length} already exist, ${songs.length} new songs to import\n`)
  }

  const importedSongIds: string[] = []

  for (const scraped of songs) {
    console.log(`\n--- ${scraped.title} ---`)
    console.log(`  Audio tracks: ${scraped.audioPlayers.map((a) => a.voicePart).join(', ')}`)
    if (scraped.credits.composer) console.log(`  Composer: ${scraped.credits.composer}`)
    if (scraped.credits.lyricist) console.log(`  Lyricist: ${scraped.credits.lyricist}`)
    if (scraped.credits.arranger) console.log(`  Arranger: ${scraped.credits.arranger}`)

    if (DRY_RUN) {
      scraped.audioPlayers.forEach((a) =>
        console.log(`    [${a.voicePart}] ${a.url} (${Math.round(a.durationMs / 1000)}s)`)
      )
      continue
    }

    // Check idempotency: skip if song already exists with this source
    const existing = await prisma.song.findFirst({
      where: { source: 'mila', title: scraped.title },
    })

    if (existing) {
      console.log(`  Already exists (id: ${existing.id}), skipping`)
      continue
    }

    // Create song
    const song = await prisma.song.create({
      data: {
        title: scraped.title,
        composer: scraped.credits.composer ?? null,
        lyricist: scraped.credits.lyricist ?? null,
        arranger: scraped.credits.arranger ?? null,
        source: 'mila',
        language: 'he',
        textDirection: 'rtl',
        choirId: CHOIR_ID,
      },
    })
    report.songsCreated++
    importedSongIds.push(song.id)
    console.log(`  Created song: ${song.id}`)

    // Process audio tracks
    for (const audio of scraped.audioPlayers) {
      console.log(`  Downloading [${audio.voicePart}]...`)

      // Check if this sourceUrl already has a track
      const existingTrack = await prisma.audioTrack.findFirst({
        where: { sourceUrl: audio.url },
      })
      if (existingTrack) {
        console.log(`    Already exists, skipping`)
        report.tracksSkipped++
        continue
      }

      const result = await downloadAndCheckAudio(audio.url)
      if (!result) {
        report.tracksSkipped++
        continue
      }

      try {
        let fileUrl: string

        if (S3_BUCKET) {
          fileUrl = await uploadToS3(result.buffer, song.id, audio.voicePart)
        } else {
          // No S3 configured — store the original MILA URL directly
          fileUrl = audio.url
          console.log(`    No S3 bucket configured, using source URL directly`)
        }

        await prisma.audioTrack.create({
          data: {
            songId: song.id,
            voicePart: audio.voicePart,
            fileUrl,
            sourceUrl: audio.url,
            durationMs: Math.round(result.durationMs),
          },
        })

        report.tracksDownloaded++
        console.log(`    Saved (${Math.round(result.durationMs / 1000)}s)`)
      } catch (err) {
        const msg = `Failed to save ${audio.voicePart} for "${scraped.title}": ${err}`
        report.failures.push(msg)
        console.error(`    ${msg}`)
      }
    }
  }

  // --process-refs: Create ReferenceVocal records for all tracks without READY references
  if (PROCESS_REFS && !DRY_RUN) {
    console.log('\n--- Processing reference vocals ---')

    // Find all audio tracks (optionally scoped to choir)
    const trackFilter: Record<string, unknown> = {}
    if (CHOIR_ID) {
      trackFilter.song = { choirId: CHOIR_ID }
    } else if (importedSongIds.length > 0) {
      trackFilter.songId = { in: importedSongIds }
    }

    const tracks = await prisma.audioTrack.findMany({
      where: trackFilter,
      include: {
        referenceVocals: { where: { status: 'READY' } },
        song: { select: { id: true, title: true } },
      },
    })

    let refsCreated = 0
    const pendingRefs: { id: string; songId: string; voicePart: string; sourceTrackId: string }[] = []

    for (const track of tracks) {
      // Skip if track already has a READY reference
      if (track.referenceVocals.length > 0) continue
      // Skip non-vocal parts
      if (track.voicePart === 'playback' || track.voicePart === 'full') continue

      // Check if there's already a PENDING/PROCESSING reference
      const existingRef = await prisma.referenceVocal.findFirst({
        where: {
          songId: track.songId,
          voicePart: track.voicePart,
          sourceTrackId: track.id,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      })
      if (existingRef) continue

      const ref = await prisma.referenceVocal.create({
        data: {
          songId: track.songId,
          voicePart: track.voicePart,
          sourceTrackId: track.id,
          featuresFileUrl: '',
          durationMs: track.durationMs ?? 0,
          status: 'PENDING',
        },
      })
      pendingRefs.push({ id: ref.id, songId: track.songId, voicePart: track.voicePart, sourceTrackId: track.id })
      refsCreated++
      console.log(`  Created reference: ${track.song.title} [${track.voicePart}]`)
    }

    console.log(`  Created ${refsCreated} reference vocal records`)

    // Fire HTTP requests to vocal service for PENDING references
    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL
    if (vocalServiceUrl && pendingRefs.length > 0) {
      console.log(`  Sending ${pendingRefs.length} references to vocal service...`)
      for (const ref of pendingRefs) {
        try {
          const track = await prisma.audioTrack.findUnique({
            where: { id: ref.sourceTrackId },
            select: { fileUrl: true },
          })
          await fetch(`${vocalServiceUrl}/api/v1/prepare-reference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              referenceVocalId: ref.id,
              songId: ref.songId,
              voicePart: ref.voicePart,
              audioFileUrl: track?.fileUrl,
            }),
          })
          console.log(`    Sent: ${ref.songId} [${ref.voicePart}]`)
        } catch (err) {
          console.error(`    Failed to send reference ${ref.id}:`, err)
        }
      }
    } else if (!vocalServiceUrl) {
      console.log('  No VOCAL_SERVICE_URL configured — references created as PENDING')
    }
  }

  await prisma.$disconnect()

  // Print report
  console.log('\n========================================')
  console.log('SCRAPER REPORT')
  console.log('========================================')
  console.log(`Songs found:       ${report.songsFound}`)
  console.log(`Songs created:     ${report.songsCreated}`)
  console.log(`Tracks downloaded: ${report.tracksDownloaded}`)
  console.log(`Tracks skipped:    ${report.tracksSkipped}`)
  console.log(`PDFs processed:    ${report.pdfsProcessed}`)
  console.log(`Failures:          ${report.failures.length}`)
  if (report.failures.length > 0) {
    report.failures.forEach((f) => console.log(`  - ${f}`))
  }
  console.log('========================================\n')

  // Write JSON report
  const reportPath = path.resolve(__dirname, '..', 'mila-scrape-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`Report saved to: ${reportPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
