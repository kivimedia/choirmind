'use client'

import { useState, useRef, useCallback } from 'react'

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

function octaveLabel(nc: NoteComparison): string {
  if (nc.octaveDiff === null || nc.octaveDiff === undefined) return ''
  if (nc.octaveDiff === 0) return ''
  const dir = nc.octaveDiff > 0 ? '+' : ''
  return `${dir}${nc.octaveDiff} oct`
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

  // Place 5 staff lines centered on the note range, each 2 diatonic steps apart
  const center = Math.round((minP + maxP) / 2)
  // Round center to nearest even number so lines fall on natural notes
  const centerEven = Math.round(center / 2) * 2
  const staffLines = [
    centerEven - 4,
    centerEven - 2,
    centerEven,
    centerEven + 2,
    centerEven + 4,
  ]
  const staffBottom = staffLines[0]
  const staffTop = staffLines[4]

  // Compute ledger lines for notes outside the staff
  function getLedgerLines(pos: number): number[] {
    const lines: number[] = []
    if (pos < staffBottom)
      for (let lp = staffBottom - 2; lp >= pos; lp -= 2) lines.push(lp)
    if (pos > staffTop)
      for (let lp = staffTop + 2; lp <= pos; lp += 2) lines.push(lp)
    return lines
  }

  // Expand view range to include all notes + padding
  const viewMin = Math.min(minP, staffBottom) - 2
  const viewMax = Math.max(maxP, staffTop) + 2

  const STEP = 8
  const PAD_T = 14
  const PAD_B = 18
  const COL = 34
  const MARGIN_L = 38

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
          const ledgers = new Set<number>()
          if (rp !== null) getLedgerLines(rp).forEach(p => ledgers.add(p))
          if (up !== null) getLedgerLines(up).forEach(p => ledgers.add(p))
          const both = rp !== null && up !== null
          const rx = both ? cx - 6 : cx
          const ux = both ? cx + 6 : cx
          const color = staffNoteColor(nc)

          return (
            <g key={nc.noteIndex}>
              {[...ledgers].map(lp => (
                <line key={`lg${lp}`}
                  x1={cx - 10} y1={yOf(lp)} x2={cx + 10} y2={yOf(lp)}
                  stroke="var(--color-border, #d1d5db)" strokeWidth={0.8} />
              ))}

              {rp !== null && up !== null && rp !== up && (
                <line x1={cx} y1={yOf(rp)} x2={cx} y2={yOf(up)}
                  stroke="var(--color-border, #e5e7eb)" strokeWidth={0.5} strokeDasharray="2,2" />
              )}

              {rp !== null && (
                <g className="cursor-pointer" opacity={0.7}
                  onClick={() => playSnippet(nc.refStartTime, nc.refEndTime - nc.refStartTime, 'ref')}>
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

export default function SectionTimeline({
  sections,
  totalDurationMs,
  refAudioUrl,
  userAudioUrl,
  noteComparison,
}: SectionTimelineProps) {
  const [showNotes, setShowNotes] = useState(false)
  const [playingSnippet, setPlayingSnippet] = useState<{ time: number; type: 'ref' | 'user' } | null>(null)
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
    setPlayingSnippet({ time: startSec, type })

    stopTimerRef.current = setTimeout(() => {
      sourceNodeRef.current = null
      setPlayingSnippet(null)
    }, durSec * 1000)
  }, [refAudioUrl, userAudioUrl])

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
              <div className="overflow-x-auto">
              {/* Summary stats */}
              {(() => {
                const total = noteComparison!.length
                const exact = noteComparison!.filter(n => n.noteMatch).length
                const close = noteComparison!.filter(n => !n.noteMatch && n.pitchClassMatch).length
                const nearMiss = noteComparison!.filter(n => !n.noteMatch && !n.pitchClassMatch && n.centsOff != null && n.centsOff <= 150).length
                const wrong = noteComparison!.filter(n => n.userNote && !n.noteMatch && !n.pitchClassMatch && (n.centsOff == null || n.centsOff > 150)).length
                const missed = noteComparison!.filter(n => !n.userNote).length
                const pct = total > 0 ? Math.round(((exact + close + nearMiss) / total) * 100) : 0
                return (
                  <div className="flex items-center gap-3 text-[11px] mb-1.5 flex-wrap">
                    <span className="text-status-solid font-medium">{`${exact} מדויק`}</span>
                    {close > 0 && (
                      <span className="text-status-developing font-medium">{`${close} קרוב (אוקטבה)`}</span>
                    )}
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

              <table className="w-full text-[11px] border-collapse" dir="ltr">
                <thead>
                  <tr className="text-text-muted">
                    <th className="px-1.5 py-1 text-left font-medium border-b border-border">#</th>
                    <th className="px-1.5 py-1 text-center font-medium border-b border-border">Reference</th>
                    <th className="px-1.5 py-1 text-center font-medium border-b border-border">You</th>
                    <th className="px-1.5 py-1 text-center font-medium border-b border-border">Match</th>
                    <th className="px-1.5 py-1 text-center font-medium border-b border-border">Octave</th>
                    <th className="px-1.5 py-1 text-center font-medium border-b border-border">Timing</th>
                  </tr>
                </thead>
                <tbody>
                  {noteComparison!.map((nc) => {
                    const { symbol, color } = noteMatchIcon(nc)
                    const isPlayingRef = playingSnippet?.time === nc.refStartTime && playingSnippet?.type === 'ref'
                    const isPlayingUser = playingSnippet?.time === (nc.userStartTime ?? -1) && playingSnippet?.type === 'user'
                    const octLabel = octaveLabel(nc)

                    return (
                      <tr
                        key={nc.noteIndex}
                        className={nc.userNote ? 'text-foreground' : 'text-text-muted/50'}
                      >
                        <td className="px-1.5 py-0.5 border-b border-border/30 tabular-nums">
                          {nc.noteIndex + 1}
                        </td>
                        <td className="px-1.5 py-0.5 text-center border-b border-border/30">
                          {nc.refNote ? (
                            <button
                              onClick={() => playSnippet(nc.refStartTime, nc.refEndTime - nc.refStartTime, 'ref')}
                              className={`font-mono font-medium px-1 rounded hover:bg-primary/10 transition-colors ${
                                isPlayingRef ? 'bg-primary/20 text-primary' : ''
                              }`}
                              title={`Play ref ${nc.refStartTime.toFixed(1)}s`}
                            >
                              {isPlayingRef ? '...' : nc.refNote}
                            </button>
                          ) : (
                            <span className="text-text-muted/40">-</span>
                          )}
                        </td>
                        <td className="px-1.5 py-0.5 text-center border-b border-border/30">
                          {nc.userNote && nc.userStartTime != null ? (
                            <button
                              onClick={() => playSnippet(nc.userStartTime!, (nc.userEndTime ?? nc.userStartTime! + 0.5) - nc.userStartTime!, 'user')}
                              className={`font-mono font-medium px-1 rounded hover:bg-primary/10 transition-colors ${
                                isPlayingUser ? 'bg-primary/20 text-primary' : ''
                              } ${color}`}
                              title={`Play yours ${nc.userStartTime.toFixed(1)}s`}
                            >
                              {isPlayingUser ? '...' : nc.userNote}
                            </button>
                          ) : (
                            <span className="text-text-muted/40">-</span>
                          )}
                        </td>
                        <td className={`px-1.5 py-0.5 text-center border-b border-border/30 font-medium ${color}`}>
                          {symbol}
                        </td>
                        <td className="px-1.5 py-0.5 text-center border-b border-border/30">
                          {octLabel ? (
                            <span className={nc.octaveDiff === 0 ? 'text-status-solid' : 'text-status-developing'}>
                              {octLabel}
                            </span>
                          ) : nc.centsOff != null && nc.userNote ? (
                            <span className={nc.centsOff <= 50 ? 'text-status-solid text-[10px]' : nc.centsOff <= 100 ? 'text-status-developing text-[10px]' : 'text-status-fragile text-[10px]'}>
                              {nc.centsOff <= 50 ? 'OK' : `${Math.round(nc.centsOff)}¢`}
                            </span>
                          ) : (
                            nc.noteMatch ? (
                              <span className="text-status-solid text-[10px]">OK</span>
                            ) : (
                              <span className="text-text-muted/40">-</span>
                            )
                          )}
                        </td>
                        <td className="px-1.5 py-0.5 text-center border-b border-border/30 tabular-nums text-[10px]">
                          {nc.timingOffsetMs != null ? (
                            <span className={Math.abs(nc.timingOffsetMs) < 500 ? 'text-text-muted' : 'text-status-developing'}>
                              {nc.timingOffsetMs > 0 ? '+' : ''}{nc.timingOffsetMs}ms
                            </span>
                          ) : (
                            <span className="text-text-muted/40">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
