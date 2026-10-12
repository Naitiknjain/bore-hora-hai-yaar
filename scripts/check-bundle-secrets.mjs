// Fails if anything that looks like a privileged secret ended up in the production bundle.
// Run after `npm run build` (Netlify runs it as part of the build command).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const patterns = [
  [/service_role/i, 'Supabase service-role reference'],
  [/c2VydmljZV9yb2xl/, 'base64 "service_role" (service-role JWT)'],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret API key'],
  [/SUPABASE_SERVICE_ROLE_KEY/, 'service-role env var name'],
  [/LOOP_SORT_ADMIN_PIN\s*[:=]/, 'admin PIN assignment'],
  [/player_code_pepper['"]?\s*[:=]\s*['"][0-9a-f]{16,}/i, 'player code pepper value'],
]

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (/\.(js|html|css|json|txt|map)$/.test(name)) yield p
  }
}

let problems = 0
let scanned = 0
for (const file of files(DIST)) {
  scanned += 1
  const text = readFileSync(file, 'utf8')
  for (const [re, label] of patterns) {
    if (re.test(text)) {
      console.error(`✗ ${label} found in ${file}`)
      problems += 1
    }
  }
}
if (!scanned) {
  console.error('No build output found - run `npm run build` first.')
  process.exit(1)
}
if (problems) process.exit(1)
console.log(`✓ No secrets found in ${scanned} bundle files.`)
