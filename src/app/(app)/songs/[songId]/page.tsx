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

interface Chunk {
  id: string
  label: string
  chunkType: string
  lyrics: string
  order: number
  memoryStatus?: string
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
  readiness?: number
  isPersonal: boolean
  personalUserId: string | null
  choirId: string | null
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

  const songId = params.songId as string

  const [song, setSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/songs/${songId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      router.push('/songs')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon('error'))
      setDeleteModalOpen(false)
    } finally {
      setDeleting(false)
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

        {/* Actions for directors */}
        {isDirector && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/songs/${songId}/edit`)}
            >
              {t('edit')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeleteModalOpen(true)}
            >
              {t('delete')}
            </Button>
          </div>
        )}
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
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          קטעי השיר ({song.chunks.length})
        </h2>
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

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={t('delete')}
      >
        <div className="space-y-4">
          <p className="text-foreground">
            בטוחים שרוצים למחוק את &quot;{song.title}&quot;? הפעולה לא ניתנת
            לביטול.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setDeleteModalOpen(false)}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={handleDelete}
            >
              {tCommon('delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
