/**
 * Chakkar Cubes - tunable rules. Change balance here; logic and UI read from this file.
 */

/**
 * When an attempt is lost.
 *  - 'tap-exceeds-capacity' (default, confirmed by gameplay observation): tapping a truck whose
 *    cubes do not fit into the conveyor's remaining space shows the Out of Space screen.
 *  - 'jammed' (legacy alternative): such taps are refused; the attempt is lost only when the
 *    conveyor has settled and no truck can be tapped at all.
 */
export type LossTrigger = 'tap-exceeds-capacity' | 'jammed'

export type AbilityId = 'undo' | 'shuffle' | 'extraTruck' | 'extraSlot'

export interface ChakkarConfig {
  lossTrigger: LossTrigger
  /** Uses of each ability per level attempt in Normal Mode. Admin Mode is always unlimited. */
  abilitiesPerLevel: Record<AbilityId, number>
  /** Free continues offered on the Out of Space screen, per attempt (Normal Mode). */
  continuesPerAttempt: number
  /** Conveyor slots added by one continue. */
  slotsPerContinue: number
  /** Conveyor slots added by the Extra Conveyor Slot ability. */
  slotsPerExtraSlot: number
  /** Hard limit on trucks around the loop (including trucks added by Extra Truck). */
  maxTrucks: number
}

export const CHAKKAR_CONFIG: ChakkarConfig = {
  lossTrigger: 'tap-exceeds-capacity',
  abilitiesPerLevel: { undo: 2, shuffle: 2, extraTruck: 2, extraSlot: 2 },
  continuesPerAttempt: 1,
  slotsPerContinue: 1,
  slotsPerExtraSlot: 1,
  maxTrucks: 12,
}

export const ABILITY_LABELS: Record<AbilityId, string> = {
  undo: 'Undo',
  shuffle: 'Shuffle',
  extraTruck: 'Extra Truck',
  extraSlot: '+1 Slot',
}

/** Remaining uses: unlimited in Admin Mode, otherwise the configured allowance minus uses. */
export function usesLeft(id: AbilityId, used: number, admin: boolean, config: ChakkarConfig = CHAKKAR_CONFIG): number {
  return admin ? Infinity : Math.max(0, config.abilitiesPerLevel[id] - used)
}

export function continuesLeft(used: number, admin: boolean, config: ChakkarConfig = CHAKKAR_CONFIG): number {
  return admin ? Infinity : Math.max(0, config.continuesPerAttempt - used)
}
