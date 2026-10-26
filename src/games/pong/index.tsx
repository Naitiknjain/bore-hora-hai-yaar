import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CanvasStage, type CanvasHandle } from '../../components/game/CanvasStage'
import { OptionGroup, PauseButton, PauseOverlay, ResultsScreen, StartScreen, useResultRecorder } from '../../components/game/GameShell'
import { Hud, HudStat } from '../../components/game/TouchControls'
import { Segmented } from '../../components/ui/Controls'
import { usePlayer } from '../../features/player/PlayerContext'
import { useGameLoop, useKeyDown, useKeyUp, useVisibilityPause } from '../../hooks/useGameLoop'
import { createRng, randomSeed } from '../../lib/random'
import { sfx } from '../../lib/sound'
import type { Difficulty, StoredResult } from '../../types'
import { AI, aiTarget, BALL, H, initialState, movePaddle, PADDLE_H, PADDLE_SPEED, PADDLE_W, PADDLE_X, serve, stepBall, W, type PongState } from './logic'

type Phase = 'menu' | 'playing' | 'over'
type Mode = 'cpu' | 'local'

export default function Pong() {
  const navigate = useNavigate()
  const { player } = usePlayer()
  const { beginRun, finishRun } = useResultRecorder()
  const rng = useRef(createRng(randomSeed()))
  const game = useRef<PongState>(initialState(rng.current))
  const keys = useRef(new Set<string>())
  const pointers = useRef(new Map<number, { side: 0 | 1; y: number }>())
  const jitter = useRef(0)
  const ended = useRef(false)
  // the first serve waits for the player: tap/click the table or press a key
  const ready = useRef(false)
  const stage = useRef<CanvasHandle>(null)
  const [phase, setPhase] = useState<Phase>('menu')
  const [mode, setMode] = useState<Mode>('cpu')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [target, setTarget] = useState(7)
  const [paused, setPaused] = useState(false)
  const [score, setScore] = useState<[number, number]>([0, 0])
  const [result, setResult] = useState<StoredResult | null>(null)

  function start() {
    game.current = initialState(rng.current)
    keys.current.clear()
    pointers.current.clear()
    ended.current = false
    ready.current = false
    setScore([0, 0])
    setResult(null)
    setPaused(false)
    setPhase('playing')
    if (mode === 'cpu') beginRun(difficulty)
  }

  useGameLoop((dt) => {
    if (ended.current) return
    let s = game.current
    // human paddles
    const leftDir = (keys.current.has('s') || (mode === 'cpu' && keys.current.has('arrowdown')) ? 1 : 0) - (keys.current.has('w') || (mode === 'cpu' && keys.current.has('arrowup')) ? 1 : 0)
    let left = s.left + leftDir * PADDLE_SPEED * dt
    let right = s.right
    for (const p of pointers.current.values()) {
      if (p.side === 0) left = movePaddle(s.left, p.y, PADDLE_SPEED * 1.6, dt)
      else if (mode === 'local') right = movePaddle(s.right, p.y, PADDLE_SPEED * 1.6, dt)
    }
    if (mode === 'local') {
      const rightDir = (keys.current.has('arrowdown') ? 1 : 0) - (keys.current.has('arrowup') ? 1 : 0)
      if (rightDir) right = s.right + rightDir * PADDLE_SPEED * dt
    } else {
      if (Math.random() < dt * 1.5) jitter.current = Math.random() * 2 - 1
      right = movePaddle(s.right, aiTarget(s, difficulty, jitter.current), AI[difficulty].speed, dt)
    }
    s = { ...s, left: Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, left)), right: Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, right)) }
    const res = ready.current ? stepBall(s, dt) : { state: s, scored: null, hit: false, wall: false }
    s = res.state
    if (res.hit) sfx.hit()
    else if (res.wall) sfx.click()
    if (res.scored !== null) {
      sfx.point()
      setScore(s.score)
      if (s.score[0] >= target || s.score[1] >= target) {
        ended.current = true
        game.current = s
        draw()
        const [p, c] = s.score
        if (mode === 'cpu') {
          if (p > c) sfx.win()
          else sfx.lose()
          void finishRun({ board: difficulty, metrics: { playerScore: p, cpuScore: c, target } }).then(setResult)
        } else sfx.win()
        setPhase('over')
        return
      }
      s = serve(s, res.scored === 0 ? 1 : 0, rng.current)
    }
    game.current = s
    draw()
  }, phase === 'playing' && !paused)

  function draw() {
    const ctx = stage.current?.ctx()
    if (!ctx) return
    const s = game.current
    ctx.fillStyle = '#0b1020'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    for (let y = 8; y < H; y += 24) ctx.fillRect(W / 2 - 2, y, 4, 12)
    ctx.font = '700 56px "Baloo 2", system-ui'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fillText(String(s.score[0]), W / 4, 70)
    ctx.fillText(String(s.score[1]), (3 * W) / 4, 70)
    ctx.fillStyle = '#4cc9f0'
    ctx.beginPath()
    ctx.roundRect(PADDLE_X - PADDLE_W / 2, s.left - PADDLE_H / 2, PADDLE_W, PADDLE_H, 6)
    ctx.fill()
    ctx.fillStyle = mode === 'cpu' ? '#ff4d5e' : '#ff5d8f'
    ctx.beginPath()
    ctx.roundRect(W - PADDLE_X - PADDLE_W / 2, s.right - PADDLE_H / 2, PADDLE_W, PADDLE_H, 6)
    ctx.fill()
    ctx.fillStyle = s.serveTimer > 0 ? 'rgba(255,210,63,0.6)' : '#ffd23f'
    ctx.beginPath()
    ctx.arc(s.ball.x, s.ball.y, BALL / 2 + 1, 0, Math.PI * 2)
    ctx.fill()
    if (!ready.current) {
      ctx.font = '700 26px "Baloo 2", system-ui'
      ctx.fillStyle = '#ffd23f'
      ctx.fillText('Tap the table or press any key to serve', W / 2, H / 2 + 56)
    }
  }

  useEffect(() => {
    if (phase === 'playing') draw()
  })

  useKeyDown((e) => {
    if (phase !== 'playing') return false
    if (!ready.current && !paused && e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') ready.current = true
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      setPaused((p) => !p)
      return true
    }
    const k = e.key.toLowerCase()
    if (['w', 's', 'arrowup', 'arrowdown'].includes(k)) {
      keys.current.add(k)
      return true
    }
    return false
  }, phase === 'playing')
  useKeyUp((e) => {
    keys.current.delete(e.key.toLowerCase())
  }, phase === 'playing')
  useVisibilityPause(() => {
    keys.current.clear()
    setPaused(true)
  }, phase === 'playing')

  const pointerSide = (x: number): 0 | 1 => (mode === 'cpu' ? 0 : x < W / 2 ? 0 : 1)
  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.type === 'pointermove' && !pointers.current.has(e.pointerId)) return
    if (e.type === 'pointerdown') ready.current = true
    const p = stage.current!.toLogical(e.clientX, e.clientY)
    if (e.type === 'pointerdown') (e.target as HTMLElement).setPointerCapture(e.pointerId)
    const existing = pointers.current.get(e.pointerId)
    pointers.current.set(e.pointerId, { side: existing?.side ?? pointerSide(p.x), y: p.y })
  }

  if (phase === 'menu') {
    return (
      <StartScreen
        onStart={start}
        instructions={
          <ul className="list-disc space-y-1 pl-5">
            <li>Solo: move your (left, blue) paddle with W/S or ↑/↓, or drag on the screen.</li>
            <li>2 players: left uses W/S or drags the left half; right uses ↑/↓ or drags the right half.</li>
            <li>Where the ball hits the paddle changes its angle. Rallies get faster.</li>
            <li>First to the target score wins. Only solo matches count for the leaderboard.</li>
          </ul>
        }
      >
        <OptionGroup label="Mode">
          <Segmented<Mode>
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'cpu', label: 'vs Computer' },
              { value: 'local', label: '2 Players' },
            ]}
          />
        </OptionGroup>
        {mode === 'cpu' && (
          <OptionGroup label="Computer difficulty">
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
        )}
        <OptionGroup label="Points to win">
          <Segmented
            label="Points to win"
            value={String(target)}
            onChange={(v) => setTarget(Number(v))}
            options={[5, 7, 11].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </OptionGroup>
      </StartScreen>
    )
  }

  const names = mode === 'cpu' ? [player?.nickname ?? 'You', 'Computer'] : ['Left player', 'Right player']

  if (phase === 'over') {
    const leftWon = score[0] > score[1]
    return (
      <ResultsScreen
        title={mode === 'cpu' ? (leftWon ? 'Computer ko hara diya!' : 'Computer jeet gaya') : `${leftWon ? names[0] : names[1]} wins!`}
        emoji={mode === 'cpu' && !leftWon ? '🤖' : '🏓'}
        subtitle={mode === 'cpu' ? `${difficulty} · first to ${target}` : `Local match · first to ${target}`}
        result={mode === 'cpu' ? result : null}
        onReplay={start}
        stats={
          <>
            <HudStat label={names[0]} value={score[0]} accent="#4cc9f0" />
            <HudStat label={names[1]} value={score[1]} accent="#ff5d8f" />
            <HudStat label="Target" value={target} />
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col short:max-w-none short:flex-row short:items-center">
      <Hud>
        <HudStat label={names[0]} value={score[0]} accent="#4cc9f0" />
        <HudStat label={names[1]} value={score[1]} accent="#ff5d8f" />
        <HudStat label="First to" value={target} />
        <div className="ml-auto">
          <PauseButton onClick={() => setPaused(true)} />
        </div>
      </Hud>
      <CanvasStage
        ref={stage}
        width={W}
        height={H}
        label={`Pong. ${names[0]} ${score[0]}, ${names[1]} ${score[1]}`}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={(e) => pointers.current.delete(e.pointerId)}
      >
        <PauseOverlay open={paused} onResume={() => setPaused(false)} onRestart={start} onHome={() => navigate('/games')} />
      </CanvasStage>
      <p className="mt-2 shrink-0 text-center text-sm text-ink-400 landscape:hidden">Rotate your phone sideways (or tap fullscreen) for a bigger table.</p>
    </div>
  )
}
