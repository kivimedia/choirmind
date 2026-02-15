'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import TextArea from '@/components/ui/TextArea'
import Modal from '@/components/ui/Modal'
import LyricsSyncTool from '@/components/sync/LyricsSyncTool'
import AudioUploadPanel from '@/components/audio/AudioUploadPanel'

interface Chunk {
  id: string
  label: string
  chunkType: string
  lyrics: string
  order: number
  lineTimestamps: number[] | null
}

interface AudioTrack {
  id: string
  voicePart: string
  fileUrl: string
  durationMs?: number | null
}

interface Song {
  id: string
  title: string
  composer: string | null
  lyricist: string | null
  arranger: string | null
  language: string
  spotifyTrackId: string | null
  youtubeVideoId: string | null
  chunks: Chunk[]
  audioTracks?: AudioTrack[]
}

export default function EditSongPage() {
  const params = useParams()
  const router = useRouter()
  const songId = params.songId as string

  const [song, setSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editable fields
  const [title, setTitle] = useState('')
  const [composer, setComposer] = useState('')
  const [lyricist, setLyricist] = useState('')
  const [arranger, setArranger] = useState('')
  const [youtubeVideoId, setYoutubeVideoId] = useState('')
  const [youtubeInput, setYoutubeInput] = useState('')
  const [spotifyTrackId, setSpotifyTrackId] = useState('')
  const [spotifyInput, setSpotifyInput] = useState('')
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([])

  function extractYoutubeVideoId(input: string): string {
    const trimmed = input.trim()
    if (!trimmed) return ''
    // youtube.com/watch?v=VIDEO_ID
    const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
    if (watchMatch) return watchMatch[1]
    // youtu.be/VIDEO_ID
    const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
    if (shortMatch) return shortMatch[1]
    // youtube.com/embed/VIDEO_ID
    const embedMatch = trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
    if (embedMatch) return embedMatch[1]
    // youtube.com/shorts/VIDEO_ID
    const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/)
    if (shortsMatch) return shortsMatch[1]
    // Raw ID: exactly 11 characters (alphanumeric, dash, underscore)
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed
    return ''
  }

  function handleYoutubeInput(value: string) {
    setYoutubeInput(value)
    const extracted = extractYoutubeVideoId(value)
    setYoutubeVideoId(extracted)
  }

  function extractSpotifyTrackId(input: string): string {
    const trimmed = input.trim()
    if (!trimmed) return ''
    // URL: https://open.spotify.com/track/3Tk3gURii0Z0rU8TiLthBT?si=abc
    const urlMatch = trimmed.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]{22})/)
    if (urlMatch) return urlMatch[1]
    // URI: spotify:track:3Tk3gURii0Z0rU8TiLthBT
    const uriMatch = trimmed.match(/spotify:track:([a-zA-Z0-9]{22})/)
    if (uriMatch) return uriMatch[1]
    // Raw ID: exactly 22 alphanumeric characters
    if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) return trimmed
    return ''
  }

  function handleSpotifyInput(value: string) {
    setSpotifyInput(value)
    const extracted = extractSpotifyTrackId(value)
    setSpotifyTrackId(extracted)
  }

  useEffect(() => {
    async function fetchSong() {
      try {
        const res = await fetch(`/api/songs/${songId}`)
        if (!res.ok) throw new Error('שגיאה בטעינת השיר')
        const data = await res.json()
        const s = data.song
        setSong(s)
        setTitle(s.title || '')
        setComposer(s.composer || '')
        setLyricist(s.lyricist || '')
        setArranger(s.arranger || '')
        setYoutubeVideoId(s.youtubeVideoId || '')
        setYoutubeInput(s.youtubeVideoId || '')
        setSpotifyTrackId(s.spotifyTrackId || '')
        setSpotifyInput(s.spotifyTrackId || '')
        setChunks(
          (s.chunks || []).map((c: any) => ({
            ...c,
            lineTimestamps: c.lineTimestamps ? JSON.parse(c.lineTimestamps) : null,
          }))
        )
        setAudioTracks(s.audioTracks || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    if (songId) fetchSong()
  }, [songId])

  function updateChunkLyrics(index: number, newLyrics: string) {
    setChunks((prev) => {
      const updated = [...prev]
      const old = updated[index]
      const countLines = (t: string) => t.split('\n').filter((l) => l.trim()).length
      const lineCountChanged = countLines(newLyrics) !== countLines(old.lyrics)
      updated[index] = {
        ...old,
        lyrics: newLyrics,
        lineTimestamps: lineCountChanged ? null : old.lineTimestamps,
      }
      return updated
    })
  }

  function updateChunkLabel(index: number, newLabel: string) {
    setChunks((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], label: newLabel }
      return updated
    })
  }

  const [addingChunk, setAddingChunk] = useState(false)

  async function handleAddChunk() {
    setAddingChunk(true)
    setError(null)
    try {
      const nextOrder = chunks.length
      const label = `בית ${nextOrder + 1}`
      const res = await fetch(`/api/songs/${songId}/chunks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, chunkType: 'verse', lyrics: '' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'שגיאה בהוספת קטע')
      }
      const { chunk } = await res.json()
      setChunks((prev) => [...prev, chunk])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAddingChunk(false)
    }
  }

  const [deletingChunkId, setDeletingChunkId] = useState<string | null>(null)

  async function handleDeleteChunk(index: number) {
    const chunk = chunks[index]
    if (!chunk) return
    if (!confirm(`למחוק את "${chunk.label}"?`)) return

    setDeletingChunkId(chunk.id)
    setError(null)
    try {
      const res = await fetch(`/api/songs/${songId}/chunks/${chunk.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'שגיאה במחיקת קטע')
      }
      setChunks((prev) => prev.filter((_, i) => i !== index))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeletingChunkId(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Smart lyrics paste
  // ---------------------------------------------------------------------------

  // Sync lyrics state
  const [syncChunkIndex, setSyncChunkIndex] = useState<number | null>(null)

  const [pasteModalOpen, setPasteModalOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [parsedPreview, setParsedPreview] = useState<{ label: string; chunkType: string; lyrics: string }[]>([])
  const [importing, setImporting] = useState(false)

  // Sync preview state
  const [previewAudioRef] = useState<{ el: HTMLAudioElement | null }>({ el: null })
  const [previewTime, setPreviewTime] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewTrackUrl, setPreviewTrackUrl] = useState<string | null>(null)

  function formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  function startPreview(trackUrl: string) {
    if (!previewAudioRef.el) {
      const audio = new Audio(trackUrl)
      audio.addEventListener('timeupdate', () => setPreviewTime(audio.currentTime * 1000))
      audio.addEventListener('ended', () => setPreviewPlaying(false))
      previewAudioRef.el = audio
      setPreviewTrackUrl(trackUrl)
    } else if (previewTrackUrl !== trackUrl) {
      previewAudioRef.el.pause()
      previewAudioRef.el.src = trackUrl
      setPreviewTrackUrl(trackUrl)
    }
    previewAudioRef.el.play()
    setPreviewPlaying(true)
  }

  function togglePreview() {
    if (!previewAudioRef.el) return
    if (previewAudioRef.el.paused) {
      previewAudioRef.el.play()
      setPreviewPlaying(true)
    } else {
      previewAudioRef.el.pause()
      setPreviewPlaying(false)
    }
  }

  function seekPreview(ms: number) {
    if (!previewAudioRef.el) return
    previewAudioRef.el.currentTime = ms / 1000
    setPreviewTime(ms)
  }

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.el) {
        previewAudioRef.el.pause()
        previewAudioRef.el = null
      }
    }
  }, [previewAudioRef])

  // Auto-sync state
  const [autoSyncing, setAutoSyncing] = useState(false)
  const [autoSyncError, setAutoSyncError] = useState<string | null>(null)
  const [autoSyncDone, setAutoSyncDone] = useState(false)

  // Lyrics search state
  const [lyricsSearchOpen, setLyricsSearchOpen] = useState(false)
  const [lyricsSearching, setLyricsSearching] = useState(false)
  const [lyricsResults, setLyricsResults] = useState<{ source: string; title: string; artist: string; lyrics: string }[]>([])
  const [lyricsSearchLinks, setLyricsSearchLinks] = useState<{ label: string; url: string }[]>([])
  const [selectedLyricsIndex, setSelectedLyricsIndex] = useState<number | null>(null)
  const [lyricsImporting, setLyricsImporting] = useState(false)

  // Hebrew & English section header patterns
  const SECTION_PATTERNS: { pattern: RegExp; type: string; label: string }[] = [
    // Hebrew headers
    { pattern: /^[\[(]?פזמון[\])]?:?\s*$/i, type: 'chorus', label: 'פזמון' },
    { pattern: /^[\[(]?פזמון\s*(\d+)[\])]?:?\s*$/i, type: 'chorus', label: 'פזמון' },
    { pattern: /^[\[(]?בית\s*(\d+)?[\])]?:?\s*$/i, type: 'verse', label: 'בית' },
    { pattern: /^[\[(]?גשר[\])]?:?\s*$/i, type: 'bridge', label: 'גשר' },
    { pattern: /^[\[(]?הקדמה[\])]?:?\s*$/i, type: 'intro', label: 'הקדמה' },
    { pattern: /^[\[(]?סיום[\])]?:?\s*$/i, type: 'outro', label: 'סיום' },
    { pattern: /^[\[(]?קודה[\])]?:?\s*$/i, type: 'coda', label: 'קודה' },
    { pattern: /^[\[(]?מעבר[\])]?:?\s*$/i, type: 'transition', label: 'מעבר' },
    // English headers
    { pattern: /^[\[(]?chorus[\])]?:?\s*$/i, type: 'chorus', label: 'פזמון' },
    { pattern: /^[\[(]?verse\s*(\d+)?[\])]?:?\s*$/i, type: 'verse', label: 'בית' },
    { pattern: /^[\[(]?bridge[\])]?:?\s*$/i, type: 'bridge', label: 'גשר' },
    { pattern: /^[\[(]?intro[\])]?:?\s*$/i, type: 'intro', label: 'הקדמה' },
    { pattern: /^[\[(]?outro[\])]?:?\s*$/i, type: 'outro', label: 'סיום' },
    { pattern: /^[\[(]?pre[- ]?chorus[\])]?:?\s*$/i, type: 'bridge', label: 'גשר' },
  ]

  function detectSectionHeader(line: string): { type: string; label: string; num?: string } | null {
    const trimmed = line.trim()
    for (const { pattern, type, label } of SECTION_PATTERNS) {
      const match = trimmed.match(pattern)
      if (match) {
        return { type, label, num: match[1] }
      }
    }
    return null
  }

  function parseLyrics(text: string) {
    const lines = text.split('\n')
    const sections: { label: string; chunkType: string; lyrics: string }[] = []

    let currentLines: string[] = []
    let currentType = 'verse'
    let currentLabel = ''
    let verseCount = 0
    let chorusCount = 0

    function flushSection() {
      const lyrics = currentLines.join('\n').trim()
      if (!lyrics) return

      // Auto-detect chorus by finding duplicate text blocks
      let label = currentLabel
      let type = currentType

      if (!label) {
        // Check if this text already appeared (it's a repeated chorus)
        const existingMatch = sections.find(
          (s) => s.lyrics === lyrics && s.chunkType === 'chorus',
        )
        if (existingMatch) {
          type = 'chorus'
          label = existingMatch.label
        } else {
          // Check if this exact lyrics appears later in the text too
          const fullText = text.trim()
          const firstIdx = fullText.indexOf(lyrics)
          const lastIdx = fullText.lastIndexOf(lyrics)
          if (firstIdx !== lastIdx && lyrics.length > 20) {
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
      const header = detectSectionHeader(line)
      if (header) {
        // Flush whatever we have so far
        flushSection()
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

      // Empty line = section break (only if we have accumulated lines)
      if (line.trim() === '' && currentLines.length > 0) {
        flushSection()
        continue
      }

      if (line.trim()) {
        currentLines.push(line)
      }
    }
    // Flush remaining
    flushSection()

    return sections
  }

  function handleParseLyrics() {
    const sections = parseLyrics(pasteText)
    setParsedPreview(sections)
  }

  async function handleImportParsed() {
    if (parsedPreview.length === 0) return
    setImporting(true)
    setError(null)
    try {
      // Delete all existing chunks first
      for (const chunk of chunks) {
        const delRes = await fetch(`/api/songs/${songId}/chunks/${chunk.id}`, {
          method: 'DELETE',
        })
        if (!delRes.ok) {
          const data = await delRes.json().catch(() => ({}))
          throw new Error(data.error || 'שגיאה במחיקת קטע קיים')
        }
      }

      // Create new chunks starting from order 0
      const newChunks: Chunk[] = []
      for (let i = 0; i < parsedPreview.length; i++) {
        const section = parsedPreview[i]
        const res = await fetch(`/api/songs/${songId}/chunks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: section.label,
            chunkType: section.chunkType,
            lyrics: section.lyrics,
            order: i,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'שגיאה בייבוא קטע')
        }
        const { chunk } = await res.json()
        newChunks.push(chunk)
      }
      setChunks(newChunks)
      setPasteModalOpen(false)
      setPasteText('')
      setParsedPreview([])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  async function handleAutoSync(trackId: string) {
    setAutoSyncing(true)
    setAutoSyncError(null)
    setAutoSyncDone(false)
    try {
      const res = await fetch(`/api/songs/${songId}/auto-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioTrackId: trackId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Auto-sync failed')
      }
      const data = await res.json()
      // Update all chunks with their new timestamps
      setChunks((prev) => {
        const updated = [...prev]
        for (const result of data.results) {
          const idx = updated.findIndex((c) => c.id === result.chunkId)
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], lineTimestamps: result.timestamps }
          }
        }
        return updated
      })
      setAutoSyncDone(true)
    } catch (err: unknown) {
      setAutoSyncError(err instanceof Error ? err.message : 'Auto-sync failed')
    } finally {
      setAutoSyncing(false)
    }
  }

  async function handleLyricsSearch() {
    setLyricsSearching(true)
    setLyricsResults([])
    setLyricsSearchLinks([])
    setSelectedLyricsIndex(null)
    setError(null)
    try {
      const params = new URLSearchParams({ q: title })
      if (composer) params.set('composer', composer)
      if (song?.language) params.set('lang', song.language)

      const res = await fetch(`/api/lyrics-search?${params}`)
      if (!res.ok) throw new Error('שגיאה בחיפוש מילים')
      const data = await res.json()
      setLyricsResults(data.results || [])
      setLyricsSearchLinks(data.searchLinks || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLyricsSearching(false)
    }
  }

  async function handleImportLyrics() {
    if (selectedLyricsIndex === null) return
    const selected = lyricsResults[selectedLyricsIndex]
    if (!selected) return

    setLyricsImporting(true)
    setError(null)
    try {
      // Parse lyrics into sections using the same Smart Paste logic
      const sections = parseLyrics(selected.lyrics)
      if (sections.length === 0) {
        // If no sections detected, treat the whole thing as one verse
        sections.push({ label: 'בית 1', chunkType: 'verse', lyrics: selected.lyrics.trim() })
      }

      const startOrder = chunks.length
      const newChunks: Chunk[] = []
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i]
        const res = await fetch(`/api/songs/${songId}/chunks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: section.label,
            chunkType: section.chunkType,
            lyrics: section.lyrics,
            order: startOrder + i,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'שגיאה בייבוא קטע')
        }
        const { chunk } = await res.json()
        newChunks.push(chunk)
      }
      setChunks((prev) => [...prev, ...newChunks])
      setLyricsSearchOpen(false)
      setLyricsResults([])
      setSelectedLyricsIndex(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLyricsImporting(false)
    }
  }

  async function handleSave(andExit = false) {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      // Save song metadata
      const songRes = await fetch(`/api/songs/${songId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          composer: composer || null,
          lyricist: lyricist || null,
          arranger: arranger || null,
          youtubeVideoId: youtubeVideoId || null,
          spotifyTrackId: spotifyTrackId || null,
        }),
      })
      if (!songRes.ok) {
        const data = await songRes.json()
        throw new Error(data.error || 'שגיאה בשמירה')
      }

      // Save chunks (strip lineTimestamps — managed separately via timestamps API)
      const chunksPayload = chunks.map(({ lineTimestamps, ...rest }) => rest)
      const chunkRes = await fetch(`/api/songs/${songId}/chunks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunks: chunksPayload }),
      })
      if (!chunkRes.ok) {
        const data = await chunkRes.json()
        throw new Error(data.error || 'שגיאה בשמירת הקטעים')
      }

      if (andExit) {
        router.push(`/songs/${songId}`)
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!song) {
    return (
      <div className="py-12 text-center">
        <p className="text-danger mb-4">{error || 'השיר לא נמצא'}</p>
        <Button variant="outline" onClick={() => router.back()}>חזרה</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">עריכת שיר</h1>
        <Button variant="ghost" onClick={() => router.push(`/songs/${songId}`)}>
          חזרה לשיר
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Song metadata */}
      <Card className="!p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">פרטי השיר</h2>
        <Input label="שם השיר" value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="מלחין" value={composer} onChange={(e) => setComposer(e.target.value)} dir="auto" />
          <Input label="משורר / כותב מילים" value={lyricist} onChange={(e) => setLyricist(e.target.value)} dir="auto" />
        </div>
        <Input label="מעבד" value={arranger} onChange={(e) => setArranger(e.target.value)} dir="auto" />
        {/* YouTube URL / Video ID (primary) */}
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="YouTube URL or Video ID"
                value={youtubeInput}
                onChange={(e) => handleYoutubeInput(e.target.value)}
                dir="ltr"
                placeholder="Paste YouTube URL or video ID"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const query = [title, composer].filter(Boolean).join(' ')
                window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank')
              }}
              className="shrink-0 mb-[1px] inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
              title="Search on YouTube"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              Find on YouTube
            </button>
          </div>
          {youtubeVideoId && (
            <div className="relative w-full overflow-hidden rounded-xl" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                className="absolute inset-0 h-full w-full rounded-xl"
              />
            </div>
          )}
        </div>

        {/* Spotify URL / Track ID (secondary) */}
        <details className="group">
          <summary className="cursor-pointer text-sm text-text-muted hover:text-foreground transition-colors">
            Spotify (optional)
          </summary>
          <div className="mt-3 space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Spotify URL or Track ID"
                  value={spotifyInput}
                  onChange={(e) => handleSpotifyInput(e.target.value)}
                  dir="ltr"
                  placeholder="Paste Spotify URL, URI, or track ID"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const query = [title, composer].filter(Boolean).join(' ')
                  window.open(`https://open.spotify.com/search/${encodeURIComponent(query)}`, '_blank')
                }}
                className="shrink-0 mb-[1px] inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
                title="Search on Spotify"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                Find on Spotify
              </button>
            </div>
            {spotifyTrackId && (
              <iframe
                src={`https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator&theme=0`}
                width="100%"
                height="152"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="rounded-xl"
              />
            )}
          </div>
        </details>
      </Card>

      {/* Chunks */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">קטעי השיר ({chunks.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            {audioTracks.length > 0 && chunks.some((c) => c.lyrics.trim()) && (
              <Button
                variant="primary"
                size="sm"
                loading={autoSyncing}
                onClick={() => {
                  // Prefer mix/playback track, otherwise use the first one
                  const preferred = audioTracks.find((t) => t.voicePart === 'mix')
                    || audioTracks.find((t) => t.voicePart === 'playback')
                    || audioTracks[0]
                  handleAutoSync(preferred.id)
                }}
              >
                {autoSyncing ? 'מסנכרן...' : 'סנכרון אוטומטי'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setLyricsSearchOpen(true); handleLyricsSearch() }}
            >
              חיפוש מילים
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPasteModalOpen(true)}
            >
              הדבקה חכמה
            </Button>
          </div>
        </div>

        {/* Auto-sync status */}
        {autoSyncing && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-foreground">מסנכרן עם AI... ההמתנה עשויה להימשך עד 30 שניות</span>
          </div>
        )}
        {autoSyncDone && !autoSyncing && (
          <div className="flex items-center justify-between rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground">סנכרון אוטומטי הושלם!</span>
              {audioTracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const preferred = audioTracks.find((t) => t.voicePart === 'mix')
                      || audioTracks.find((t) => t.voicePart === 'playback')
                      || audioTracks[0]
                    startPreview(preferred.fileUrl)
                  }}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark transition-colors"
                >
                  {previewPlaying ? 'Playing...' : 'Preview'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAutoSyncDone(false)}
              className="text-xs text-text-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>
        )}
        {autoSyncError && (
          <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
            <span className="text-sm text-danger">{autoSyncError}</span>
            <button
              type="button"
              onClick={() => setAutoSyncError(null)}
              className="text-xs text-text-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>
        )}
        {chunks.map((chunk, idx) => (
          <Card key={chunk.id} className="!p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-text-muted">#{idx + 1}</span>
              <Input
                value={chunk.label}
                onChange={(e) => updateChunkLabel(idx, e.target.value)}
                dir="auto"
                placeholder="תווית (בית 1, פזמון...)"
              />
              {chunk.lineTimestamps && (
                <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  מסונכרן
                </span>
              )}
            </div>
            <TextArea
              value={chunk.lyrics}
              onChange={(e) => updateChunkLyrics(idx, e.target.value)}
              dir="auto"
              rows={Math.max(3, chunk.lyrics.split('\n').length + 1)}
              placeholder="מילות הקטע..."
            />
            {/* Inline timestamp preview */}
            {chunk.lineTimestamps && chunk.lineTimestamps.length > 0 && (
              <div className="rounded-lg bg-background border border-border/50 p-3 space-y-0.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-text-muted uppercase tracking-wider">Timestamps</span>
                  {audioTracks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const preferred = audioTracks.find((t) => t.voicePart === 'mix')
                          || audioTracks.find((t) => t.voicePart === 'playback')
                          || audioTracks[0]
                        if (!previewPlaying || previewTrackUrl !== preferred.fileUrl) {
                          startPreview(preferred.fileUrl)
                        }
                        seekPreview(chunk.lineTimestamps![0])
                      }}
                      className="text-[12px] font-medium text-primary hover:underline"
                    >
                      {previewPlaying ? 'Playing' : 'Play'}
                    </button>
                  )}
                </div>
                {chunk.lyrics.split('\n').filter((l) => l.trim()).map((line, i) => {
                  const ts = chunk.lineTimestamps![i]
                  const isActive = previewPlaying && ts !== undefined && (() => {
                    const nextTs = chunk.lineTimestamps![i + 1]
                    return previewTime >= ts && (nextTs === undefined || previewTime < nextTs)
                  })()
                  return (
                    <div
                      key={i}
                      className={[
                        'flex gap-2 rounded px-1.5 py-0.5 cursor-pointer hover:bg-surface-hover transition-colors',
                        isActive ? 'bg-primary/10' : '',
                      ].join(' ')}
                      onClick={() => {
                        if (ts !== undefined && audioTracks.length > 0) {
                          const preferred = audioTracks.find((t) => t.voicePart === 'mix')
                            || audioTracks.find((t) => t.voicePart === 'playback')
                            || audioTracks[0]
                          if (!previewAudioRef.el || previewTrackUrl !== preferred.fileUrl) {
                            startPreview(preferred.fileUrl)
                          }
                          seekPreview(ts)
                          if (!previewPlaying && previewAudioRef.el) {
                            previewAudioRef.el.play()
                            setPreviewPlaying(true)
                          }
                        }
                      }}
                    >
                      <span className="w-10 shrink-0 text-xs font-mono text-primary tabular-nums">
                        {ts !== undefined ? formatTime(ts) : '--:--'}
                      </span>
                      <span className={['text-xs', isActive ? 'text-foreground font-medium' : 'text-text-muted'].join(' ')} dir="auto">
                        {line}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex items-center gap-2">
              {(youtubeVideoId || audioTracks.length > 0) && chunk.lyrics.trim() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSyncChunkIndex(idx)}
                >
                  {chunk.lineTimestamps ? 'סנכרון מחדש' : 'סנכרון מילים'}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger/10 ms-auto"
                onClick={() => handleDeleteChunk(idx)}
                loading={deletingChunkId === chunk.id}
              >
                מחיקת קטע
              </Button>
            </div>
          </Card>
        ))}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleAddChunk}
            loading={addingChunk}
            className="flex-1"
          >
            + הוספת קטע
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPasteModalOpen(true)}
            className="flex-1"
          >
            Smart Paste - הדבקה חכמה
          </Button>
        </div>
      </div>

      {/* Audio Tracks */}
      <Card className="!p-6">
        <AudioUploadPanel
          songId={songId}
          existingTracks={audioTracks}
          onTrackAdded={(track) => setAudioTracks((prev) => [...prev, track])}
          onTrackDeleted={(trackId) => setAudioTracks((prev) => prev.filter((t) => t.id !== trackId))}
        />
      </Card>

      {/* Save */}
      <div className="sticky bottom-4 flex gap-3">
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          loading={saving}
          onClick={() => handleSave(false)}
        >
          {saved ? 'נשמר!' : 'שמירה'}
        </Button>
        <Button
          variant="outline"
          size="lg"
          loading={saving}
          onClick={() => handleSave(true)}
        >
          שמירה ויציאה
        </Button>
      </div>

      {/* Floating preview player */}
      {previewPlaying && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-foreground/90 px-4 py-2 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => seekPreview(Math.max(0, previewTime - 3000))}
            className="text-background/70 hover:text-white p-1"
            aria-label="Skip back 3 seconds"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={togglePreview}
            className="text-background hover:text-white p-1"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => seekPreview(previewTime + 3000)}
            className="text-background/70 hover:text-white p-1"
            aria-label="Skip forward 3 seconds"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
          </button>
          <span className="text-xs font-mono text-background/80 tabular-nums mx-1">
            {formatTime(previewTime)}
          </span>
          <button
            type="button"
            onClick={() => { previewAudioRef.el?.pause(); setPreviewPlaying(false) }}
            className="text-background/60 hover:text-white text-xs"
          >
            Stop
          </button>
        </div>
      )}

      {/* Sync Lyrics Modal */}
      <Modal
        isOpen={syncChunkIndex !== null}
        onClose={() => setSyncChunkIndex(null)}
        title={`סנכרון מילים - ${syncChunkIndex !== null ? chunks[syncChunkIndex]?.label : ''} (${(syncChunkIndex ?? 0) + 1}/${chunks.length})`}
        className="max-w-2xl"
      >
        {syncChunkIndex !== null && (youtubeVideoId || audioTracks.length > 0) && chunks[syncChunkIndex] && (
          <LyricsSyncTool
            videoId={youtubeVideoId || undefined}
            audioTracks={audioTracks}
            lyrics={chunks[syncChunkIndex].lyrics}
            chunkId={chunks[syncChunkIndex].id}
            songId={songId}
            existingTimestamps={chunks[syncChunkIndex].lineTimestamps}
            startTimeMs={
              // Start from the last timestamp of the previous chunk so the user doesn't re-listen
              syncChunkIndex > 0
                ? chunks[syncChunkIndex - 1]?.lineTimestamps?.at(-1) ?? 0
                : 0
            }
            onSaved={(timestamps) => {
              setChunks((prev) => {
                const updated = [...prev]
                updated[syncChunkIndex] = { ...updated[syncChunkIndex], lineTimestamps: timestamps }
                return updated
              })
              setSyncChunkIndex(null)
            }}
            onSavedAndNext={
              // Only provide if there's a next chunk with lyrics to sync
              syncChunkIndex < chunks.length - 1 && chunks[syncChunkIndex + 1]?.lyrics.trim()
                ? (timestamps) => {
                    setChunks((prev) => {
                      const updated = [...prev]
                      updated[syncChunkIndex] = { ...updated[syncChunkIndex], lineTimestamps: timestamps }
                      return updated
                    })
                    setSyncChunkIndex(syncChunkIndex + 1)
                  }
                : undefined
            }
            onClose={() => setSyncChunkIndex(null)}
          />
        )}
      </Modal>

      {/* Lyrics Search Modal */}
      <Modal
        isOpen={lyricsSearchOpen}
        onClose={() => { setLyricsSearchOpen(false); setSelectedLyricsIndex(null) }}
        title="חיפוש מילים לשיר"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {lyricsSearching && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <span className="ms-3 text-sm text-text-muted">מחפש מילים עבור &quot;{title}&quot;...</span>
            </div>
          )}

          {!lyricsSearching && lyricsResults.length === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-text-muted text-center py-4">
                לא נמצאו תוצאות אוטומטיות. נסו לחפש ידנית:
              </p>
            </div>
          )}

          {!lyricsSearching && lyricsResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">
                נמצאו {lyricsResults.length} תוצאות. בחרו את הגרסה הנכונה:
              </p>
              {lyricsResults.map((result, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedLyricsIndex(selectedLyricsIndex === idx ? null : idx)}
                  className={[
                    'w-full text-start rounded-lg border p-4 transition-colors',
                    selectedLyricsIndex === idx
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50',
                  ].join(' ')}
                >
                  <div className="mb-2 flex items-center justify-between">
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
                      selectedLyricsIndex === idx ? '' : 'line-clamp-4',
                    ].join(' ')}
                    dir="auto"
                  >
                    {result.lyrics}
                  </p>
                  {selectedLyricsIndex !== idx && result.lyrics.split('\n').length > 4 && (
                    <span className="mt-1 block text-xs text-primary">לחצו לצפייה במילים המלאות</span>
                  )}
                </button>
              ))}

              {selectedLyricsIndex !== null && (
                <Button
                  variant="primary"
                  onClick={handleImportLyrics}
                  loading={lyricsImporting}
                  className="w-full"
                >
                  ייבוא מילים
                </Button>
              )}
            </div>
          )}

          {/* Fallback: manual search links */}
          {!lyricsSearching && lyricsSearchLinks.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs text-text-muted">
                {lyricsResults.length > 0 ? 'לא מצאתם? ' : ''}חפשו ידנית והדביקו עם Smart Paste:
              </p>
              <div className="flex flex-wrap gap-2">
                {lyricsSearchLinks.map((link) => (
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
            </div>
          )}
        </div>
      </Modal>

      {/* Smart Paste Modal */}
      <Modal
        isOpen={pasteModalOpen}
        onClose={() => { setPasteModalOpen(false); setParsedPreview([]) }}
        title="הדבקה חכמה - Smart Paste"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            הדביקו את כל מילות השיר. המערכת תזהה אוטומטית בתים, פזמונות וגשרים.
          </p>
          <p className="text-xs text-text-muted">
            טיפ: השאירו שורה ריקה בין קטעים. ניתן להוסיף כותרות כמו &quot;פזמון&quot;, &quot;בית 1&quot;, &quot;גשר&quot;.
          </p>
          <TextArea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            dir="auto"
            rows={12}
            placeholder={"בית 1\nשורה ראשונה של הבית\nשורה שנייה\n\nפזמון\nשורה ראשונה של הפזמון\nשורה שנייה\n\nבית 2\n..."}
          />
          <Button
            variant="outline"
            onClick={handleParseLyrics}
            disabled={!pasteText.trim()}
            className="w-full"
          >
            נתח מילים
          </Button>

          {/* Preview parsed sections */}
          {parsedPreview.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                תוצאה: {parsedPreview.length} קטעים זוהו
              </h3>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {parsedPreview.map((section, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {section.label}
                      </span>
                      <span className="text-xs text-text-muted">
                        {section.chunkType}
                      </span>
                    </div>
                    <p className="whitespace-pre-line text-sm text-foreground line-clamp-3" dir="auto">
                      {section.lyrics}
                    </p>
                  </div>
                ))}
              </div>
              <Button
                variant="primary"
                onClick={handleImportParsed}
                loading={importing}
                className="w-full"
              >
                ייבוא {parsedPreview.length} קטעים
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
