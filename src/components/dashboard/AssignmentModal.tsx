'use client'

import { useState, useCallback } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'

interface SongOption {
  id: string
  title: string
}

interface AssignmentModalProps {
  isOpen: boolean
  onClose: () => void
  songs: SongOption[]
  choirId: string
}

const VOICE_PARTS = [
  { value: 'soprano', label: '\u05E1\u05D5\u05E4\u05E8\u05DF' },
  { value: 'mezzo', label: '\u05DE\u05E6\u05D5' },
  { value: 'alto', label: '\u05D0\u05DC\u05D8' },
  { value: 'tenor', label: '\u05D8\u05E0\u05D5\u05E8' },
  { value: 'baritone', label: '\u05D1\u05E8\u05D9\u05D8\u05D5\u05DF' },
  { value: 'bass', label: '\u05D1\u05E1' },
]

const PRIORITY_OPTIONS = [
  { value: 'normal', label: '\u05E8\u05D2\u05D9\u05DC' },
  { value: 'high', label: '\u05D2\u05D1\u05D5\u05D4' },
  { value: 'urgent', label: '\u05D3\u05D7\u05D5\u05E3' },
]

export default function AssignmentModal({
  isOpen,
  onClose,
  songs,
  choirId,
}: AssignmentModalProps) {
  const [songId, setSongId] = useState('')
  const [selectedParts, setSelectedParts] = useState<string[]>([])
  const [allParts, setAllParts] = useState(true)
  const [targetDate, setTargetDate] = useState('')
  const [priority, setPriority] = useState('normal')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handlePartToggle = useCallback((partValue: string) => {
    setAllParts(false)
    setSelectedParts((prev) =>
      prev.includes(partValue)
        ? prev.filter((p) => p !== partValue)
        : [...prev, partValue]
    )
  }, [])

  const handleAllPartsToggle = useCallback(() => {
    setAllParts((prev) => {
      if (!prev) {
        setSelectedParts([])
      }
      return !prev
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!songId) {
      setError('\u05E0\u05D0 \u05DC\u05D1\u05D7\u05D5\u05E8 \u05E9\u05D9\u05E8')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const body: Record<string, unknown> = {
        songId,
        choirId,
        priority,
      }

      if (!allParts && selectedParts.length > 0) {
        body.voiceParts = selectedParts
      }

      if (targetDate) {
        body.targetDate = targetDate
      }

      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D9\u05E6\u05D9\u05E8\u05EA \u05D4\u05E9\u05D9\u05D1\u05D5\u05E5')
      }

      // Reset form and close
      setSongId('')
      setSelectedParts([])
      setAllParts(true)
      setTargetDate('')
      setPriority('normal')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '\u05E9\u05D2\u05D9\u05D0\u05D4 \u05DC\u05D0 \u05E6\u05E4\u05D5\u05D9\u05D4')
    } finally {
      setSubmitting(false)
    }
  }, [songId, choirId, priority, allParts, selectedParts, targetDate, onClose])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={'\u05E9\u05D1\u05E5 \u05E9\u05D9\u05E8'}
    >
      <div className="space-y-4">
        {/* Song select */}
        <Select
          label={'\u05E9\u05D9\u05E8'}
          placeholder={'\u05D1\u05D7\u05E8\u05D5 \u05E9\u05D9\u05E8...'}
          options={songs.map((s) => ({ value: s.id, label: s.title }))}
          value={songId}
          onChange={(e) => setSongId(e.target.value)}
        />

        {/* Voice parts */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground text-start">
            {'\u05E7\u05D5\u05DC\u05D5\u05EA'}
          </legend>

          <label className="mb-2 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allParts}
              onChange={handleAllPartsToggle}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
            />
            <span className="text-sm text-foreground font-medium">
              {'\u05DB\u05DC \u05D4\u05DE\u05E7\u05D4\u05DC\u05D4'}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {VOICE_PARTS.map((part) => (
              <label
                key={part.value}
                className={[
                  'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                  !allParts && selectedParts.includes(part.value)
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary-light',
                  allParts ? 'opacity-50' : '',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={allParts || selectedParts.includes(part.value)}
                  onChange={() => handlePartToggle(part.value)}
                  disabled={allParts}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
                />
                <span className="text-sm">{part.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Target date */}
        <Input
          label={'\u05EA\u05D0\u05E8\u05D9\u05DA \u05D9\u05E2\u05D3'}
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          dir="ltr"
        />

        {/* Priority */}
        <Select
          label={'\u05E2\u05D3\u05D9\u05E4\u05D5\u05EA'}
          options={PRIORITY_OPTIONS}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        />

        {/* Error message */}
        {error && (
          <p className="text-sm text-danger text-start" role="alert">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={!songId}
            className="flex-1"
          >
            {'\u05E9\u05D1\u05E5'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {'\u05D1\u05D9\u05D8\u05D5\u05DC'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
