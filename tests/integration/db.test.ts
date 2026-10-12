// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './db-harness'

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
}, 60000)

const uuid = () => crypto.randomUUID()

describe('player identity', () => {
  it('registers a guest player and returns a private code once', async () => {
    const uid = await t.newUser()
    const res = await t.rpc(uid, 'register_player', ['Chintu'])
    expect(res.nickname).toBe('Chintu')
    expect(res.player_code).toMatch(/^BHHY-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    const me = await t.rpc(uid, 'me')
    expect(me.player_id).toBe(res.player_id)
    expect(me.player_code).toBeUndefined()
  })

  it('never stores or exposes the raw code', async () => {
    const uid = await t.newUser()
    const res = await t.rpc(uid, 'register_player', ['Pinky'])
    const raw = await t.db.query<{ code_hmac: string }>(
      'select code_hmac from public.player_code_credentials where player_id = $1',
      [res.player_id],
    )
    expect(raw.rows[0].code_hmac).not.toContain(res.player_code.slice(5, 9))
    await expect(t.as(uid, 'select * from public.player_code_credentials')).rejects.toThrow(/permission denied/)
    await expect(t.as(null, 'select * from public.player_code_credentials')).rejects.toThrow(/permission denied/)
  })

  it('rejects invalid nicknames and allows duplicates', async () => {
    const a = await t.newUser()
    await expect(t.rpc(a, 'register_player', ['x'])).rejects.toThrow(/invalid_nickname/)
    await expect(t.rpc(a, 'register_player', ['<script>'])).rejects.toThrow(/invalid_nickname/)
    const b = await t.newUser()
    const r1 = await t.rpc(a, 'register_player', ['Same Name'])
    const r2 = await t.rpc(b, 'register_player', ['Same Name'])
    expect(r1.player_id).not.toBe(r2.player_id)
  })

  it('recovers the identity on another device with the code (forgiving format)', async () => {
    const phone = await t.newUser()
    const reg = await t.rpc(phone, 'register_player', ['Bablu'])
    const laptop = await t.newUser()
    const sloppy = reg.player_code.toLowerCase().replace(/-/g, ' ')
    const rec = await t.rpc(laptop, 'recover_player', [sloppy])
    expect(rec.player_id).toBe(reg.player_id)
    expect((await t.rpc(laptop, 'me')).player_id).toBe(reg.player_id)
  })

  it('rate-limits wrong recovery codes and counts failed attempts', async () => {
    const uid = await t.newUser()
    for (let i = 0; i < 5; i += 1) {
      const r = await t.rpc(uid, 'recover_player', ['BHHY-0000-0000-0000-0000'])
      expect(r.error).toBe('invalid_code')
    }
    await expect(t.rpc(uid, 'recover_player', ['BHHY-0000-0000-0000-0000'])).rejects.toThrow(/rate_limited/)
  })

  it('rotating the code invalidates the old one', async () => {
    const uid = await t.newUser()
    const reg = await t.rpc(uid, 'register_player', ['Golu'])
    const rot = await t.rpc(uid, 'rotate_player_code')
    expect(rot.player_code).not.toBe(reg.player_code)
    const other = await t.newUser()
    expect((await t.rpc(other, 'recover_player', [reg.player_code])).error).toBe('invalid_code')
    expect((await t.rpc(other, 'recover_player', [rot.player_code])).player_id).toBe(reg.player_id)
  })

  it('renames only the caller and blocks direct table writes', async () => {
    const uid = await t.newUser()
    const reg = await t.rpc(uid, 'register_player', ['Old Name'])
    const renamed = await t.rpc(uid, 'rename_player', ['New Name'])
    expect(renamed.nickname).toBe('New Name')
    await expect(t.as(uid, `update public.players set nickname = 'hax' where id = $1`, [reg.player_id])).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      t.as(uid, `insert into public.game_scores (submission_id, player_id, game_id, board, rank1, metrics, played_at)
                 values ($1, $2, 'tetris', 'classic', 999999, '{}', now())`, [uuid(), reg.player_id]),
    ).rejects.toThrow(/permission denied/)
  })

  it('cannot call private functions or set the admin PIN from the API', async () => {
    const uid = await t.newUser()
    await expect(t.as(uid, `select private.set_loop_sort_admin_pin('0000')`)).rejects.toThrow(/permission denied/)
    await expect(t.as(null, `select private.setting('player_code_pepper')`)).rejects.toThrow(/permission denied/)
  })
})

describe('scores and leaderboards', () => {
  it('validates, de-duplicates and ranks memory match (time asc, moves asc)', async () => {
    const a = await t.newUser()
    const b = await t.newUser()
    const c = await t.newUser()
    await t.rpc(a, 'register_player', ['Fast'])
    await t.rpc(b, 'register_player', ['Tie Fewer Moves'])
    await t.rpc(c, 'register_player', ['Slow'])

    const subA = uuid()
    const metricsA = { pairs: 7, moves: 12, timeMs: 30000 }
    expect((await t.rpc(a, 'submit_score', [subA, 'memory-match', 'easy', JSON.stringify(metricsA)])).status).toBe('accepted')
    // retry of the same submission (network retry / offline replay) is not double counted
    expect((await t.rpc(a, 'submit_score', [subA, 'memory-match', 'easy', JSON.stringify(metricsA)])).status).toBe('duplicate')
    await t.rpc(b, 'submit_score', [uuid(), 'memory-match', 'easy', JSON.stringify({ pairs: 7, moves: 10, timeMs: 30000 })])
    await t.rpc(c, 'submit_score', [uuid(), 'memory-match', 'easy', JSON.stringify({ pairs: 7, moves: 9, timeMs: 50000 })])

    const lb = await t.as<{ rank: number; nickname: string }>(null, `select * from public.get_leaderboard('memory-match', 'easy', 10)`)
    expect(lb.rows.map((r) => r.nickname)).toEqual(['Tie Fewer Moves', 'Fast', 'Slow'])
    expect(lb.rows.map((r) => Number(r.rank))).toEqual([1, 2, 3])

    const me = await t.as<{ rank: number }>(c, `select * from public.get_my_leaderboard_position('memory-match', 'easy')`)
    expect(Number(me.rows[0].rank)).toBe(3)

    // different difficulty boards are never mixed
    const hard = await t.as(null, `select * from public.get_leaderboard('memory-match', 'hard', 10)`)
    expect(hard.rows).toHaveLength(0)
  })

  it('rejects impossible or malformed results', async () => {
    const uid = await t.newUser()
    await t.rpc(uid, 'register_player', ['Cheater'])
    const bad: [string, string, object][] = [
      ['memory-match', 'easy', { pairs: 11, moves: 12, timeMs: 30000 }],
      ['memory-match', 'easy', { pairs: 7, moves: 7, timeMs: 100 }],
      ['ludo', 'easy', { position: 1, points: 5 }],
      ['pong', 'hard', { target: 7, playerScore: 7, cpuScore: 7 }],
      ['2048', 'classic', { score: 100, maxTile: 3000 }],
      ['typing-racer', 'easy', { wpm: 200, accuracy: 99, timeMs: 60000, chars: 250 }],
      ['snake-battle', 'classic', { score: 'lots' }],
      ['tetris', 'nonexistent', { score: 10, lines: 1 }],
      ['loop-sort', 'classic', { score: 1 }],
    ]
    for (const [game, board, metrics] of bad) {
      await expect(t.rpc(uid, 'submit_score', [uuid(), game, board, JSON.stringify(metrics)])).rejects.toThrow()
    }
  })

  it('sums Ludo points per bot difficulty', async () => {
    const uid = await t.newUser()
    await t.rpc(uid, 'register_player', ['Ludo King'])
    await t.rpc(uid, 'submit_score', [uuid(), 'ludo', 'hard', JSON.stringify({ position: 1, points: 10 })])
    await t.rpc(uid, 'submit_score', [uuid(), 'ludo', 'hard', JSON.stringify({ position: 2, points: 5 })])
    const lb = await t.as<{ nickname: string; rank1: number; rank2: number; results: number }>(
      null,
      `select * from public.get_leaderboard('ludo', 'hard', 10)`,
    )
    expect(lb.rows[0]).toMatchObject({ nickname: 'Ludo King', rank1: 15, rank2: 1 })
    expect(Number(lb.rows[0].results)).toBe(2)
  })

  it('checks claimed durations against a server session', async () => {
    const uid = await t.newUser()
    await t.rpc(uid, 'register_player', ['Timer'])
    const sess = await t.as<{ id: string }>(uid, `select public.start_game_session('sudoku', 'easy') as id`)
    const sessionId = sess.rows[0].id
    // claims 10 minutes although the session started just now
    await expect(
      t.rpc(uid, 'submit_score', [uuid(), 'sudoku', 'easy', JSON.stringify({ timeMs: 600000, mistakes: 0 }), null, sessionId]),
    ).rejects.toThrow(/timing_mismatch/)
    await t.db.query(`update public.game_sessions set started_at = now() - interval '11 minutes' where id = $1`, [sessionId])
    const ok = await t.rpc(uid, 'submit_score', [uuid(), 'sudoku', 'easy', JSON.stringify({ timeMs: 600000, mistakes: 0 }), null, sessionId])
    expect(ok.timing_verified).toBe(true)
  })

  it('merges level progress deterministically and ranks by levels', async () => {
    const uid = await t.newUser()
    await t.rpc(uid, 'register_player', ['Arrow Pro'])
    await t.rpc(uid, 'save_progress', ['arrow-go', '{1,2,3}', JSON.stringify({ 1: 100 })])
    const merged = await t.rpc(uid, 'save_progress', ['arrow-go', '{2,5}', JSON.stringify({ 1: 50, 5: 80 })])
    expect(merged.completed).toEqual([1, 2, 3, 5])
    expect(merged.best).toEqual({ 1: 100, 5: 80 })
    await expect(t.rpc(uid, 'save_progress', ['arrow-go', '{999}', '{}'])).rejects.toThrow(/invalid_level/)
    const lb = await t.as<{ nickname: string; rank1: number }>(null, `select * from public.get_leaderboard('arrow-go', 'classic', 10)`)
    expect(lb.rows.find((r) => r.nickname === 'Arrow Pro')?.rank1).toBe(4)
  })
})

describe('loop sort', () => {
  const ev = (kind: 'fail' | 'complete', level: number, id = uuid()) => ({ id, kind, level })

  async function setup(name: string) {
    const uid = await t.newUser()
    const reg = await t.rpc(uid, 'register_player', [name])
    return { uid, player: reg.player_id as string }
  }

  it('starts with max lives and loses one per failed level, idempotently', async () => {
    const { uid } = await setup('Lives')
    const s0 = await t.rpc(uid, 'loop_sort_state')
    expect(s0.lives).toBe(5)
    expect(s0.next_life_at).toBeNull()
    const fail = ev('fail', 1)
    const r1 = await t.rpc(uid, 'loop_sort_apply_events', [JSON.stringify([fail])])
    expect(r1.state.lives).toBe(4)
    expect(r1.state.next_life_at).not.toBeNull()
    const r2 = await t.rpc(uid, 'loop_sort_apply_events', [JSON.stringify([fail])])
    expect(r2.results[0].status).toBe('duplicate')
    expect(r2.state.lives).toBe(4)
  })

  it('regenerates lives from the server clock only', async () => {
    const { uid, player } = await setup('Regen')
    await t.rpc(uid, 'loop_sort_apply_events', [JSON.stringify([ev('fail', 1), ev('fail', 1), ev('fail', 1)])])
    expect((await t.rpc(uid, 'loop_sort_state')).lives).toBe(2)
    // pretend 41 minutes passed on the server (regen = 20 min)
    await t.db.query(`update public.loop_sort_lives set regen_anchor = now() - interval '41 minutes' where player_id = $1`, [player])
    const s = await t.rpc(uid, 'loop_sort_state')
    expect(s.lives).toBe(4)
    const nextIn = (new Date(s.next_life_at).getTime() - new Date(s.server_now).getTime()) / 1000
    expect(nextIn).toBeGreaterThan(17 * 60)
    expect(nextIn).toBeLessThanOrEqual(19 * 60 + 1)
    await t.db.query(`update public.loop_sort_lives set regen_anchor = now() - interval '5 hours' where player_id = $1`, [player])
    expect((await t.rpc(uid, 'loop_sort_state')).lives).toBe(5)
  })

  it('does not accept completions with no lives or for locked levels in normal mode', async () => {
    const { uid } = await setup('Locked')
    const r = await t.rpc(uid, 'loop_sort_apply_events', [JSON.stringify([ev('complete', 3)])])
    expect(r.results[0]).toMatchObject({ status: 'rejected', reason: 'level_locked' })
    await t.rpc(uid, 'loop_sort_apply_events', [JSON.stringify([1, 2, 3, 4, 5].map(() => ev('fail', 1)))])
    const r2 = await t.rpc(uid, 'loop_sort_apply_events', [JSON.stringify([ev('complete', 1)])])
    expect(r2.results[0]).toMatchObject({ status: 'rejected', reason: 'no_lives' })
    expect(r2.state.lives).toBe(0)
  })

  it('admin PIN: not configured, wrong PIN, rate limit, success', async () => {
    const { uid } = await setup('Admin')
    expect((await t.rpc(uid, 'loop_sort_enter_admin', ['1234'])).error).toBe('admin_not_configured')
    await t.db.query(`select private.set_loop_sort_admin_pin('4321')`)
    expect((await t.rpc(uid, 'loop_sort_enter_admin', ['1234'])).error).toBe('invalid_pin')
    const ok = await t.rpc(uid, 'loop_sort_enter_admin', ['4321'])
    expect(ok.admin).toBe(true)

    const brute = await setup('Brute')
    for (let i = 0; i < 5; i += 1) {
      expect((await t.rpc(brute.uid, 'loop_sort_enter_admin', ['0000'])).error).toBe('invalid_pin')
    }
    // even the right PIN is refused once the limit is hit
    expect((await t.rpc(brute.uid, 'loop_sort_enter_admin', ['4321'])).error).toBe('rate_limited')
  })

  it('admin mode: unlimited lives, direct level selection, completion shared with normal mode', async () => {
    await t.db.query(`select private.set_loop_sort_admin_pin('4321')`)
    const { uid } = await setup('Switcher')
    await t.rpc(uid, 'loop_sort_apply_events', [JSON.stringify([ev('complete', 1), ev('fail', 2), ev('fail', 2)])])
    expect((await t.rpc(uid, 'loop_sort_state')).lives).toBe(3)

    await expect(t.rpc(uid, 'loop_sort_select_level', [40])).rejects.toThrow(/level_locked/)
    await t.rpc(uid, 'loop_sort_enter_admin', ['4321'])
    const sel = await t.rpc(uid, 'loop_sort_select_level', [40])
    expect(sel.current_level).toBe(40)
    expect(sel.completed).toEqual([1]) // opening a level does not complete it

    const r = await t.rpc(uid, 'loop_sort_apply_events', [JSON.stringify([ev('fail', 40), ev('fail', 40), ev('complete', 40)])])
    expect(r.state.lives).toBe(3) // fails in admin mode cost nothing
    expect(r.state.completed).toEqual([1, 40])

    const back = await t.rpc(uid, 'loop_sort_exit_admin')
    expect(back.admin).toBe(false)
    expect(back.lives).toBe(5) // reset to max on switch to normal
    expect(back.completed).toEqual([1, 40]) // admin completions persist
    // a different device of the same player is not in admin mode
    const other = await t.newUser()
    const code = (await t.rpc(uid, 'rotate_player_code')).player_code
    await t.rpc(other, 'recover_player', [code])
    const otherState = await t.rpc(other, 'loop_sort_state')
    expect(otherState.admin).toBe(false)
    expect(otherState.completed).toEqual([1, 40])
  })
})
