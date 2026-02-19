'use client'

import { useMemo } from 'react'
import { scheduleDistractions, type ScheduledDistraction } from '@/lib/chaos-distractions'

interface ChaosOverlayProps {
  enabled: boolean
  seed: number
  songDurationMs: number
  currentTimeMs: number
}

export default function ChaosOverlay({ enabled, seed, songDurationMs, currentTimeMs }: ChaosOverlayProps) {
  const schedule = useMemo(
    () => scheduleDistractions(seed, songDurationMs),
    [seed, songDurationMs]
  )

  if (!enabled) return null

  // Find active distractions (started but not yet ended)
  const active = schedule.filter(s => {
    const elapsed = currentTimeMs - s.startMs
    return elapsed >= 0 && elapsed < s.def.durationMs
  })

  // Screen effects apply to the container
  const screenEffect = active.find(a => a.def.category === 'screen_effect')
  const screenStyle = getScreenEffectStyle(screenEffect)

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 60, ...screenStyle }}
    >
      {active.filter(a => a.def.category !== 'screen_effect').map(a => (
        <DistractionRenderer key={`${a.def.id}-${a.startMs}`} distraction={a} currentTimeMs={currentTimeMs} />
      ))}

      {/* CSS Keyframes for chaos animations */}
      <style>{`
        @keyframes chaos-shake {
          0%, 100% { transform: translate(0, 0) rotate(0); }
          25% { transform: translate(-5px, 3px) rotate(-2deg); }
          50% { transform: translate(3px, -5px) rotate(1deg); }
          75% { transform: translate(-3px, 2px) rotate(-1deg); }
        }
        @keyframes chaos-static {
          0% { filter: brightness(1) contrast(1); }
          50% { filter: brightness(1.3) contrast(1.5) hue-rotate(90deg); }
          100% { filter: brightness(0.8) contrast(1.2); }
        }
        @keyframes chaos-heartbeat {
          0%, 100% { transform: scale(1); }
          15% { transform: scale(1.05); }
          30% { transform: scale(1); }
          45% { transform: scale(1.03); }
        }
        @keyframes chaos-drop {
          0% { transform: translateY(-100vh); }
          100% { transform: translateY(100vh); }
        }
        @keyframes chaos-walk-right {
          0% { transform: translateX(-100vw); }
          100% { transform: translateX(100vw); }
        }
        @keyframes chaos-swim {
          0% { transform: translateX(-50vw) scaleX(-1); }
          50% { transform: translateX(0) scaleX(-1) translateY(-20px); }
          100% { transform: translateX(50vw) scaleX(-1); }
        }
        @keyframes chaos-flutter {
          0%, 100% { transform: translateY(0) rotate(0); }
          25% { transform: translateY(-15px) rotate(10deg); }
          75% { transform: translateY(10px) rotate(-5deg); }
        }
        @keyframes chaos-jump {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-40px); }
        }
        @keyframes chaos-peek {
          0% { transform: translateX(-100%) rotate(-10deg); }
          30% { transform: translateX(0) rotate(0); }
          70% { transform: translateX(0) rotate(0); }
          100% { transform: translateX(-100%) rotate(-10deg); }
        }
        @keyframes chaos-dance {
          0%, 100% { transform: rotate(0) scaleX(1); }
          25% { transform: rotate(15deg) scaleX(1.1); }
          50% { transform: rotate(0) scaleX(1); }
          75% { transform: rotate(-15deg) scaleX(-1.1); }
        }
        @keyframes chaos-wobble {
          0%, 100% { transform: rotate(0); }
          25% { transform: rotate(20deg); }
          75% { transform: rotate(-20deg); }
        }
        @keyframes chaos-float-up {
          0% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-100vh); opacity: 0; }
        }
        @keyframes chaos-throw {
          0% { transform: translate(0, 0) rotate(0); }
          100% { transform: translate(100px, -80px) rotate(360deg); opacity: 0; }
        }
        @keyframes chaos-flash {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
        @keyframes chaos-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-30px); }
        }
        @keyframes chaos-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes chaos-explode {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--chaos-ex, 30px), var(--chaos-ey, -40px)) scale(0.5); opacity: 0; }
        }
        @keyframes chaos-rocket {
          0% { transform: translateY(0) rotate(-45deg); }
          100% { transform: translateY(-100vh) rotate(-45deg); }
        }
        @keyframes chaos-roll {
          0% { transform: translateX(-50vw) rotate(0); }
          100% { transform: translateX(50vw) rotate(720deg); }
        }
        @keyframes chaos-matrix-col {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
      `}</style>
    </div>
  )
}

function getScreenEffectStyle(effect: ScheduledDistraction | undefined): React.CSSProperties {
  if (!effect) return {}
  const id = effect.def.id
  switch (id) {
    case 'screen-shake': return { animation: 'chaos-shake 0.1s infinite' }
    case 'screen-tilt': return { transform: 'rotate(3deg)', transition: 'transform 0.5s' }
    case 'screen-flip': return { transform: 'scaleY(-1)', transition: 'transform 0.3s' }
    case 'screen-blur': return { filter: 'blur(2px)', transition: 'filter 0.5s' }
    case 'screen-dim': return { filter: 'brightness(0.4)', transition: 'filter 0.3s' }
    case 'screen-static': return { animation: 'chaos-static 0.15s infinite' }
    case 'matrix-rain': return {}
    case 'heartbeat-pulse': return { animation: 'chaos-heartbeat 0.8s infinite' }
    default: return {}
  }
}

function DistractionRenderer({ distraction, currentTimeMs }: { distraction: ScheduledDistraction; currentTimeMs: number }) {
  const { def, x, y, startMs } = distraction
  const elapsed = currentTimeMs - startMs
  const progress = elapsed / def.durationMs // 0 to 1

  // Entry (0-20%), Hold (20-80%), Exit (80-100%)
  let opacity = 1
  let scale = 1
  if (progress < 0.2) {
    opacity = progress / 0.2
    scale = 0.5 + (progress / 0.2) * 0.5
  } else if (progress > 0.8) {
    opacity = (1 - progress) / 0.2
    scale = 1 - ((progress - 0.8) / 0.2) * 0.3
  }

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%) scale(${scale})`,
    opacity,
    transition: 'opacity 0.2s, transform 0.2s',
    fontSize: 'clamp(48px, 8vw, 80px)',
    lineHeight: 1,
  }

  return (
    <div style={style}>
      {renderDistraction(def.id, progress)}
    </div>
  )
}

function renderDistraction(id: string, progress: number) {
  switch (id) {
    // Animals
    case 'bird-poop':
      return (
        <div style={{ animation: 'chaos-drop 1s ease-in forwards' }}>
          <span>&#x1F426;</span>
          {progress > 0.4 && <span style={{ position: 'absolute', top: '100%', left: '50%', fontSize: '0.5em' }}>&#x1F4A9;</span>}
        </div>
      )
    case 'cat-walk':
      return <span style={{ animation: 'chaos-walk-right 4s linear', display: 'inline-block' }}>&#x1F431;</span>
    case 'dog-chase':
      return <span style={{ animation: 'chaos-walk-right 3.5s linear', display: 'inline-block' }}>&#x1F415;</span>
    case 'spider-drop':
      return <span style={{ animation: 'chaos-drop 2s ease-in', display: 'inline-block' }}>&#x1F577;&#xFE0F;</span>
    case 'fish-swim':
      return <span style={{ animation: 'chaos-swim 3.5s ease-in-out', display: 'inline-block' }}>&#x1F41F;</span>
    case 'butterfly-swarm':
      return (
        <div style={{ display: 'flex', gap: '10px' }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ animation: `chaos-flutter ${2 + i * 0.3}s ease-in-out infinite`, display: 'inline-block' }}>&#x1F98B;</span>
          ))}
        </div>
      )
    case 'duck-parade':
      return (
        <div style={{ display: 'flex', animation: 'chaos-walk-right 4.5s linear' }}>
          <span>&#x1F986;</span>
          <span>&#x1F986;</span>
          <span>&#x1F986;</span>
          <span>&#x1F986;</span>
        </div>
      )
    case 'frog-jump':
      return <span style={{ animation: 'chaos-jump 1s ease-in-out infinite', display: 'inline-block' }}>&#x1F438;</span>

    // People
    case 'peek-character':
      return <span style={{ animation: 'chaos-peek 3s ease-in-out', display: 'inline-block' }}>&#x1F440;</span>
    case 'wrong-sign':
      return (
        <div style={{
          background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '12px 24px',
          borderRadius: '12px', fontWeight: 900, fontSize: '0.5em', fontFamily: 'sans-serif',
          animation: 'chaos-shake 0.3s infinite', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          &#x274C; WRONG!
        </div>
      )
    case 'grandma-walk':
      return <span style={{ animation: 'chaos-walk-right 4s linear', display: 'inline-block' }}>&#x1F475;</span>
    case 'dancing-man':
      return <span style={{ animation: 'chaos-dance 0.5s ease-in-out infinite', display: 'inline-block' }}>&#x1F57A;</span>
    case 'pointing-finger':
      return <span style={{ animation: 'chaos-wobble 1s ease-in-out infinite', display: 'inline-block' }}>&#x1F449;</span>
    case 'sleeping-person':
      return (
        <div style={{ position: 'relative' }}>
          <span>&#x1F634;</span>
          <span style={{ fontSize: '0.4em', position: 'absolute', top: '-10px', right: '-5px', animation: 'chaos-float-up 1.5s infinite' }}>&#x1F4A4;</span>
        </div>
      )
    case 'chef-pizza':
      return (
        <div style={{ display: 'flex', gap: '5px' }}>
          <span>&#x1F468;&#x200D;&#x1F373;</span>
          <span style={{ animation: 'chaos-throw 1s ease-out infinite', display: 'inline-block' }}>&#x1F355;</span>
        </div>
      )
    case 'photographer':
      return (
        <div>
          <span>&#x1F4F8;</span>
          {progress > 0.3 && progress < 0.5 && (
            <div style={{
              position: 'fixed', inset: 0, background: 'white', opacity: 0.8,
              animation: 'chaos-flash 0.3s ease-out forwards',
            }} />
          )}
        </div>
      )

    // Objects
    case 'pizza-bounce':
      return <span style={{ animation: 'chaos-bounce 0.8s ease-in-out infinite', display: 'inline-block' }}>&#x1F355;</span>
    case 'disco-ball':
      return <span style={{ animation: 'chaos-spin 2s linear infinite', display: 'inline-block' }}>&#x1FA69;</span>
    case 'rain-drops':
      return (
        <div style={{ display: 'flex', gap: '20px', fontSize: '0.6em' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ animation: `chaos-drop ${1 + i * 0.2}s linear infinite`, animationDelay: `${i * 0.15}s`, display: 'inline-block' }}>&#x1F4A7;</span>
          ))}
        </div>
      )
    case 'confetti-burst':
      return (
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.7em' }}>
          {['\u{1F38A}', '\u{1F389}', '\u2728', '\u{1F38A}', '\u{1F389}'].map((c, i) => (
            <span key={i} style={{ animation: 'chaos-explode 1s ease-out forwards', animationDelay: `${i * 0.05}s`, display: 'inline-block' }}>{c}</span>
          ))}
        </div>
      )
    case 'balloon-float':
      return <span style={{ animation: 'chaos-float-up 4s ease-out', display: 'inline-block' }}>&#x1F388;</span>
    case 'rocket-launch':
      return <span style={{ animation: 'chaos-rocket 3s ease-in', display: 'inline-block' }}>&#x1F680;</span>
    case 'rolling-ball':
      return <span style={{ animation: 'chaos-roll 3.5s linear', display: 'inline-block' }}>&#x26BD;</span>
    case 'spinning-star':
      return <span style={{ animation: 'chaos-spin 1s linear infinite', display: 'inline-block' }}>&#x2B50;</span>

    // Screen effects that render content
    case 'matrix-rain':
      return (
        <div style={{
          position: 'fixed', inset: 0, overflow: 'hidden', color: '#0f0',
          fontFamily: 'monospace', fontSize: '14px', opacity: 0.3,
        }}>
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${i * 5}%`,
              animation: `chaos-matrix-col ${2 + (i % 3) * 0.5}s linear infinite`,
              animationDelay: `${(i % 5) * 0.4}s`,
            }}>
              {'01'.repeat(30)}
            </div>
          ))}
        </div>
      )

    // Fake UI
    case 'low-battery':
      return (
        <div style={{
          background: 'rgba(0,0,0,0.85)', color: '#ef4444', padding: '10px 20px',
          borderRadius: '12px', fontSize: '0.35em', fontFamily: 'sans-serif',
          fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          &#x1F50B; <span>{'\u05E1\u05D5\u05DC\u05DC\u05D4 2%'}</span>
        </div>
      )
    case 'incoming-call':
      return (
        <div style={{
          background: 'rgba(34,197,94,0.9)', color: 'white', padding: '12px 20px',
          borderRadius: '16px', fontSize: '0.35em', fontFamily: 'sans-serif',
          animation: 'chaos-shake 0.3s infinite', fontWeight: 600,
        }}>
          &#x1F4DE; {'\u05D0\u05DE\u05D0 \u05DE\u05EA\u05E7\u05E9\u05E8\u05EA...'}
        </div>
      )
    case 'buffering':
      return (
        <div style={{
          background: 'rgba(0,0,0,0.7)', color: 'white', padding: '16px 28px',
          borderRadius: '12px', fontSize: '0.4em', fontFamily: 'sans-serif',
          textAlign: 'center' as const,
        }}>
          <div style={{ animation: 'chaos-spin 1s linear infinite', display: 'inline-block', marginBottom: '4px' }}>&#x23F3;</div>
          <div>{'\u05D8\u05D5\u05E2\u05DF...'}</div>
        </div>
      )
    case 'update-modal':
      return (
        <div style={{
          background: 'rgba(255,255,255,0.95)', color: '#1f2937', padding: '16px 24px',
          borderRadius: '16px', fontSize: '0.3em', fontFamily: 'sans-serif',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)', textAlign: 'center' as const,
          maxWidth: '250px',
        }}>
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>{'\u05E2\u05D3\u05DB\u05D5\u05DF \u05D6\u05DE\u05D9\u05DF!'}</div>
          <div style={{ fontSize: '0.85em', color: '#6b7280' }}>{'\u05D2\u05E8\u05E1\u05D4 99.0.1 \u05DE\u05D5\u05DB\u05E0\u05D4 \u05DC\u05D4\u05EA\u05E7\u05E0\u05D4'}</div>
          <div style={{
            marginTop: '8px', background: '#3b82f6', color: 'white',
            padding: '6px 16px', borderRadius: '8px', fontWeight: 600,
          }}>
            {'\u05E2\u05D3\u05DB\u05DF \u05E2\u05DB\u05E9\u05D9\u05D5'}
          </div>
        </div>
      )
    case 'wifi-lost':
      return (
        <div style={{
          background: 'rgba(0,0,0,0.85)', color: '#fbbf24', padding: '10px 20px',
          borderRadius: '12px', fontSize: '0.35em', fontFamily: 'sans-serif',
          fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          &#x1F4F6; {'\u05D0\u05D9\u05DF \u05D7\u05D9\u05D1\u05D5\u05E8 \u05DC\u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8'}
        </div>
      )
    case 'screenshot-flash':
      return (
        <div style={{
          position: 'fixed', inset: 0, background: 'white',
          animation: 'chaos-flash 0.5s ease-out forwards',
        }} />
      )
    case 'app-crash':
      return (
        <div style={{
          background: 'rgba(0,0,0,0.9)', color: 'white', padding: '20px 28px',
          borderRadius: '12px', fontSize: '0.3em', fontFamily: 'monospace',
          maxWidth: '280px', textAlign: 'center' as const,
        }}>
          <div style={{ fontSize: '2em', marginBottom: '8px' }}>&#x1F4A5;</div>
          <div style={{ fontWeight: 700 }}>{'\u05D4\u05D0\u05E4\u05DC\u05D9\u05E7\u05E6\u05D9\u05D4 \u05E7\u05E8\u05E1\u05D4'}</div>
          <div style={{ color: '#9ca3af', marginTop: '4px', fontSize: '0.9em' }}>Error: TOO_MUCH_FUN</div>
        </div>
      )
    case 'timer-popup':
      return (
        <div style={{
          background: 'rgba(0,0,0,0.85)', color: 'white', padding: '10px 20px',
          borderRadius: '12px', fontSize: '0.35em', fontFamily: 'sans-serif',
          fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          &#x23F0; {'\u05D8\u05D9\u05D9\u05DE\u05E8: 00:00'}
        </div>
      )

    // Wacky illustrations inspired by crazy lyrics scenarios
    case 'penguin-pizza':
      return (
        <div style={{ display: 'flex', gap: '4px', animation: 'chaos-wobble 0.6s ease-in-out infinite' }}>
          <span>&#x1F427;</span>
          <span style={{ fontSize: '0.5em', alignSelf: 'center' }}>&#x27A1;&#xFE0F;</span>
          <span style={{ animation: 'chaos-spin 2s linear infinite', display: 'inline-block' }}>&#x1F355;</span>
        </div>
      )
    case 'fish-couch-fight':
      return (
        <div style={{ display: 'flex', gap: '2px', animation: 'chaos-shake 0.2s infinite' }}>
          <span>&#x1F41F;</span>
          <span style={{ fontSize: '0.5em', animation: 'chaos-bounce 0.4s infinite', display: 'inline-block' }}>&#x1F4A2;</span>
          <span>&#x1F6CB;&#xFE0F;</span>
          <span style={{ fontSize: '0.5em', animation: 'chaos-bounce 0.4s infinite 0.2s', display: 'inline-block' }}>&#x1F4A2;</span>
          <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>&#x1F41F;</span>
        </div>
      )
    case 'cat-mayor':
      return (
        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', animation: 'chaos-dance 1s infinite' }}>
          <span style={{ fontSize: '0.4em' }}>&#x1F451;</span>
          <span>&#x1F431;</span>
          <span style={{ fontSize: '0.25em', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' as const }}>VOTE MEOW</span>
        </div>
      )
    case 'ceo-dog':
      return (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', animation: 'chaos-walk-right 3.5s linear' }}>
          <span>&#x1F436;</span>
          <span style={{ fontSize: '0.3em', background: 'rgba(0,0,0,0.8)', color: '#fbbf24', padding: '4px 8px', borderRadius: '6px', fontWeight: 700, fontFamily: 'sans-serif', whiteSpace: 'nowrap' as const }}>&#x1F4BC; CEO</span>
        </div>
      )
    case 'octopus-dress':
      return (
        <div style={{ position: 'relative', animation: 'chaos-wobble 0.8s infinite' }}>
          <span>&#x1F419;</span>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              position: 'absolute', fontSize: '0.3em',
              top: `${60 + i * 15}%`, left: `${20 + i * 25}%`,
              animation: `chaos-flutter ${1 + i * 0.3}s infinite`,
              display: 'inline-block',
            }}>&#x1F455;</span>
          ))}
        </div>
      )
    case 'snail-chase':
      return (
        <div style={{ display: 'flex', gap: '30px', animation: 'chaos-walk-right 8s linear' }}>
          <span>&#x1F40C;</span>
          <span style={{ fontSize: '0.4em', alignSelf: 'center' }}>&#x1F4A8;</span>
          <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>&#x1F40C;</span>
        </div>
      )
    case 'banana-crisis':
      return (
        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
          <span style={{ animation: 'chaos-heartbeat 0.6s infinite', display: 'inline-block' }}>&#x1F34C;</span>
          <span style={{ fontSize: '0.2em', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 6px', borderRadius: '4px', animation: 'chaos-shake 0.3s infinite', whiteSpace: 'nowrap' as const }}>&#x1F62D; MIDLIFE CRISIS</span>
        </div>
      )
    case 'fridge-revolution':
      return (
        <div style={{ display: 'flex', gap: '3px', animation: 'chaos-shake 0.15s infinite' }}>
          <span style={{ animation: 'chaos-jump 0.5s infinite', display: 'inline-block' }}>&#x1F966;</span>
          <span style={{ animation: 'chaos-jump 0.5s infinite 0.1s', display: 'inline-block' }}>&#x1F955;</span>
          <span style={{ fontSize: '0.4em', alignSelf: 'center' }}>&#x2694;&#xFE0F;</span>
          <span style={{ animation: 'chaos-wobble 0.5s infinite', display: 'inline-block' }}>&#x1F370;</span>
        </div>
      )
    case 'pizza-trial':
      return (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.6em' }}>&#x1F957;</span>
          <span style={{ fontSize: '0.3em', background: 'rgba(0,0,0,0.8)', color: '#ef4444', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, fontFamily: 'sans-serif' }}>GUILTY!</span>
          <span style={{ animation: 'chaos-shake 0.2s infinite', display: 'inline-block' }}>&#x1F355;</span>
        </div>
      )
    case 'toast-propose':
      return (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ animation: 'chaos-wobble 1s infinite', display: 'inline-block' }}>&#x1F35E;</span>
          <span style={{ fontSize: '0.4em', animation: 'chaos-bounce 0.6s infinite', display: 'inline-block' }}>&#x1F48D;</span>
          <span>&#x1F95C;</span>
        </div>
      )
    case 'alien-breakfast':
      return (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', animation: 'chaos-peek 3s ease-in-out' }}>
          <span>&#x1F47D;</span>
          <span style={{ fontSize: '0.3em' }}>&#x2753;</span>
          <span style={{ fontSize: '0.7em' }}>&#x1F373;</span>
        </div>
      )
    case 'sock-reunion':
      return (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <span style={{ animation: 'chaos-walk-right 1.5s ease-out', display: 'inline-block' }}>&#x1F9E6;</span>
          <span style={{ fontSize: '0.5em', animation: 'chaos-heartbeat 0.5s infinite', display: 'inline-block' }}>&#x2764;&#xFE0F;</span>
          <span style={{ animation: 'chaos-walk-right 1.5s ease-out reverse', display: 'inline-block', transform: 'scaleX(-1)' }}>&#x1F9E6;</span>
        </div>
      )
    case 'chair-diary':
      return (
        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
          <span style={{ animation: 'chaos-wobble 2s infinite', display: 'inline-block' }}>&#x1FA91;</span>
          <span style={{ fontSize: '0.25em', background: 'rgba(0,0,0,0.7)', color: '#93c5fd', padding: '2px 8px', borderRadius: '4px', fontStyle: 'italic', fontFamily: 'serif', whiteSpace: 'nowrap' as const }}>{'\u05D9\u05D5\u05DE\u05DF \u05D9\u05E7\u05E8...'}</span>
        </div>
      )
    case 'traffic-light-crisis':
      return (
        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px' }}>
          {['#ef4444', '#fbbf24', '#22c55e'].map((color, i) => (
            <div key={i} style={{
              width: '20px', height: '20px', borderRadius: '50%',
              background: color, opacity: progress * 3 % 3 > i ? 1 : 0.2,
              animation: 'chaos-static 0.3s infinite',
              transition: 'opacity 0.1s',
            }} />
          ))}
          <span style={{ fontSize: '0.2em', marginTop: '2px' }}>&#x1F635;&#x200D;&#x1F4AB;</span>
        </div>
      )
    case 'elevator-race':
      return (
        <div style={{ display: 'flex', gap: '30px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
            <span style={{ fontSize: '0.3em', fontFamily: 'monospace', color: '#22c55e' }}>{Math.floor(progress * 10)}</span>
            <span style={{ animation: `chaos-float-up ${2}s linear`, display: 'inline-block', fontSize: '0.7em' }}>&#x1F6D7;</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
            <span style={{ fontSize: '0.3em', fontFamily: 'monospace', color: '#ef4444' }}>{Math.floor(progress * 8)}</span>
            <span style={{ animation: `chaos-float-up ${2.5}s linear`, display: 'inline-block', fontSize: '0.7em' }}>&#x1F6D7;</span>
          </div>
        </div>
      )
    case 'grandma-cook-battle':
      return (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', animation: 'chaos-shake 0.2s infinite' }}>
          <span>&#x1F475;</span>
          <span style={{ fontSize: '0.5em' }}>&#x2694;&#xFE0F;</span>
          <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>&#x1F475;</span>
          <span style={{ fontSize: '0.5em', animation: 'chaos-throw 0.8s infinite', display: 'inline-block' }}>&#x1F35A;</span>
        </div>
      )
    case 'falafel-love':
      return (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ animation: 'chaos-wobble 1s infinite', display: 'inline-block' }}>&#x1F9C6;</span>
          <span style={{ fontSize: '0.5em', animation: 'chaos-heartbeat 0.6s infinite', display: 'inline-block' }}>&#x1F495;</span>
          <span style={{ animation: 'chaos-wobble 1s infinite 0.5s', display: 'inline-block' }}>&#x1F9C6;</span>
          <span style={{ fontSize: '0.4em', position: 'relative', top: '-15px', animation: 'chaos-shake 0.3s infinite', display: 'inline-block' }}>&#x1F60D;</span>
        </div>
      )
    case 'pigeon-complaint':
      return (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
          <span style={{ animation: 'chaos-wobble 0.5s infinite', display: 'inline-block' }}>&#x1F54A;&#xFE0F;</span>
          <div style={{ fontSize: '0.2em', background: 'white', color: '#1f2937', padding: '4px 8px', borderRadius: '8px', maxWidth: '120px', fontFamily: 'sans-serif', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            {'\u05D4\u05DC\u05D7\u05DD \u05DB\u05D0\u05DF \u05E0\u05D5\u05E8\u05D0!!'}
          </div>
        </div>
      )
    case 'astronaut-milk':
      return (
        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', animation: 'chaos-float-up 5s ease-out' }}>
          <span>&#x1F468;&#x200D;&#x1F680;</span>
          <span style={{ fontSize: '0.25em', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' as const }}>&#x1F95B; {'\u05E9\u05DB\u05D7\u05EA\u05D9 \u05D7\u05DC\u05D1!'}</span>
        </div>
      )
    case 'gps-lost':
      return (
        <div style={{
          background: 'rgba(0,0,0,0.85)', color: '#f97316', padding: '10px 20px',
          borderRadius: '12px', fontSize: '0.35em', fontFamily: 'sans-serif',
          fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
          animation: 'chaos-shake 0.3s infinite',
        }}>
          &#x1F4CD; {'\u05DE\u05D7\u05E9\u05D1 \u05DE\u05E1\u05DC\u05D5\u05DC \u05DE\u05D7\u05D3\u05E9...'}
        </div>
      )

    default:
      return <span>&#x2753;</span>
  }
}
