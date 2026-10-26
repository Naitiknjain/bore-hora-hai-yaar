import { Pause, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { OptionGroup, PauseOverlay, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { useBoxSize } from '../../components/game/FitStage'
import { Hud, HudStat } from '../../components/game/TouchControls'
import { Button } from '../../components/ui/Button'
import { Segmented } from '../../components/ui/Controls'
import { ConfirmDialog } from '../../components/ui/Modal'
import { usePlayer } from '../../features/player/PlayerContext'
import { useSettings } from '../../features/settings/SettingsContext'
import { useVisibilityPause } from '../../hooks/useGameLoop'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { useStopwatch } from '../../hooks/useStopwatch'
import { createRng, randomSeed } from '../../lib/random'
import { formatDuration, formatMs } from '../../lib/scoring'
import { isSoundEnabled, setSoundEnabled, sfx } from '../../lib/sound'
import type { Difficulty, StoredResult } from '../../types'
import { deal, isComplete, isMatch, PAIRS, resolve, reveal, winner, type MemoryState } from './logic'

type Phase = 'menu' | 'playing' | 'over'

const CARD_GAP = 8

/** Column count that makes 3:4 cards as large as possible inside a w x h box. */
function bestGrid(n: number, w: number, h: number) {
  let best = { cols: 4, cardW: 0 }
  for (let cols = 2; cols <= n; cols += 1) {
    const rows = Math.ceil(n / cols)
    const cardW = Math.min((w - CARD_GAP * (cols - 1)) / cols, ((h - CARD_GAP * (rows - 1)) / rows) * 0.75)
    if (cardW > best.cardW) best = { cols, cardW }
  }
  return { cols: best.cols, cardW: Math.floor(Math.min(best.cardW, 150)) }
}

const GRID: Record<Difficulty, string> = {
  easy: 'grid-cols-4 sm:grid-cols-7',
  medium: 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8',
  hard: 'grid-cols-5 sm:grid-cols-6 lg:grid-cols-10',
}

export default function MemoryMatch() {
  const navigate = useNavigate()
  const { player } = usePlayer()
  const { settings, update } = useSettings()
  const { beginRun, finishRun } = useResultRecorder()
  const rng = useRef(createRng(randomSeed()))
  const watch = useStopwatch()
  const [phase, setPhase] = useState<Phase>('menu')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [players, setPlayers] = useState<1 | 2>(1)
  const [game, setGame] = useState<MemoryState>(() => deal('easy', 1, rng.current))
  const [paused, setPaused] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [result, setResult] = useState<StoredResult | null>(null)
  const [finalMs, setFinalMs] = useState(0)

  const unfinished = phase === 'playing'
  const blocker = useLeaveGuard(unfinished)
  const { box: cardBox, rect: cardRect } = useBoxSize()
  const layout = cardRect && cardRect.h > 120 ? bestGrid(game.cards.length, cardRect.w, cardRect.h) : null

  function start() {
    setGame(deal(difficulty, players, rng.current))
    setPaused(false)
    setResult(null)
    watch.reset()
    setPhase('playing')
    if (players === 1) beginRun(difficulty)
  }

  function onCard(i: number) {
    if (paused || phase !== 'playing') return
    const next = reveal(game, i)
    if (next === game) return
    if (game.moves === 0 && game.open.length === 0) watch.start()
    sfx.flip()
    setGame(next)
  }

  // settle two open cards after a short delay
  useEffect(() => {
    if (game.open.length !== 2 || paused) return
    const match = isMatch(game)
    const t = window.setTimeout(
      () => {
        if (match) sfx.match()
        else sfx.miss()
        setGame((g) => resolve(g))
      },
      match ? 380 : 850,
    )
    return () => window.clearTimeout(t)
  }, [game, paused])

  // completion
  useEffect(() => {
    if (phase !== 'playing' || !isComplete(game)) return
    watch.pause()
    const ms = Math.round(watch.read())
    setFinalMs(ms)
    sfx.win()
    if (game.players === 1) {
      void finishRun({ board: difficulty, metrics: { timeMs: ms, moves: game.moves, pairs: PAIRS[difficulty] } }).then(setResult)
    }
    const t = window.setTimeout(() => setPhase('over'), 600)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, phase])

  function pause() {
    if (phase !== 'playing') return
    watch.pause()
    setPaused(true)
  }
  function resume() {
    setPaused(false)
    if (game.moves > 0 || game.open.length > 0) watch.start()
  }

  useVisibilityPause(pause, phase === 'playing' && !paused)

  const sound = (
    <OptionGroup label="Sound">
      <Segmented
        label="Sound"
        value={settings.sound ? 'on' : 'off'}
        onChange={(v) => {
          update({ sound: v === 'on' })
          setSoundEnabled(v === 'on')
        }}
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
      />
    </OptionGroup>
  )

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>All cards start face-down. Flip two at a time to find matching emoji.</li>
            <li>A match stays face-up. A miss flips back after a moment.</li>
            <li>Solo: finish as fast as you can - time first, then fewest moves.</li>
            <li>2 players: a match earns a pair and another turn. Most pairs wins; equal pairs is a draw. Who starts is random.</li>
          </ul>
        }
      >
        <OptionGroup label="Mode">
          <Segmented
            label="Mode"
            value={String(players)}
            onChange={(v) => setPlayers(v === '2' ? 2 : 1)}
            options={[
              { value: '1', label: 'Solo' },
              { value: '2', label: '2 Players' },
            ]}
          />
        </OptionGroup>
        <OptionGroup label="Difficulty">
          <Segmented<Difficulty>
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={[
              { value: 'easy', label: 'Easy · 7', hint: '7 pairs, 14 cards' },
              { value: 'medium', label: 'Medium · 11', hint: '11 pairs, 22 cards' },
              { value: 'hard', label: 'Hard · 15', hint: '15 pairs, 30 cards' },
            ]}
          />
        </OptionGroup>
        {sound}
      </StartScreen>
    )
  }

  const names = players === 2 ? ['Player 1', 'Player 2'] : [player?.nickname ?? 'You']

  if (phase === 'over') {
    const w = winner(game)
    const title = game.players === 1 ? 'Sab yaad tha! 🧠' : w === 'draw' ? "It's a draw!" : `${names[w]} wins!`
    return (
      <ResultsScreen
        title={title}
        emoji={game.players === 1 || w !== 'draw' ? '🏆' : '🤝'}
        subtitle={`${difficulty[0].toUpperCase() + difficulty.slice(1)} · ${PAIRS[difficulty]} pairs`}
        result={game.players === 1 ? result : null}
        onReplay={start}
        stats={
          <>
            {game.players === 2 ? (
              <>
                <HudStat label={`${names[0]} pairs`} value={game.pairs[0]} accent="#4cc9f0" />
                <HudStat label={`${names[1]} pairs`} value={game.pairs[1]} accent="#ff5d8f" />
              </>
            ) : (
              <HudStat label="Pairs" value={game.pairs[0]} />
            )}
            <HudStat label="Moves" value={game.moves} />
            <HudStat label="Time" value={formatMs(finalMs)} />
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col short:max-w-none short:flex-row short:items-center">
      <Hud>
        {players === 2 ? (
          <>
            {[0, 1].map((p) => (
              <div
                key={p}
                className={`rounded-2xl px-3 py-1.5 transition ${game.turn === p ? 'bg-ink-700 ring-2' : 'bg-ink-800 opacity-70'}`}
                style={{ ['--tw-ring-color' as string]: p === 0 ? '#4cc9f0' : '#ff5d8f' }}
                aria-current={game.turn === p}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{game.turn === p ? 'Your turn' : 'Waiting'}</div>
                <div className="font-display text-lg font-bold" style={{ color: p === 0 ? '#4cc9f0' : '#ff5d8f' }}>
                  {names[p]}: {game.pairs[p]}
                </div>
              </div>
            ))}
          </>
        ) : (
          <HudStat label="Pairs" value={`${game.pairs[0]}/${PAIRS[difficulty]}`} accent="#ff5d8f" />
        )}
        <HudStat label="Moves" value={game.moves} />
        <HudStat label="Time" value={formatDuration(watch.elapsed)} />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" className="!px-3" aria-label="Restart" onClick={() => setConfirmRestart(true)}>
            <RotateCcw className="size-5" />
          </Button>
          <Button variant="secondary" className="!px-3" aria-label="Pause" onClick={pause}>
            <Pause className="size-5" />
          </Button>
        </div>
      </Hud>

      <div ref={cardBox} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-3xl short:self-stretch">
        <div
          className={layout ? 'grid' : `grid w-full gap-2 sm:gap-3 ${GRID[difficulty]}`}
          style={layout ? { gap: CARD_GAP, gridTemplateColumns: `repeat(${layout.cols}, ${layout.cardW}px)` } : undefined}
          role="grid"
          aria-label="Memory cards"
        >
          {game.cards.map((card, i) => {
            const faceUp = card.matched || game.open.includes(i)
            const ownerColor = card.owner === 1 ? '#ff5d8f' : '#4cc9f0'
            return (
              <button
                key={card.id}
                type="button"
                role="gridcell"
                className="flip-card aspect-[3/4] w-full"
                onClick={() => onCard(i)}
                disabled={card.matched || paused}
                aria-label={faceUp ? `Card ${i + 1}: ${card.emoji}${card.matched ? ', matched' : ''}` : `Card ${i + 1}, face down`}
              >
                <span className={`flip-inner block ${faceUp ? 'is-flipped' : ''}`}>
                  <span className="flip-face flex items-center justify-center rounded-2xl border-2 border-white/10 bg-gradient-to-br from-gulabi to-baingan shadow-md">
                    <span className="text-2xl opacity-60 sm:text-3xl" aria-hidden>
                      ?
                    </span>
                  </span>
                  <span
                    className={`flip-face flip-back flex items-center justify-center rounded-2xl border-2 bg-ink-100 text-3xl sm:text-5xl ${
                      card.matched ? 'opacity-90' : ''
                    }`}
                    style={{ borderColor: card.matched ? (players === 2 ? ownerColor : '#3ee08f') : '#ffffff' }}
                    aria-hidden
                  >
                    {card.emoji}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        <PauseOverlay open={paused} onResume={resume} onHome={() => navigate('/games')}>
          <p className="mt-2 text-xs text-ink-400">Sound: {isSoundEnabled() ? 'on' : 'off'} (toggle in the header)</p>
        </PauseOverlay>
      </div>

      <ConfirmDialog
        open={confirmRestart}
        title="Restart this game?"
        message="The current game will be discarded and not saved."
        confirmLabel="Restart"
        onConfirm={() => {
          setConfirmRestart(false)
          start()
        }}
        onCancel={() => setConfirmRestart(false)}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        danger
        title="Leave this game?"
        message="The unfinished game will be discarded. Incomplete games are not saved."
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  )
}
