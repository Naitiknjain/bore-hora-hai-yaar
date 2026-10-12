import { Segmented, Toggle } from '../../components/ui/Controls'
import { backendConfigured } from '../../lib/supabase'
import { type MotionPref, type TouchPref, useSettings } from './SettingsContext'

export function SettingsPage() {
  const { settings, update } = useSettings()
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-4xl font-extrabold">Settings</h1>
        <p className="mt-1 text-ink-300">Saved on this device.</p>
      </div>

      <section className="space-y-3" aria-labelledby="sound-h">
        <h2 id="sound-h" className="text-xl font-bold">
          Sound & feel
        </h2>
        <Toggle label="Sound effects" description="All sounds are tiny synthesised beeps - no music." checked={settings.sound} onChange={(v) => update({ sound: v })} />
        <Toggle label="Vibration" description="Short vibrations on supported phones." checked={settings.haptics} onChange={(v) => update({ haptics: v })} />
      </section>

      <section className="space-y-3" aria-labelledby="a11y-h">
        <h2 id="a11y-h" className="text-xl font-bold">
          Accessibility
        </h2>
        <div className="rounded-2xl bg-ink-800 p-4">
          <p className="font-semibold">Reduce motion</p>
          <p className="mb-3 text-sm text-ink-300">"System" follows your device setting. Reduces page animations and screen shake.</p>
          <Segmented<MotionPref>
            label="Reduce motion"
            value={settings.reducedMotion}
            onChange={(v) => update({ reducedMotion: v })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'on', label: 'Reduce' },
              { value: 'off', label: 'Full motion' },
            ]}
          />
        </div>
        <div className="rounded-2xl bg-ink-800 p-4">
          <p className="font-semibold">On-screen game controls</p>
          <p className="mb-3 text-sm text-ink-300">Touch buttons for arcade games. "Auto" shows them on touch screens.</p>
          <Segmented<TouchPref>
            label="On-screen controls"
            value={settings.touchControls}
            onChange={(v) => update({ touchControls: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'always', label: 'Always' },
              { value: 'never', label: 'Never' },
            ]}
          />
        </div>
      </section>

      <section className="rounded-2xl bg-ink-800 p-4 text-sm text-ink-300" aria-labelledby="about-h">
        <h2 id="about-h" className="mb-1 text-base font-bold text-ink-100">
          About
        </h2>
        <p>Online features: {backendConfigured ? 'connected to the shared backend.' : 'not configured - running in local-only mode.'}</p>
        <p className="mt-1">All games, artwork and sounds are original implementations. Some are inspired by classic games; no proprietary assets are used.</p>
      </section>
    </div>
  )
}
