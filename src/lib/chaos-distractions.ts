// Seeded PRNG (mulberry32) — same as in karaoke-madness.ts
function createPRNG(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DistractionDef {
  id: string
  category: 'animal' | 'person' | 'object' | 'screen_effect' | 'fake_ui'
  durationMs: number
  position: 'random' | 'center' | 'top' | 'bottom' | 'side'
}

export interface ScheduledDistraction {
  def: DistractionDef
  startMs: number
  x: number // 0-100 percentage
  y: number // 0-100 percentage
}

// All available distractions
export const DISTRACTIONS: DistractionDef[] = [
  // Animals
  { id: 'bird-poop', category: 'animal', durationMs: 3000, position: 'top' },
  { id: 'cat-walk', category: 'animal', durationMs: 4000, position: 'bottom' },
  { id: 'dog-chase', category: 'animal', durationMs: 3500, position: 'bottom' },
  { id: 'spider-drop', category: 'animal', durationMs: 3000, position: 'top' },
  { id: 'fish-swim', category: 'animal', durationMs: 3500, position: 'side' },
  { id: 'butterfly-swarm', category: 'animal', durationMs: 4000, position: 'random' },
  { id: 'duck-parade', category: 'animal', durationMs: 4500, position: 'bottom' },
  { id: 'frog-jump', category: 'animal', durationMs: 2500, position: 'bottom' },
  // People
  { id: 'peek-character', category: 'person', durationMs: 3000, position: 'side' },
  { id: 'wrong-sign', category: 'person', durationMs: 2500, position: 'center' },
  { id: 'grandma-walk', category: 'person', durationMs: 4000, position: 'bottom' },
  { id: 'dancing-man', category: 'person', durationMs: 4000, position: 'side' },
  { id: 'pointing-finger', category: 'person', durationMs: 2500, position: 'random' },
  { id: 'sleeping-person', category: 'person', durationMs: 3500, position: 'bottom' },
  { id: 'chef-pizza', category: 'person', durationMs: 3000, position: 'side' },
  { id: 'photographer', category: 'person', durationMs: 2500, position: 'random' },
  // Objects
  { id: 'pizza-bounce', category: 'object', durationMs: 3000, position: 'random' },
  { id: 'disco-ball', category: 'object', durationMs: 4000, position: 'top' },
  { id: 'rain-drops', category: 'object', durationMs: 4000, position: 'top' },
  { id: 'confetti-burst', category: 'object', durationMs: 3000, position: 'center' },
  { id: 'balloon-float', category: 'object', durationMs: 4000, position: 'bottom' },
  { id: 'rocket-launch', category: 'object', durationMs: 3000, position: 'bottom' },
  { id: 'rolling-ball', category: 'object', durationMs: 3500, position: 'bottom' },
  { id: 'spinning-star', category: 'object', durationMs: 3000, position: 'random' },
  // Screen effects
  { id: 'screen-shake', category: 'screen_effect', durationMs: 2000, position: 'center' },
  { id: 'screen-tilt', category: 'screen_effect', durationMs: 3000, position: 'center' },
  { id: 'screen-flip', category: 'screen_effect', durationMs: 2500, position: 'center' },
  { id: 'screen-blur', category: 'screen_effect', durationMs: 2500, position: 'center' },
  { id: 'screen-dim', category: 'screen_effect', durationMs: 2000, position: 'center' },
  { id: 'screen-static', category: 'screen_effect', durationMs: 2000, position: 'center' },
  { id: 'matrix-rain', category: 'screen_effect', durationMs: 3500, position: 'center' },
  { id: 'heartbeat-pulse', category: 'screen_effect', durationMs: 3000, position: 'center' },
  // Wacky illustrations (inspired by crazy lyrics scenarios)
  { id: 'penguin-pizza', category: 'person', durationMs: 3500, position: 'side' },
  { id: 'fish-couch-fight', category: 'animal', durationMs: 3500, position: 'bottom' },
  { id: 'cat-mayor', category: 'animal', durationMs: 3000, position: 'center' },
  { id: 'ceo-dog', category: 'animal', durationMs: 3500, position: 'side' },
  { id: 'octopus-dress', category: 'animal', durationMs: 3000, position: 'random' },
  { id: 'snail-chase', category: 'animal', durationMs: 4500, position: 'bottom' },
  { id: 'banana-crisis', category: 'object', durationMs: 3000, position: 'random' },
  { id: 'fridge-revolution', category: 'object', durationMs: 3500, position: 'center' },
  { id: 'pizza-trial', category: 'person', durationMs: 3000, position: 'center' },
  { id: 'toast-propose', category: 'object', durationMs: 3000, position: 'random' },
  { id: 'alien-breakfast', category: 'person', durationMs: 3000, position: 'top' },
  { id: 'sock-reunion', category: 'object', durationMs: 3000, position: 'center' },
  { id: 'chair-diary', category: 'object', durationMs: 3500, position: 'bottom' },
  { id: 'traffic-light-crisis', category: 'object', durationMs: 3000, position: 'top' },
  { id: 'elevator-race', category: 'fake_ui', durationMs: 3000, position: 'side' },
  { id: 'grandma-cook-battle', category: 'person', durationMs: 3500, position: 'bottom' },
  { id: 'falafel-love', category: 'object', durationMs: 3000, position: 'center' },
  { id: 'pigeon-complaint', category: 'animal', durationMs: 3000, position: 'top' },
  { id: 'astronaut-milk', category: 'person', durationMs: 3500, position: 'random' },
  { id: 'gps-lost', category: 'fake_ui', durationMs: 3000, position: 'top' },
  // Fake UI
  { id: 'low-battery', category: 'fake_ui', durationMs: 3000, position: 'top' },
  { id: 'incoming-call', category: 'fake_ui', durationMs: 3500, position: 'top' },
  { id: 'buffering', category: 'fake_ui', durationMs: 3000, position: 'center' },
  { id: 'update-modal', category: 'fake_ui', durationMs: 3500, position: 'center' },
  { id: 'wifi-lost', category: 'fake_ui', durationMs: 2500, position: 'top' },
  { id: 'screenshot-flash', category: 'fake_ui', durationMs: 1500, position: 'center' },
  { id: 'app-crash', category: 'fake_ui', durationMs: 3000, position: 'center' },
  { id: 'timer-popup', category: 'fake_ui', durationMs: 3000, position: 'top' },
]

/**
 * Pre-compute a deterministic schedule of distractions for a song.
 */
export function scheduleDistractions(
  seed: number,
  songDurationMs: number,
): ScheduledDistraction[] {
  const rand = createPRNG(seed)
  const schedule: ScheduledDistraction[] = []
  const used = new Set<string>()

  // Start after 5s, leave 3s at end
  let time = 5000 + rand() * 3000
  const endTime = songDurationMs - 3000

  while (time < endTime) {
    // Pick a random distraction (avoid repeats until all used)
    const available = DISTRACTIONS.filter(d => !used.has(d.id))
    const pool = available.length > 0 ? available : DISTRACTIONS
    if (available.length === 0) used.clear()

    const def = pool[Math.floor(rand() * pool.length)]
    used.add(def.id)

    // Position
    let x: number, y: number
    switch (def.position) {
      case 'top':
        x = 10 + rand() * 80
        y = 5 + rand() * 15
        break
      case 'bottom':
        x = 10 + rand() * 80
        y = 70 + rand() * 20
        break
      case 'side':
        x = rand() < 0.5 ? 2 + rand() * 10 : 88 + rand() * 10
        y = 20 + rand() * 50
        break
      case 'center':
        x = 30 + rand() * 40
        y = 30 + rand() * 30
        break
      default:
        x = 10 + rand() * 80
        y = 10 + rand() * 70
    }

    schedule.push({ def, startMs: Math.round(time), x, y })

    // Rapid gaps: 1.5-5s early, 0.5-3s later — much more chaotic!
    const progress = time / songDurationMs
    const minGap = progress > 0.5 ? 500 : 1500
    const maxGap = progress > 0.5 ? 3000 : 5000
    time += minGap + rand() * (maxGap - minGap) + def.durationMs * 0.3
  }

  return schedule
}
