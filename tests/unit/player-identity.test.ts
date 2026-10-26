import { describe, expect, it } from 'vitest'
import { looksLikePlayerCode, validateNickname } from '../../src/features/player/PlayerContext'
import { handOffRecoveryCode, takeRecoveryCode } from '../../src/features/player/recovery-handoff'

describe('player codes never become nicknames', () => {
  it('recognises full, truncated, spaced and lower-case player codes', () => {
    for (const code of ['BHHY-ABCD-EFGH-JKMN-PQRS', 'BHHY-ABCD-EFGH-JKMN-', 'bhhy abcd efgh', 'BHHYABCDEFGH', ' BHHY-1234 ', 'ABCD-EFGH-JKMN-PQRS', 'abcd efgh jkmn']) {
      expect(looksLikePlayerCode(code), code).toBe(true)
    }
  })

  it('leaves ordinary nicknames alone', () => {
    for (const nick of ['Pappu Gamer', 'NaitikJain', 'BHHY', 'Bhhy fan', 'ABCD-EFGH', 'R2-D2', 'xX_Pro_Xx']) {
      expect(looksLikePlayerCode(nick), nick).toBe(false)
      expect(validateNickname(nick), nick).toBe(nick)
    }
  })

  it('refuses a code (the bug: a pasted code was cut to 20 characters and saved as a public name)', () => {
    expect(validateNickname('BHHY-ABCD-EFGH-JKMN-')).toBeNull()
    expect(validateNickname('ABCD-EFGH-JKMN-PQRS')).toBeNull()
  })

  it('hands a pasted code to the Recover page once, in memory only', () => {
    handOffRecoveryCode('BHHY-ABCD-EFGH-JKMN-PQRS')
    expect(takeRecoveryCode()).toBe('BHHY-ABCD-EFGH-JKMN-PQRS')
    expect(takeRecoveryCode()).toBe('')
  })
})
