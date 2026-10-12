import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setSoundEnabled } from '../../lib/sound'
import { readJSON, writeJSON } from '../../lib/storage'

export type MotionPref = 'system' | 'on' | 'off'
export type TouchPref = 'auto' | 'always' | 'never'

export interface Settings {
  sound: boolean
  /** 'on' = force reduced motion, 'off' = allow animation even if the OS asks to reduce it */
  reducedMotion: MotionPref
  touchControls: TouchPref
  haptics: boolean
}

const DEFAULTS: Settings = { sound: true, reducedMotion: 'system', touchControls: 'auto', haptics: true }

interface Ctx {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  /** Resolved preference used by canvas games. */
  prefersReducedMotion: boolean
  showTouchControls: boolean
}

const SettingsContext = createContext<Ctx | null>(null)

function systemReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function isTouchDevice() {
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULTS, ...readJSON<Partial<Settings>>('settings', {}) }))

  useEffect(() => {
    writeJSON('settings', settings)
    setSoundEnabled(settings.sound)
    document.documentElement.dataset.reducedMotion = settings.reducedMotion
  }, [settings])

  const value = useMemo<Ctx>(
    () => ({
      settings,
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
      prefersReducedMotion: settings.reducedMotion === 'on' || (settings.reducedMotion === 'system' && Boolean(systemReducedMotion())),
      showTouchControls: settings.touchControls === 'always' || (settings.touchControls === 'auto' && isTouchDevice()),
    }),
    [settings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}

export function vibrate(ms: number | number[]) {
  try {
    const s = readJSON<Partial<Settings>>('settings', {})
    if (s.haptics !== false) navigator.vibrate?.(ms)
  } catch {
    /* ignore */
  }
}
