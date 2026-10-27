// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyWalletEvent, applyWalletLocally, BOOSTER_PRICE, canAfford, claimRewards, levelReward, WALLET_START, type Wallet } from '../../src/games/loop-sort/wallet'

const empty: Wallet = { coins: 0, boosters: { undo: 0, shuffle: 0, extraTruck: 0, extraSlot: 0 } }

describe('wallet', () => {
  it('starts with 500 coins and 2 of each booster', () => {
    expect(WALLET_START).toEqual({ coins: 500, boosters: { undo: 2, shuffle: 2, extraTruck: 2, extraSlot: 2 } })
  })

  it('pays 10 coins per level, 30 for Hard and 50 for Super Hard (same rule as the server)', () => {
    expect(levelReward(1)).toBe(10)
    expect(levelReward(14)).toBe(10) // Hard levels start at 15
    expect(levelReward(21)).toBe(30)
    expect(levelReward(50)).toBe(50)
    expect(levelReward(175)).toBe(50) // Super Hard wins over Hard (175 is both)
  })

  it('pays each level once', () => {
    const a = claimRewards(WALLET_START, [], [1, 2, 21])
    expect(a.wallet.coins).toBe(500 + 10 + 10 + 30)
    const b = claimRewards(a.wallet, a.rewarded, [1, 2, 21, 3])
    expect(b.wallet.coins).toBe(a.wallet.coins + 10)
    expect(claimRewards(b.wallet, b.rewarded, [1, 2, 3, 21]).wallet.coins).toBe(b.wallet.coins)
  })

  it('uses the stock first, then buys with coins, and refuses when neither is enough', () => {
    let w: Wallet | null = { ...empty, coins: 350, boosters: { ...empty.boosters, undo: 1 } }
    w = applyWalletEvent(w, { kind: 'use', booster: 'undo' }, false)!
    expect(w).toEqual({ ...empty, coins: 350 })
    w = applyWalletEvent(w, { kind: 'use', booster: 'undo' }, false)!
    expect(w.coins).toBe(350 - BOOSTER_PRICE.undo)
    expect(canAfford(w, 'undo', false)).toBe(false)
    expect(applyWalletEvent(w, { kind: 'use', booster: 'undo' }, false)).toBeNull()
  })

  it('buying adds to the stock', () => {
    const w = applyWalletEvent({ ...empty, coins: 1000 }, { kind: 'buy', booster: 'extraTruck' }, false)!
    expect(w.coins).toBe(1000 - BOOSTER_PRICE.extraTruck)
    expect(w.boosters.extraTruck).toBe(1)
  })

  it('Admin Mode uses boosters for free', () => {
    expect(canAfford(empty, 'extraSlot', true)).toBe(true)
    expect(applyWalletEvent(empty, { kind: 'use', booster: 'extraSlot' }, true)).toEqual(empty)
  })

  it('queued events apply in order and unaffordable ones are skipped (the server rejects them too)', () => {
    const w = applyWalletLocally({ ...empty, coins: 300 }, [
      { id: 'a', kind: 'use', booster: 'shuffle' },
      { id: 'b', kind: 'use', booster: 'shuffle' },
    ], false)
    expect(w.coins).toBe(0)
  })
})
