/**
 * Retry downloading the 30 audio tracks that failed with 0ms duration.
 * Tries with Referer header and falls back to static.wixstatic.com domain.
 */

import { PrismaClient } from '@prisma/client'
import { parseBuffer } from 'music-metadata'

const prisma = new PrismaClient()

// The 30 rejected tracks: song title → voice part → file ID
const FAILED_TRACKS: { songTitle: string; voicePart: string; fileId: string }[] = [
  // קופסת צבעים
  { songTitle: 'קופסת צבעים', voicePart: 'soprano', fileId: '7fee58_60bf3d1dd2d64ea28a7080431c5336c5' },
  { songTitle: 'קופסת צבעים', voicePart: 'alto', fileId: '7fee58_7c99cd783dee4bdcb4d5171ef21e46e7' },
  { songTitle: 'קופסת צבעים', voicePart: 'tenor', fileId: '7fee58_79c6f9017c7e4fa8a75c487973dc7ade' },
  // מכתב לאחי
  { songTitle: 'מכתב לאחי', voicePart: 'soprano', fileId: '7fee58_2f31573810554f90a9a121fafeb050a5' },
  { songTitle: 'מכתב לאחי', voicePart: 'alto', fileId: '7fee58_dab86301bcad489e8d2436d8e19ab61c' },
  { songTitle: 'מכתב לאחי', voicePart: 'tenor', fileId: '7fee58_d6e59a6a8ddc4582a02f738a7298d7ad' },
  // כוחו של משורר
  { songTitle: 'כוחו של משורר', voicePart: 'soprano', fileId: '7fee58_59d1fcb421a94b26be0e0db09be49079' },
  { songTitle: 'כוחו של משורר', voicePart: 'alto', fileId: '7fee58_be3cb141207048188f79dc59aed985ae' },
  // ירושלים של זהב
  { songTitle: 'ירושלים של זהב', voicePart: 'soprano', fileId: '7fee58_b373d23b62b647ca940ec00b65818052' },
  { songTitle: 'ירושלים של זהב', voicePart: 'alto', fileId: '7fee58_6e0aaa60835940ef8b93cb6c5fe679d6' },
  { songTitle: 'ירושלים של זהב', voicePart: 'tenor', fileId: '7fee58_6e6496f2b0f9472fad43b7cb99fc9f69' },
  { songTitle: 'ירושלים של זהב', voicePart: 'bass', fileId: '7fee58_affb064b3ba0457f8b29349f46180be5' },
  // אם אתה בסביבה
  { songTitle: 'אם אתה בסביבה', voicePart: 'soprano', fileId: '7fee58_bd08ead9b1004bd2ae6b7550d90814af' },
  { songTitle: 'אם אתה בסביבה', voicePart: 'alto', fileId: '7fee58_61f48e89189542de844fde54056a7f7b' },
  { songTitle: 'אם אתה בסביבה', voicePart: 'tenor', fileId: '7fee58_677924813de445fbaa85a5af05e7b74a' },
  { songTitle: 'אם אתה בסביבה', voicePart: 'bass', fileId: '7fee58_97860a25070a4748acd8a8244ea73375' },
  // אל תשטה באהבה
  { songTitle: 'אל תשטה באהבה', voicePart: 'soprano', fileId: '7fee58_b772868cf0b14de39e3d2005e8f751e6' },
  { songTitle: 'אל תשטה באהבה', voicePart: 'alto', fileId: '7fee58_af902ed3ff9544909a79f1d492d16641' },
  { songTitle: 'אל תשטה באהבה', voicePart: 'tenor', fileId: '7fee58_63b84dc732a54cb983f28a9309e8103e' },
  { songTitle: 'אל תשטה באהבה', voicePart: 'bass', fileId: '7fee58_b31c9b766c0c46f389bd368f76177449' },
  // לאחד החיילים
  { songTitle: 'לאחד החיילים', voicePart: 'soprano', fileId: '7fee58_3bd3cd7edff541078005d8e26018d068' },
  { songTitle: 'לאחד החיילים', voicePart: 'alto', fileId: '7fee58_a23f2fca2b0246f7a18728c92bded767' },
  { songTitle: 'לאחד החיילים', voicePart: 'tenor', fileId: '7fee58_3fc49777771a45108787a2d8d43c4335' },
  { songTitle: 'לאחד החיילים', voicePart: 'bass', fileId: '7fee58_74d8862a6a2c4f1ca1f121192dd1cffd' },
  { songTitle: 'לאחד החיילים', voicePart: 'mix', fileId: '7fee58_58c6dcb20e2b4bf8abfeebf098c8f6e2' },
  // אחרי עשרים שנה
  { songTitle: 'אחרי עשרים שנה', voicePart: 'soprano', fileId: '7fee58_3f3b010070a040aaa47bf34d2441a575' },
  { songTitle: 'אחרי עשרים שנה', voicePart: 'alto', fileId: '7fee58_f63b7b160efc4a28ab24b24069ee3b5b' },
  { songTitle: 'אחרי עשרים שנה', voicePart: 'tenor', fileId: '7fee58_2b78e256c0e34b9ca22fad5e40a49942' },
  { songTitle: 'אחרי עשרים שנה', voicePart: 'bass', fileId: '7fee58_dcc7d3ed529643abb28e7056c6328d13' },
  { songTitle: 'אחרי עשרים שנה', voicePart: 'mix', fileId: '7fee58_4107c7fa8f43485fb9c90729fc6fb3d5' },
]

const URL_PATTERNS = [
  (id: string) => `https://music.wixstatic.com/mp3/${id}.mp3`,
  (id: string) => `https://static.wixstatic.com/mp3/${id}.mp3`,
]

const HEADERS_OPTIONS: Record<string, string>[] = [
  {
    'Referer': 'https://www.milachoirs.com/',
    'Origin': 'https://www.milachoirs.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  {}, // bare fetch
]

async function tryDownload(fileId: string): Promise<{ url: string; buffer: Buffer; durationMs: number } | null> {
  for (const makeUrl of URL_PATTERNS) {
    const url = makeUrl(fileId)
    for (const headers of HEADERS_OPTIONS) {
      try {
        const response = await fetch(url, { headers })
        if (!response.ok) continue

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        if (buffer.length < 1000) continue // too small, likely an error page

        const metadata = await parseBuffer(buffer, { mimeType: 'audio/mpeg' })
        let durationMs = (metadata.format.duration ?? 0) * 1000

        // Fallback: calculate from file size and bitrate for CBR MP3s without duration header
        if (durationMs === 0 && metadata.format.bitrate) {
          durationMs = (buffer.length * 8 / metadata.format.bitrate) * 1000
        }

        if (durationMs > 2000) {
          const headerDesc = Object.keys(headers).length > 0 ? Object.keys(headers).join('+') : 'bare'
          console.log(`    OK via ${url.includes('music.') ? 'music' : 'static'} + ${headerDesc} (${Math.round(durationMs / 1000)}s, ${(buffer.length / 1024).toFixed(0)}KB)`)
          return { url, buffer, durationMs }
        }
      } catch {
        // try next combination
      }
    }
  }
  return null
}

async function main() {
  let saved = 0
  let failed = 0

  console.log(`Retrying ${FAILED_TRACKS.length} failed audio tracks...\n`)

  for (const track of FAILED_TRACKS) {
    // Find the song in DB
    const song = await prisma.song.findFirst({
      where: { source: 'mila', title: track.songTitle },
    })

    if (!song) {
      console.log(`  SKIP: Song "${track.songTitle}" not found in DB`)
      failed++
      continue
    }

    // Check if track already exists
    const existing = await prisma.audioTrack.findFirst({
      where: { songId: song.id, voicePart: track.voicePart },
    })
    if (existing) {
      console.log(`  SKIP: ${track.songTitle} [${track.voicePart}] already has a track`)
      continue
    }

    console.log(`  ${track.songTitle} [${track.voicePart}]...`)
    const result = await tryDownload(track.fileId)

    if (!result) {
      console.log(`    FAILED — all download strategies returned empty/short audio`)
      failed++
      continue
    }

    // Save to DB with the working URL
    await prisma.audioTrack.create({
      data: {
        songId: song.id,
        voicePart: track.voicePart,
        fileUrl: result.url,
        sourceUrl: result.url,
        durationMs: Math.round(result.durationMs),
      },
    })
    saved++
  }

  await prisma.$disconnect()

  console.log(`\n========================================`)
  console.log(`RETRY REPORT`)
  console.log(`========================================`)
  console.log(`Total attempted: ${FAILED_TRACKS.length}`)
  console.log(`Saved:           ${saved}`)
  console.log(`Failed:          ${failed}`)
  console.log(`========================================`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
