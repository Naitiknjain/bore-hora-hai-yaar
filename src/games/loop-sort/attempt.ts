import { CHAKKAR_CONFIG, continuesLeft, usesLeft, type AbilityId, type ChakkarConfig } from './config'
import {
  addConveyorSlots, addTruck, attemptTap, canAddConveyorSlot, canShuffle, canTap, hasNoMoves, initialState, isWon, MAX_TRUCKS, SPARE_DOCKS, nextSpareDock,
  shuffleTruck, undoTo, type LevelDef, type LoopState, type TapError,
} from './logic'

/**
 * One level attempt as a pure state machine (UI-independent, fully unit-tested).
 * The conveyor itself is advanced by the UI with `tick()`; call `afterTick` when it settles.
 */
export type AttemptStatus = 'playing' | 'out-of-space' | 'stuck' | 'won' | 'given-up'

export interface Attempt {
  level: number
  admin: boolean
  state: LoopState
  /** Boards before each tap, for Undo. */
  history: LoopState[]
  used: Record<AbilityId, number>
  continuesUsed: number
  status: AttemptStatus
  /** The tap that did not fit (retried automatically after a continue / +1 slot if it fits). */
  pending: { truck: number; needed: number; free: number } | null
  /** Last refused tap, for UI feedback. */
  refused: { truck: number; reason: TapError } | null
}

export function startAttempt(level: LevelDef, admin: boolean, config: ChakkarConfig = CHAKKAR_CONFIG): Attempt {
  const room = MAX_TRUCKS - level.trucks.length
  // Normal Mode: exactly the spare docks the levels were solved with; Admin Mode: a few more
  const spare = Math.min(room, admin ? Math.max(SPARE_DOCKS, 4) : Math.min(SPARE_DOCKS, config.abilitiesPerLevel.extraTruck))
  return {
    level: level.n,
    admin,
    state: initialState(level, spare),
    history: [],
    used: { undo: 0, shuffle: 0, extraTruck: 0, extraSlot: 0 },
    continuesUsed: 0,
    status: 'playing',
    pending: null,
    refused: null,
  }
}

function applyMove(a: Attempt, truck: number, config: ChakkarConfig): Attempt {
  const out = attemptTap(a.state, truck, config.lossTrigger)
  if (out.kind === 'moved') return { ...a, history: [...a.history, a.state], state: out.state, pending: null, refused: null, status: 'playing' }
  if (out.kind === 'out-of-space') return { ...a, status: 'out-of-space', pending: { truck, needed: out.needed, free: out.free }, refused: null }
  return { ...a, refused: { truck, reason: out.reason } }
}

/** Player taps a truck. With the confirmed rule, a group that does not fit -> Out of Space. */
export function tapTruck(a: Attempt, truck: number, config: ChakkarConfig = CHAKKAR_CONFIG): Attempt {
  if (a.status !== 'playing') return a
  return applyMove(a, truck, config)
}

/** Board updated by the running conveyor. Checks win / no-moves once it has settled. */
export function afterTick(a: Attempt, state: LoopState, settled: boolean): Attempt {
  let next: Attempt = { ...a, state }
  if (a.status !== 'playing') return next
  if (isWon(state)) next = { ...next, status: 'won' }
  else if (settled && hasNoMoves(state)) next = { ...next, status: 'stuck' }
  return next
}

/** After an extra slot is granted on the Out of Space screen: resume, retrying the move if it now fits. */
function resumeAfterSlot(a: Attempt, config: ChakkarConfig): Attempt {
  const resumed: Attempt = { ...a, status: 'playing' }
  const p = a.pending
  if (p && canTap(resumed.state, p.truck) === null) return applyMove(resumed, p.truck, config)
  return { ...resumed, pending: null }
}

export const canContinue = (a: Attempt, config: ChakkarConfig = CHAKKAR_CONFIG) =>
  a.status === 'out-of-space' && continuesLeft(a.continuesUsed, a.admin, config) > 0 && canAddConveyorSlot(a.state)

/** Free continue: +slotsPerContinue conveyor slots, then play resumes. */
export function continueAttempt(a: Attempt, config: ChakkarConfig = CHAKKAR_CONFIG): Attempt {
  if (!canContinue(a, config)) return a
  const withSlot = { ...a, continuesUsed: a.continuesUsed + 1, state: addConveyorSlots(a.state, config.slotsPerContinue) }
  return resumeAfterSlot(withSlot, config)
}

/** Ends the attempt. The caller records the failure (Normal Mode: -1 life via the existing event logic). */
export function giveUp(a: Attempt): Attempt {
  if (a.status === 'won' || a.status === 'given-up') return a
  return { ...a, status: 'given-up', pending: null }
}

/**
 * Whether an ability can be used now. `affordable` comes from the player's wallet (stock or coins);
 * without it the per-attempt allowance in the config applies.
 */
export function abilityAvailable(a: Attempt, id: AbilityId, config: ChakkarConfig = CHAKKAR_CONFIG, affordable?: boolean): boolean {
  if (!(affordable ?? usesLeft(id, a.used[id], a.admin, config) > 0)) return false
  switch (id) {
    case 'undo':
      return a.history.length > 0 && (a.status === 'playing' || a.status === 'stuck')
    case 'shuffle':
      return a.status === 'playing' && a.state.trucks.some((_, i) => canShuffle(a.state, i))
    case 'extraTruck':
      return (a.status === 'playing' || a.status === 'stuck') && nextSpareDock(a.state) >= 0
    case 'extraSlot':
      return (a.status === 'playing' || a.status === 'out-of-space') && canAddConveyorSlot(a.state)
  }
}

/**
 * Uses an ability. `truck` is required for Shuffle. Admin Mode has unlimited uses but the same
 * consistency checks (e.g. no more than 12 trucks, conveyor never larger than the loop).
 */
export function applyAbility(
  a: Attempt,
  id: AbilityId,
  opts: { truck?: number; rand?: () => number; affordable?: boolean } = {},
  config: ChakkarConfig = CHAKKAR_CONFIG,
): Attempt {
  if (!abilityAvailable(a, id, config, opts.affordable)) return a
  const used = { ...a.used, [id]: a.used[id] + 1 }
  switch (id) {
    case 'undo': {
      const prev = a.history[a.history.length - 1]
      return { ...a, used, history: a.history.slice(0, -1), state: undoTo(prev, a.state), status: 'playing', pending: null }
    }
    case 'shuffle': {
      if (opts.truck === undefined || !canShuffle(a.state, opts.truck)) return a
      return { ...a, used, state: shuffleTruck(a.state, opts.truck, opts.rand) }
    }
    case 'extraTruck':
      return { ...a, used, state: addTruck(a.state), status: 'playing' }
    case 'extraSlot': {
      const next = { ...a, used, state: addConveyorSlots(a.state, config.slotsPerExtraSlot) }
      return a.status === 'out-of-space' ? resumeAfterSlot(next, config) : next
    }
  }
}
