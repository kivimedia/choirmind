'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { useChoirStore } from '@/stores/useChoirStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AudioFile {
  voicePart: string
  url: string
  durationMs?: number
}

interface ScannedSong {
  title: string
  composer?: string
  lyricist?: string
  arranger?: string
  audioFiles: AudioFile[]
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ScanPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { activeChoirId } = useChoirStore()

  const [url, setUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [songs, setSongs] = useState<ScannedSong[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [existingTitles, setExistingTitles] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, errors: 0 })
  const [importDone, setImportDone] = useState(false)
  const [demucsStatus, setDemucsStatus] = useState<string | null>(null)
  const [rescanning, setRescanning] = useState(false)

  const isDirector = session?.user?.role === 'director' || session?.user?.role === 'admin'

  // Helper: normalise a title for dedup comparison (lowercase + trim)
  function normalizeTitle(t: string) {
    return t.trim().toLowerCase()
  }

  // Check whether a scanned song already exists in the choir
  function isSongExisting(song: ScannedSong) {
    return existingTitles.has(normalizeTitle(song.title))
  }

  // ── Scan ──────────────────────────────────────────────────────────────

  async function handleScan() {
    if (!url.trim()) return
    setScanning(true)
    setScanError(null)
    setSongs([])
    setSelected(new Set())
    setExistingTitles(new Set())
    setImportDone(false)

    try {
      // Fetch scanned songs and existing choir songs in parallel
      const [scanRes, existingRes] = await Promise.all([
        fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim(), choirId: activeChoirId }),
        }),
        fetch(`/api/songs?choirId=${activeChoirId}`),
      ])

      const scanData = await scanRes.json()
      if (!scanRes.ok) {
        setScanError(scanData.error || 'Failed to scan')
        return
      }

      // Build a set of normalised existing song titles
      let existingSet = new Set<string>()
      if (existingRes.ok) {
        const existingData = await existingRes.json()
        const existingSongs: { title: string }[] = existingData.songs || []
        existingSet = new Set(existingSongs.map((s) => normalizeTitle(s.title)))
      }
      setExistingTitles(existingSet)

      const scannedSongs: ScannedSong[] = scanData.songs || []
      setSongs(scannedSongs)
      setSource(scanData.source || null)

      // Auto-select only NEW songs (not already in choir)
      const newIndices = scannedSongs
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => !existingSet.has(normalizeTitle(s.title)))
        .map(({ i }) => i)
      setSelected(new Set(newIndices))
    } catch {
      setScanError('Network error')
    } finally {
      setScanning(false)
    }
  }

  // ── Toggle selection ──────────────────────────────────────────────────

  function toggleSong(index: number) {
    // Prevent toggling already-imported songs
    if (isSongExisting(songs[index])) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  // Count of selectable (new) songs
  const newSongIndices = songs
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !isSongExisting(s))
    .map(({ i }) => i)

  function toggleAll() {
    // Only toggle new (non-existing) songs
    const allNewSelected = newSongIndices.every((i) => selected.has(i))
    if (allNewSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(newSongIndices))
    }
  }

  // ── Import ────────────────────────────────────────────────────────────

  async function handleImport() {
    if (selected.size === 0 || !activeChoirId) return
    setImporting(true)
    setImportProgress({ done: 0, total: selected.size, errors: 0 })
    setImportDone(false)

    let done = 0
    let errors = 0
    const importedSongIds: string[] = []

    for (const idx of selected) {
      const song = songs[idx]
      try {
        // Create the song with a single placeholder chunk (lyrics TBD)
        const songRes = await fetch('/api/songs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: song.title,
            composer: song.composer || null,
            lyricist: song.lyricist || null,
            language: 'he',
            choirId: activeChoirId,
            chunks: [
              {
                label: 'שיר מלא',
                chunkType: 'verse',
                order: 0,
                lyrics: '(טקסט יתווסף מאוחר יותר)',
              },
            ],
          }),
        })

        if (!songRes.ok) {
          errors++
          done++
          setImportProgress({ done, total: selected.size, errors })
          continue
        }

        const songData = await songRes.json()
        const songId = songData.song?.id
        if (songId) importedSongIds.push(songId)

        // Create audio tracks
        if (songId && song.audioFiles.length > 0) {
          for (const audio of song.audioFiles) {
            try {
              await fetch(`/api/songs/${songId}/audio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  voicePart: audio.voicePart,
                  fileUrl: audio.url,
                  sourceUrl: audio.url,
                  durationMs: audio.durationMs || null,
                }),
              })
            } catch {
              // Non-critical — song was still created
            }
          }
        }

        done++
        setImportProgress({ done, total: selected.size, errors })
      } catch {
        errors++
        done++
        setImportProgress({ done, total: selected.size, errors })
      }
    }

    setImportDone(true)
    setImporting(false)

    // Auto-trigger Demucs reference preparation for imported songs
    if (importedSongIds.length > 0) {
      setDemucsStatus('מעבד אודיו לתרגול קולי...')
      try {
        const res = await fetch('/api/vocal-analysis/references/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: importedSongIds }),
        })
        if (res.ok) {
          const data = await res.json()
          setDemucsStatus(`${data.queued} הפניות קוליות נשלחו לעיבוד`)
        } else {
          setDemucsStatus('שגיאה בהפעלת עיבוד קולי')
        }
      } catch {
        setDemucsStatus('שגיאה בהפעלת עיבוד קולי')
      }
    }
  }

  // Rescan: process existing choir audio tracks that don't have references
  async function handleRescan() {
    if (!activeChoirId) return
    setRescanning(true)
    setDemucsStatus('סורק קבצי אודיו קיימים...')
    try {
      const res = await fetch('/api/vocal-analysis/references/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choirId: activeChoirId }),
      })
      if (res.ok) {
        const data = await res.json()
        setDemucsStatus(
          data.queued > 0
            ? `${data.queued} הפניות חדשות נשלחו לעיבוד (${data.skipped} כבר קיימות)`
            : 'כל קבצי האודיו כבר מעובדים'
        )
      } else {
        setDemucsStatus('שגיאה')
      }
    } catch {
      setDemucsStatus('שגיאה')
    } finally {
      setRescanning(false)
    }
  }

  // ── Guard ─────────────────────────────────────────────────────────────

  if (!isDirector) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-danger">גישה למנצחים בלבד</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/')}>
          חזרה
        </Button>
      </div>
    )
  }

  if (!activeChoirId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-text-muted">יש לבחור מקהלה תחילה</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/director')}>
          חזרה ללוח מנצח
        </Button>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">סריקת שירים</h1>
          <p className="mt-1 text-sm text-text-muted">
            הזינו כתובת אתר של מקהלה (Wix ועוד) לייבוא אוטומטי של שירים ואודיו
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/director')}>
          חזרה
        </Button>
      </div>

      {/* Rescan existing audio */}
      <Card className="!p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">עיבוד הפניות קוליות</p>
          <p className="text-xs text-text-muted">עבדו את כל קבצי האודיו הקיימים שטרם עובדו</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={rescanning}
          onClick={handleRescan}
        >
          סרוק מחדש
        </Button>
      </Card>

      {demucsStatus && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-foreground">
          {demucsStatus}
        </div>
      )}

      {/* URL input */}
      <Card className="!p-5">
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              label="כתובת אתר"
              placeholder="https://www.example.com/repertoire"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              dir="ltr"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleScan()
              }}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="primary"
              loading={scanning}
              onClick={handleScan}
              disabled={!url.trim()}
            >
              סרוק
            </Button>
          </div>
        </div>
        {scanError && (
          <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">
            {scanError}
          </div>
        )}
      </Card>

      {/* Results */}
      {songs.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex items-center justify-between rounded-lg bg-surface-hover px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">
                נמצאו {songs.length} שירים
              </span>
              {source && (
                <Badge variant="primary">{source === 'wix' ? 'Wix' : 'כללי'}</Badge>
              )}
              {songs.length - newSongIndices.length > 0 && (
                <Badge variant="default">
                  {songs.length - newSongIndices.length} כבר קיימים
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              {newSongIndices.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-sm text-primary hover:underline"
                >
                  {newSongIndices.every((i) => selected.has(i)) ? 'בטל הכל' : 'בחר הכל'}
                </button>
              )}
              <Badge variant="default">
                {selected.size} נבחרו
              </Badge>
            </div>
          </div>

          {/* Song list */}
          <div className="space-y-2">
            {songs.map((song, i) => {
              const existing = isSongExisting(song)
              return (
                <Card
                  key={i}
                  className={[
                    '!p-4 transition-colors',
                    existing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                    !existing && selected.has(i) ? 'ring-2 ring-primary/40' : '',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3" onClick={() => toggleSong(i)}>
                    {/* Checkbox */}
                    <div className="mt-0.5 shrink-0">
                      <div
                        className={[
                          'flex h-5 w-5 items-center justify-center rounded border-2 transition-colors',
                          existing
                            ? 'border-border bg-surface-hover cursor-not-allowed'
                            : selected.has(i)
                              ? 'border-primary bg-primary text-white'
                              : 'border-border bg-surface',
                        ].join(' ')}
                      >
                        {!existing && selected.has(i) && (
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Song info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={[
                          'font-medium',
                          existing ? 'text-text-muted line-through' : 'text-foreground',
                        ].join(' ')}>
                          {song.title}
                        </p>
                        {existing && (
                          <Badge variant="default" className="!bg-surface-hover !text-text-muted text-xs">
                            כבר קיים
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        {song.composer && <span>לחן: {song.composer}</span>}
                        {song.lyricist && <span>מילים: {song.lyricist}</span>}
                        {song.arranger && <span>עיבוד: {song.arranger}</span>}
                      </div>
                      {/* Audio parts */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {song.audioFiles.map((af, j) => (
                          <Badge key={j} variant="default">
                            {af.voicePart}
                            {af.durationMs ? ` (${Math.round(af.durationMs / 1000)}s)` : ''}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Import button */}
          <div className="sticky bottom-4 flex justify-center">
            <Button
              variant="primary"
              size="lg"
              loading={importing}
              disabled={selected.size === 0 || importDone}
              onClick={handleImport}
              className="shadow-lg"
            >
              {importDone
                ? `יובאו ${importProgress.done - importProgress.errors} שירים`
                : `ייבא ${selected.size} שירים`}
            </Button>
          </div>

          {/* Import progress */}
          {(importing || importDone) && (
            <Card className="!p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {importing ? 'מייבא...' : 'ייבוא הושלם'}
                  </span>
                  <span className="text-text-muted">
                    {importProgress.done}/{importProgress.total}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: importProgress.total > 0
                        ? `${(importProgress.done / importProgress.total) * 100}%`
                        : '0%',
                    }}
                  />
                </div>
                {importProgress.errors > 0 && (
                  <p className="text-xs text-danger">
                    {importProgress.errors} שגיאות
                  </p>
                )}
                {importDone && (
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => router.push('/songs')}>
                      לרשימת השירים
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setSongs([])
                      setSelected(new Set())
                      setImportDone(false)
                      setUrl('')
                    }}>
                      סריקה נוספת
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Empty state after scan with no results */}
      {!scanning && songs.length === 0 && source !== null && (
        <Card className="!p-8 text-center">
          <p className="text-lg text-text-muted">לא נמצאו שירים בכתובת זו</p>
          <p className="mt-1 text-sm text-text-muted">
            נסו כתובת אחרת או וודאו שהאתר מכיל קבצי שמע
          </p>
        </Card>
      )}
    </div>
  )
}
