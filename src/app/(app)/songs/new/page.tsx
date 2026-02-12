'use client'

import { useState, useCallback } from 'react'
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

  // Save state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      // URL tab is placeholder — just show the URL was entered
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
      router.push(`/songs/${data.song.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה')
    } finally {
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
            {t('autoChunk')} — {detectedChunks.length} קטעים זוהו
          </h3>
          <div className="space-y-2">
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
            dir="auto"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={t('composer')}
              placeholder="לחן"
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              dir="auto"
            />
            <Input
              label={t('lyricist')}
              placeholder="מילים"
              value={lyricist}
              onChange={(e) => setLyricist(e.target.value)}
              dir="auto"
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
        </div>
      </Card>

      {/* Tabs for lyrics input method */}
      <Card>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3">
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
          {t('save')}
        </Button>
      </div>
    </div>
  )
}
