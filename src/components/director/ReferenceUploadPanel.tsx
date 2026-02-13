'use client'

import { useState, useCallback } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Tabs from '@/components/ui/Tabs'
import { useVocalRecorder } from '@/hooks/useVocalRecorder'

interface ReferenceUploadPanelProps {
  isOpen: boolean
  onClose: () => void
  songId: string
  voicePart: string
  onComplete?: () => void
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'error'

export default function ReferenceUploadPanel({
  isOpen,
  onClose,
  songId,
  voicePart,
  onComplete,
}: ReferenceUploadPanelProps) {
  const [tab, setTab] = useState<'upload' | 'record'>('upload')
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const recorder = useVocalRecorder()

  const statusLabels: Record<UploadStatus, string> = {
    idle: '',
    uploading: 'מעלה קובץ...',
    processing: 'מעבד — בידוד קולי ואיפיון...',
    ready: 'הפניה מוכנה!',
    error: 'שגיאה',
  }

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      setError('יש להעלות קובץ שמע (MP3/WAV)')
      return
    }

    setStatus('uploading')
    setError(null)

    try {
      // 1. Get presigned URL
      const presignRes = await fetch(`/api/songs/${songId}/audio-tracks/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          voicePart,
        }),
      })
      if (!presignRes.ok) throw new Error('Failed to get upload URL')
      const { uploadUrl, key } = await presignRes.json()

      // 2. Upload to S3
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      // 3. Confirm upload → creates AudioTrack
      const confirmRes = await fetch(`/api/songs/${songId}/audio-tracks/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, voicePart, fileName: file.name }),
      })
      if (!confirmRes.ok) throw new Error('Failed to confirm upload')
      const { audioTrack } = await confirmRes.json()

      // 4. Trigger reference preparation
      setStatus('processing')
      const prepRes = await fetch('/api/vocal-analysis/references/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          voicePart,
          sourceTrackId: audioTrack.id,
        }),
      })
      if (!prepRes.ok) throw new Error('Failed to start reference preparation')

      setStatus('ready')
      onComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStatus('error')
    }
  }, [songId, voicePart, onComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  const handleRecordingComplete = useCallback(async () => {
    if (!recorder.audioBlob) return

    setStatus('uploading')
    setError(null)

    try {
      // Upload via server proxy
      const formData = new FormData()
      formData.append('file', recorder.audioBlob, `reference-${voicePart}.webm`)
      formData.append('songId', songId)
      formData.append('voicePart', voicePart)

      const uploadRes = await fetch('/api/vocal-analysis/upload', {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { key } = await uploadRes.json()

      // Create AudioTrack
      const trackRes = await fetch(`/api/songs/${songId}/audio-tracks/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, voicePart, fileName: `reference-${voicePart}.webm` }),
      })
      if (!trackRes.ok) throw new Error('Failed to create audio track')
      const { audioTrack } = await trackRes.json()

      // Trigger reference prep
      setStatus('processing')
      const prepRes = await fetch('/api/vocal-analysis/references/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId, voicePart, sourceTrackId: audioTrack.id }),
      })
      if (!prepRes.ok) throw new Error('Failed to start preparation')

      setStatus('ready')
      onComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
      setStatus('error')
    }
  }, [recorder.audioBlob, songId, voicePart, onComplete])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="העלאת הפניה קולית">
      <div className="space-y-4">
        <Tabs
          activeTab={tab}
          onChange={(v: string) => setTab(v as 'upload' | 'record')}
          tabs={[
            { key: 'upload', label: 'העלאת קובץ', content: null },
            { key: 'record', label: 'הקלטה', content: null },
          ]}
        />

        {/* File Upload Tab */}
        {tab === 'upload' && status === 'idle' && (
          <div
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-border'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <span className="text-3xl mb-2">📁</span>
            <p className="text-sm text-foreground font-medium">גררו קובץ שמע לכאן</p>
            <p className="text-xs text-text-muted mt-1">MP3, WAV — עד 50MB</p>
            <label className="mt-3">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                }}
              />
              <span className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover cursor-pointer">
                בחרו קובץ
              </span>
            </label>
          </div>
        )}

        {/* Record Tab */}
        {tab === 'record' && status === 'idle' && (
          <div className="flex flex-col items-center gap-4 py-4">
            {!recorder.isRecording ? (
              <Button
                variant="primary"
                size="lg"
                onClick={() => recorder.startRecording()}
              >
                התחילו הקלטה
              </Button>
            ) : (
              <>
                <p className="text-2xl font-bold tabular-nums" dir="ltr">
                  {Math.floor(recorder.durationMs / 1000)}s
                </p>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    recorder.stopRecording()
                    // Will trigger blob ready → handleRecordingComplete
                    setTimeout(handleRecordingComplete, 500)
                  }}
                >
                  עצרו הקלטה
                </Button>
              </>
            )}
          </div>
        )}

        {/* Status display */}
        {status !== 'idle' && (
          <div className="flex flex-col items-center gap-3 py-4">
            {(status === 'uploading' || status === 'processing') && (
              <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {status === 'ready' && <span className="text-3xl">✅</span>}
            {status === 'error' && <span className="text-3xl">❌</span>}
            <p className="text-sm text-foreground">{statusLabels[status]}</p>
            {error && <p className="text-sm text-danger">{error}</p>}
            {(status === 'ready' || status === 'error') && (
              <Button variant="outline" size="sm" onClick={() => { setStatus('idle'); setError(null); recorder.reset() }}>
                {status === 'ready' ? 'סגור' : 'נסו שוב'}
              </Button>
            )}
            {status === 'processing' && (
              <Badge variant="primary">PENDING → PROCESSING → READY</Badge>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
