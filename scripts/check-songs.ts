import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const songs = await prisma.song.findMany({
    select: { id: true, title: true, source: true, choirId: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Total songs in DB: ${songs.length}`)
  console.log()

  const milaSongs = songs.filter(s => s.source === 'mila')
  const otherSongs = songs.filter(s => s.source !== 'mila')

  console.log(`MILA songs: ${milaSongs.length}`)
  milaSongs.forEach((s, i) => console.log(`  ${i + 1}. ${s.title} (choir: ${s.choirId ?? 'none'})`))

  console.log(`\nOther songs: ${otherSongs.length}`)
  otherSongs.forEach((s, i) => console.log(`  ${i + 1}. [${s.source ?? 'manual'}] ${s.title} (choir: ${s.choirId ?? 'none'})`))

  // Check audio track counts
  const tracksPerSong = await prisma.audioTrack.groupBy({
    by: ['songId'],
    _count: true,
  })
  const trackMap = new Map(tracksPerSong.map(t => [t.songId, t._count]))

  const milaSongsWithTracks = milaSongs.filter(s => (trackMap.get(s.id) ?? 0) > 0)
  const milaSongsWithoutTracks = milaSongs.filter(s => (trackMap.get(s.id) ?? 0) === 0)

  console.log(`\nMILA songs with audio tracks: ${milaSongsWithTracks.length}`)
  console.log(`MILA songs WITHOUT audio tracks: ${milaSongsWithoutTracks.length}`)
  if (milaSongsWithoutTracks.length > 0) {
    milaSongsWithoutTracks.forEach(s => console.log(`  - ${s.title}`))
  }

  await prisma.$disconnect()
}

main()
