import { Crown, RefreshCw, Trophy } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Button, LinkButton } from '../../components/ui/Button'
import { Badge, EmptyState, Segmented, Spinner } from '../../components/ui/Controls'
import { GAMES, getGame } from '../../games/registry'
import { useResults } from '../../hooks/useResults'
import { formatMs, localSummary } from '../../lib/scoring'
import { backendConfigured, friendlyError, rpc } from '../../lib/supabase'
import type { GameMeta, LeaderboardConfig, LeaderboardEntry, MetricColumn } from '../../types'
import { NotFoundPage } from '../home/NotFoundPage'
import { usePlayer } from '../player/PlayerContext'

interface Row {
  rank: number
  player_id: string
  nickname: string
  rank1: number
  rank2: number
  metrics: Record<string, number>
  achieved_at: string
  results: number
}

const toEntry = (r: Row): LeaderboardEntry => ({
  rank: Number(r.rank),
  playerId: r.player_id,
  nickname: r.nickname,
  rank1: r.rank1,
  rank2: r.rank2,
  metrics: r.metrics ?? {},
  achievedAt: r.achieved_at,
  results: Number(r.results),
})

function formatValue(col: MetricColumn & { source: string }, entry: LeaderboardEntry): string {
  const raw = col.source === 'metric' ? entry.metrics[col.key] : col.source === 'rank1' ? entry.rank1 : entry.rank2
  if (raw == null || Number.isNaN(raw)) return '-'
  switch (col.format) {
    case 'time':
      return formatMs(raw)
    case 'decimal':
      return raw.toFixed(1)
    case 'percent':
      return `${raw.toFixed(1)}%`
    default:
      return Math.round(raw).toLocaleString()
  }
}

export function LeaderboardIndexPage() {
  const boards = GAMES.filter((g) => g.leaderboard)
  const without = GAMES.filter((g) => !g.leaderboard)
  return (
    <div>
      <h1 className="text-4xl font-extrabold">Leaderboards</h1>
      <p className="mt-1 text-ink-300">Har game ka apna leaderboard. No combined ranking - Ludo points and Sudoku times don't mix.</p>
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((g) => (
          <li key={g.id}>
            <Link to={`/leaderboards/${g.id}`} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-ink-800 p-4 transition hover:border-white/15 hover:bg-ink-700">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                style={{ background: `linear-gradient(135deg, ${g.colors.from}, ${g.colors.to})` }}
                aria-hidden
              >
                {g.emoji}
              </span>
              <span className="min-w-0">
                <span className="block font-bold">{g.name}</span>
                <span className="block truncate text-sm text-ink-400">{g.leaderboard!.rule}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {without.length > 0 && (
        <p className="mt-6 text-sm text-ink-400">
          No leaderboard: {without.map((g) => g.name).join(', ')} - admin mode can open and complete any level, so a ranking would not be fair.
        </p>
      )}
    </div>
  )
}

export function GameLeaderboardPage() {
  const { gameId } = useParams()
  const game = getGame(gameId)
  if (!game || !game.leaderboard) return <NotFoundPage what="leaderboard" />
  return <GameLeaderboard game={game} config={game.leaderboard} />
}

function GameLeaderboard({ game, config }: { game: GameMeta; config: LeaderboardConfig }) {
  const [params, setParams] = useSearchParams()
  const board = config.boards.some((b) => b.id === params.get('board')) ? params.get('board')! : config.boards[0].id
  const { player, online } = usePlayer()
  const registered = Boolean(player?.registered)
  const results = useResults()
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null)
  const [me, setMe] = useState<LeaderboardEntry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!backendConfigured) return
    setLoading(true)
    setError(null)
    try {
      const data = await rpc<Row[]>('get_leaderboard', { p_game: game.id, p_board: board, p_limit: 50 })
      setRows(data.map(toEntry))
      if (registered) {
        const mine = await rpc<Row[]>('get_my_leaderboard_position', { p_game: game.id, p_board: board }).catch(() => [])
        setMe(mine[0] ? toEntry(mine[0]) : null)
      } else setMe(null)
    } catch (err) {
      setError(friendlyError(err))
      setRows(null)
    } finally {
      setLoading(false)
    }
  }, [game.id, board, registered])

  useEffect(() => {
    document.title = `${game.name} leaderboard · bore-hora-hai-yaar`
    void load()
  }, [load, game.name])

  const pendingHere = results.filter((r) => r.gameId === game.id && r.board === board && r.status === 'pending' && r.playerKey === player?.id).length
  const device =
    config.aggregation === 'progress' ? null : localSummary(results.filter((r) => r.playerKey === player?.id), game.id, board)

  return (
    <div>
      <Link to="/leaderboards" className="text-sm font-semibold text-neela hover:underline">
        ← All leaderboards
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">
          <span aria-hidden>{game.emoji}</span> {game.name}
        </h1>
        <LinkButton to={`/games/${game.id}`} size="sm">
          Play
        </LinkButton>
      </div>
      <p className="mt-1 text-ink-300">{config.rule}</p>

      {config.boards.length > 1 && (
        <div className="mt-4 max-w-md">
          <Segmented
            label="Leaderboard"
            value={board}
            options={config.boards.map((b) => ({ value: b.id, label: b.label }))}
            onChange={(v) => setParams({ board: v }, { replace: true })}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {pendingHere > 0 && <Badge tone="warn">{pendingHere} of your results not synced yet</Badge>}
        {!online && <Badge tone="warn">Offline - showing what's on this device</Badge>}
        {backendConfigured && (
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} icon={<RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />}>
            Refresh
          </Button>
        )}
      </div>

      {!backendConfigured ? (
        <div className="mt-4 space-y-4">
          <EmptyState icon="🔌" title="Online leaderboard not configured">
            This copy of the site runs without a backend, so there is no shared ranking. Your own best on this device is shown below.
          </EmptyState>
          {device && <DeviceBest config={config} entry={device} nickname={player?.nickname ?? 'You'} />}
        </div>
      ) : loading && !rows ? (
        <div className="py-12 text-center">
          <Spinner label="Loading leaderboard" />
        </div>
      ) : error ? (
        <div className="mt-4 space-y-4">
          <EmptyState icon="📡" title="Couldn't load the leaderboard">
            {error}
          </EmptyState>
          {device && <DeviceBest config={config} entry={device} nickname={player?.nickname ?? 'You'} />}
        </div>
      ) : rows && rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon="🏁" title="Abhi tak koi nahi">
            No results on this leaderboard yet. Be the first!
          </EmptyState>
        </div>
      ) : rows ? (
        <LeaderboardTable config={config} rows={rows} me={me} myId={player?.id} />
      ) : null}
    </div>
  )
}

function DeviceBest({ config, entry, nickname }: { config: LeaderboardConfig; entry: LeaderboardEntry; nickname: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-ink-800 p-4">
      <p className="text-sm font-semibold text-ink-400">Your best on this device ({nickname})</p>
      <div className="mt-2 flex flex-wrap gap-6">
        <div>
          <div className="text-xs uppercase text-ink-400">{config.primary.label}</div>
          <div className="font-display text-2xl font-bold">{formatValue(config.primary, entry)}</div>
        </div>
        {config.secondary && (
          <div>
            <div className="text-xs uppercase text-ink-400">{config.secondary.label}</div>
            <div className="font-display text-2xl font-bold">{formatValue(config.secondary, entry)}</div>
          </div>
        )}
        <div>
          <div className="text-xs uppercase text-ink-400">Results</div>
          <div className="font-display text-2xl font-bold">{entry.results}</div>
        </div>
      </div>
    </div>
  )
}

function LeaderboardTable({ config, rows, me, myId }: { config: LeaderboardConfig; rows: LeaderboardEntry[]; me: LeaderboardEntry | null; myId?: string }) {
  const meInTop = me && rows.some((r) => r.playerId === me.playerId)
  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)
  const renderRow = (r: LeaderboardEntry, highlight: boolean) => (
    <tr key={r.playerId} className={highlight ? 'bg-masala/10' : 'odd:bg-white/[0.02]'}>
      <td className="px-3 py-3 text-center font-display text-lg font-bold tabular-nums">{medal(r.rank) ?? r.rank}</td>
      <td className="max-w-[9rem] px-3 py-3 sm:max-w-none">
        <span className="flex items-center gap-1.5 truncate font-semibold">
          {r.rank === 1 && <Crown className="size-4 shrink-0 text-masala" aria-label="Top player" />}
          <span className="truncate">{r.nickname}</span>
          {highlight && <Badge tone="warn">You</Badge>}
        </span>
      </td>
      <td className="px-3 py-3 text-right font-display text-lg font-bold tabular-nums">{formatValue(config.primary, r)}</td>
      {config.secondary && <td className="px-3 py-3 text-right tabular-nums text-ink-200">{formatValue(config.secondary, r)}</td>}
      <td className="hidden px-3 py-3 text-right text-sm text-ink-400 sm:table-cell">{new Date(r.achievedAt).toLocaleDateString()}</td>
    </tr>
  )
  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-ink-800">
      <table className="w-full table-fixed text-left text-sm sm:table-auto">
        <caption className="sr-only">Leaderboard</caption>
        <thead className="bg-ink-850 text-xs uppercase tracking-wider text-ink-400">
          <tr>
            <th scope="col" className="w-14 px-3 py-3 text-center">
              <Trophy className="mx-auto size-4" aria-label="Rank" />
            </th>
            <th scope="col" className="px-3 py-3">
              Player
            </th>
            <th scope="col" className="px-3 py-3 text-right">
              {config.primary.label}
            </th>
            {config.secondary && (
              <th scope="col" className="px-3 py-3 text-right">
                {config.secondary.label}
              </th>
            )}
            <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">
              {config.aggregation === 'sum' ? 'Last played' : 'Date'}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => renderRow(r, r.playerId === myId))}
          {me && !meInTop && (
            <>
              <tr aria-hidden>
                <td colSpan={5} className="py-1 text-center text-ink-500">
                  ⋯
                </td>
              </tr>
              {renderRow(me, true)}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}
