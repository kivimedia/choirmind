'use client'

import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import ProgressBar from '@/components/ui/ProgressBar'
import EmptyState from '@/components/ui/EmptyState'
import Modal from '@/components/ui/Modal'
import { useChoirStore } from '@/stores/useChoirStore'

interface AudioTrackSummary {
  id: string
  voicePart: string
}

interface Song {
  id: string
  title: string
  composer: string | null
  lyricist: string | null
  language: string
  audioTracks?: AudioTrackSummary[]
  youtubeVideoId?: string | null
  spotifyTrackId?: string | null
  readiness?: number
  createdAt: string
  isFavorited?: boolean
  chunkCount: number
  hasLyrics: boolean
  allSynced: boolean
  hasUnsynced: boolean
  stemsCount?: number
}

export default function SongsPage() {
  const t = useTranslations('songs')
  const tCommon = useTranslations('common')
  const tVoiceParts = useTranslations('voiceParts')
  const router = useRouter()
  const { data: session } = useSession()

  const isDirector = session?.user?.role === 'director'
  const { activeChoirId } = useChoirStore()

  const BATCH = 30
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery)
  const [visibleCount, setVisibleCount] = useState(BATCH)
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [audioSourceFilter, setAudioSourceFilter] = useState<'all' | 'voices' | 'youtube' | 'spotify' | 'none'>('all')
  const [noVersesOnly, setNoVersesOnly] = useState(false)
  const [noSyncOnly, setNoSyncOnly] = useState(false)
  const [stemsOnly, setStemsOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [archiveModalSong, setArchiveModalSong] = useState<Song | null>(null)
  const [deleteModalSong, setDeleteModalSong] = useState<Song | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkArchiveModal, setBulkArchiveModal] = useState(false)

  // Bulk lyrics wizard state
  const bulkLyricsAbortRef = useRef<AbortController | null>(null)
  const [bulkLyricsOpen, setBulkLyricsOpen] = useState(false)
  const [bulkLyricsQueue, setBulkLyricsQueue] = useState<Song[]>([])
  const [bulkLyricsIndex, setBulkLyricsIndex] = useState(0)
  const [bulkLyricsSearching, setBulkLyricsSearching] = useState(false)
  const [bulkLyricsResults, setBulkLyricsResults] = useState<{ source: string; title: string; artist: string; lyrics: string }[]>([])
  const [bulkLyricsLinks, setBulkLyricsLinks] = useState<{ label: string; url: string }[]>([])
  const [bulkLyricsSelected, setBulkLyricsSelected] = useState<number | null>(null)
  const [bulkLyricsImporting, setBulkLyricsImporting] = useState(false)
  const [bulkLyricsImported, setBulkLyricsImported] = useState(0)

  // Bulk auto-sync state
  const [bulkSyncOpen, setBulkSyncOpen] = useState(false)
  const [bulkSyncQueue, setBulkSyncQueue] = useState<Song[]>([])
  const [bulkSyncIndex, setBulkSyncIndex] = useState(0)
  const [bulkSyncResults, setBulkSyncResults] = useState<{ songId: string; title: string; success: boolean; error?: string }[]>([])

  const fetchSongs = useCallback(async (archived: boolean) => {
    try {
      setLoading(true)
      setVisibleCount(BATCH)
      const params = new URLSearchParams()
      if (archived) params.set('archived', 'true')
      if (activeChoirId) params.set('choirId', activeChoirId)
      const url = `/api/songs${params.toString() ? `?${params}` : ''}`
      const t0 = performance.now()
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      const networkTime = performance.now() - t0
      const t1 = performance.now()
      const data = await res.json()
      const parseTime = performance.now() - t1
      const songList = data.songs ?? []
      setSongs(songList)
      if (process.env.NEXT_PUBLIC_PERF_DEBUG === '1') {
        const serverTiming = res.headers.get('Server-Timing')
        console.log(`[PERF] fetchSongs: network=${networkTime.toFixed(0)}ms, parse=${parseTime.toFixed(0)}ms, songs=${songList.length}, payloadSize=${JSON.stringify(data).length}`)
        if (serverTiming) console.log(`[PERF] Server-Timing: ${serverTiming}`)
      }
    } catch {
      setError(tCommon('error'))
    } finally {
      setLoading(false)
    }
  }, [tCommon, activeChoirId])

  useEffect(() => {
    fetchSongs(showArchived)
  }, [showArchived, fetchSongs])

  async function handleToggleFavorite(songId: string) {
    // Optimistic update
    setSongs((prev) =>
      prev.map((s) =>
        s.id === songId ? { ...s, isFavorited: !s.isFavorited } : s
      )
    )
    try {
      const res = await fetch(`/api/songs/${songId}/favorite`, { method: 'POST' })
      if (!res.ok) {
        // Revert on failure
        setSongs((prev) =>
          prev.map((s) =>
            s.id === songId ? { ...s, isFavorited: !s.isFavorited } : s
          )
        )
      }
    } catch {
      // Revert on failure
      setSongs((prev) =>
        prev.map((s) =>
          s.id === songId ? { ...s, isFavorited: !s.isFavorited } : s
        )
      )
    }
  }

  const filteredSongs = useMemo(() => {
    const filtered = songs.filter((song) => {
      const matchesSearch =
        !deferredSearch ||
        song.title.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        song.composer?.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        song.lyricist?.toLowerCase().includes(deferredSearch.toLowerCase())

      const matchesLanguage =
        languageFilter === 'all' || song.language === languageFilter

      let matchesAudioSource = true
      if (audioSourceFilter !== 'all') {
        const hasVoiceTracks = song.audioTracks?.some((t) =>
          ['soprano', 'mezzo', 'alto', 'tenor', 'baritone', 'bass', 'mix'].includes(t.voicePart)
        )
        switch (audioSourceFilter) {
          case 'voices':
            matchesAudioSource = !!hasVoiceTracks
            break
          case 'youtube':
            matchesAudioSource = !!song.youtubeVideoId && !hasVoiceTracks
            break
          case 'spotify':
            matchesAudioSource = false
            break
          case 'none':
            matchesAudioSource = !hasVoiceTracks && !song.youtubeVideoId && !song.spotifyTrackId
            break
        }
      }

      const matchesVerses = !noVersesOnly || song.chunkCount === 0

      const matchesSync = !noSyncOnly || song.hasUnsynced

      const matchesStems = !stemsOnly || (song.stemsCount ?? 0) > 0

      return matchesSearch && matchesLanguage && matchesAudioSource && matchesVerses && matchesSync && matchesStems
    })

    // Sort: favorites first, then by creation date (already sorted from API)
    return filtered.sort((a, b) => {
      if (a.isFavorited && !b.isFavorited) return -1
      if (!a.isFavorited && b.isFavorited) return 1
      return 0
    })
  }, [songs, deferredSearch, languageFilter, audioSourceFilter, noVersesOnly, noSyncOnly, stemsOnly])

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(BATCH)
  }, [deferredSearch, languageFilter, audioSourceFilter, noVersesOnly, noSyncOnly, stemsOnly])

  const visibleSongs = filteredSongs.slice(0, visibleCount)

  async function handleArchive(song: Song) {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      setSongs((prev) => prev.filter((s) => s.id !== song.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon('error'))
    } finally {
      setActionLoading(false)
      setArchiveModalSong(null)
    }
  }

  async function handleUnarchive(song: Song) {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unarchive' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      setSongs((prev) => prev.filter((s) => s.id !== song.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon('error'))
    } finally {
      setActionLoading(false)
    }
  }

  async function handlePermanentDelete(song: Song) {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/songs/${song.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      setSongs((prev) => prev.filter((s) => s.id !== song.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon('error'))
    } finally {
      setActionLoading(false)
      setDeleteModalSong(null)
    }
  }

  function toggleSelection(songId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(songId)) {
        next.delete(songId)
      } else {
        next.add(songId)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredSongs.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredSongs.map((s) => s.id)))
    }
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  async function handleBulkArchive() {
    setActionLoading(true)
    try {
      const res = await fetch('/api/songs/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIds: Array.from(selectedIds), action: 'archive' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      const data = await res.json()
      setSongs((prev) => prev.filter((s) => !data.songIds.includes(s.id)))
      exitSelectionMode()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon('error'))
    } finally {
      setActionLoading(false)
      setBulkArchiveModal(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Bulk lyrics wizard
  // ---------------------------------------------------------------------------

  function startBulkLyrics() {
    const selectedSongs = songs.filter((s) => selectedIds.has(s.id))
    if (selectedSongs.length === 0) return
    setBulkLyricsQueue(selectedSongs)
    setBulkLyricsIndex(0)
    setBulkLyricsImported(0)
    setBulkLyricsOpen(true)
    searchLyricsForSong(selectedSongs[0])
  }

  async function searchLyricsForSong(song: Song) {
    // Abort any in-flight search
    bulkLyricsAbortRef.current?.abort()
    const controller = new AbortController()
    bulkLyricsAbortRef.current = controller

    setBulkLyricsSearching(true)
    setBulkLyricsResults([])
    setBulkLyricsLinks([])
    setBulkLyricsSelected(null)
    try {
      const params = new URLSearchParams({ q: song.title })
      if (song.composer) params.set('composer', song.composer)
      if (song.language) params.set('lang', song.language)
      const res = await fetch(`/api/lyrics-search?${params}`, { signal: controller.signal })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      if (controller.signal.aborted) return
      setBulkLyricsResults(data.results || [])
      setBulkLyricsLinks(data.searchLinks || [])
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setBulkLyricsResults([])
      setBulkLyricsLinks([])
    } finally {
      if (!controller.signal.aborted) {
        setBulkLyricsSearching(false)
      }
    }
  }

  // Smart lyrics parser — detects section headers and choruses (same as edit page)
  function parseBulkLyrics(text: string): { label: string; chunkType: string; lyrics: string }[] {
    const sectionPatterns: { pattern: RegExp; type: string; label: string }[] = [
      { pattern: /^[\[(]?פזמון[\])]?:?\s*$/i, type: 'chorus', label: 'פזמון' },
      { pattern: /^[\[(]?פזמון\s*(\d+)[\])]?:?\s*$/i, type: 'chorus', label: 'פזמון' },
      { pattern: /^[\[(]?בית\s*(\d+)?[\])]?:?\s*$/i, type: 'verse', label: 'בית' },
      { pattern: /^[\[(]?גשר[\])]?:?\s*$/i, type: 'bridge', label: 'גשר' },
      { pattern: /^[\[(]?chorus[\])]?:?\s*$/i, type: 'chorus', label: 'פזמון' },
      { pattern: /^[\[(]?verse\s*(\d+)?[\])]?:?\s*$/i, type: 'verse', label: 'בית' },
      { pattern: /^[\[(]?bridge[\])]?:?\s*$/i, type: 'bridge', label: 'גשר' },
      { pattern: /^[\[(]?intro[\])]?:?\s*$/i, type: 'intro', label: 'הקדמה' },
      { pattern: /^[\[(]?outro[\])]?:?\s*$/i, type: 'outro', label: 'סיום' },
      { pattern: /^[\[(]?pre[- ]?chorus[\])]?:?\s*$/i, type: 'bridge', label: 'גשר' },
    ]

    function detectHeader(line: string) {
      const trimmed = line.trim()
      for (const { pattern, type, label } of sectionPatterns) {
        const m = trimmed.match(pattern)
        if (m) return { type, label, num: m[1] }
      }
      return null
    }

    const lines = text.split('\n')
    const sections: { label: string; chunkType: string; lyrics: string }[] = []
    let currentLines: string[] = []
    let currentType = 'verse'
    let currentLabel = ''
    let verseCount = 0
    let chorusCount = 0

    function flush() {
      const lyrics = currentLines.join('\n').trim()
      if (!lyrics) return
      let label = currentLabel
      let type = currentType
      if (!label) {
        const existing = sections.find((s) => s.lyrics === lyrics && s.chunkType === 'chorus')
        if (existing) {
          type = 'chorus'
          label = existing.label
        } else {
          const full = text.trim()
          if (full.indexOf(lyrics) !== full.lastIndexOf(lyrics) && lyrics.length > 20) {
            type = 'chorus'
            chorusCount++
            label = chorusCount === 1 ? 'פזמון' : `פזמון ${chorusCount}`
          } else {
            type = 'verse'
            verseCount++
            label = `בית ${verseCount}`
          }
        }
      }
      sections.push({ label, chunkType: type, lyrics })
      currentLines = []
      currentLabel = ''
      currentType = 'verse'
    }

    for (const line of lines) {
      const header = detectHeader(line)
      if (header) {
        flush()
        currentType = header.type
        if (header.type === 'verse') {
          verseCount++
          currentLabel = header.num ? `${header.label} ${header.num}` : `${header.label} ${verseCount}`
        } else if (header.type === 'chorus') {
          chorusCount++
          currentLabel = chorusCount === 1 ? header.label : `${header.label} ${chorusCount}`
        } else {
          currentLabel = header.label
        }
        continue
      }
      if (line.trim() === '' && currentLines.length > 0) {
        flush()
        continue
      }
      if (line.trim()) currentLines.push(line)
    }
    flush()
    return sections
  }

  async function handleBulkLyricsImport() {
    if (bulkLyricsSelected === null) return
    const currentSong = bulkLyricsQueue[bulkLyricsIndex]
    const selected = bulkLyricsResults[bulkLyricsSelected]
    if (!currentSong || !selected) return

    setBulkLyricsImporting(true)
    try {
      const sections = parseBulkLyrics(selected.lyrics)
      if (sections.length === 0) {
        sections.push({ label: 'בית 1', chunkType: 'verse', lyrics: selected.lyrics.trim() })
      }
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i]
        const res = await fetch(`/api/songs/${currentSong.id}/chunks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: section.label,
            chunkType: section.chunkType,
            lyrics: section.lyrics,
            order: i,
          }),
        })
        if (!res.ok) throw new Error('Import failed')
      }
      // Update local song data to reflect new chunks
      setSongs((prev) =>
        prev.map((s) =>
          s.id === currentSong.id
            ? { ...s, chunkCount: sections.length, hasLyrics: sections.some((sec) => sec.lyrics.trim()), allSynced: false, hasUnsynced: sections.some((sec) => sec.lyrics.trim()) }
            : s
        )
      )
      setBulkLyricsImported((n) => n + 1)
      advanceBulkLyrics()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה בייבוא')
    } finally {
      setBulkLyricsImporting(false)
    }
  }

  function advanceBulkLyrics() {
    // Abort any in-flight search before advancing
    bulkLyricsAbortRef.current?.abort()
    setBulkLyricsSearching(false)

    const nextIndex = bulkLyricsIndex + 1
    if (nextIndex >= bulkLyricsQueue.length) {
      // Done — close wizard
      setBulkLyricsOpen(false)
      exitSelectionMode()
      return
    }
    setBulkLyricsIndex(nextIndex)
    searchLyricsForSong(bulkLyricsQueue[nextIndex])
  }

  function closeBulkLyrics() {
    bulkLyricsAbortRef.current?.abort()
    setBulkLyricsSearching(false)
    setBulkLyricsOpen(false)
    setBulkLyricsQueue([])
    setBulkLyricsIndex(0)
    setBulkLyricsResults([])
    setBulkLyricsSelected(null)
  }

  async function startBulkSync() {
    const eligible = songs.filter((s) =>
      selectedIds.has(s.id) &&
      (s.audioTracks?.length ?? 0) > 0 &&
      s.hasLyrics
    )
    if (eligible.length === 0) return

    setBulkSyncOpen(true)
    setBulkSyncQueue(eligible)
    setBulkSyncIndex(0)
    setBulkSyncResults([])

    const results: { songId: string; title: string; success: boolean; error?: string }[] = []

    for (let i = 0; i < eligible.length; i++) {
      const song = eligible[i]
      setBulkSyncIndex(i)

      const tracks = song.audioTracks ?? []
      const preferred = tracks.find((t) => t.voicePart === 'mix')
        || tracks.find((t) => t.voicePart === 'playback')
        || tracks[0]

      try {
        const res = await fetch(`/api/songs/${song.id}/auto-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioTrackId: preferred.id }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Sync failed')
        }
        results.push({ songId: song.id, title: song.title, success: true })
        setBulkSyncResults([...results])
        // Mark as synced in local state
        setSongs((prev) => prev.map((s) => {
          if (s.id !== song.id) return s
          return { ...s, allSynced: true, hasUnsynced: false }
        }))
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        results.push({ songId: song.id, title: song.title, success: false, error: errorMsg })
        setBulkSyncResults([...results])
      }
    }
    setBulkSyncIndex(eligible.length)
  }

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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          {isDirector && (
            <>
              <button
                type="button"
                onClick={() => setShowArchived(!showArchived)}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  showArchived
                    ? 'bg-border/60 text-foreground'
                    : 'bg-surface-hover text-text-muted hover:text-foreground',
                ].join(' ')}
              >
                {showArchived ? 'ארכיון' : 'ארכיון'}
                {showArchived && (
                  <span className="ms-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
              {!showArchived && (
                <button
                  type="button"
                  onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                  className={[
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    selectionMode
                      ? 'bg-primary text-white'
                      : 'bg-surface-hover text-text-muted hover:text-foreground',
                  ].join(' ')}
                >
                  בחירה
                </button>
              )}
            </>
          )}
        </div>
        {!showArchived && (
          <Link href="/songs/new">
            <Button variant="primary" size="md">
              + {t('addSong')}
            </Button>
          </Link>
        )}
      </div>

      {/* Bulk selection bar */}
      {selectionMode && (
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3 border border-primary/20">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size > 0 ? `${selectedIds.size} שירים נבחרו` : 'בחרו שירים'}
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs text-primary hover:underline"
            >
              {selectedIds.size === filteredSongs.length ? 'בטל הכל' : 'בחר הכל'}
            </button>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={startBulkLyrics}
              >
                חיפוש מילים
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={startBulkSync}
              >
                סנכרון אוטומטי
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setBulkArchiveModal(true)}
              >
                העבר לארכיון
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Search and filter bar */}
      {songs.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                placeholder={tCommon('search') + '...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
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
          {/* Audio source filter + content filter */}
          <div className="flex gap-2 flex-wrap items-center">
            {([
              { key: 'all', label: 'הכל' },
              { key: 'voices', label: 'קולות' },
              { key: 'youtube', label: 'YouTube' },
              { key: 'none', label: 'ללא אודיו' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setAudioSourceFilter(key)}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  audioSourceFilter === key
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-foreground hover:bg-border',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            <button
              type="button"
              onClick={() => setNoVersesOnly(!noVersesOnly)}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                noVersesOnly
                  ? 'bg-warning/80 text-white'
                  : 'bg-surface-hover text-foreground hover:bg-border',
              ].join(' ')}
            >
              ללא קטעים
            </button>
            <button
              type="button"
              onClick={() => setNoSyncOnly(!noSyncOnly)}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                noSyncOnly
                  ? 'bg-warning/80 text-white'
                  : 'bg-surface-hover text-foreground hover:bg-border',
              ].join(' ')}
            >
              ללא סנכרון
            </button>
            <button
              type="button"
              onClick={() => setStemsOnly(!stemsOnly)}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                stemsOnly
                  ? 'bg-primary text-white'
                  : 'bg-surface-hover text-foreground hover:bg-border',
              ].join(' ')}
            >
              שירה מבודדת
            </button>
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
        <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSongs.map((song) => {
            const readiness = song.readiness ?? 0
            const isSelected = selectedIds.has(song.id)
            return (
              <Card
                key={song.id}
                hoverable
                onClick={() => {
                  if (selectionMode) {
                    toggleSelection(song.id)
                  } else if (!showArchived) {
                    router.push(`/songs/${song.id}`)
                  }
                }}
                className={[
                  'flex flex-col',
                  showArchived ? 'opacity-75' : '',
                  isSelected ? 'ring-2 ring-primary' : '',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {selectionMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(song.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                      />
                    )}
                    {!selectionMode && !showArchived && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleFavorite(song.id)
                        }}
                        className="mt-0.5 shrink-0 text-2xl leading-none transition-colors"
                        title={song.isFavorited ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
                      >
                        {song.isFavorited ? (
                          <span className="text-yellow-500">&#9733;</span>
                        ) : (
                          <span className="text-border hover:text-yellow-400">&#9734;</span>
                        )}
                      </button>
                    )}
                    <h3 className="text-base font-semibold text-foreground line-clamp-2">
                      {song.title}
                    </h3>
                  </div>
                  <Badge variant={getLanguageBadgeVariant(song.language)}>
                    {getLanguageLabel(song.language)}
                  </Badge>
                </div>

                {(song.composer || song.lyricist) && (
                  <p className="mt-1 text-sm text-text-muted line-clamp-1">
                    {[song.composer, song.lyricist].filter(Boolean).join(' / ')}
                  </p>
                )}

                {/* Audio source indicator */}
                {(() => {
                  const tracks = song.audioTracks ?? []
                  const hasVoiceTracks = tracks.some((t) =>
                    ['soprano', 'mezzo', 'alto', 'tenor', 'baritone', 'bass', 'mix'].includes(t.voicePart)
                  )

                  if (hasVoiceTracks) {
                    const partOrder = ['soprano', 'mezzo', 'alto', 'tenor', 'baritone', 'bass', 'mix', 'playback']
                    const shortLabels: Record<string, string> = {
                      soprano: 'S', mezzo: 'Mz', alto: 'A', tenor: 'T', baritone: 'Bar', bass: 'B', mix: 'Mix', playback: 'PB',
                    }
                    const available = tracks
                      .map((t) => t.voicePart)
                      .sort((a, b) => partOrder.indexOf(a) - partOrder.indexOf(b))

                    return (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1">
                        {available.map((part) => (
                          <span
                            key={part}
                            title={tVoiceParts.has(part as any) ? tVoiceParts(part as any) : part}
                            className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[12px] font-semibold text-primary-dark"
                          >
                            {shortLabels[part] ?? part}
                          </span>
                        ))}
                      </div>
                    )
                  }

                  if (song.youtubeVideoId) {
                    return (
                      <div className="mt-2.5 flex items-center gap-1 text-xs text-text-muted">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
                          <path fill="white" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                        </svg>
                        <span>YouTube</span>
                      </div>
                    )
                  }

                  if (song.spotifyTrackId) {
                    return (
                      <div className="mt-2.5 flex items-center gap-1 text-xs text-text-muted">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                        <span>Spotify</span>
                      </div>
                    )
                  }

                  return null
                })()}

                <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                  <span>{song.chunkCount} קטעים</span>
                  {song.allSynced && (
                    <span className="inline-flex items-center gap-0.5 text-secondary">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                      מסונכרן
                    </span>
                  )}
                  {(song.stemsCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-primary">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      שירה מבודדת
                    </span>
                  )}
                </div>

                {!showArchived && (
                  <div className="mt-2">
                    <ProgressBar value={readiness} showLabel size="sm" />
                  </div>
                )}

                {/* Archive / Unarchive / Delete actions */}
                {isDirector && (
                  <div className="mt-3 flex items-center gap-3 border-t border-border/50 pt-3">
                    {showArchived ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleUnarchive(song) }}
                          className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                          שחזור
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDeleteModalSong(song) }}
                          className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 transition-colors"
                        >
                          מחיקה לצמיתות
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); router.push(`/songs/${song.id}/edit`) }}
                          className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                          עריכה
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setArchiveModalSong(song) }}
                          className="rounded px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
                        >
                          העבר לארכיון
                        </button>
                      </>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
        {visibleCount < filteredSongs.length && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => setVisibleCount((c) => c + BATCH)}
            >
              {`הצג עוד (${filteredSongs.length - visibleCount} נותרו)`}
            </Button>
          </div>
        )}
      </>
      ) : songs.length === 0 ? (
        showArchived ? (
          <EmptyState
            icon="&#128230;"
            title="הארכיון ריק"
            description="אין שירים בארכיון"
          />
        ) : (
          <EmptyState
            icon="&#127925;"
            title={t('noSongs')}
            description="התחילו להוסיף שירים לספרייה שלכם"
            actionLabel={t('addSong')}
            onAction={() => router.push('/songs/new')}
          />
        )
      ) : (
        <EmptyState
          icon="&#128269;"
          title={tCommon('noResults')}
          description="נסו חיפוש אחר או שנו את הסינון"
        />
      )}

      {/* Archive confirmation modal */}
      <Modal
        isOpen={!!archiveModalSong}
        onClose={() => setArchiveModalSong(null)}
        title="העברה לארכיון"
      >
        <div className="space-y-4">
          <p className="text-foreground">
            להעביר את &quot;{archiveModalSong?.title}&quot; לארכיון? ניתן לשחזר בכל עת.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setArchiveModalSong(null)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="primary"
              loading={actionLoading}
              onClick={() => archiveModalSong && handleArchive(archiveModalSong)}
            >
              העבר לארכיון
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk archive confirmation modal */}
      <Modal
        isOpen={bulkArchiveModal}
        onClose={() => setBulkArchiveModal(false)}
        title="העברה לארכיון"
      >
        <div className="space-y-4">
          <p className="text-foreground">
            להעביר {selectedIds.size} שירים לארכיון? ניתן לשחזר בכל עת.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setBulkArchiveModal(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="primary"
              loading={actionLoading}
              onClick={handleBulkArchive}
            >
              העבר לארכיון
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk lyrics wizard modal */}
      <Modal
        isOpen={bulkLyricsOpen}
        onClose={closeBulkLyrics}
        title="חיפוש מילים"
        className="max-w-2xl"
      >
        {bulkLyricsQueue.length > 0 && (
          <div className="space-y-4">
            {/* Progress header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {bulkLyricsQueue[bulkLyricsIndex]?.title}
                </h3>
                {bulkLyricsQueue[bulkLyricsIndex]?.composer && (
                  <p className="text-xs text-text-muted">{bulkLyricsQueue[bulkLyricsIndex].composer}</p>
                )}
              </div>
              <span className="rounded-full bg-surface-hover px-3 py-1 text-xs font-medium text-text-muted">
                {bulkLyricsIndex + 1} / {bulkLyricsQueue.length}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${((bulkLyricsIndex) / bulkLyricsQueue.length) * 100}%` }}
              />
            </div>

            {/* Loading */}
            {bulkLyricsSearching && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="flex items-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <span className="ms-3 text-sm text-text-muted">מחפש מילים...</span>
                </div>
              </div>
            )}

            {/* No results */}
            {!bulkLyricsSearching && bulkLyricsResults.length === 0 && (
              <div className="space-y-3 py-4 text-center">
                <p className="text-sm text-text-muted">לא נמצאו תוצאות אוטומטיות.</p>
                {bulkLyricsLinks.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {bulkLyricsLinks.map((link) => (
                      <a
                        key={link.label}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
                      >
                        {link.label}
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {!bulkLyricsSearching && bulkLyricsResults.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-text-muted">
                  {bulkLyricsResults.length} תוצאות - בחרו את הנכונה:
                </p>
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {bulkLyricsResults.map((result, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setBulkLyricsSelected(bulkLyricsSelected === idx ? null : idx)}
                      className={[
                        'w-full text-start rounded-lg border p-3 transition-colors',
                        bulkLyricsSelected === idx
                          ? 'border-primary bg-primary/5 ring-2 ring-primary'
                          : 'border-border hover:border-primary/50',
                      ].join(' ')}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{result.title}</span>
                          {result.artist && (
                            <span className="text-xs text-text-muted">- {result.artist}</span>
                          )}
                        </div>
                        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[12px] font-medium text-text-muted">
                          {result.source}
                        </span>
                      </div>
                      <p
                        className={[
                          'whitespace-pre-line text-sm text-text-muted',
                          bulkLyricsSelected === idx ? '' : 'line-clamp-3',
                        ].join(' ')}
                        dir="auto"
                      >
                        {result.lyrics}
                      </p>
                      {bulkLyricsSelected !== idx && result.lyrics.split('\n').length > 3 && (
                        <span className="mt-1 block text-xs text-primary">לחצו לצפייה במילים המלאות</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons — always visible (skip available even during search) */}
            <div className="flex items-center gap-2 border-t border-border pt-4">
              {!bulkLyricsSearching && bulkLyricsSelected !== null && (
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={handleBulkLyricsImport}
                  loading={bulkLyricsImporting}
                >
                  ייבוא מילים
                </Button>
              )}
              <Button
                variant={bulkLyricsSearching ? 'outline' : 'ghost'}
                onClick={advanceBulkLyrics}
                className={!bulkLyricsSearching && bulkLyricsSelected !== null ? '' : 'flex-1'}
              >
                {bulkLyricsIndex + 1 >= bulkLyricsQueue.length ? 'סיום' : 'דלג'}
              </Button>
            </div>

            {/* Summary */}
            {bulkLyricsImported > 0 && (
              <p className="text-center text-xs text-success">
                יובאו מילים ל-{bulkLyricsImported} שירים
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Bulk auto-sync modal */}
      <Modal
        isOpen={bulkSyncOpen}
        onClose={() => { if (bulkSyncIndex >= bulkSyncQueue.length) { setBulkSyncOpen(false); exitSelectionMode() } }}
        title="סנכרון אוטומטי"
        className="max-w-lg"
      >
        {bulkSyncQueue.length > 0 && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="flex items-center justify-between text-sm text-text-muted">
              <span>
                {bulkSyncIndex < bulkSyncQueue.length
                  ? `מעבד: ${bulkSyncQueue[bulkSyncIndex]?.title}`
                  : 'הושלם!'
                }
              </span>
              <span>{Math.min(bulkSyncIndex + 1, bulkSyncQueue.length)} / {bulkSyncQueue.length}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(bulkSyncResults.length / bulkSyncQueue.length) * 100}%` }}
              />
            </div>

            {/* Processing spinner */}
            {bulkSyncIndex < bulkSyncQueue.length && (
              <div className="flex items-center gap-3 py-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-foreground">
                  מסנכרן עם AI... ההמתנה עשויה להימשך עד 30 שניות
                </span>
              </div>
            )}

            {/* Results list */}
            {bulkSyncResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {bulkSyncResults.map((r) => (
                  <div
                    key={r.songId}
                    className={[
                      'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
                      r.success ? 'bg-success/5' : 'bg-danger/5',
                    ].join(' ')}
                  >
                    <span className="text-foreground">{r.title}</span>
                    {r.success ? (
                      <span className="text-success text-xs font-medium">מסונכרן</span>
                    ) : (
                      <span className="text-danger text-xs" title={r.error}>נכשל</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Summary when done */}
            {bulkSyncIndex >= bulkSyncQueue.length && (
              <div className="space-y-3 pt-2">
                <p className="text-sm text-foreground text-center">
                  {bulkSyncResults.filter((r) => r.success).length} מתוך {bulkSyncQueue.length} שירים סונכרנו בהצלחה
                </p>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => { setBulkSyncOpen(false); exitSelectionMode() }}
                >
                  סגירה
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Permanent delete confirmation modal */}
      <Modal
        isOpen={!!deleteModalSong}
        onClose={() => setDeleteModalSong(null)}
        title="מחיקה לצמיתות"
      >
        <div className="space-y-4">
          <p className="text-foreground">
            למחוק את &quot;{deleteModalSong?.title}&quot; לצמיתות? הפעולה לא ניתנת לביטול.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteModalSong(null)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="danger"
              loading={actionLoading}
              onClick={() => deleteModalSong && handlePermanentDelete(deleteModalSong)}
            >
              מחיקה לצמיתות
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
