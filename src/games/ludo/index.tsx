import { Dices, RotateCcw, Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { OptionGroup, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { Button } from '../../components/ui/Button'
import { Segmented } from '../../components/ui/Controls'
import { ConfirmDialog } from '../../components/ui/Modal'
import { usePlayer } from '../../features/player/PlayerContext'
import { vibrate } from '../../features/settings/SettingsContext'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { createRng, randomSeed } from '../../lib/random'
import { sfx } from '../../lib/sound'
import type { Difficulty, StoredResult } from '../../types'
import { FitStage } from '../../components/game/FitStage'
import {
  applyMove, BASE, botChoose, cellOf, COLORS, HOME, HOME_COLUMN, LAST_TRACK, newMatch, registerRoll, SAFE_SQUARES, standings, START_INDEX, TRACK,
  type LudoState, type SeatType,
} from './logic'

type Phase = 'menu' | 'playing' | 'over'
interface Pending {
  roll: number
  state: LudoState
  legal: number[]
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
}

function Die({ value, rolling, color }: { value: number | null; rolling: boolean; color: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`size-16 ${rolling ? 'motion-safe:animate-spin' : ''}`} role="img" aria-label={value ? `Dice shows ${value}` : 'Dice'}>
      <rect x="6" y="6" width="88" height="88" rx="20" fill="#eef0f8" stroke={color} strokeWidth="6" />
      {(PIPS[value ?? 0] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="8.5" fill="#0b1020" />
      ))}
    </svg>
  )
}

function Board({ game, legal, onToken }: { game: LudoState; legal: number[] | null; onToken: (t: number) => void }) {
  const cells: React.ReactNode[] = []
  // yards
  const yards: [number, number][] = [
    [0, 0],
    [0, 9],
    [9, 9],
    [9, 0],
  ]
  yards.forEach(([r, c], p) => {
    cells.push(<rect key={`y${p}`} x={c} y={r} width={6} height={6} fill={COLORS[p].fill} />)
    cells.push(<rect key={`yi${p}`} x={c + 0.7} y={r + 0.7} width={4.6} height={4.6} rx={0.6} fill="#f6f7fb" />)
  })
  TRACK.forEach(([r, c], i) => {
    const startOf = START_INDEX.indexOf(i as 0)
    cells.push(
      <rect key={`t${i}`} x={c + 0.03} y={r + 0.03} width={0.94} height={0.94} rx={0.08} fill={startOf >= 0 ? COLORS[startOf].fill : '#f6f7fb'} stroke="#c9cfe2" strokeWidth={0.03} />,
    )
    if (SAFE_SQUARES.has(i) && startOf < 0) {
      cells.push(
        <text key={`s${i}`} x={c + 0.5} y={r + 0.72} textAnchor="middle" fontSize={0.62} fill="#9aa3c0" aria-hidden>
          ★
        </text>,
      )
    }
  })
  HOME_COLUMN.forEach((col, p) =>
    col.forEach(([r, c], i) => cells.push(<rect key={`h${p}${i}`} x={c + 0.03} y={r + 0.03} width={0.94} height={0.94} rx={0.08} fill={COLORS[p].fill} opacity={0.85} />)),
  )
  // centre triangles
  const tri = [
    '6,6 7.5,7.5 6,9',
    '6,6 9,6 7.5,7.5',
    '9,6 9,9 7.5,7.5',
    '6,9 7.5,7.5 9,9',
  ]
  tri.forEach((pts, p) => cells.push(<polygon key={`c${p}`} points={pts} fill={COLORS[p].fill} />))

  // tokens, offset when several share a cell
  const placed = new Map<string, number>()
  const tokenEls: React.ReactNode[] = []
  game.tokens.forEach((list, p) =>
    list.forEach((pos, t) => {
      const [r, c] = cellOf(p, t, pos)
      const key = `${r},${c}`
      const k = placed.get(key) ?? 0
      placed.set(key, k + 1)
      const off = pos === BASE ? [0, 0] : [[0, 0], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]][k % 4]
      const cx = (pos === BASE ? c : c + 0.5) + off[0]
      const cy = (pos === BASE ? r : r + 0.5) + off[1]
      const active = p === game.current && legal?.includes(t)
      tokenEls.push(
        <g
          key={`tk${p}${t}`}
          style={{ transform: `translate(${cx}px, ${cy}px)`, transition: 'transform 0.35s ease' }}
          role={active ? 'button' : undefined}
          tabIndex={active ? 0 : -1}
          aria-label={active ? `Move ${COLORS[p].name} token ${t + 1}` : undefined}
          onClick={() => active && onToken(t)}
          onKeyDown={(e) => active && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToken(t))}
          // always outline-none: a browser focus ring inside this tiny viewBox scales up into a giant black blob
          className={active ? 'cursor-pointer outline-none' : 'outline-none'}
        >
          {active && <circle r={0.5} fill="none" stroke="#0b1020" strokeWidth={0.08} className="motion-safe:animate-pulse" />}
          <circle r={0.36} fill={COLORS[p].dark} />
          <circle r={0.3} fill={COLORS[p].fill} stroke="#fff" strokeWidth={0.07} />
          {pos === HOME && <circle r={0.1} fill="#fff" />}
        </g>,
      )
    }),
  )

  return (
    <svg viewBox="0 0 15 15" className="game-surface block w-full rounded-2xl bg-[#e3e6f0]" role="img" aria-label="Ludo board">
      {cells}
      {tokenEls}
    </svg>
  )
}

export default function Ludo() {
  const { player } = usePlayer()
  const { beginRun, finishRun } = useResultRecorder()
  const rng = useRef(createRng(randomSeed()))
  const [phase, setPhase] = useState<Phase>('menu')
  const [humans, setHumans] = useState(1)
  const [botLevel, setBotLevel] = useState<Difficulty>('medium')
  const [game, setGame] = useState<LudoState>(() => newMatch(['human', 'bot', 'bot', 'bot']))
  const [pending, setPending] = useState<Pending | null>(null)
  const [lastRoll, setLastRoll] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [result, setResult] = useState<StoredResult | null>(null)
  const blocker = useLeaveGuard(phase === 'playing')

  const seats: SeatType[] = [0, 1, 2, 3].map((i) => (i < humans ? 'human' : 'bot'))
  const names = game.seats.map((t, i) =>
    t === 'bot' ? `${COLORS[i].name} Bot` : humans === 1 ? (player?.nickname ?? 'You') : `${COLORS[i].name} (P${i + 1})`,
  )
  const isBotTurn = phase === 'playing' && game.seats[game.current] === 'bot' && !game.over

  function start() {
    const g = newMatch(seats)
    setGame(g)
    setPending(null)
    setLastRoll(null)
    setRolling(false)
    setBusy(false)
    setResult(null)
    setMessage(`${humans === 1 ? 'Your' : `${COLORS[0].name}'s`} turn - roll the dice!`)
    setPhase('playing')
    if (humans === 1) beginRun(botLevel)
  }

  function finishMatch(final: LudoState) {
    const table = standings(final)
    const mine = table.find((s) => s.player === 0)!
    if (final.seats.filter((t) => t === 'human').length === 1) {
      if (mine.position === 1) sfx.win()
      else sfx.lose()
      void finishRun({ board: botLevel, metrics: { position: mine.position, points: mine.points } }).then(setResult)
    } else sfx.win()
    window.setTimeout(() => setPhase('over'), 900)
  }

  function commitMove(p: Pending, token: number) {
    const res = applyMove(p.state, token, p.roll)
    const mover = p.state.current
    setPending(null)
    setGame(res.state)
    if (res.captured.length) {
      sfx.crash()
      vibrate(80)
    } else if (res.reachedHome) sfx.match()
    else sfx.click()
    const parts: string[] = []
    if (res.captured.length) parts.push(`${names[mover]} captured ${res.captured.map((c) => COLORS[c.player].name).join(', ')}!`)
    if (res.reachedHome) parts.push('A token reached home.')
    if (res.playerFinished) parts.push(`${names[mover]} finished!`)
    if (res.state.over) {
      parts.push('Match over.')
      setMessage(parts.join(' '))
      finishMatch(res.state)
      return
    }
    if (res.extraTurn) parts.push(p.roll === 6 ? 'Rolled a six - roll again.' : 'Capture bonus - roll again.')
    else parts.push(`${names[res.state.current]}'s turn.`)
    setMessage(parts.join(' '))
  }

  function roll() {
    if (busy || pending || rolling || game.over) return
    setRolling(true)
    setBusy(true)
    sfx.dice()
    window.setTimeout(() => {
      const value = 1 + Math.floor(rng.current() * 6)
      setRolling(false)
      setLastRoll(value)
      const res = registerRoll(game, value)
      const who = names[game.current]
      if (res.outcome.kind === 'choose') {
        const p = { roll: value, state: res.state, legal: res.outcome.legal }
        setPending(p)
        setBusy(false)
        const isBot = game.seats[game.current] === 'bot'
        setMessage(isBot ? `${who} rolled ${value}.` : res.outcome.legal.length === 1 ? `Rolled ${value} - moving your only option.` : `Rolled ${value}. Pick a token to move.`)
        if (res.outcome.legal.length === 1 && !isBot) window.setTimeout(() => commitMove(p, p.legal[0]), 550)
      } else {
        setMessage(res.outcome.kind === 'three-sixes' ? `${who} rolled three sixes - turn cancelled!` : `${who} rolled ${value}: No Valid Moves.`)
        sfx.miss()
        window.setTimeout(() => {
          setGame(res.state)
          setBusy(false)
          setMessage(`${names[res.state.current]}'s turn.`)
        }, 1100)
      }
    }, 450)
  }

  // bots roll and move on their own
  useEffect(() => {
    if (!isBotTurn) return
    if (!pending && !busy && !rolling) {
      const t = window.setTimeout(roll, 650)
      return () => window.clearTimeout(t)
    }
    if (pending) {
      const t = window.setTimeout(() => commitMove(pending, botChoose(pending.state, pending.roll, pending.legal, botLevel, rng.current)), 600)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBotTurn, pending, busy, rolling, game])

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>Four seats, always. Friends share this device; empty seats are bots.</li>
            <li>Roll a 6 to bring a token out. A 6 gives another roll - but three sixes in a row cancels the turn.</li>
            <li>Move one token by the full roll. Land on an opponent (not on a ★ or start square) to send it home and earn an extra turn.</li>
            <li>Enter the home column and reach the centre with an exact roll. No overshooting.</li>
            <li>1st place = 10 points, 2nd = 5. Only solo matches (you + 3 bots) go to the leaderboard.</li>
          </ul>
        }
      >
        <OptionGroup label="Human players on this device">
          <Segmented
            label="Human players"
            value={String(humans)}
            onChange={(v) => setHumans(Number(v))}
            options={[
              { value: '1', label: '1 + 3 bots' },
              { value: '2', label: '2 + 2' },
              { value: '3', label: '3 + 1' },
              { value: '4', label: '4' },
            ]}
          />
        </OptionGroup>
        {humans < 4 && (
          <OptionGroup label="Bot difficulty">
            <Segmented<Difficulty>
              label="Bot difficulty"
              value={botLevel}
              onChange={setBotLevel}
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
            />
          </OptionGroup>
        )}
      </StartScreen>
    )
  }

  if (phase === 'over') {
    const table = standings(game)
    const solo = game.seats.filter((t) => t === 'human').length === 1
    const top = table[0]
    return (
      <ResultsScreen
        title={solo ? (top.player === 0 ? 'Aap jeet gaye! 🎉' : `You finished #${table.find((s) => s.player === 0)!.position}`) : `${names[top.player]} wins!`}
        emoji={solo && top.player !== 0 ? '🎲' : '🏆'}
        subtitle={solo ? `vs ${botLevel} bots` : 'Local match'}
        result={solo ? result : null}
        onReplay={start}
      >
        <ol className="mt-4 space-y-2 text-left">
          {table.map((s) => (
            <li key={s.player} className="flex items-center gap-3 rounded-2xl bg-ink-900/60 px-4 py-2.5">
              <span className="w-6 font-display text-xl font-bold">{s.position}</span>
              <span className="size-4 shrink-0 rounded-full" style={{ background: COLORS[s.player].fill }} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-semibold">{names[s.player]}</span>
              <span className="text-sm text-ink-400">{s.finished ? 'finished' : `${s.tokensHome}/4 home`}</span>
              <span className="w-14 text-right font-display text-lg font-bold text-masala">{s.points} pts</span>
            </li>
          ))}
        </ol>
      </ResultsScreen>
    )
  }

  const color = COLORS[game.current]
  const humanTurn = game.seats[game.current] === 'human' && !game.over

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-4 short:flex-row"> 
      <FitStage aspect={1} maxHeight="80dvh" className="lg:h-full">
        <Board game={game} legal={humanTurn ? (pending?.legal ?? null) : null} onToken={(t) => pending && humanTurn && commitMove(pending, t)} />
      </FitStage>
      <div className="flex shrink-0 flex-col gap-2 lg:w-[280px] lg:gap-3 short:max-h-full short:w-[260px] short:overflow-y-auto">
        <div className="rounded-3xl border-2 bg-ink-800 p-3 lg:p-4" style={{ borderColor: color.fill }}>
          <div className="flex items-center gap-3">
            <Die value={lastRoll} rolling={rolling} color={color.fill} />
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Turn</div>
              <div className="truncate font-display text-xl font-bold" style={{ color: color.fill }}>
                {names[game.current]}
              </div>
              {game.sixes > 0 && <div className="text-xs text-masala">Sixes in a row: {game.sixes}</div>}
            </div>
          </div>
          <p className="mt-2 min-h-10 text-sm text-ink-200 lg:mt-3 short:mt-1 short:min-h-0" aria-live="polite">
            {message}
          </p>
          <Button className="mt-2 w-full" size="lg" onClick={roll} disabled={!humanTurn || busy || !!pending || rolling} icon={<Dices className="size-5" />}>
            {pending && humanTurn ? 'Choose a token' : 'Roll dice'}
          </Button>
        </div>
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {game.seats.map((_, p) => (
            <li key={p} className={`flex items-center gap-2 rounded-2xl px-3 py-2 short:py-1 ${p === game.current ? 'bg-ink-700' : 'bg-ink-800'}`}>
              <span className="size-3 shrink-0 rounded-full" style={{ background: COLORS[p].fill }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{names[p]}</span>
              <span className="font-semibold tabular-nums">{game.tokens[p].filter((x) => x === HOME).length}/4</span>
            </li>
          ))}
        </ul>
        <p className="hidden items-center gap-1.5 text-xs text-ink-400 lg:flex">
          <Star className="size-3.5" /> ★ and coloured start squares are safe. Tokens on the track: {game.tokens.flat().filter((x) => x >= 0 && x <= LAST_TRACK).length}
        </p>
        <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setConfirmRestart(true)}>
          Restart match
        </Button>
      </div>
      <ConfirmDialog
        open={confirmRestart}
        title="Restart the match?"
        message="The current match will be discarded."
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
        title="Leave the match?"
        message="The unfinished match will be discarded."
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  )
}
