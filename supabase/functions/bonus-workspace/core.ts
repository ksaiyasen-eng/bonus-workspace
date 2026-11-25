// Request handling for the shared Bonus Workspace data. No Deno or Supabase imports here,
// so the same code runs in the edge function, in the local mock server and in the tests.
import { check } from './check.ts'

export type Role = 'manager' | 'staff'
const ROLES: Role[] = ['manager', 'staff']

export interface Store {
  read(): Promise<{ data: any; version: number } | null>
  /** Saves only if the stored version still equals `expected`. Returns false when someone else saved first. */
  write(data: any, expected: number, by: Role): Promise<boolean>
  pins(): Promise<Partial<Record<Role, string>>>
  setPin(role: Role, hash: string): Promise<void>
  /** Records one sign-in try, then counts tries since `sinceIso`: from this address, and from everyone. */
  attempt(ip: string, sinceIso: string): Promise<{ mine: number; all: number }>
}

export interface Req { action?: string; pin?: string; token?: string; data?: any; baseVersion?: number; role?: string; newPin?: string }

const enc = new TextEncoder()
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
export const hashPin = async (pin: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(`bonus-workspace:${pin}`)))

async function sign(keyText: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))
}
const sameText = (a: string, b: string) => {
  let diff = a.length ^ b.length
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1))
  return diff === 0
}

const TOKEN_MS = 30 * 24 * 60 * 60 * 1000
const LOCK_AFTER = 10 // tries per address
const LOCK_ALL_AFTER = 100 // tries from all addresses together, in case the address can be faked
const LOCK_MS = 15 * 60 * 1000
const MAX_BYTES = 2_000_000

// The token is signed with the role's PIN hash, so changing a PIN signs every device of that role out.
// It is also signed with a server-only secret, so a token cannot be used to work the PIN out offline.
async function makeToken(role: Role, key: string, now: number) {
  const msg = `${role}.${now + TOKEN_MS}`
  return `${msg}.${await sign(key, msg)}`
}
async function roleOf(token: unknown, pins: Partial<Record<Role, string>>, now: number, secret: string): Promise<Role | null> {
  const [role, exp, sig] = String(token ?? '').split('.')
  const hash = pins[role as Role]
  if (!ROLES.includes(role as Role) || !hash || !sig || !(Number(exp) > now)) return null
  return sameText(await sign(hash + secret, `${role}.${exp}`), sig) ? (role as Role) : null
}

/** JSON text with sorted keys: the database does not keep key order, so plain JSON.stringify cannot compare. */
export const stable = (v: any): string =>
  v === null || v === undefined || typeof v !== 'object'
    ? JSON.stringify(v) ?? 'null'
    : Array.isArray(v)
      ? `[${v.map(stable).join(',')}]`
      : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`

/** Returns the first problem in the data (a Lao message), or null when it is sound. */
const problemIn = (d: any): string | null => { try { check(d); return null } catch (e) { return e instanceof Error ? e.message : 'bad data' } }

// What only a manager may change: rules, prices, the staff list and its roles, old payout marks, cancelled-bill records,
// any bill that is not waiting for approval, and any pay claim that is not waiting to be paid.
const MANAGER_ONLY = ['settings', 'products', 'payouts', 'cancels', 'staff', 'followIds', 'warehouseIds']
// list -> the status staff may still add, change or remove; rows in any other status are the manager's
const OPEN_STATUS: Record<string, string> = { sales: 'pending', claims: 'requested' }

/** Returns the part a staff save may not touch, or null when the save is allowed. */
export function staffBlock(old: any, next: any): string | null {
  if (!old) return 'first-save'
  for (const k of MANAGER_ONLY) if (stable(old[k] ?? []) !== stable(next[k] ?? [])) return k
  for (const [k, open] of Object.entries(OPEN_STATUS)) {
    const before = new Map<string, any>((old[k] ?? []).map((x: any) => [x.id, x]))
    const after = new Map<string, any>((next[k] ?? []).map((x: any) => [x.id, x]))
    for (const [id, x] of before) if (x.status !== open && stable(after.get(id)) !== stable(x)) return k
    for (const [id, x] of after) if (x.status !== open && stable(before.get(id)) !== stable(x)) return k
  }
  return null
}

export async function handle(req: Req, ip: string, store: Store, now = Date.now(), secret = ''): Promise<{ status: number; body: any }> {
  const pins = await store.pins()

  if (req.action === 'login') {
    // Count the try before looking at the PIN: tries sent at the same moment cannot all slip under the limit.
    const tries = await store.attempt(ip, new Date(now - LOCK_MS).toISOString())
    if (tries.mine > LOCK_AFTER || tries.all > LOCK_ALL_AFTER) return { status: 429, body: { error: 'locked' } }
    const hash = await hashPin(String(req.pin ?? ''))
    const role = ROLES.find((r) => pins[r] === hash)
    if (!role) return { status: 401, body: { error: 'bad-pin' } }
    return { status: 200, body: { role, token: await makeToken(role, hash + secret, now) } }
  }

  const role = await roleOf(req.token, pins, now, secret)
  if (!role) return { status: 401, body: { error: 'bad-token' } }
  const current = async () => { const row = await store.read(); return { data: row?.data ?? null, version: row?.version ?? 0 } }

  if (req.action === 'load') return { status: 200, body: { role, ...(await current()) } }

  if (req.action === 'save') {
    if (JSON.stringify(req.data ?? null).length > MAX_BYTES) return { status: 400, body: { error: 'too-big' } }
    const problem = problemIn(req.data)
    if (problem) return { status: 400, body: { error: 'bad-data', detail: problem } }
    const cur = await current()
    if (cur.version !== req.baseVersion) return { status: 409, body: cur }
    if (role === 'staff') {
      // the stored copy goes through the same check, so old payout marks compare as the paid claims the new data holds
      const part = staffBlock(cur.data && check(structuredClone(cur.data)), req.data)
      if (part) return { status: 403, body: { error: 'forbidden', part } }
    }
    if (!(await store.write(req.data, cur.version, role))) return { status: 409, body: await current() }
    return { status: 200, body: { version: cur.version + 1 } }
  }

  if (req.action === 'setPin') {
    if (role !== 'manager') return { status: 403, body: { error: 'forbidden', part: 'pin' } }
    const target = req.role as Role
    if (!ROLES.includes(target) || !/^\d{8}$/.test(String(req.newPin ?? ''))) return { status: 400, body: { error: 'bad-pin-format' } }
    const hash = await hashPin(String(req.newPin))
    if (pins[target === 'manager' ? 'staff' : 'manager'] === hash) return { status: 400, body: { error: 'same-pin' } }
    await store.setPin(target, hash)
    return { status: 200, body: target === 'manager' ? { token: await makeToken('manager', hash + secret, now) } : {} }
  }

  return { status: 400, body: { error: 'bad-action' } }
}

/** In-memory store for the local mock server and the tests. */
export function memoryStore(pinHashes: Partial<Record<Role, string>>): Store & { row: { data: any; version: number } | null } {
  const tries: { ip: string; at: string }[] = []
  const s = {
    row: null as { data: any; version: number } | null,
    read: async () => s.row && { data: JSON.parse(JSON.stringify(s.row.data)), version: s.row.version },
    write: async (data: any, expected: number) => {
      if ((s.row?.version ?? 0) !== expected) return false
      s.row = { data: JSON.parse(JSON.stringify(data)), version: expected + 1 }
      return true
    },
    pins: async () => ({ ...pinHashes }),
    setPin: async (role: Role, hash: string) => void (pinHashes[role] = hash),
    attempt: async (ip: string, since: string) => {
      tries.push({ ip, at: new Date().toISOString() })
      const recent = tries.filter((t) => t.at >= since)
      return { mine: recent.filter((t) => t.ip === ip).length, all: recent.length }
    },
  }
  return s
}
