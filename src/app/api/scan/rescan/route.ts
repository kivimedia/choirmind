import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/scan/rescan — trigger a rescan for a choir
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { choirId } = body

    if (!choirId) {
      return NextResponse.json({ error: 'choirId is required' }, { status: 400 })
    }

    // Verify director access
    const isAdmin = session.user.role === 'admin'
    if (!isAdmin) {
      const membership = await prisma.choirMember.findUnique({
        where: { userId_choirId: { userId: session.user.id, choirId } },
      })
      if (!membership || membership.role !== 'director') {
        return NextResponse.json({ error: 'Director access required' }, { status: 403 })
      }
    }

    // Fetch choir with rescan config
    const choir = await prisma.choir.findUnique({ where: { id: choirId } })
    if (!choir) {
      return NextResponse.json({ error: 'Choir not found' }, { status: 404 })
    }

    // Get rescanUrl from raw SQL since it's a new field
    const rows = await prisma.$queryRawUnsafe<{ rescanUrl: string | null }[]>(
      'SELECT "rescanUrl" FROM "Choir" WHERE id = $1',
      choirId
    )
    const rescanUrl = rows[0]?.rescanUrl
    if (!rescanUrl) {
      return NextResponse.json({ error: 'No rescan URL configured for this choir' }, { status: 400 })
    }

    // Fetch the URL
    console.log(`[rescan] Fetching: ${rescanUrl} for choir ${choirId}`)
    const res = await fetch(rescanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch URL (HTTP ${res.status})` }, { status: 502 })
    }

    const html = await res.text()

    // Use the same Wix parser from scan route
    const scannedSongs = extractSongsFromWixHtml(html)
    const isWix = scannedSongs.length > 0
    const allSongs = isWix ? scannedSongs : extractSongsFromGenericHtml(html, rescanUrl)

    // Fetch existing songs for dedup
    const existingSongs = await prisma.song.findMany({
      where: { choirId },
      select: { title: true },
    })
    const existingTitles = new Set(existingSongs.map((s) => s.title.trim().toLowerCase()))

    // Filter to new songs only
    const newSongs = allSongs.filter((s) => !existingTitles.has(s.title.trim().toLowerCase()))

    console.log(`[rescan] Found ${allSongs.length} total, ${newSongs.length} new songs`)

    // Import new songs
    const imported: string[] = []
    for (const song of newSongs) {
      try {
        const created = await prisma.song.create({
          data: {
            title: song.title,
            composer: song.composer || null,
            lyricist: song.lyricist || null,
            language: 'he',
            choirId,
            source: isWix ? 'mila' : 'scan',
            chunks: {
              create: [{
                label: 'שיר מלא',
                chunkType: 'verse',
                order: 0,
                lyrics: '(טקסט יתווסף מאוחר יותר)',
              }],
            },
          },
        })

        // Create audio tracks
        for (const audio of song.audioFiles) {
          try {
            await prisma.audioTrack.create({
              data: {
                songId: created.id,
                voicePart: audio.voicePart,
                fileUrl: audio.url,
                sourceUrl: audio.url,
                durationMs: audio.durationMs || null,
              },
            })
          } catch {
            // Non-critical
          }
        }

        imported.push(created.id)
      } catch (err) {
        console.error(`[rescan] Failed to import "${song.title}":`, err)
      }
    }

    // Update lastRescanAt
    await prisma.$executeRawUnsafe(
      'UPDATE "Choir" SET "lastRescanAt" = $1 WHERE id = $2',
      new Date(),
      choirId
    )

    // Auto-trigger Demucs reference preparation for new songs
    if (imported.length > 0) {
      try {
        const bulkRes = await fetch(`${process.env.NEXTAUTH_URL || ''}/api/vocal-analysis/references/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: imported }),
        })
        if (bulkRes.ok) {
          const data = await bulkRes.json()
          console.log(`[rescan] Queued ${data.queued} references for processing`)
        }
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json({
      scanned: allSongs.length,
      imported: imported.length,
      importedSongIds: imported,
      source: isWix ? 'wix' : 'generic',
    })
  } catch (error) {
    console.error('POST /api/scan/rescan error:', error)
    return NextResponse.json({ error: 'Rescan failed' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Parsers (duplicated from scan/route.ts to avoid circular imports)
// ---------------------------------------------------------------------------

interface ScannedSong {
  title: string
  composer?: string
  lyricist?: string
  arranger?: string
  audioFiles: { voicePart: string; url: string; durationMs?: number }[]
}

function wixAudioToUrl(uri: string): { url: string; durationMs: number } | null {
  if (!uri || !uri.startsWith('wix:audio://')) return null
  const match = uri.match(/wix:audio:\/\/v1\/(7fee58_[a-f0-9]+\.mp3)/)
  if (!match) return null
  const fileId = match[1].replace('.mp3', '')
  if (fileId === '7fee58_7102f0c610934d27b103483f2d2320bd') return null
  if (fileId === '7fee58_fffea4a62b2c46c389d2ac8982d8b878') return null
  const durationMatch = uri.match(/#duration=(\d+)/)
  const durationMs = durationMatch ? parseInt(durationMatch[1]) * 1000 : 0
  return { url: `https://music.wixstatic.com/mp3/${fileId}.mp3`, durationMs }
}

function parseCredits(text?: string): { lyricist?: string; composer?: string; arranger?: string } {
  if (!text) return {}
  const result: { lyricist?: string; composer?: string; arranger?: string } = {}
  const lyricistMatch = text.match(/מילים\s*[:：]\s*([^/\n]+)/)
  const composerMatch = text.match(/לחן\s*[:：]\s*([^/\n]+)/)
  const arrangerMatch = text.match(/עיבוד\s*[:：]\s*([^/\n]+)/)
  if (lyricistMatch) result.lyricist = lyricistMatch[1].trim()
  if (composerMatch) result.composer = composerMatch[1].trim()
  if (arrangerMatch) result.arranger = arrangerMatch[1].trim()
  return result
}

const VOICE_PART_FIELDS = ['soprano', 'alto', 'tenor', 'bass', 'mix', 'playback'] as const

function extractSongsFromWixHtml(html: string): ScannedSong[] {
  const warmupMatch = html.match(/<script[^>]+id="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/)
  if (!warmupMatch) return []

  let warmupData: unknown
  try { warmupData = JSON.parse(warmupMatch[1]) } catch { return [] }

  interface RepertoireItem {
    _id: string; title: string; credits?: string; active?: boolean
    soprano?: string; alto?: string; tenor?: string; bass?: string; mix?: string; playback?: string; audio?: string
  }

  const items: RepertoireItem[] = []

  function find(obj: unknown, depth = 0): void {
    if (depth > 15 || !obj || typeof obj !== 'object') return
    const o = obj as Record<string, unknown>
    if (typeof o._id === 'string' && typeof o.title === 'string' &&
      (o.soprano || o.alto || o.tenor || o.bass || o.mix)) {
      const hasAudio = VOICE_PART_FIELDS.some(
        (f) => typeof o[f] === 'string' && (o[f] as string).startsWith('wix:audio://')
      )
      if (hasAudio) { items.push(o as unknown as RepertoireItem); return }
    }
    if (Array.isArray(obj)) { for (const item of obj) find(item, depth + 1) }
    else { for (const key of Object.keys(o)) find(o[key], depth + 1) }
  }
  find(warmupData)

  const seen = new Set<string>()
  const songs: ScannedSong[] = []
  for (const item of items) {
    if (seen.has(item._id) || item.active === false) continue
    seen.add(item._id)

    const audioFiles: ScannedSong['audioFiles'] = []
    for (const field of VOICE_PART_FIELDS) {
      const uri = item[field]
      if (!uri) continue
      const parsed = wixAudioToUrl(uri)
      if (parsed) audioFiles.push({ voicePart: field, url: parsed.url, durationMs: parsed.durationMs })
    }
    if (item.audio) {
      const parsed = wixAudioToUrl(item.audio)
      if (parsed) audioFiles.push({ voicePart: 'full', url: parsed.url, durationMs: parsed.durationMs })
    }
    if (audioFiles.length === 0) continue

    const credits = parseCredits(item.credits)
    songs.push({
      title: item.title,
      composer: credits.composer,
      lyricist: credits.lyricist,
      arranger: credits.arranger,
      audioFiles,
    })
  }
  return songs
}

function extractSongsFromGenericHtml(html: string, baseUrl: string): ScannedSong[] {
  const songs: ScannedSong[] = []
  const mp3Regex = /(?:href|src)=["']([^"']*\.mp3(?:\?[^"']*)?)["']/gi
  const mp3Urls = new Set<string>()
  let match
  while ((match = mp3Regex.exec(html)) !== null) {
    let url = match[1]
    if (url.startsWith('//')) url = 'https:' + url
    else if (url.startsWith('/')) {
      try { url = new URL(url, baseUrl).href } catch { continue }
    }
    if (url.startsWith('http')) mp3Urls.add(url)
  }

  const wixAudioRegex = /wix:audio:\/\/v1\/[a-f0-9_]+\.mp3[^"']*/g
  while ((match = wixAudioRegex.exec(html)) !== null) {
    const parsed = wixAudioToUrl(match[0])
    if (parsed) mp3Urls.add(parsed.url)
  }

  if (mp3Urls.size === 0) return songs

  const voicePartPattern = /(?:[-_\s])(soprano|alto|mezzo|tenor|baritone|bass|mix|playback|full)(?:[-_.\s]|$)/i
  const grouped = new Map<string, ScannedSong['audioFiles']>()

  for (const url of mp3Urls) {
    const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '')
    const vpMatch = filename.match(voicePartPattern)
    const voicePart = vpMatch ? vpMatch[1].toLowerCase() : 'full'
    let title = filename
      .replace(/\.mp3$/i, '')
      .replace(voicePartPattern, '')
      .replace(/[-_]+/g, ' ')
      .trim()
    if (!title) title = 'שיר ללא שם'
    if (!grouped.has(title)) grouped.set(title, [])
    grouped.get(title)!.push({ voicePart, url })
  }

  for (const [title, audioFiles] of grouped) {
    songs.push({ title, audioFiles })
  }
  return songs
}
