/**
 * Tiny WebAudio synthesiser: all sounds are generated in code (no audio assets).
 * Respects the global sound toggle from Settings.
 */
let enabled = true
let ctx: AudioContext | null = null

export function setSoundEnabled(value: boolean) {
  enabled = value
}

export function isSoundEnabled() {
  return enabled
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface ToneOptions {
  freq: number
  to?: number
  duration?: number
  type?: OscillatorType
  volume?: number
  delay?: number
}

export function tone({ freq, to, duration = 0.12, type = 'sine', volume = 0.12, delay = 0 }: ToneOptions) {
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

export const sfx = {
  click: () => tone({ freq: 520, duration: 0.05, type: 'triangle', volume: 0.06 }),
  flip: () => tone({ freq: 380, to: 620, duration: 0.08, type: 'triangle', volume: 0.07 }),
  match: () => {
    tone({ freq: 660, duration: 0.1, type: 'sine', volume: 0.1 })
    tone({ freq: 990, duration: 0.14, type: 'sine', volume: 0.08, delay: 0.08 })
  },
  miss: () => tone({ freq: 240, to: 160, duration: 0.15, type: 'sawtooth', volume: 0.05 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, duration: 0.18, type: 'triangle', volume: 0.1, delay: i * 0.1 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone({ freq: f, duration: 0.2, type: 'triangle', volume: 0.09, delay: i * 0.13 })),
  jump: () => tone({ freq: 300, to: 700, duration: 0.12, type: 'square', volume: 0.04 }),
  point: () => tone({ freq: 880, duration: 0.07, type: 'square', volume: 0.04 }),
  hit: () => tone({ freq: 180, duration: 0.06, type: 'square', volume: 0.06 }),
  crash: () => tone({ freq: 160, to: 40, duration: 0.3, type: 'sawtooth', volume: 0.08 }),
  dice: () => [0, 0.05, 0.1].forEach((d) => tone({ freq: 200 + Math.random() * 200, duration: 0.04, type: 'square', volume: 0.04, delay: d })),
  whoosh: () => tone({ freq: 900, to: 200, duration: 0.18, type: 'sine', volume: 0.06 }),
}
