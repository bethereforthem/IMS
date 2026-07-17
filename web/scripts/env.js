// Loads secrets for seed/verify scripts from web/.env.local (never committed).
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
const vars = {}
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) vars[m[1]] = m[2].trim()
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? vars.JWT_SECRET
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? vars.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_URL = process.env.SUPABASE_URL ?? vars.SUPABASE_URL ?? 'https://euifbienxyqhgeqapajd.supabase.co'

if (!JWT_SECRET || !SERVICE_ROLE_KEY) {
  console.error('Missing JWT_SECRET / SUPABASE_SERVICE_ROLE_KEY — set them in web/.env.local')
  process.exit(1)
}

module.exports = { JWT_SECRET, SERVICE_ROLE_KEY, SUPABASE_URL }
