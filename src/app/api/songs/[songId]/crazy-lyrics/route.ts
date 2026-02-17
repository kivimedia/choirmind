import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const LANG_NAMES: Record<string, string> = {
  he: 'Hebrew (עברית)',
  en: 'English',
  fr: 'French',
  mixed: 'Hebrew (עברית)',
}

// POST /api/songs/[songId]/crazy-lyrics — generate absurd alternative lyrics
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { songId } = await params
    const userId = session.user.id

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    const vocalServiceUrl = process.env.VOCAL_SERVICE_URL

    // Fetch song with chunks
    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: {
        chunks: {
          orderBy: { order: 'asc' },
          select: { id: true, wordTimestamps: true, lyrics: true },
        },
      },
    })

    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 })
    }

    // Verify access
    if (song.isPersonal) {
      if (song.personalUserId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (song.choirId) {
      const membership = await prisma.choirMember.findUnique({
        where: { userId_choirId: { userId, choirId: song.choirId } },
      })
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Build lines-of-words from word timestamps
    const lines: string[][] = []
    for (const chunk of song.chunks) {
      if (!chunk.wordTimestamps) continue
      const parsed = JSON.parse(chunk.wordTimestamps) as { word: string }[][]
      for (const line of parsed) {
        if (line.length > 0) {
          lines.push(line.map((w) => w.word))
        }
      }
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: 'Song has no word timestamps' }, { status: 400 })
    }

    // Build compact prompt — just word counts per line + original text
    const langName = LANG_NAMES[song.language] ?? LANG_NAMES['he']
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
      // Fast path: call Claude Haiku directly (no Modal roundtrip)
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
        console.error('[crazy-lyrics] Anthropic API error:', err)
        return NextResponse.json({ error: 'AI generation failed' }, { status: 502 })
      }

      const anthropicData = await anthropicRes.json()
      const text = anthropicData.content?.[0]?.text?.trim() ?? ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 })
      }
      result = JSON.parse(jsonMatch[0])
    } else if (vocalServiceUrl) {
      // Fallback: go through vocal service (has its own Anthropic key)
      const res = await fetch(`${vocalServiceUrl}/api/v1/crazy-lyrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, language: song.language }),
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Generation failed' }))
        return NextResponse.json({ error: err.detail || 'Generation failed' }, { status: 502 })
      }
      const data = await res.json()
      result = data.crazy_lines
    } else {
      return NextResponse.json({ error: 'No AI service configured' }, { status: 500 })
    }

    // Validate and fix structure
    const validated: string[][] = []
    for (let i = 0; i < lines.length; i++) {
      const original = lines[i]
      const crazy = result[i]
      if (!crazy || !Array.isArray(crazy)) {
        validated.push(original)
      } else if (crazy.length === original.length) {
        validated.push(crazy.map(String))
      } else if (crazy.length > original.length) {
        validated.push(crazy.slice(0, original.length).map(String))
      } else {
        // Pad with original words
        const padded = crazy.map(String)
        while (padded.length < original.length) {
          padded.push(original[padded.length])
        }
        validated.push(padded)
      }
    }

    return NextResponse.json({ crazyLines: validated })
  } catch (error) {
    console.error('POST /api/songs/[songId]/crazy-lyrics error:', error)
    return NextResponse.json({ error: 'Crazy lyrics generation failed' }, { status: 500 })
  }
}
