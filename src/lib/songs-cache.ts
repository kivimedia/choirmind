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
      _count: {
        select: {
          referenceVocals: { where: { status: 'READY' } },
        },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  })

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
    stemsCount: (song as any)._count?.referenceVocals ?? 0,
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
    ['songs', userId, choirIds.sort().join(','), filterChoirId ?? '', String(showArchived)],
    { tags: ['songs'] }
  )()
}

export function invalidateSongsCache() {
  revalidateTag('songs', 'max')
}
