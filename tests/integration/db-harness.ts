import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Boots an in-process Postgres (PGlite), stubs the parts of Supabase the migrations rely on
 * (auth schema, auth.uid(), API roles, extensions schema) and applies every migration in order.
 */
export async function createTestDb() {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(`
    create schema if not exists extensions;
    create schema if not exists auth;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `)

  const dir = join(process.cwd(), 'supabase', 'migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'))
  }

  let counter = 0
  async function newUser(): Promise<string> {
    counter += 1
    const id = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
    await db.query('insert into auth.users (id) values ($1)', [id])
    return id
  }

  /** Runs a query as the `authenticated` role with auth.uid() = uid (or anon when uid is null). */
  async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
    await db.exec(uid ? 'set role authenticated' : 'set role anon')
    try {
      return await db.query<T>(sql, params)
    } finally {
      await db.exec('reset role')
    }
  }

  /** Calls a json-returning RPC and returns the parsed object. */
  async function rpc<T = any>(uid: string | null, fn: string, args: unknown[] = []): Promise<T> {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(', ')
    const res = await as<{ r: T }>(uid, `select public.${fn}(${placeholders}) as r`, args)
    return res.rows[0].r
  }

  return { db, newUser, as, rpc }
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
