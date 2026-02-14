import { unstable_cache, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/db'

type CachedSong = {
  id: string
  title: string
  composer: string | null
  lyricist: string | null
  language: string
  youtubeVideoId: string | null
  spotifyTrackId: string | null
  createdAt: Date
  audioTracks: { id: string; voicePart: string }[]
  chunkCount: number
  hasLyrics: boolean
  allSynced: boolean
  hasUnsynced: boolean
  stemsCount: number
}

async function fetchSongs(
  choirIds: string[],
  filterChoirId: string | null,
  userId: string,
  showArchived: boolean
): Promise<CachedSong[]> {
  const orConditions: Record<string, unknown>[] = []
  if (filterChoirId) {
    if (choirIds.includes(filterChoirId)) {
      orConditions.push({ choirId: filterChoirId })
    }
    orConditions.push({ isPersonal: true, personalUserId: userId })
  } else {
    orConditions.push({ choirId: { in: choirIds } })
    orConditions.push({ isPersonal: true, personalUserId: userId })
  }

  const songs = await prisma.song.findMany({
    where: {
      OR: orConditions,
      archivedAt: showArchived ? { not: null } : null,
    },
    include: {
      chunks: {
        orderBy: { order: 'asc' as const },
        select: { id: true, lyrics: true, lineTimestamps: true },
      },
      audioTracks: {
        select: { id: true, voicePart: true },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  })

  // Count stems per song via raw SQL (more reliable than Prisma include with where)
  const songIds = songs.map((s) => s.id)
  let stemMap = new Map<string, number>()
  if (songIds.length > 0) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ songId: string; cnt: bigint }[]>(
        `SELECT "songId", COUNT(*) as cnt
         FROM "ReferenceVocal"
         WHERE "songId" = ANY($1::text[])
           AND status = 'READY'
           AND "isolatedFileUrl" != ''
         GROUP BY "songId"`,
        songIds
      )
      stemMap = new Map(rows.map((r) => [r.songId, Number(r.cnt)]))
    } catch (e) {
      console.error('[songs-cache] stems count query failed:', e)
    }
  }

  return songs.map((song) => ({
    id: song.id,
    title: song.title,
    composer: song.composer,
    lyricist: song.lyricist,
    language: song.language,
    youtubeVideoId: song.youtubeVideoId,
    spotifyTrackId: song.spotifyTrackId,
    createdAt: song.createdAt,
    audioTracks: song.audioTracks,
    chunkCount: song.chunks.length,
    hasLyrics: song.chunks.some((c) => c.lyrics?.trim()),
    allSynced: song.chunks.length > 0 && song.chunks.every((c) => c.lineTimestamps),
    hasUnsynced: song.chunks.some((c) => c.lyrics?.trim() && !c.lineTimestamps),
    stemsCount: stemMap.get(song.id) ?? 0,
  }))
}

export function getCachedSongs(
  choirIds: string[],
  filterChoirId: string | null,
  userId: string,
  showArchived: boolean
) {
  return unstable_cache(
    () => fetchSongs(choirIds, filterChoirId, userId, showArchived),
    ['songs-v3', userId, choirIds.sort().join(','), filterChoirId ?? '', String(showArchived)],
    { tags: ['songs-v3'] }
  )()
}

export function invalidateSongsCache() {
  revalidateTag('songs-v3', 'max')
}
