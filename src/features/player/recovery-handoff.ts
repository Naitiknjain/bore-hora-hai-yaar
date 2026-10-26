// Carries a player code from the welcome form to the Recover page in memory only.
// It is never written to the URL, history state or storage.
let pending = ''

export function handOffRecoveryCode(code: string) {
  pending = code
}

export function takeRecoveryCode(): string {
  const code = pending
  pending = ''
  return code
}
