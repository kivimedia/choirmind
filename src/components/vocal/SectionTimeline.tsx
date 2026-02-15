'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface SectionScore {
  score: number | null
  pitchScore: number | null
  timingScore: number | null
  dynamicsScore: number | null
  refNote: string | null
  userNote: string | null
  noteMatch: boolean | null
  pitchClassMatch: boolean | null
  octaveDiff: number | null
  startMs: number
  endMs: number
}

interface NoteComparison {
  noteIndex: number
  refNote: string | null
  refStartTime: number
  refEndTime: number
  userNote: string | null
  userStartTime: number | null
  userEndTime: number | null
  noteMatch: boolean
  pitchClassMatch: boolean | null
  octaveDiff: number | null
  centsOff: number | null
  timingOffsetMs: number | null
}

interface SectionTimelineProps {
  sections: SectionScore[]
  totalDurationMs: number
  refAudioUrl?: string | null
  userAudioUrl?: string | null
  noteComparison?: NoteComparison[]
  /** Lyric lines from the chunk — used to group notes by lyric line */
  lyricLines?: string[]
  /** Timestamps (seconds) for each lyric line boundary */
  lineTimestamps?: number[]
}

function scoreColor(score: number | null): string {
  if (score === null) return 'bg-border/60'
  if (score >= 80) return 'bg-status-solid'
  if (score >= 60) return 'bg-status-developing'
  if (score >= 40) return 'bg-status-shaky'
  return 'bg-status-fragile'
}

function noteMatchIcon(nc: NoteComparison): { symbol: string; color: string } {
  if (!nc.userNote) return { symbol: '-', color: 'text-text-muted/50' }
  if (nc.noteMatch) return { symbol: 'V', color: 'text-status-solid' }
  if (nc.pitchClassMatch) return { symbol: '~', color: 'text-status-developing' }
  // Close miss: within 150 cents (1.5 semitones)
  if (nc.centsOff != null && nc.centsOff <= 150) return { symbol: '~', color: 'text-status-developing' }
  return { symbol: 'X', color: 'text-status-fragile' }
}

/** Strip octave number from note name: "Sol#3" → "Sol#", "Mi2" → "Mi" */
function stripOctave(note: string | null): string | null {
  if (!note) return null
  return note.replace(/\d+$/, '')
}

// ── Musical Staff Visualization ──────────────────────

const SOLFEGE_IDX: Record<string, number> = {
  Do: 0, Re: 1, Mi: 2, Fa: 3, Sol: 4, La: 5, Si: 6,
}
const SOLFEGE_NAMES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si']

function parseSolfege(note: string) {
  const m = note.match(/^(Do|Re|Mi|Fa|Sol|La|Si)(#?)(\d)$/)
  if (!m) return null
  return { base: m[1], idx: SOLFEGE_IDX[m[1]], oct: +m[3], sharp: m[2] === '#' }
}

/** Diatonic position: Do4=0, Re4=1, Mi4=2, ... Si4=6, Do5=7, etc. */
function diaPos(note: string): number | null {
  const p = parseSolfege(note)
  return p ? (p.oct - 4) * 7 + p.idx : null
}

/** Convert diatonic position back to note label (e.g. -5 → "Mi3") */
function posToLabel(pos: number): string {
  const idx = ((pos % 7) + 7) % 7
  const oct = Math.floor(pos / 7) + 4
  return `${SOLFEGE_NAMES[idx]}${oct}`
}

function staffNoteColor(nc: NoteComparison): string {
  if (!nc.userNote) return 'transparent'
  if (nc.noteMatch) return 'var(--color-status-solid, #22c55e)'
  if (nc.pitchClassMatch) return 'var(--color-status-developing, #eab308)'
  return 'var(--color-status-fragile, #ef4444)'
}

function NoteStaff({
  notes,
  playSnippet,
}: {
  notes: NoteComparison[]
  playSnippet: (startSec: number, duration: number, type: 'ref' | 'user') => void
}) {
  if (notes.length === 0) return null

  // Find the actual range of notes
  let minP = Infinity, maxP = -Infinity
  for (const nc of notes) {
    const rp = nc.refNote ? diaPos(nc.refNote) : null
    const up = nc.userNote ? diaPos(nc.userNote) : null
    if (rp !== null) { minP = Math.min(minP, rp); maxP = Math.max(maxP, rp) }
    if (up !== null) { minP = Math.min(minP, up); maxP = Math.max(maxP, up) }
  }
  if (!isFinite(minP)) { minP = 0; maxP = 8 }

  // Staff lines covering the full note range, every 2 diatonic steps
  const lineStart = Math.floor((minP - 1) / 2) * 2
  const lineEnd = Math.ceil((maxP + 1) / 2) * 2
  const staffLines: number[] = []
  for (let pos = lineStart; pos <= lineEnd; pos += 2) {
    staffLines.push(pos)
  }

  // View range = full staff + padding
  const viewMin = lineStart - 2
  const viewMax = lineEnd + 2

  const STEP = 8
  const PAD_T = 14
  const PAD_B = 18
  const COL = 34
  const MARGIN_L = 44

  const yOf = (pos: number) => PAD_T + (viewMax - pos) * STEP
  const svgH = PAD_T + (viewMax - viewMin) * STEP + PAD_B
  const svgW = MARGIN_L + notes.length * COL + 8

  return (
    <div className="relative rounded-lg border border-border/40 bg-surface/50 p-1.5" dir="ltr">
    <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="flex items-center gap-3 text-[9px] text-text-muted mb-1 px-1 flex-wrap">
        <span className="flex items-center gap-1">
          <svg width={10} height={8}><ellipse cx={5} cy={4} rx={4} ry={3} fill="none" stroke="#6b7280" strokeWidth={1.5} /></svg>
          Reference
        </span>
        <span className="flex items-center gap-1">
          <svg width={10} height={8}><ellipse cx={5} cy={4} rx={4} ry={3} fill="#22c55e" /></svg>
          Match
        </span>
        <span className="flex items-center gap-1">
          <svg width={10} height={8}><ellipse cx={5} cy={4} rx={4} ry={3} fill="#eab308" /></svg>
          Octave
        </span>
        <span className="flex items-center gap-1">
          <svg width={10} height={8}><ellipse cx={5} cy={4} rx={4} ry={3} fill="#ef4444" /></svg>
          Wrong
        </span>
      </div>

      <svg width={svgW} height={svgH} className="block">
        {/* Dynamic staff line labels */}
        {staffLines.map(pos => (
          <text key={`lbl${pos}`} x={MARGIN_L - 3} y={yOf(pos)}
            fontSize={7} fill="var(--color-text-muted, #9ca3af)"
            textAnchor="end" dominantBaseline="central">{posToLabel(pos)}</text>
        ))}

        {/* Staff lines */}
        {staffLines.map(pos => (
          <line key={`sl${pos}`}
            x1={MARGIN_L} y1={yOf(pos)} x2={svgW} y2={yOf(pos)}
            stroke="var(--color-border, #d1d5db)" strokeWidth={0.8} />
        ))}

        {notes.map((nc, i) => {
          const cx = MARGIN_L + i * COL + COL / 2
          const rp = nc.refNote ? diaPos(nc.refNote) : null
          const up = nc.userNote ? diaPos(nc.userNote) : null
          const ri = nc.refNote ? parseSolfege(nc.refNote) : null
          const ui = nc.userNote ? parseSolfege(nc.userNote) : null
          const both = rp !== null && up !== null
          const rx = both ? cx - 6 : cx
          const ux = both ? cx + 6 : cx
          const color = staffNoteColor(nc)

          return (
            <g key={nc.noteIndex}>
              {rp !== null && up !== null && rp !== up && (
                <line x1={cx} y1={yOf(rp)} x2={cx} y2={yOf(up)}
                  stroke="var(--color-border, #e5e7eb)" strokeWidth={0.5} strokeDasharray="2,2" />
              )}

              {rp !== null && (
                <g className="cursor-pointer" opacity={0.7}
                  onClick={() => playSnippet(nc.refStartTime, nc.refEndTime - nc.refStartTime, 'ref')}>
                  <circle cx={rx} cy={yOf(rp)} r={12} fill="transparent" />
                  <ellipse cx={rx} cy={yOf(rp)} rx={5} ry={3.5}
                    fill="none" stroke="var(--color-text-muted, #6b7280)" strokeWidth={1.5}
                    transform={`rotate(-15,${rx},${yOf(rp)})`} />
                  {ri?.sharp && (
                    <text x={rx - 8} y={yOf(rp)} fontSize={9}
                      fill="var(--color-text-muted, #6b7280)"
                      dominantBaseline="central" textAnchor="end">♯</text>
                  )}
                </g>
              )}

              {up !== null && (
                <g className="cursor-pointer"
                  onClick={() => nc.userStartTime != null
                    ? playSnippet(nc.userStartTime, (nc.userEndTime ?? nc.userStartTime + 0.5) - nc.userStartTime, 'user')
                    : undefined}>
                  <circle cx={ux} cy={yOf(up)} r={12} fill="transparent" />
                  <ellipse cx={ux} cy={yOf(up)} rx={5} ry={3.5}
                    fill={color}
                    transform={`rotate(-15,${ux},${yOf(up)})`} />
                  {ui?.sharp && (
                    <text x={ux + 8} y={yOf(up)} fontSize={9}
                      fill={color} dominantBaseline="central">♯</text>
                  )}
                </g>
              )}

              {rp !== null && !nc.userNote && (
                <text x={cx + 8} y={yOf(rp)} fontSize={8} fill="var(--color-status-fragile, #ef4444)"
                  dominantBaseline="central">✕</text>
              )}

              <text x={cx} y={svgH - 4} fontSize={7}
                fill="var(--color-text-muted, #9ca3af)"
                textAnchor="middle">{nc.noteIndex + 1}</text>
            </g>
          )
        })}
      </svg>
    </div>
    {/* Scroll hint: fade on right edge when SVG is wider than container */}
    {notes.length > 8 && (
      <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-6 bg-gradient-to-l from-surface/80 to-transparent rounded-r-lg" />
    )}
    </div>
  )
}

// ── Line-by-line Note Comparison ──────────────────────

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function NoteLineComparison({
  notes,
  playSnippet,
  playingSnippet,
  lyricLines,
  lineTimestamps,
}: {
  notes: NoteComparison[]
  playSnippet: (startSec: number, duration: number, type: 'ref' | 'user') => void
  playingSnippet: { type: 'ref' | 'user'; currentTime: number } | null
  lyricLines?: string[]
  lineTimestamps?: number[]
}) {
  if (notes.length === 0) return null

  // Group notes into lines based on lyric line timestamps if available,
  // otherwise fall back to time gaps > 0.8s or every 5 notes
  const lines: { notes: NoteComparison[]; lyric?: string }[] = []

  if (lineTimestamps && lineTimestamps.length > 1) {
    // Build time boundaries from lyric line timestamps (in ms → convert to seconds)
    const boundaries = lineTimestamps.map(t => t / 1000)

    // Notes BEFORE the first lyric line (e.g. instrumental intro 0:00-0:19)
    const preLineNotes = notes.filter(n => n.refStartTime < boundaries[0] - 0.05)
    if (preLineNotes.length > 0) {
      lines.push({ notes: preLineNotes })
    }

    for (let li = 0; li < boundaries.length; li++) {
      const tStart = boundaries[li]
      const tEnd = li + 1 < boundaries.length ? boundaries[li + 1] : Infinity
      const lineNotes = notes.filter(n => n.refStartTime >= tStart - 0.05 && n.refStartTime < tEnd - 0.05)
      if (lineNotes.length > 0) {
        lines.push({ notes: lineNotes, lyric: lyricLines?.[li] })
      }
    }
    // Catch any notes after the last boundary
    const assigned = new Set(lines.flatMap(l => l.notes.map(n => n.noteIndex)))
    const remaining = notes.filter(n => !assigned.has(n.noteIndex))
    if (remaining.length > 0) {
      lines.push({ notes: remaining })
    }
  } else {
    // Fallback: split at time gaps > 0.8s or every 6 notes
    let current: NoteComparison[] = []
    for (let i = 0; i < notes.length; i++) {
      if (current.length > 0) {
        const gap = notes[i].refStartTime - notes[i - 1].refEndTime
        if (gap > 0.8 || current.length >= 6) {
          lines.push({ notes: current })
          current = []
        }
      }
      current.push(notes[i])
    }
    if (current.length > 0) lines.push({ notes: current })
  }

  return (
    <div className="space-y-2" dir="ltr">
      {lines.map((lineData, lineIdx) => {
        const line = lineData.notes
        const refStart = line[0].refStartTime
        const refEnd = line[line.length - 1].refEndTime
        const userStarts = line.filter(n => n.userStartTime != null).map(n => n.userStartTime!)
        const userEnds = line.filter(n => n.userEndTime != null).map(n => n.userEndTime!)
        const userStart = userStarts.length > 0 ? Math.min(...userStarts) : null
        const userEnd = userEnds.length > 0 ? Math.max(...userEnds) : null

        const isPlayingRefLine = playingSnippet?.type === 'ref' &&
          playingSnippet.currentTime >= refStart - 0.05 && playingSnippet.currentTime <= refEnd + 0.3
        const isPlayingUserLine = userStart != null && playingSnippet?.type === 'user' &&
          playingSnippet.currentTime >= userStart - 0.05 && playingSnippet.currentTime <= (userEnd ?? userStart) + 0.3

        return (
          <div key={lineIdx} className="rounded-lg border border-border/30 bg-surface/30 px-2.5 py-1.5 space-y-1">
            {/* Lyric text */}
            {lineData.lyric && (
              <p className="text-sm text-foreground/90 leading-snug" dir="rtl">{lineData.lyric}</p>
            )}
            {/* Timestamp */}
            <span className="text-[9px] text-text-muted/50 tabular-nums">
              {formatTime(refStart)}–{formatTime(refEnd)}
            </span>
            {/* Reference line */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => playSnippet(refStart, refEnd - refStart + 0.3, 'ref')}
                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  isPlayingRefLine ? 'bg-primary/20 text-primary' : 'text-text-muted hover:bg-primary/10'
                }`}
                title={`Play ref ${formatTime(refStart)}–${formatTime(refEnd)}`}
              >
                {isPlayingRefLine ? '...' : '▶ Ref'}
              </button>
              <div className="flex items-center gap-0.5 flex-wrap">
                {line.map((nc) => {
                  const isPlaying = playingSnippet?.type === 'ref' &&
                    playingSnippet.currentTime >= nc.refStartTime - 0.02 &&
                    playingSnippet.currentTime < nc.refEndTime + 0.02
                  return (
                    <button
                      key={nc.noteIndex}
                      onClick={() => playSnippet(nc.refStartTime, nc.refEndTime - nc.refStartTime, 'ref')}
                      className={`font-mono text-[11px] leading-tight px-1 py-0.5 rounded border transition-all ${
                        isPlaying
                          ? 'border-primary bg-primary/30 text-primary scale-125 shadow-sm font-bold'
                          : 'border-border/40 text-text-muted hover:bg-primary/10'
                      }`}
                    >
                      {stripOctave(nc.refNote) || '·'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* User line */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => userStart != null ? playSnippet(userStart, (userEnd ?? userStart + 1) - userStart + 0.3, 'user') : undefined}
                disabled={userStart == null}
                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  isPlayingUserLine ? 'bg-primary/20 text-primary'
                    : userStart != null ? 'text-text-muted hover:bg-primary/10' : 'text-text-muted/30'
                }`}
                title={userStart != null ? `Play yours ${userStart.toFixed(1)}s–${(userEnd ?? userStart).toFixed(1)}s` : ''}
              >
                {isPlayingUserLine ? '...' : '▶ You'}
              </button>
              <div className="flex items-center gap-0.5 flex-wrap">
                {line.map((nc) => {
                  const { color } = noteMatchIcon(nc)
                  const isPlaying = nc.userStartTime != null && playingSnippet?.type === 'user' &&
                    playingSnippet.currentTime >= nc.userStartTime - 0.02 &&
                    playingSnippet.currentTime < (nc.userEndTime ?? nc.userStartTime + 0.5) + 0.02
                  const isMatch = nc.noteMatch || nc.pitchClassMatch
                  return (
                    <button
                      key={nc.noteIndex}
                      onClick={() => nc.userStartTime != null
                        ? playSnippet(nc.userStartTime, (nc.userEndTime ?? nc.userStartTime + 0.5) - nc.userStartTime, 'user')
                        : undefined}
                      disabled={!nc.userNote}
                      className={`font-mono text-[11px] leading-tight px-1 py-0.5 rounded border transition-all ${
                        isPlaying
                          ? 'border-primary bg-primary/30 text-primary scale-125 shadow-sm font-bold'
                          : isMatch
                            ? 'border-status-solid/40 bg-status-solid/10'
                            : nc.userNote
                              ? 'border-status-fragile/40 bg-status-fragile/10'
                              : 'border-border/20 text-text-muted/30'
                      } ${!isPlaying ? color : ''}`}
                    >
                      {stripOctave(nc.userNote) || '·'}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SectionTimeline({
  sections,
  totalDurationMs,
  refAudioUrl,
  userAudioUrl,
  noteComparison,
  lyricLines,
  lineTimestamps,
}: SectionTimelineProps) {
  const [showNotes, setShowNotes] = useState(true)
  const [playingSnippet, setPlayingSnippet] = useState<{
    type: 'ref' | 'user'
    startOffset: number
    duration: number
    wallStart: number
    currentTime: number
  } | null>(null)
  const playbackRAFRef = useRef<number>(0)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache decoded audio buffers to avoid re-fetching
  const audioBufferCache = useRef<Map<string, AudioBuffer>>(new Map())

  const playSnippet = useCallback(async (startSec: number, duration: number, type: 'ref' | 'user') => {
    const url = type === 'ref' ? refAudioUrl : userAudioUrl
    if (!url) return

    // Stop any currently playing snippet
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop() } catch {}
      sourceNodeRef.current = null
    }
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current)
    }
    if (playbackRAFRef.current) {
      cancelAnimationFrame(playbackRAFRef.current)
    }

    // Lazy-init AudioContext
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    const ctx = audioCtxRef.current

    // Decode or use cached buffer
    let buffer = audioBufferCache.current.get(url)
    if (!buffer) {
      try {
        const resp = await fetch(url)
        const arrayBuf = await resp.arrayBuffer()
        buffer = await ctx.decodeAudioData(arrayBuf)
        audioBufferCache.current.set(url, buffer)
      } catch {
        return
      }
    }

    // Create source + gain
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    // Boost reference vocals (Demucs-isolated are quieter than direct mic)
    gain.gain.value = type === 'ref' ? 2.0 : 1.0
    source.connect(gain).connect(ctx.destination)

    const durSec = Math.max(0.5, duration)
    source.start(0, startSec, durSec)
    sourceNodeRef.current = source
    const wallStart = performance.now()
    setPlayingSnippet({ type, startOffset: startSec, duration: durSec, wallStart, currentTime: startSec })

    stopTimerRef.current = setTimeout(() => {
      sourceNodeRef.current = null
      setPlayingSnippet(null)
      if (playbackRAFRef.current) cancelAnimationFrame(playbackRAFRef.current)
    }, durSec * 1000)
  }, [refAudioUrl, userAudioUrl])

  // Animate current playback position for real-time note highlighting
  useEffect(() => {
    if (!playingSnippet) return
    const { wallStart, startOffset, duration } = playingSnippet
    function tick() {
      const elapsed = (performance.now() - wallStart) / 1000
      if (elapsed >= duration) {
        setPlayingSnippet(null)
        return
      }
      setPlayingSnippet(prev => prev ? { ...prev, currentTime: startOffset + elapsed } : null)
      playbackRAFRef.current = requestAnimationFrame(tick)
    }
    playbackRAFRef.current = requestAnimationFrame(tick)
    return () => { if (playbackRAFRef.current) cancelAnimationFrame(playbackRAFRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingSnippet?.wallStart])

  if (sections.length === 0 || totalDurationMs === 0) return null

  const hasNoteComparison = noteComparison && noteComparison.length > 0

  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">
        {'באיזה שניות שרת נכון?'}
      </h3>

      {/* Per-second heatmap grid */}
      <div className="flex flex-wrap gap-[2px]" dir="ltr">
        {sections.map((sec, i) => {
          const secNum = Math.round(sec.startMs / 1000) + 1
          const octInfo = sec.octaveDiff != null && sec.octaveDiff !== 0
            ? ` [${sec.octaveDiff > 0 ? '+' : ''}${sec.octaveDiff} oct]`
            : ''
          const label = sec.score === null
            ? `${secNum}s: quiet`
            : `${secNum}s: ${Math.round(sec.score)} (P:${Math.round(sec.pitchScore ?? 0)} T:${Math.round(sec.timingScore ?? 0)} D:${Math.round(sec.dynamicsScore ?? 0)})${sec.refNote ? ` ${sec.refNote}→${sec.userNote || '?'}${octInfo}` : ''}`
          return (
            <div
              key={i}
              className={`${scoreColor(sec.score)} rounded-sm relative group cursor-default`}
              style={{ width: 20, height: 20 }}
              title={label}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-white/80 select-none">
                {secNum}
              </span>
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 pointer-events-none">
                <div className="rounded bg-foreground px-2 py-1 text-[11px] text-surface whitespace-nowrap shadow-md">
                  {label}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[11px] text-text-muted flex-wrap">
        <div className="flex items-center gap-1">
          <div className="h-2.5 w-2.5 rounded-sm bg-status-solid" />
          <span>{'מדויק (80+)'}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2.5 w-2.5 rounded-sm bg-status-developing" />
          <span>{'טוב (60-79)'}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2.5 w-2.5 rounded-sm bg-status-shaky" />
          <span>{'בינוני (40-59)'}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2.5 w-2.5 rounded-sm bg-status-fragile" />
          <span>{'לא מדויק (<40)'}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2.5 w-2.5 rounded-sm bg-border/60" />
          <span>{'שקט'}</span>
        </div>
      </div>

      {/* Note-by-note comparison */}
      {hasNoteComparison && (
        <>
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-foreground transition-colors"
          >
            <svg
              className={`h-3 w-3 transition-transform ${showNotes ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {`השוואת תווים (${noteComparison!.length} תווים)`}
          </button>

          {showNotes && (
            <div className="space-y-2">
              <NoteStaff notes={noteComparison!} playSnippet={playSnippet} />

              {/* Summary stats */}
              {(() => {
                const total = noteComparison!.length
                const correct = noteComparison!.filter(n => n.noteMatch || n.pitchClassMatch).length
                const nearMiss = noteComparison!.filter(n => !n.noteMatch && !n.pitchClassMatch && n.centsOff != null && n.centsOff <= 150).length
                const wrong = noteComparison!.filter(n => n.userNote && !n.noteMatch && !n.pitchClassMatch && (n.centsOff == null || n.centsOff > 150)).length
                const missed = noteComparison!.filter(n => !n.userNote).length
                const pct = total > 0 ? Math.round(((correct + nearMiss) / total) * 100) : 0
                return (
                  <div className="flex items-center gap-3 text-[11px] mb-1.5 flex-wrap">
                    <span className="text-status-solid font-medium">{`${correct} מדויק`}</span>
                    {nearMiss > 0 && (
                      <span className="text-status-developing font-medium">{`${nearMiss} כמעט`}</span>
                    )}
                    {wrong > 0 && (
                      <span className="text-status-fragile font-medium">{`${wrong} תו שגוי`}</span>
                    )}
                    {missed > 0 && (
                      <span className="text-text-muted">{`${missed} חסר`}</span>
                    )}
                    <span className="text-foreground font-semibold">{`${pct}% נכון`}</span>
                  </div>
                )
              })()}

              {/* Line-by-line comparison */}
              <NoteLineComparison
                notes={noteComparison!}
                playSnippet={playSnippet}
                playingSnippet={playingSnippet}
                lyricLines={lyricLines}
                lineTimestamps={lineTimestamps}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
