import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface LyricsResult {
  source: string
  title: string
  artist: string
  lyrics: string
}

// GET /api/lyrics-search?q=song+title&composer=artist&lang=he
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const query = request.nextUrl.searchParams.get('q')?.trim()
    const composer = request.nextUrl.searchParams.get('composer')?.trim() || ''
    const lang = request.nextUrl.searchParams.get('lang') || 'he'

    if (!query) {
      return NextResponse.json({ error: 'Missing search query' }, { status: 400 })
    }

    const results: LyricsResult[] = []

    // Source 1: Internal database
    try {
      const dbResults = await searchInternalDb(query, composer)
      results.push(...dbResults)
    } catch (e) {
      console.error('[lyrics-search] Internal DB error:', e)
    }

    // Source 2: Genius (API-based — works reliably from cloud IPs)
    try {
      const geniusResults = await searchGenius(query)
      results.push(...geniusResults)
    } catch (e) {
      console.error('[lyrics-search] Genius error:', e)
    }

    // Source 3: LRCLIB (free, no API key needed) — good for international songs
    try {
      const lrcResults = await searchLrclib(query, composer)
      results.push(...lrcResults)
    } catch (e) {
      console.error('[lyrics-search] LRCLIB error:', e)
    }

    // Source 4: Shironet (Hebrew lyrics — search + scrape)
    if (lang === 'he' || lang === 'mixed') {
      try {
        const shironetResults = await searchShironet(query)
        results.push(...shironetResults)
      } catch (e) {
        console.error('[lyrics-search] Shironet error:', e)
      }
    }

    // Source 5: Tab4U (Hebrew lyrics — search + scrape)
    if (lang === 'he' || lang === 'mixed') {
      try {
        const tab4uResults = await searchTab4u(query)
        results.push(...tab4uResults)
      } catch (e) {
        console.error('[lyrics-search] Tab4U error:', e)
      }
    }

    // Deduplicate by lyrics content similarity
    const unique = deduplicateResults(results)

    // Build fallback search links for the user (always provide these)
    const searchLinks = buildSearchLinks(query, composer, lang)

    return NextResponse.json({
      results: unique.slice(0, 3),
      searchLinks,
    })
  } catch (error) {
    console.error('GET /api/lyrics-search error:', error)
    return NextResponse.json(
      { error: 'Failed to search lyrics' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Internal DB search
// ---------------------------------------------------------------------------

async function searchInternalDb(title: string, composer: string): Promise<LyricsResult[]> {
  const normalized = normalizeTitle(title)

  const songs = await prisma.song.findMany({
    where: { archivedAt: null },
    include: {
      chunks: {
        orderBy: { order: 'asc' },
        select: { lyrics: true, label: true },
      },
    },
    take: 50,
  })

  const matches: LyricsResult[] = []

  for (const song of songs) {
    const songNormalized = normalizeTitle(song.title)
    if (songNormalized !== normalized) continue

    const totalLyrics = song.chunks.reduce((sum, c) => sum + (c.lyrics?.trim().length ?? 0), 0)
    if (totalLyrics < 10) continue

    const fullLyrics = song.chunks
      .map((c) => {
        const label = c.label ? `${c.label}\n` : ''
        return label + (c.lyrics || '')
      })
      .join('\n\n')

    matches.push({
      source: 'ChoirMind DB',
      title: song.title,
      artist: song.composer || '',
      lyrics: fullLyrics,
    })
  }

  return matches.slice(0, 1)
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[^\w\u0590-\u05FF\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Genius (API search + page scrape — most reliable from cloud IPs)
// ---------------------------------------------------------------------------

async function searchGenius(query: string): Promise<LyricsResult[]> {
  // Step 1: Search via Genius API (no auth needed for basic search)
  const searchUrl = `https://genius.com/api/search?q=${encodeURIComponent(query)}`

  const searchRes = await fetch(searchUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!searchRes.ok) return []

  const searchData = await searchRes.json()
  const hits: Array<{
    type: string
    result: {
      title: string
      url: string
      lyrics_state: string
      primary_artist?: { name: string }
    }
  }> = searchData?.response?.hits || []

  // Find the first song hit with complete lyrics
  const songHit = hits.find(
    (h) => h.type === 'song' && h.result?.lyrics_state === 'complete' && h.result?.url,
  )

  if (!songHit) return []

  // Step 2: Fetch the song page and extract lyrics
  const pageRes = await fetch(songHit.result.url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!pageRes.ok) return []
  const html = await pageRes.text()

  // Genius stores lyrics in <div data-lyrics-container="true"> elements
  const containerPattern = /data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi
  const blocks: string[] = []
  let match: RegExpExecArray | null
  while ((match = containerPattern.exec(html)) !== null) {
    const text = match[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (text.length > 0) {
      blocks.push(decodeHtmlEntities(text))
    }
  }

  if (blocks.length === 0) return []

  // Convert [Verse 1], [Chorus] etc. to Hebrew labels for chunk auto-detection
  const rawLyrics = blocks.join('\n\n')
  const cleanedLyrics = rawLyrics
    .replace(/\[Verse\s*(\d*)\]/gi, (_, n) => `בית${n ? ` ${n}` : ''}`)
    .replace(/\[Chorus\s*\d*\]/gi, 'פזמון')
    .replace(/\[Bridge\s*\d*\]/gi, 'גשר')
    .replace(/\[Intro\]/gi, 'פתיחה')
    .replace(/\[Outro\]/gi, 'סיום')
    .replace(/\[Pre-Chorus\s*\d*\]/gi, 'מעבר')
    .replace(/\[Post-Chorus\s*\d*\]/gi, '')
    .replace(/\[.*?\]\n?/g, '') // remove any remaining section headers
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return [{
    source: 'Genius',
    title: songHit.result.title,
    artist: songHit.result.primary_artist?.name || '',
    lyrics: cleanedLyrics,
  }]
}

// ---------------------------------------------------------------------------
// Shironet scraping
// ---------------------------------------------------------------------------

async function searchShironet(title: string): Promise<LyricsResult[]> {
  const searchUrl = `https://shironet.mako.co.il/search?q=${encodeURIComponent(title)}&type=songs`

  const searchRes = await fetch(searchUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'he,en-US;q=0.9',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!searchRes.ok) return []
  const html = await searchRes.text()

  // Check for CAPTCHA
  if (html.includes('captcha') || html.includes('CAPTCHA')) return []

  // Find song links: /artist?type=lyrics&lang=1&prfid=XXX&wrkid=YYY
  const linkPattern = /href="(\/artist\?type=lyrics&lang=1&prfid=\d+&wrkid=\d+)"/g
  const links: string[] = []
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(html)) !== null) {
    links.push(match[1])
  }

  if (links.length === 0) return []

  // Fetch lyrics from the first result
  const lyricsUrl = `https://shironet.mako.co.il${links[0]}`
  const lyricsRes = await fetch(lyricsUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'he,en-US;q=0.9',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!lyricsRes.ok) return []
  const lyricsHtml = await lyricsRes.text()

  // Extract song title from page
  const titleMatch = lyricsHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const pageTitle = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
    : title

  // Extract artist
  const artistMatch = lyricsHtml.match(/class="[^"]*artist_name[^"]*"[^>]*>([\s\S]*?)<\//)
  const artist = artistMatch
    ? artistMatch[1].replace(/<[^>]+>/g, '').trim()
    : ''

  // Extract lyrics from artist_lyrics_text elements
  const lyricsPattern = /class="[^"]*artist_lyrics_text[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p|td)/gi
  const blocks: string[] = []
  let lyricsMatch: RegExpExecArray | null
  while ((lyricsMatch = lyricsPattern.exec(lyricsHtml)) !== null) {
    const text = lyricsMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (text.length > 0) {
      blocks.push(decodeHtmlEntities(text))
    }
  }

  if (blocks.length === 0) return []

  return [{
    source: 'Shironet',
    title: decodeHtmlEntities(pageTitle),
    artist: decodeHtmlEntities(artist),
    lyrics: blocks.join('\n\n'),
  }]
}

// ---------------------------------------------------------------------------
// Tab4U scraping
// ---------------------------------------------------------------------------

async function searchTab4u(title: string): Promise<LyricsResult[]> {
  const searchUrl = `https://www.tab4u.com/resultsSimple?tab=songs&q=${encodeURIComponent(title)}`

  const searchRes = await fetch(searchUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'he,en-US;q=0.9',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!searchRes.ok) return []
  const html = await searchRes.text()

  if (html.includes('captcha') || html.includes('CAPTCHA')) return []

  // Find song page links: tabs/songs/NNNN_....html (may or may not have leading slash)
  const linkPattern = /href="(\/?tabs\/songs\/\d+[^"]*\.html)"/g
  const links: string[] = []
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(html)) !== null) {
    const path = match[1].startsWith('/') ? match[1] : `/${match[1]}`
    if (!links.includes(path)) links.push(path)
  }

  if (links.length === 0) return []

  // Use the lyrics-only page (plain HTML, no JavaScript rendering needed)
  const lyricsPath = links[0].replace('/tabs/songs/', '/lyrics/songs/')
  const songUrl = `https://www.tab4u.com${lyricsPath}`
  const songRes = await fetch(songUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'he,en-US;q=0.9',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!songRes.ok) return []
  const songHtml = await songRes.text()

  // Extract title — Tab4U uses "מילים לשיר <title> של <artist>"
  const titleMatch = songHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  let pageTitle = title
  let artist = ''
  if (titleMatch) {
    const rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim()
    // Strip "מילים לשיר" prefix and "של <artist>" suffix
    const cleaned = rawTitle
      .replace(/^מילים לשיר\s*/, '')
      .replace(/\s*של\s+\S+.*$/, '')
      .trim()
    if (cleaned) pageTitle = cleaned
  }
  // Extract artist from the artistTitle link inside h1
  const artistMatch = songHtml.match(/class=['"][^'"]*artistTitle[^'"]*['"][^>]*>([^<]+)</i)
  if (artistMatch) {
    artist = artistMatch[1].trim()
  }

  // Extract lyrics from the songContentTPL div (lyrics-only page)
  // Each <table> represents a section/verse
  const contentMatch = songHtml.match(/id="songContentTPL"[^>]*>([\s\S]*?)<\/div>/i)
  if (!contentMatch) return []

  // Split content by tables — each table is a section
  const tables = contentMatch[1].split(/<\/table>/i).filter((t) => t.includes('song_only'))
  const sections: string[] = []

  for (const table of tables) {
    const cellPattern = /class="song_only"[^>]*>([\s\S]*?)<\/td>/gi
    const lines: string[] = []
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellPattern.exec(table)) !== null) {
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text.length > 0) {
        lines.push(decodeHtmlEntities(text))
      }
    }
    if (lines.length > 0) {
      sections.push(lines.join('\n'))
    }
  }

  const lyrics = sections.join('\n\n')

  if (lyrics.trim().length < 10) return []

  return [{
    source: 'Tab4U',
    title: decodeHtmlEntities(pageTitle),
    artist: decodeHtmlEntities(artist),
    lyrics: lyrics.trim(),
  }]
}

// ---------------------------------------------------------------------------
// LRCLIB search (free, no API key)
// ---------------------------------------------------------------------------

async function searchLrclib(title: string, artist: string): Promise<LyricsResult[]> {
  // Try multiple search strategies for better hit rate
  const queries: string[] = []

  // Strategy 1: title + artist (most specific)
  if (artist) queries.push(`${title} ${artist}`)
  // Strategy 2: just the title
  queries.push(title)

  for (const searchQuery of queries) {
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'ChoirMind/1.0 (https://choirmind.app)',
        },
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) continue

      const data: Array<{
        trackName: string
        artistName: string
        plainLyrics: string | null
        syncedLyrics: string | null
      }> = await res.json()

      const results: LyricsResult[] = []

      for (const item of data.slice(0, 3)) {
        const lyrics = item.plainLyrics || stripSyncedLyrics(item.syncedLyrics)
        if (!lyrics || lyrics.trim().length < 10) continue

        results.push({
          source: 'LRCLIB',
          title: item.trackName,
          artist: item.artistName,
          lyrics: lyrics.trim(),
        })
      }

      if (results.length > 0) return results
    } catch {
      // Try next strategy
    }
  }

  return []
}

function stripSyncedLyrics(synced: string | null): string {
  if (!synced) return ''
  return synced
    .replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  result = result.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10)),
  )
  return result
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicateResults(results: LyricsResult[]): LyricsResult[] {
  const seen = new Set<string>()
  const unique: LyricsResult[] = []

  for (const r of results) {
    const fingerprint = r.lyrics
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200)
      .toLowerCase()

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint)
      unique.push(r)
    }
  }

  return unique
}

// ---------------------------------------------------------------------------
// Fallback search links
// ---------------------------------------------------------------------------

function buildSearchLinks(title: string, composer: string, lang: string) {
  const query = [title, composer].filter(Boolean).join(' ')
  const hebrewSuffix = lang === 'he' ? ' מילים לשיר' : ' lyrics'

  return [
    {
      label: 'Google',
      url: `https://www.google.com/search?q=${encodeURIComponent(query + hebrewSuffix)}`,
    },
    ...(lang === 'he'
      ? [
          {
            label: 'Shironet',
            url: `https://shironet.mako.co.il/search?q=${encodeURIComponent(query)}`,
          },
          {
            label: 'Tab4U',
            url: `https://www.tab4u.com/resultsSearch?tab=songs&q=${encodeURIComponent(query)}`,
          },
        ]
      : []),
    {
      label: 'Genius',
      url: `https://genius.com/search?q=${encodeURIComponent(query)}`,
    },
  ]
}
