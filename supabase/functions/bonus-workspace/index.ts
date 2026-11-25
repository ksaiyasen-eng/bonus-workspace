// Supabase edge function: the only way in to the shared Bonus Workspace data.
// The tables have row level security on and no policies, so only this function (service role) can read or write them.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handle, type Role, type Store } from './core.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const ORIGINS = ['https://ksaiyasen-eng.github.io', 'http://localhost:5183']
const ok = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data }
const dayInVientiane = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date())

const store: Store = {
  async read() {
    return ok(await db.from('bonus_state').select('data,version').eq('id', 'main').maybeSingle())
  },
  async write(data, expected, by) {
    const row = { data, version: expected + 1, updated_at: new Date().toISOString(), updated_by: by }
    let saved: boolean
    if (expected === 0) {
      const { error } = await db.from('bonus_state').insert({ id: 'main', ...row })
      if (error && error.code !== '23505') throw error // 23505 = the row already exists: someone saved first. Anything else is a real fault.
      saved = !error
    } else {
      saved = ok(await db.from('bonus_state').update(row).eq('id', 'main').eq('version', expected).select('version')).length === 1
    }
    // one copy per day, so a bad save can be undone from the last good day
    if (saved) ok(await db.from('bonus_history').upsert({ day: dayInVientiane(), data, version: expected + 1 }))
    return saved
  },
  async pins() {
    const rows = ok(await db.from('bonus_pins').select('role,hash')) as { role: Role; hash: string }[]
    return Object.fromEntries(rows.map((r) => [r.role, r.hash]))
  },
  async setPin(role, hash) {
    ok(await db.from('bonus_pins').upsert({ role, hash, updated_at: new Date().toISOString() }))
  },
  async attempt(ip, since) {
    ok(await db.from('bonus_fails').insert({ ip }))
    const count = async (mine: boolean) => {
      let q = db.from('bonus_fails').select('id', { count: 'exact', head: true }).gte('at', since)
      if (mine) q = q.eq('ip', ip)
      const r = await q
      if (r.error) throw r.error
      return r.count ?? 0
    }
    return { mine: await count(true), all: await count(false) }
  },
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  const cors = {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'post-only' })
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    const r = await handle(await req.json(), ip, store, Date.now(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    return json(r.status, r.body)
  } catch (e) {
    console.error(e)
    return json(500, { error: 'server' })
  }
})
