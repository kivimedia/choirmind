'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import ProgressBar from '@/components/ui/ProgressBar'
import EmptyState from '@/components/ui/EmptyState'

interface Chunk {
  id: string
  label: string
  chunkType: string
  lyrics: string
  order: number
}

interface Song {
  id: string
  title: string
  composer: string | null
  lyricist: string | null
  language: string
  chunks: Chunk[]
  readiness?: number
  createdAt: string
}

export default function SongsPage() {
  const t = useTranslations('songs')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [languageFilter, setLanguageFilter] = useState<string>('all')

  useEffect(() => {
    async function fetchSongs() {
      try {
        const res = await fetch('/api/songs')
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        setSongs(data.songs ?? [])
      } catch {
        setError(tCommon('error'))
      } finally {
        setLoading(false)
      }
    }
    fetchSongs()
  }, [tCommon])

  const filteredSongs = useMemo(() => {
    return songs.filter((song) => {
      const matchesSearch =
        !searchQuery ||
        song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.composer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.lyricist?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesLanguage =
        languageFilter === 'all' || song.language === languageFilter

      return matchesSearch && matchesLanguage
    })
  }, [songs, searchQuery, languageFilter])

  function getLanguageLabel(lang: string) {
    switch (lang) {
      case 'he':
        return t('hebrew')
      case 'en':
        return t('english')
      case 'mixed':
        return t('mixed')
      default:
        return lang
    }
  }

  function getLanguageBadgeVariant(lang: string) {
    switch (lang) {
      case 'he':
        return 'primary' as const
      case 'en':
        return 'default' as const
      default:
        return 'developing' as const
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <Link href="/songs/new">
          <Button variant="primary" size="md">
            + {t('addSong')}
          </Button>
        </Link>
      </div>

      {/* Search and filter bar */}
      {songs.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              placeholder={tCommon('search') + '...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              dir="auto"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'he', 'en', 'mixed'].map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguageFilter(lang)}
                className={[
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  languageFilter === lang
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-foreground hover:bg-border',
                ].join(' ')}
              >
                {lang === 'all' ? 'הכל' : getLanguageLabel(lang)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Song grid */}
      {filteredSongs.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSongs.map((song) => {
            const readiness = song.readiness ?? 0
            return (
              <Card
                key={song.id}
                hoverable
                onClick={() => router.push(`/songs/${song.id}`)}
                className="flex flex-col"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground line-clamp-2">
                    {song.title}
                  </h3>
                  <Badge variant={getLanguageBadgeVariant(song.language)}>
                    {getLanguageLabel(song.language)}
                  </Badge>
                </div>

                {(song.composer || song.lyricist) && (
                  <p className="mt-1 text-sm text-text-muted line-clamp-1">
                    {[song.composer, song.lyricist].filter(Boolean).join(' / ')}
                  </p>
                )}

                <div className="mt-3 text-xs text-text-muted">
                  {song.chunks.length} קטעים
                </div>

                <div className="mt-2">
                  <ProgressBar
                    value={readiness}
                    showLabel
                    size="sm"
                  />
                </div>
              </Card>
            )
          })}
        </div>
      ) : songs.length === 0 ? (
        <EmptyState
          icon="&#127925;"
          title={t('noSongs')}
          description="התחילו להוסיף שירים לספרייה שלכם"
          actionLabel={t('addSong')}
          onAction={() => router.push('/songs/new')}
        />
      ) : (
        <EmptyState
          icon="&#128269;"
          title={tCommon('noResults')}
          description="נסו חיפוש אחר או שנו את הסינון"
        />
      )}
    </div>
  )
}
