'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import ProgressBar from '@/components/ui/ProgressBar'
import Modal from '@/components/ui/Modal'
import AudioPlayer from '@/components/audio/AudioPlayer'
import type { AudioTrackData, VoicePart } from '@/lib/audio/types'

interface Chunk {
  id: string
  label: string
  chunkType: string
  lyrics: string
  order: number
  memoryStatus?: string
  lineTimestamps?: string | null
}

interface AudioTrack {
  id: string
  voicePart: string
  fileUrl: string
}

interface Song {
  id: string
  title: string
  composer: string | null
  lyricist: string | null
  arranger: string | null
  language: string
  textDirection: string
  chunks: Chunk[]
  audioTracks?: AudioTrack[]
  source?: string | null
  readiness?: number
  isPersonal: boolean
  personalUserId: string | null
  choirId: string | null
  spotifyTrackId?: string | null
  spotifyEmbed?: string | null
  youtubeVideoId?: string | null
}

type MemoryStatusVariant = 'fragile' | 'shaky' | 'developing' | 'solid' | 'locked' | 'default'

function getStatusBadgeVariant(status?: string): MemoryStatusVariant {
  switch (status) {
    case 'fragile':
      return 'fragile'
    case 'shaky':
      return 'shaky'
    case 'developing':
      return 'developing'
    case 'solid':
      return 'solid'
    case 'locked':
      return 'locked'
    default:
      return 'default'
  }
}

export default function SongDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const t = useTranslations('songs')
  const tStatus = useTranslations('status')
  const tChunks = useTranslations('chunks')
  const tPractice = useTranslations('practice')
  const tGames = useTranslations('games')
  const tCommon = useTranslations('common')
  const tAudio = useTranslations('audio')
  const tVoiceParts = useTranslations('voiceParts')

  const songId = params.songId as string

  const [song, setSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [archiveModalOpen, setArchiveModalOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const isDirector = session?.user?.role === 'director'

  useEffect(() => {
    async function fetchSong() {
      try {
        const res = await fetch(`/api/songs/${songId}`)
        if (!res.ok) {
          if (res.status === 404) throw new Error('שיר לא נמצא')
          throw new Error('שגיאה בטעינת השיר')
        }
        const data = await res.json()
        setSong(data.song)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : tCommon('error'))
      } finally {
        setLoading(false)
      }
    }
    if (songId) fetchSong()
  }, [songId, tCommon])

  async function handleArchive() {
    setArchiving(true)
    try {
      const res = await fetch(`/api/songs/${songId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to archive')
      }
      router.push('/songs')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon('error'))
      setArchiveModalOpen(false)
    } finally {
      setArchiving(false)
    }
  }

  function getChunkTypeLabel(chunkType: string): string {
    switch (chunkType) {
      case 'verse':
        return tChunks('verse')
      case 'chorus':
        return tChunks('chorus')
      case 'bridge':
        return tChunks('bridge')
      case 'intro':
        return tChunks('intro')
      case 'outro':
        return tChunks('outro')
      case 'transition':
        return tChunks('transition')
      case 'coda':
        return tChunks('coda')
      default:
        return tChunks('custom')
    }
  }

  function getStatusLabel(status?: string): string {
    switch (status) {
      case 'fragile':
        return tStatus('fragile')
      case 'shaky':
        return tStatus('shaky')
      case 'developing':
        return tStatus('developing')
      case 'solid':
        return tStatus('solid')
      case 'locked':
        return tStatus('lockedIn')
      default:
        return '\u2014'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !song) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="mb-4 text-lg text-danger">{error || tCommon('error')}</p>
        <Button variant="outline" onClick={() => router.push('/songs')}>
          {tCommon('back')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.push('/songs')}
            className="mt-1 rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <svg
              className="h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              {song.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-muted">
              {song.composer && (
                <span>
                  {t('composer')}: {song.composer}
                </span>
              )}
              {song.composer && song.lyricist && (
                <span className="text-border">|</span>
              )}
              {song.lyricist && (
                <span>
                  {t('lyricist')}: {song.lyricist}
                </span>
              )}
              {song.arranger && (
                <>
                  <span className="text-border">|</span>
                  <span>
                    {t('arranger')}: {song.arranger}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/songs/${songId}/edit`)}
          >
            {t('edit')}
          </Button>
          {isDirector && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setArchiveModalOpen(true)}
            >
              העבר לארכיון
            </Button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Link href={`/practice/${songId}`}>
          <Button variant="primary" size="lg">
            &#9654; {tPractice('start')}
          </Button>
        </Link>
        <Link href={`/games/${songId}`}>
          <Button variant="secondary" size="lg">
            &#127918; {tGames('title')}
          </Button>
        </Link>
      </div>

      {/* Audio player: voice-part tracks preferred, YouTube/Spotify fallback */}
      {(song.audioTracks && song.audioTracks.length > 0) || song.youtubeVideoId || song.spotifyTrackId ? (
        <AudioPlayer
          audioTracks={(song.audioTracks ?? []).map((t) => ({
            id: t.id,
            songId: song.id,
            voicePart: t.voicePart as VoicePart,
            fileUrl: t.fileUrl,
          } as AudioTrackData))}
          userVoicePart={(session?.user as any)?.voicePart as VoicePart | undefined}
          youtubeVideoId={song.youtubeVideoId}
          spotifyTrackId={song.spotifyTrackId}
          locale={song.language === 'en' ? 'en' : 'he'}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            const query = [song.title, song.composer].filter(Boolean).join(' ')
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank')
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          Find on YouTube
        </button>
      )}

      {/* Voice part info (shown below the player when tracks exist) */}
      {song.audioTracks && song.audioTracks.length > 0 && song.source && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>{tAudio('audioSource')}: {song.source}</span>
        </div>
      )}

      {/* Overall readiness */}
      {typeof song.readiness === 'number' && (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-foreground">
              מוכנות כללית
            </span>
            <div className="flex-1 max-w-md">
              <ProgressBar value={song.readiness} showLabel size="md" />
            </div>
          </div>
        </Card>
      )}

      {/* Chunks list */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            קטעי השיר ({song.chunks.length})
          </h2>
          {song.youtubeVideoId && song.chunks.length > 0 && (() => {
            const syncedCount = song.chunks.filter((c) => c.lineTimestamps).length
            const allSynced = syncedCount === song.chunks.length
            return (
              <span className={[
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                allSynced
                  ? 'bg-secondary/15 text-secondary'
                  : 'bg-border/40 text-text-muted',
              ].join(' ')}>
                {allSynced ? (
                  <>
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    מסונכרן
                  </>
                ) : (
                  `${syncedCount}/${song.chunks.length} מסונכרנים`
                )}
              </span>
            )
          })()}
        </div>
        <div className="space-y-3">
          {song.chunks.map((chunk) => (
            <Card key={chunk.id} className="!p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        chunk.chunkType === 'chorus'
                          ? 'primary'
                          : chunk.chunkType === 'bridge'
                            ? 'developing'
                            : 'default'
                      }
                    >
                      {chunk.label || getChunkTypeLabel(chunk.chunkType)}
                    </Badge>
                    <span className="text-xs text-text-muted">
                      {getChunkTypeLabel(chunk.chunkType)}
                    </span>
                    {chunk.lineTimestamps && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-secondary">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                      </span>
                    )}
                  </div>
                  <p
                    className="whitespace-pre-line text-sm leading-relaxed text-foreground line-clamp-4"
                    dir={song.textDirection === 'rtl' ? 'rtl' : song.textDirection === 'ltr' ? 'ltr' : 'auto'}
                  >
                    {chunk.lyrics}
                  </p>
                </div>

                {/* Memory status badge */}
                <div className="shrink-0">
                  {chunk.memoryStatus ? (
                    <Badge variant={getStatusBadgeVariant(chunk.memoryStatus)}>
                      {getStatusLabel(chunk.memoryStatus)}
                    </Badge>
                  ) : (
                    <Badge variant="default">
                      {'\u2014'}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Archive confirmation modal */}
      <Modal
        isOpen={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        title="העברה לארכיון"
      >
        <div className="space-y-4">
          <p className="text-foreground">
            להעביר את &quot;{song.title}&quot; לארכיון? ניתן לשחזר בכל עת
            מתוך דף הספרייה.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setArchiveModalOpen(false)}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="primary"
              loading={archiving}
              onClick={handleArchive}
            >
              העבר לארכיון
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
