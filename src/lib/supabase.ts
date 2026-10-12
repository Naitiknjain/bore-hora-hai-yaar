import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the public Supabase settings are present. Otherwise the site runs in local-only mode. */
export const backendConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = backendConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'bhhy-auth',
      },
    })
  : null

/**
 * Makes sure this browser has a Supabase (anonymous) auth session.
 * Requires "Anonymous sign-ins" to be enabled in the Supabase dashboard.
 */
export async function ensureAuthSession(): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.auth.getSession()
  if (data.session) return true
  const { error } = await supabase.auth.signInAnonymously()
  if (error) throw new ApiError(error.message.includes('Anonymous') ? 'anonymous_disabled' : 'auth_failed', error.message)
  return true
}

export class ApiError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

const KNOWN_CODES = [
  'rate_limited',
  'invalid_code',
  'invalid_nickname',
  'already_registered',
  'no_player',
  'not_authenticated',
  'unknown_board',
  'unknown_game',
  'invalid_metrics',
  'invalid_played_at',
  'timing_mismatch',
  'invalid_submission',
  'level_locked',
  'invalid_level',
  'invalid_events',
  'invalid_best',
]

function toApiError(err: { message?: string; code?: string } | null | undefined): ApiError {
  const msg = err?.message ?? 'unknown_error'
  const known = KNOWN_CODES.find((c) => msg.startsWith(c))
  if (known) return new ApiError(known, msg)
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return new ApiError('network', msg)
  return new ApiError('server_error', msg)
}

/** Calls a Postgres RPC and throws ApiError with a stable code on failure. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new ApiError('not_configured')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError('network')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw toApiError(error)
  if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data && typeof data.error === 'string') {
    throw new ApiError(data.error)
  }
  return data as T
}

export function friendlyError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : 'unknown'
  switch (code) {
    case 'rate_limited':
      return 'Thoda ruk jao yaar - too many attempts. Try again in a few minutes.'
    case 'invalid_code':
      return 'That player code did not match any player. Check it and try again.'
    case 'invalid_nickname':
      return 'Nickname must be 2-20 characters (no < or >).'
    case 'network':
      return 'You seem to be offline. Your results are saved on this device and will sync later.'
    case 'not_configured':
      return 'Online features are not configured for this site yet (local-only mode).'
    case 'anonymous_disabled':
      return 'The backend has anonymous sign-ins disabled. The site owner needs to enable them in Supabase.'
    case 'invalid_pin':
      return 'Wrong PIN.'
    case 'admin_not_configured':
      return 'Admin PIN has not been set up on the server yet.'
    case 'level_locked':
      return 'That level is still locked.'
    case 'no_player':
      return 'This device is not linked to a player yet.'
    default:
      return 'Something went wrong on our side. Please try again.'
  }
}
