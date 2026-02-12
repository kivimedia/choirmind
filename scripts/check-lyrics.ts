/**
 * Check which songs have metadata but no lyrics (empty chunks).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const songs = await prisma.song.findMany({
    where: { archivedAt: null },
    include: {
      chunks: { select: { id: true, lyrics: true } },
    },
    orderBy: { title: 'asc' },
  })

  const needLyrics: typeof songs = []
  const haveLyrics: typeof songs = []

  for (const song of songs) {
    const totalLyricsLength = song.chunks.reduce((sum, c) => sum + (c.lyrics?.trim().length ?? 0), 0)
    if (totalLyricsLength < 10) {
      needLyrics.push(song)
    } else {
      haveLyrics.push(song)
    }
  }

  console.log(`\n=== Songs WITH lyrics (${haveLyrics.length}) ===`)
  for (const s of haveLyrics) {
    const chars = s.chunks.reduce((sum, c) => sum + (c.lyrics?.trim().length ?? 0), 0)
    console.log(`  ✓ ${s.title} (${s.chunks.length} chunks, ${chars} chars)`)
  }

  console.log(`\n=== Songs NEEDING lyrics (${needLyrics.length}) ===`)
  for (const s of needLyrics) {
    const meta = [
      s.composer && `composer: ${s.composer}`,
      s.lyricist && `lyricist: ${s.lyricist}`,
    ].filter(Boolean).join(', ')
    console.log(`  ✗ ${s.title}${meta ? ` (${meta})` : ' (no metadata)'}`)
  }

  console.log(`\nTotal: ${songs.length} songs, ${haveLyrics.length} have lyrics, ${needLyrics.length} need lyrics`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
