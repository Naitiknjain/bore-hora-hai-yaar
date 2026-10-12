import { Flag, Keyboard, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { OptionGroup, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { Hud, HudStat } from '../../components/game/TouchControls'
import { Button } from '../../components/ui/Button'
import { Segmented } from '../../components/ui/Controls'
import { usePlayer } from '../../features/player/PlayerContext'
import { useGameLoop } from '../../hooks/useGameLoop'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { ConfirmDialog } from '../../components/ui/Modal'
import { createRng, randomSeed } from '../../lib/random'
import { formatMs } from '../../lib/scoring'
import { sfx } from '../../lib/sound'
import type { Difficulty, StoredResult } from '../../types'
import { correctPrefix, finalPosition, makeRivals, pickSentence, rivalFinishMs, rivalProgress, stats, type Rival } from './logic'

type Phase = 'menu' | 'countdown' | 'racing' | 'over'

function Car({ color, label }: { color: string; label: string }) {
  return (
    <svg viewBox="0 0 64 28" className="h-7 w-16 drop-shadow" role="img" aria-label={label}>
      <rect x="4" y="8" width="56" height="14" rx="6" fill={color} />
      <path d="M18 8 L26 2 H42 L50 8 Z" fill={color} />
      <path d="M28 4 H40 L45 8 H25 Z" fill="#bfe9ff" />
      <rect x="54" y="11" width="6" height="4" rx="1" fill="#fff6c4" />
      <circle cx="16" cy="22" r="5" fill="#0b1020" />
      <circle cx="48" cy="22" r="5" fill="#0b1020" />
      <circle cx="16" cy="22" r="2" fill="#9aa3c0" />
      <circle cx="48" cy="22" r="2" fill="#9aa3c0" />
    </svg>
  )
}

export default function TypingRacer() {
  const { player } = usePlayer()
  const { beginRun, finishRun } = useResultRecorder()
  const rng = useRef(createRng(randomSeed()))
  const [phase, setPhase] = useState<Phase>('menu')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [text, setText] = useState('')
  const [typed, setTyped] = useState('')
  const [rivals, setRivals] = useState<Rival[]>([])
  const [count, setCount] = useState(3)
  const [now, setNow] = useState(0)
  const [keystrokes, setKeystrokes] = useState(0)
  const [errors, setErrors] = useState(0)
  const [final, setFinal] = useState<{ ms: number; wpm: number; accuracy: number; position: number } | null>(null)
  const [result, setResult] = useState<StoredResult | null>(null)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const startAt = useRef(0)
  const phases = useRef([0, 2, 4])
  const input = useRef<HTMLInputElement>(null)
  const blocker = useLeaveGuard(phase === 'racing' || phase === 'countdown')

  const correct = correctPrefix(text, typed)
  const elapsed = phase === 'racing' ? now - startAt.current : final?.ms ?? 0

  function start() {
    const sentence = pickSentence(difficulty, rng.current, text)
    setText(sentence)
    setTyped('')
    setRivals(makeRivals(difficulty, rng.current))
    phases.current = [rng.current() * 6, rng.current() * 6, rng.current() * 6]
    setKeystrokes(0)
    setErrors(0)
    setFinal(null)
    setResult(null)
    setCount(3)
    setPhase('countdown')
  }

  // 3-2-1-GO
  useEffect(() => {
    if (phase !== 'countdown') return
    if (count === 0) {
      startAt.current = performance.now()
      setNow(startAt.current)
      setPhase('racing')
      sfx.win()
      beginRun(difficulty)
      return
    }
    sfx.click()
    const t = window.setTimeout(() => setCount((c) => c - 1), 750)
    return () => window.clearTimeout(t)
  }, [phase, count, beginRun, difficulty])

  useEffect(() => {
    if (phase === 'racing' || phase === 'countdown') input.current?.focus()
  }, [phase])

  useGameLoop((_, t) => setNow(t), phase === 'racing')

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    if (phase !== 'racing') return
    const value = e.target.value.slice(0, text.length + 8)
    if (value.length > typed.length) {
      const added = value.length - typed.length
      let newErrors = 0
      for (let p = typed.length; p < value.length; p += 1) {
        // a character is an error if it is wrong or typed after an uncorrected mistake
        if (correctPrefix(text, value.slice(0, p + 1)) !== p + 1) newErrors += 1
      }
      setKeystrokes((k) => k + added)
      if (newErrors) {
        setErrors((x) => x + newErrors)
        sfx.miss()
      }
    }
    setTyped(value)
    if (value === text) finish(value)
  }

  function finish(value: string) {
    const ms = Math.round(performance.now() - startAt.current)
    const totalKeys = keystrokes + Math.max(0, value.length - typed.length)
    const { wpm, accuracy } = stats(text.length, totalKeys, errors, ms)
    const position = finalPosition(rivals, text.length, ms)
    setFinal({ ms, wpm, accuracy, position })
    if (position === 1) sfx.win()
    else sfx.click()
    void finishRun({ board: difficulty, metrics: { wpm, accuracy, timeMs: ms, chars: text.length, position } }).then(setResult)
    setPhase('over')
  }

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        startLabel="Start race"
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>Type the sentence exactly - every correct character pushes your car forward.</li>
            <li>A wrong key turns red and blocks you until you fix it with Backspace.</li>
            <li>First car to the finish wins. WPM = (characters ÷ 5) ÷ minutes.</li>
            <li>Harder levels have longer sentences with punctuation and faster rivals.</li>
          </ul>
        }
      >
        <OptionGroup label="Difficulty">
          <Segmented<Difficulty>
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' },
            ]}
          />
        </OptionGroup>
      </StartScreen>
    )
  }

  if (phase === 'over' && final) {
    const ordinal = ['1st', '2nd', '3rd', '4th'][final.position - 1]
    return (
      <ResultsScreen
        title={final.position === 1 ? 'Pehla number! 🏁' : `You finished ${ordinal}`}
        emoji={final.position === 1 ? '🏆' : '🏎️'}
        subtitle={`${difficulty} · "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`}
        result={result}
        onReplay={start}
        replayLabel="Race again"
        stats={
          <>
            <HudStat label="WPM" value={final.wpm.toFixed(1)} accent="#3ee08f" />
            <HudStat label="Accuracy" value={`${final.accuracy}%`} />
            <HudStat label="Errors" value={errors} />
            <HudStat label="Time" value={formatMs(final.ms)} />
            <HudStat label="Position" value={ordinal} />
          </>
        }
      />
    )
  }

  const live = stats(correct, keystrokes, errors, Math.max(1, elapsed))
  const cars = [
    { name: player?.nickname ?? 'You', color: '#ffd23f', progress: correct / text.length, you: true },
    ...rivals.map((r, i) => ({
      name: r.name,
      color: r.color,
      progress: phase === 'racing' ? rivalProgress(r, elapsed, text.length, phases.current[i]) : 0,
      you: false,
      done: phase === 'racing' && elapsed >= rivalFinishMs(r, text.length),
    })),
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <Hud>
        <HudStat label="WPM" value={phase === 'racing' ? live.wpm.toFixed(0) : '-'} accent="#3ee08f" />
        <HudStat label="Accuracy" value={`${live.accuracy}%`} />
        <HudStat label="Errors" value={errors} accent={errors ? '#ff4d5e' : undefined} />
        <HudStat label="Time" value={formatMs(elapsed)} />
        <HudStat label="Progress" value={`${Math.round((correct / text.length) * 100)}%`} />
        <div className="ml-auto">
          <Button variant="secondary" className="!px-3" aria-label="Quit race" onClick={() => setConfirmQuit(true)}>
            <RotateCcw className="size-5" />
          </Button>
        </div>
      </Hud>

      {/* highway */}
      <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#2a2f45]" aria-label="Race track">
        <div className="absolute inset-y-0 right-10 w-3 bg-[repeating-linear-gradient(0deg,#fff_0_8px,#0b1020_8px_16px)] opacity-80" aria-hidden />
        {cars.map((c, i) => (
          <div key={c.name} className={`relative flex h-12 items-center ${i < cars.length - 1 ? 'border-b-2 border-dashed border-white/15' : ''}`}>
            <div className="absolute transition-[left] duration-100 ease-linear" style={{ left: `calc(${Math.min(1, c.progress)} * (100% - 6.5rem) + 0.25rem)` }}>
              <Car color={c.color} label={`${c.name}${c.you ? ' (you)' : ''}`} />
            </div>
            <span className={`pointer-events-none absolute right-14 text-xs font-semibold ${c.you ? 'text-masala' : 'text-ink-300'}`}>
              {c.you ? 'YOU' : c.name}
              {'done' in c && c.done ? ' 🏁' : ''}
            </span>
          </div>
        ))}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-950/60 font-display text-7xl font-extrabold text-masala animate-fade-in" aria-live="assertive">
            {count || 'GO!'}
          </div>
        )}
      </div>

      {/* sentence */}
      <div
        className="mt-4 rounded-3xl border border-white/5 bg-ink-800 p-4 font-mono text-lg leading-relaxed sm:text-2xl"
        onClick={() => input.current?.focus()}
        aria-label="Sentence to type"
      >
        {[...text].map((ch, i) => {
          let cls = 'text-ink-400'
          if (i < correct) cls = 'text-pudina'
          else if (i < typed.length) cls = 'bg-lal/40 text-white'
          if (i === typed.length) cls += ' border-b-2 border-masala text-ink-100'
          return (
            <span key={i} className={cls}>
              {ch}
            </span>
          )
        })}
      </div>

      <label className="mt-3 flex items-center gap-2 rounded-2xl border border-ink-600 bg-ink-900 px-3 focus-within:border-masala">
        <Keyboard className="size-5 shrink-0 text-ink-400" aria-hidden />
        <input
          ref={input}
          data-game-input="true"
          value={typed}
          onChange={onChange}
          onPaste={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          disabled={phase !== 'racing'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Type the sentence here"
          placeholder={phase === 'countdown' ? 'Get ready...' : 'Start typing...'}
          className="min-h-12 w-full bg-transparent font-mono text-lg text-ink-100 outline-none"
        />
        <Flag className="size-5 shrink-0 text-ink-400" aria-hidden />
      </label>
      <p className="mt-2 text-center text-xs text-ink-400">Paste is disabled. Tap the sentence to bring up the keyboard on phones.</p>

      <ConfirmDialog
        open={confirmQuit}
        title="Quit this race?"
        message="The race will not be saved."
        confirmLabel="Quit"
        onConfirm={() => {
          setConfirmQuit(false)
          setPhase('menu')
        }}
        onCancel={() => setConfirmQuit(false)}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        danger
        title="Leave the race?"
        message="The unfinished race will be discarded."
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  )
}
