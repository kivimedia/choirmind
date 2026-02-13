'use client'

import { useState, useRef, useCallback } from 'react'
import type { VoicePart } from '@/lib/audio/types'
import { SINGER_VOICE_PARTS } from '@/lib/audio/types'

// ---------------------------------------------------------------------------
// Voice part detection from filename
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UploadFile {
  file: File
  voicePart: VoicePart
  progress: number // 0-100
  status: 'pending' | 'uploading' | 'confirming' | 'done' | 'error'
  error?: string
}

interface AudioTrack {
  id: string
  voicePart: string
  fileUrl: string
  durationMs?: number | null
}

interface AudioUploadPanelProps {
  songId: string
  existingTracks: AudioTrack[]
  onTrackAdded?: (track: AudioTrack) => void
  onTrackDeleted?: (trackId: string) => void
}

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

const ACCEPTED_TYPES = '.mp3,.m4a,.wav,.ogg,.webm'
const MAX_SIZE = 50 * 1024 * 1024 // 50MB

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AudioUploadPanel({
  songId,
  existingTracks,
  onTrackAdded,
  onTrackDeleted,
}: AudioUploadPanelProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file selection (from input or drop)
  const addFiles = useCallback((fileList: FileList) => {
    const newFiles: UploadFile[] = []
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      if (file.size > MAX_SIZE) continue
      newFiles.push({
        file,
        voicePart: detectVoicePart(file.name),
        progress: 0,
        status: 'pending',
      })
    }
    setFiles((prev) => [...prev, ...newFiles])
  }, [])

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }

  // Update voice part for a pending file
  const setFileVoicePart = (index: number, part: VoicePart) => {
    setFiles((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], voicePart: part }
      return updated
    })
  }

  // Remove a pending file
  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // Upload a single file
  const uploadFile = async (index: number) => {
    const entry = files[index]
    if (!entry || entry.status !== 'pending') return

    setFiles((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], status: 'uploading', progress: 0 }
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

      // 2. Upload to S3 via PUT
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': entry.file.type || 'audio/mpeg' },
        body: entry.file,
      })

      if (!uploadRes.ok) {
        throw new Error('Upload to S3 failed')
      }

      setFiles((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], status: 'confirming', progress: 90 }
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

      const { audioTrack } = await confirmRes.json()

      setFiles((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], status: 'done', progress: 100 }
        return updated
      })

      onTrackAdded?.(audioTrack)
    } catch (err) {
      setFiles((prev) => {
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

  // Upload all pending files
  const uploadAll = async () => {
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'pending') {
        await uploadFile(i)
      }
    }
  }

  // Delete an existing track
  const handleDelete = async (trackId: string) => {
    setDeletingId(trackId)
    try {
      const res = await fetch(`/api/songs/${songId}/audio-tracks?trackId=${trackId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        onTrackDeleted?.(trackId)
      }
    } catch {
      // Silently fail
    } finally {
      setDeletingId(null)
    }
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">קבצי שמע</h3>

      {/* Existing tracks */}
      {existingTracks.length > 0 && (
        <div className="space-y-2">
          {existingTracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {VOICE_PART_OPTIONS.find((o) => o.value === track.voicePart)?.label ?? track.voicePart}
              </span>
              <span className="flex-1 truncate text-sm text-text-muted" dir="ltr">
                {track.fileUrl.split('/').pop()}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(track.id)}
                disabled={deletingId === track.id}
                className="text-xs text-danger hover:underline disabled:opacity-50"
              >
                {deletingId === track.id ? '...' : 'מחק'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={[
          'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50',
        ].join(' ')}
      >
        <svg className="h-8 w-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-text-muted">
          גררו קבצי שמע לכאן או לחצו לבחירה
        </p>
        <p className="text-xs text-text-muted">
          MP3, M4A, WAV, OGG - עד 50MB
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Pending files */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((entry, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              {/* Voice part selector */}
              <select
                value={entry.voicePart}
                onChange={(e) => setFileVoicePart(idx, e.target.value as VoicePart)}
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

              {/* Status */}
              {entry.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="text-xs text-danger hover:underline"
                >
                  הסר
                </button>
              )}
              {entry.status === 'uploading' && (
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border/40">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: '60%' }} />
                </div>
              )}
              {entry.status === 'confirming' && (
                <span className="text-xs text-text-muted">מאשר...</span>
              )}
              {entry.status === 'done' && (
                <span className="text-xs text-success font-medium">הועלה</span>
              )}
              {entry.status === 'error' && (
                <span className="text-xs text-danger" title={entry.error}>שגיאה</span>
              )}
            </div>
          ))}

          {pendingCount > 0 && (
            <button
              type="button"
              onClick={uploadAll}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              העלאת {pendingCount} {pendingCount === 1 ? 'קובץ' : 'קבצים'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
