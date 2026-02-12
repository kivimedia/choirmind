import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScannedSong {
  title: string
  composer?: string
  lyricist?: string
  arranger?: string
  audioFiles: { voicePart: string; url: string; durationMs?: number }[]
}

// ---------------------------------------------------------------------------
// Wix audio URI parsing (reused from scrape-mila)
// ---------------------------------------------------------------------------

function wixAudioToUrl(uri: string): { url: string; durationMs: number } | null {
  if (!uri || !uri.startsWith('wix:audio://')) return null
  const match = uri.match(/wix:audio:\/\/v1\/(7fee58_[a-f0-9]+\.mp3)/)
  if (!match) return null
  const fileId = match[1].replace('.mp3', '')
  // Skip known silence/placeholder files
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

// ---------------------------------------------------------------------------
// Wix site parser
// ---------------------------------------------------------------------------

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

  // Deduplicate
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

// ---------------------------------------------------------------------------
// Generic HTML parser for MP3 links
// ---------------------------------------------------------------------------

function extractSongsFromGenericHtml(html: string, baseUrl: string): ScannedSong[] {
  const songs: ScannedSong[] = []

  // Find all MP3 links in the page
  const mp3Regex = /(?:href|src)=["']([^"']*\.mp3(?:\?[^"']*)?)["']/gi
  const mp3Urls = new Set<string>()
  let match
  while ((match = mp3Regex.exec(html)) !== null) {
    let url = match[1]
    // Make absolute
    if (url.startsWith('//')) url = 'https:' + url
    else if (url.startsWith('/')) {
      try { url = new URL(url, baseUrl).href } catch { continue }
    }
    if (url.startsWith('http')) mp3Urls.add(url)
  }

  // Also search for wix:audio URIs
  const wixAudioRegex = /wix:audio:\/\/v1\/[a-f0-9_]+\.mp3[^"']*/g
  while ((match = wixAudioRegex.exec(html)) !== null) {
    const parsed = wixAudioToUrl(match[0])
    if (parsed) mp3Urls.add(parsed.url)
  }

  if (mp3Urls.size === 0) return songs

  // Try to group MP3s by song title
  // Look for patterns like "song-title-soprano.mp3", "song-title-alto.mp3"
  const voicePartPattern = /(?:[-_\s])(soprano|alto|mezzo|tenor|baritone|bass|mix|playback|full)(?:[-_.\s]|$)/i
  const grouped = new Map<string, ScannedSong['audioFiles']>()

  for (const url of mp3Urls) {
    const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '')
    const vpMatch = filename.match(voicePartPattern)
    const voicePart = vpMatch ? vpMatch[1].toLowerCase() : 'full'

    // Derive a title from the filename by removing voice part and extension
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

// ---------------------------------------------------------------------------
// POST /api/scan — scan a URL for songs
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { url, choirId } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Verify user is director of this choir (or admin)
    if (choirId) {
      const isAdmin = session.user.role === 'admin'
      if (!isAdmin) {
        const membership = await prisma.choirMember.findUnique({
          where: { userId_choirId: { userId: session.user.id, choirId } },
        })
        if (!membership || membership.role !== 'director') {
          return NextResponse.json({ error: 'Director access required' }, { status: 403 })
        }
      }
    }

    // Fetch the URL
    console.log(`[scan] Fetching: ${url}`)
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL (HTTP ${res.status})` },
        { status: 502 }
      )
    }

    const html = await res.text()
    console.log(`[scan] HTML size: ${(html.length / 1024).toFixed(0)}KB`)

    // Try Wix parser first
    let songs = extractSongsFromWixHtml(html)
    const isWix = songs.length > 0

    // Fall back to generic MP3 link extraction
    if (songs.length === 0) {
      songs = extractSongsFromGenericHtml(html, url)
    }

    console.log(`[scan] Found ${songs.length} songs (${isWix ? 'Wix' : 'generic'})`)

    return NextResponse.json({
      songs,
      source: isWix ? 'wix' : 'generic',
      count: songs.length,
    })
  } catch (error) {
    console.error('POST /api/scan error:', error)
    return NextResponse.json(
      { error: 'Failed to scan URL' },
      { status: 500 }
    )
  }
}
