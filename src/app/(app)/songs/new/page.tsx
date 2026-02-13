'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import TextArea from '@/components/ui/TextArea'
import Select from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { useChoirStore } from '@/stores/useChoirStore'
import type { VoicePart } from '@/lib/audio/types'

// ── Voice part helpers ──────────────────────────────────────────────

const VOICE_PART_OPTIONS: { value: VoicePart; label: string }[] = [
  { value: 'soprano', label: 'סופרן' },
  { value: 'mezzo', label: 'מצו' },
  { value: 'alto', label: 'אלט' },
  { value: 'tenor', label: 'טנור' },
  { value: 'baritone', label: 'בריטון' },
  { value: 'bass', label: 'בס' },
  { value: 'mix', label: 'מיקס' },
  { value: 'playback', label: 'פלייבק' },
  { value: 'full', label: 'מלא' },
]

const FILENAME_PATTERNS: { pattern: RegExp; part: VoicePart }[] = [
  { pattern: /soprano|סופרן/i, part: 'soprano' },
  { pattern: /mezzo|מצו/i, part: 'mezzo' },
  { pattern: /alto|אלט/i, part: 'alto' },
  { pattern: /tenor|טנור/i, part: 'tenor' },
  { pattern: /baritone|בריטון/i, part: 'baritone' },
  { pattern: /bass|בס(?!ס)/i, part: 'bass' },
  { pattern: /mix|מיקס/i, part: 'mix' },
  { pattern: /playback|פלייבק/i, part: 'playback' },
  { pattern: /full|מלא/i, part: 'full' },
]

function detectVoicePart(filename: string): VoicePart {
  for (const { pattern, part } of FILENAME_PATTERNS) {
    if (pattern.test(filename)) return part
  }
  return 'full'
}

const ACCEPTED_AUDIO_TYPES = '.mp3,.m4a,.wav,.ogg,.webm'
const MAX_AUDIO_SIZE = 50 * 1024 * 1024 // 50MB

// ── Audio upload file type ──────────────────────────────────────────

interface AudioUploadFile {
  file: File
  voicePart: VoicePart
  progress: number
  status: 'pending' | 'uploading' | 'confirming' | 'done' | 'error'
  error?: string
}

// ── Chunk types and Hebrew header patterns ──────────────────────────

interface DetectedChunk {
  label: string
  chunkType: string
  lyrics: string
  order: number
}

const HEBREW_HEADER_PATTERNS: [RegExp, string, string][] = [
  [/^פזמון\s*[:\-]?\s*/i, 'פזמון', 'chorus'],
  [/^בית\s*(\d+)?\s*[:\-]?\s*/i, 'בית', 'verse'],
  [/^גשר\s*[:\-]?\s*/i, 'גשר', 'bridge'],
  [/^פתיחה\s*[:\-]?\s*/i, 'פתיחה', 'intro'],
  [/^סיום\s*[:\-]?\s*/i, 'סיום', 'outro'],
  [/^מעבר\s*[:\-]?\s*/i, 'מעבר', 'transition'],
  [/^קודה\s*[:\-]?\s*/i, 'קודה', 'coda'],
]

function detectLanguage(text: string): 'he' | 'en' | 'mixed' {
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length
  const total = hebrewChars + latinChars
  if (total === 0) return 'he'
  const hebrewRatio = hebrewChars / total
  if (hebrewRatio > 0.7) return 'he'
  if (hebrewRatio < 0.3) return 'en'
  return 'mixed'
}

/**
 * Simple auto-chunk detection:
 * 1. Split on blank lines
 * 2. Check if a section's first line is a Hebrew header (בית, פזמון, גשר...)
 * 3. Fall back to labeling as "בית N"
 */
function autoDetectChunks(lyrics: string): DetectedChunk[] {
  const rawSections = lyrics
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (rawSections.length === 0) return []

  const chunks: DetectedChunk[] = []
  let verseCounter = 1

  for (let i = 0; i < rawSections.length; i++) {
    const section = rawSections[i]
    const firstLine = section.split('\n')[0].trim()
    let label = ''
    let chunkType = 'verse'
    let lyricsBody = section

    // Check if the first line matches a known Hebrew header
    let matched = false
    for (const [pattern, hebrewLabel, type] of HEBREW_HEADER_PATTERNS) {
      if (pattern.test(firstLine)) {
        chunkType = type
        // Check if the header line contains lyrics beyond just the header
        const remaining = firstLine.replace(pattern, '').trim()
        if (remaining) {
          // Header is on the same line as lyrics
          label = hebrewLabel + (type === 'verse' ? ` ${verseCounter}` : '')
          lyricsBody = remaining + '\n' + section.split('\n').slice(1).join('\n')
          lyricsBody = lyricsBody.trim()
        } else {
          // Header is standalone, body is the rest
          label = hebrewLabel + (type === 'verse' ? ` ${verseCounter}` : '')
          lyricsBody = section.split('\n').slice(1).join('\n').trim()
        }
        if (type === 'verse') verseCounter++
        matched = true
        break
      }
    }

    if (!matched) {
      chunkType = 'verse'
      label = `בית ${verseCounter}`
      verseCounter++
      lyricsBody = section
    }

    chunks.push({
      label,
      chunkType,
      lyrics: lyricsBody,
      order: i,
    })
  }

  return chunks
}

// ── YouTube helpers ─────────────────────────────────────────────────

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

// ── Manual entry row ────────────────────────────────────────────────

interface ManualChunk {
  label: string
  chunkType: string
  lyrics: string
}

// ── Component ───────────────────────────────────────────────────────

export default function NewSongPage() {
  const router = useRouter()
  const t = useTranslations('songs')
  const tChunks = useTranslations('chunks')
  const tCommon = useTranslations('common')
  const { activeChoirId } = useChoirStore()

  // Shared fields
  const [title, setTitle] = useState('')
  const [composer, setComposer] = useState('')
  const [lyricist, setLyricist] = useState('')
  const [language, setLanguage] = useState('he')

  // YouTube
  const [youtubeInput, setYoutubeInput] = useState('')
  const [youtubeVideoId, setYoutubeVideoId] = useState('')

  function handleYoutubeInput(value: string) {
    setYoutubeInput(value)
    const extracted = extractYoutubeVideoId(value)
    setYoutubeVideoId(extracted)
  }

  // Tab state
  const [activeTab, setActiveTab] = useState('paste')

  // Paste tab
  const [pastedLyrics, setPastedLyrics] = useState('')
  const [detectedChunks, setDetectedChunks] = useState<DetectedChunk[]>([])

  // URL tab
  const [url, setUrl] = useState('')

  // Manual tab
  const [manualChunks, setManualChunks] = useState<ManualChunk[]>([
    { label: 'בית 1', chunkType: 'verse', lyrics: '' },
  ])

  // Audio file upload (pre-creation staging)
  const [audioFiles, setAudioFiles] = useState<AudioUploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)

  // Save state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Post-creation upload phase
  const [createdSongId, setCreatedSongId] = useState<string | null>(null)
  const [uploadPhase, setUploadPhase] = useState(false)
  const [uploadingAll, setUploadingAll] = useState(false)

  // Auto-detect when lyrics change
  const handleLyricsChange = useCallback(
    (text: string) => {
      setPastedLyrics(text)
      if (text.trim()) {
        const chunks = autoDetectChunks(text)
        setDetectedChunks(chunks)
        // Auto-detect language
        const detected = detectLanguage(text)
        setLanguage(detected)
      } else {
        setDetectedChunks([])
      }
    },
    [],
  )

  // Manual chunk management
  function addManualChunk() {
    setManualChunks((prev) => [
      ...prev,
      {
        label: `בית ${prev.length + 1}`,
        chunkType: 'verse',
        lyrics: '',
      },
    ])
  }

  function updateManualChunk(
    index: number,
    field: keyof ManualChunk,
    value: string,
  ) {
    setManualChunks((prev) =>
      prev.map((chunk, i) =>
        i === index ? { ...chunk, [field]: value } : chunk,
      ),
    )
  }

  function removeManualChunk(index: number) {
    setManualChunks((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Audio file management ─────────────────────────────────────────

  const addAudioFiles = useCallback((fileList: FileList) => {
    const newFiles: AudioUploadFile[] = []
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      if (file.size > MAX_AUDIO_SIZE) continue
      newFiles.push({
        file,
        voicePart: detectVoicePart(file.name),
        progress: 0,
        status: 'pending',
      })
    }
    setAudioFiles((prev) => [...prev, ...newFiles])
  }, [])

  const handleAudioDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleAudioDragLeave = () => setIsDragging(false)
  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      addAudioFiles(e.dataTransfer.files)
    }
  }

  const setAudioFileVoicePart = (index: number, part: VoicePart) => {
    setAudioFiles((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], voicePart: part }
      return updated
    })
  }

  const removeAudioFile = (index: number) => {
    setAudioFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // Upload a single audio file (requires songId)
  async function uploadSingleAudioFile(songId: string, index: number) {
    const entry = audioFiles[index]
    if (!entry || entry.status !== 'pending') return

    setAudioFiles((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], status: 'uploading', progress: 30 }
      return updated
    })

    try {
      // 1. Get presigned URL
      const presignRes = await fetch(`/api/songs/${songId}/audio-tracks/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voicePart: entry.voicePart,
          filename: entry.file.name,
          contentType: entry.file.type || 'audio/mpeg',
        }),
      })

      if (!presignRes.ok) {
        const data = await presignRes.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to get upload URL')
      }

      const { uploadUrl, key } = await presignRes.json()

      setAudioFiles((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], progress: 50 }
        return updated
      })

      // 2. Upload to S3 via PUT
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': entry.file.type || 'audio/mpeg' },
        body: entry.file,
      })

      if (!uploadRes.ok) {
        throw new Error('Upload to S3 failed')
      }

      setAudioFiles((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], status: 'confirming', progress: 80 }
        return updated
      })

      // 3. Confirm upload
      const confirmRes = await fetch(`/api/songs/${songId}/audio-tracks/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          voicePart: entry.voicePart,
        }),
      })

      if (!confirmRes.ok) {
        const data = await confirmRes.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to confirm upload')
      }

      setAudioFiles((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], status: 'done', progress: 100 }
        return updated
      })
    } catch (err) {
      setAudioFiles((prev) => {
        const updated = [...prev]
        updated[index] = {
          ...updated[index],
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed',
        }
        return updated
      })
    }
  }

  // Upload all pending audio files for a given songId
  async function uploadAllAudioFiles(songId: string) {
    setUploadingAll(true)
    for (let i = 0; i < audioFiles.length; i++) {
      if (audioFiles[i].status === 'pending') {
        await uploadSingleAudioFile(songId, i)
      }
    }
    setUploadingAll(false)
  }

  // Save song
  async function handleSave() {
    setError(null)

    if (!title.trim()) {
      setError('נא להזין שם שיר')
      return
    }

    let chunksToSave: DetectedChunk[] = []

    if (activeTab === 'paste') {
      if (detectedChunks.length === 0) {
        setError('נא להזין מילות שיר')
        return
      }
      chunksToSave = detectedChunks
    } else if (activeTab === 'manual') {
      const validChunks = manualChunks.filter((c) => c.lyrics.trim())
      if (validChunks.length === 0) {
        setError('נא להזין לפחות קטע אחד')
        return
      }
      chunksToSave = validChunks.map((c, i) => ({
        label: c.label,
        chunkType: c.chunkType,
        lyrics: c.lyrics,
        order: i,
      }))
    } else if (activeTab === 'url') {
      // URL tab is placeholder -- just show the URL was entered
      if (!url.trim()) {
        setError('נא להזין קישור')
        return
      }
      // For now, we cannot actually extract from URL on client side
      setError('חילוץ מקישור עדיין לא נתמך. נסו להדביק את המילים ישירות.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          composer: composer.trim() || undefined,
          lyricist: lyricist.trim() || undefined,
          language,
          youtubeVideoId: youtubeVideoId || undefined,
          isPersonal: !activeChoirId,
          choirId: activeChoirId || undefined,
          chunks: chunksToSave,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      const data = await res.json()
      const newSongId = data.song.id

      // If there are audio files to upload, enter upload phase
      const pendingAudio = audioFiles.filter((f) => f.status === 'pending')
      if (pendingAudio.length > 0) {
        setCreatedSongId(newSongId)
        setUploadPhase(true)
        setSaving(false)
        // Auto-start uploading
        await uploadAllAudioFiles(newSongId)
      } else {
        // No audio files, navigate directly
        router.push(`/songs/${newSongId}`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  const chunkTypeOptions = [
    { value: 'verse', label: tChunks('verse') },
    { value: 'chorus', label: tChunks('chorus') },
    { value: 'bridge', label: tChunks('bridge') },
    { value: 'intro', label: tChunks('intro') },
    { value: 'outro', label: tChunks('outro') },
    { value: 'transition', label: tChunks('transition') },
    { value: 'coda', label: tChunks('coda') },
    { value: 'custom', label: tChunks('custom') },
  ]

  const languageOptions = [
    { value: 'he', label: t('hebrew') },
    { value: 'en', label: t('english') },
    { value: 'mixed', label: t('mixed') },
  ]

  const pendingAudioCount = audioFiles.filter((f) => f.status === 'pending').length
  const allAudioDone = audioFiles.length > 0 && audioFiles.every((f) => f.status === 'done' || f.status === 'error')

  // ── Upload phase (post-creation) ──────────────────────────────────

  if (uploadPhase && createdSongId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">העלאת קבצי שמע</h1>
        </div>

        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
              <svg className="h-5 w-5 text-success shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-foreground">
                השיר <strong dir="auto">{title}</strong> נוצר בהצלחה! מעלה קבצי שמע...
              </span>
            </div>

            <div className="space-y-2">
              {audioFiles.map((entry, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {VOICE_PART_OPTIONS.find((o) => o.value === entry.voicePart)?.label ?? entry.voicePart}
                  </span>
                  <span className="flex-1 truncate text-sm text-foreground" dir="ltr">
                    {entry.file.name}
                  </span>

                  {entry.status === 'uploading' && (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-border/40">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: `${entry.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-text-muted">{entry.progress}%</span>
                    </div>
                  )}
                  {entry.status === 'confirming' && (
                    <span className="text-xs text-text-muted">מאשר...</span>
                  )}
                  {entry.status === 'done' && (
                    <span className="text-xs text-success font-medium">הועלה</span>
                  )}
                  {entry.status === 'error' && (
                    <span className="text-xs text-danger" title={entry.error}>שגיאה: {entry.error}</span>
                  )}
                  {entry.status === 'pending' && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  )}
                </div>
              ))}
            </div>

            {uploadingAll && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-text-muted">מעלה קבצים...</span>
              </div>
            )}

            {allAudioDone && (
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => router.push(`/songs/${createdSongId}`)}
                >
                  מעבר לשיר
                </Button>
              </div>
            )}

            {!uploadingAll && !allAudioDone && (
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => router.push(`/songs/${createdSongId}`)}
                >
                  דלג על ההעלאה
                </Button>
                <Button
                  variant="primary"
                  onClick={() => uploadAllAudioFiles(createdSongId)}
                >
                  נסה שוב
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  // ── Tab content ─────────────────────────────────────────────────

  const pasteTabContent = (
    <div className="space-y-4">
      <TextArea
        label={t('lyrics')}
        placeholder={t('lyricsPlaceholder')}
        rows={10}
        value={pastedLyrics}
        onChange={(e) => handleLyricsChange(e.target.value)}
        dir="auto"
      />

      {/* Detected chunks preview */}
      {detectedChunks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t('autoChunk')} - {detectedChunks.length} קטעים זוהו
          </h3>
          <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-border/40 p-2">
            {detectedChunks.map((chunk, index) => (
              <Card key={index} className="!p-3">
                <div className="flex items-start gap-3">
                  <Badge
                    variant={
                      chunk.chunkType === 'chorus'
                        ? 'primary'
                        : chunk.chunkType === 'bridge'
                          ? 'developing'
                          : 'default'
                    }
                  >
                    {chunk.label}
                  </Badge>
                  <p
                    className="flex-1 whitespace-pre-line text-sm text-foreground line-clamp-3"
                    dir="auto"
                  >
                    {chunk.lyrics}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const urlTabContent = (
    <div className="space-y-4">
      <Input
        label={t('pasteUrl')}
        placeholder={t('urlPlaceholder')}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        dir="ltr"
      />
      <p className="text-sm text-text-muted">
        תמיכה בשירונט, Tab4U, ואתרי מילים נוספים (בקרוב)
      </p>
    </div>
  )

  const manualTabContent = (
    <div className="space-y-4">
      {manualChunks.map((chunk, index) => (
        <Card key={index} className="!p-4">
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label={`שם הקטע`}
                  value={chunk.label}
                  onChange={(e) =>
                    updateManualChunk(index, 'label', e.target.value)
                  }
                  dir="auto"
                />
              </div>
              <div className="w-28 sm:w-36">
                <Select
                  label="סוג"
                  options={chunkTypeOptions}
                  value={chunk.chunkType}
                  onChange={(e) =>
                    updateManualChunk(index, 'chunkType', e.target.value)
                  }
                />
              </div>
              {manualChunks.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeManualChunk(index)}
                  className="text-danger hover:text-danger"
                >
                  <svg
                    className="h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </Button>
              )}
            </div>
            <TextArea
              label={t('lyrics')}
              placeholder="הזינו את מילות הקטע..."
              rows={4}
              value={chunk.lyrics}
              onChange={(e) =>
                updateManualChunk(index, 'lyrics', e.target.value)
              }
              dir="auto"
            />
          </div>
        </Card>
      ))}

      <Button variant="outline" size="sm" onClick={addManualChunk}>
        + {t('addChunk')}
      </Button>
    </div>
  )

  const tabs = [
    { key: 'paste', label: t('pasteText'), content: pasteTabContent },
    { key: 'url', label: t('pasteUrl'), content: urlTabContent },
    { key: 'manual', label: t('manualCreate'), content: manualTabContent },
  ]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <svg
            className="h-5 w-5 rtl:rotate-180"
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
        <h1 className="text-2xl font-bold text-foreground">{t('addSong')}</h1>
      </div>

      {/* Common fields */}
      <Card>
        <div className="space-y-4">
          <Input
            label={t('songTitle')}
            placeholder="הזינו את שם השיר..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            dir="rtl"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={t('composer')}
              placeholder="לחן"
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              dir="rtl"
            />
            <Input
              label={t('lyricist')}
              placeholder="מילים"
              value={lyricist}
              onChange={(e) => setLyricist(e.target.value)}
              dir="rtl"
            />
          </div>

          <div className="w-48">
            <Select
              label={t('language')}
              options={languageOptions}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </div>

          {/* YouTube URL / Video ID */}
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="YouTube URL / Video ID"
                  value={youtubeInput}
                  onChange={(e) => handleYoutubeInput(e.target.value)}
                  dir="ltr"
                  placeholder="הדביקו קישור YouTube או מזהה וידאו"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const query = [title, composer].filter(Boolean).join(' ')
                  if (query) {
                    window.open(
                      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
                      '_blank',
                    )
                  }
                }}
                className="shrink-0 mb-[1px] inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
                title="חפשו ב-YouTube"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                חפשו ב-YouTube
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
        </div>
      </Card>

      {/* Tabs for lyrics input method */}
      <Card>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </Card>

      {/* Audio file upload section */}
      <Card>
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-foreground">
            קבצי שמע לקולות
          </h3>
          <p className="text-sm text-text-muted">
            העלו קבצי MP3 לקולות השונים (סופרן, אלט, טנור, בס, מיקס, פלייבק). הקבצים יועלו לאחר יצירת השיר.
          </p>

          {/* Drop zone */}
          <div
            onDragOver={handleAudioDragOver}
            onDragLeave={handleAudioDragLeave}
            onDrop={handleAudioDrop}
            onClick={() => audioInputRef.current?.click()}
            className={[
              'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50',
            ].join(' ')}
          >
            <svg className="h-8 w-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-text-muted">
              גררו קבצי שמע לכאן או לחצו לבחירה
            </p>
            <p className="text-xs text-text-muted">
              MP3, M4A, WAV, OGG - עד 50MB
            </p>
            <input
              ref={audioInputRef}
              type="file"
              accept={ACCEPTED_AUDIO_TYPES}
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addAudioFiles(e.target.files)}
            />
          </div>

          {/* Staged audio files list */}
          {audioFiles.length > 0 && (
            <div className="space-y-2">
              {audioFiles.map((entry, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                >
                  {/* Voice part selector */}
                  <select
                    value={entry.voicePart}
                    onChange={(e) => setAudioFileVoicePart(idx, e.target.value as VoicePart)}
                    disabled={entry.status !== 'pending'}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
                  >
                    {VOICE_PART_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {/* Filename */}
                  <span className="flex-1 truncate text-sm text-foreground" dir="ltr">
                    {entry.file.name}
                  </span>

                  {/* File size */}
                  <span className="text-xs text-text-muted shrink-0">
                    {(entry.file.size / (1024 * 1024)).toFixed(1)}MB
                  </span>

                  {/* Remove button */}
                  {entry.status === 'pending' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeAudioFile(idx) }}
                      className="text-xs text-danger hover:underline"
                    >
                      הסר
                    </button>
                  )}
                </div>
              ))}

              {pendingAudioCount > 0 && (
                <p className="text-xs text-text-muted">
                  {pendingAudioCount} {pendingAudioCount === 1 ? 'קובץ ממתין' : 'קבצים ממתינים'} להעלאה - יועלו לאחר יצירת השיר
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border/40 bg-background py-4">
        <Button
          variant="ghost"
          onClick={() => router.push('/songs')}
        >
          {t('cancel')}
        </Button>
        <Button
          variant="primary"
          size="lg"
          loading={saving}
          onClick={handleSave}
        >
          {audioFiles.length > 0
            ? `${t('save')} והעלאת ${audioFiles.length} ${audioFiles.length === 1 ? 'קובץ' : 'קבצים'}`
            : t('save')
          }
        </Button>
      </div>
    </div>
  )
}
