import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyState, exportJson, isCancelled, load, brokenCopy, parseBackup, type State } from './store.ts'

const good = (): State => ({
  ...emptyState(),
  staff: [{ id: 'a', name: 'A' }],
  customers: [{ id: 'c', name: 'C' }],
  followIds: ['a'],
  sales: [{ id: '1', billNo: 'W-1', date: '2026-11-25', cat: 'water', customerId: 'c', productId: 'w250', qty: 10, price: 38000, staff: { transport: 'a', onsite: '', follow: 'a', warehouse: '' }, status: 'pending' }],
  cash: [{ id: '2', date: '2026-11-25', cat: 'water', followId: 'a', amount: 1000 }],
  moves: [{ id: '3', date: '2026-11-25', type: 'out', productId: 'w250', qty: 5, note: '' }],
})
const backup = (change: (s: State) => void) => { const s = good(); change(s); return parseBackup(exportJson(s)) }

test('a complete backup is accepted', () => assert.ok('state' in backup(() => {})))

test('a backup with a broken reference is refused', () => {
  const bad: [string, (s: State) => void][] = [
    ['unknown product', (s) => { s.sales[0].productId = 'gone' }],
    ['product of another category', (s) => { s.sales[0].productId = 'bagblack' }],
    ['unknown staff', (s) => { s.sales[0].staff.transport = 'gone' }],
    ['unknown customer', (s) => { s.sales[0].customerId = 'gone' }],
    ['unknown follower', (s) => { s.followIds = ['gone'] }],
    ['cash to unknown follower', (s) => { s.cash[0].followId = 'gone' }],
    ['stock of unknown product', (s) => { s.moves[0].productId = 'gone' }],
    ['zero packs', (s) => { s.sales[0].qty = 0 }],
  ]
  for (const [name, change] of bad) assert.ok('error' in backup(change), name)
})

test('unreadable stored data is set aside, not lost', () => {
  const mem = new Map<string, string>()
  globalThis.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } as Storage
  mem.set('bonus-workspace/v1', '{"staff": "broken"')
  assert.deepEqual(load().sales, [])
  assert.equal(brokenCopy(), '{"staff": "broken"')
  // a second failure must not replace the first copy
  mem.set('bonus-workspace/v1', 'other')
  load()
  assert.equal(brokenCopy(), '{"staff": "broken"')
})

test('a backup made before payouts existed is still accepted', () => {
  const old = JSON.parse(exportJson(good()))
  delete old.data.payouts
  const r = parseBackup(JSON.stringify(old))
  assert.ok('state' in r && Array.isArray(r.state.payouts))
})

test('a payout or stock issue for an unknown person is refused', () => {
  assert.ok('error' in backup((s) => { s.payouts = [{ id: 'p', ym: '2026-12', cat: 'water', staffId: 'gone', amount: 1, date: '2026-12-31' }] }))
  assert.ok('error' in backup((s) => { s.moves[0].staffId = 'gone' }))
  assert.ok('state' in backup((s) => { s.moves[0].staffId = 'a' }))
})

test('old payout marks become paid claims when data is loaded or imported', () => {
  const old = JSON.parse(exportJson(good()))
  delete old.data.claims
  old.data.payouts = [{ id: 'p1', ym: '2026-12', cat: 'water', staffId: 'a', amount: 15000, date: '2026-12-31' }]
  const r = parseBackup(JSON.stringify(old))
  assert.ok('state' in r)
  assert.deepEqual(r.state.payouts, [])
  assert.deepEqual(r.state.claims.map((c) => [c.id, c.staffId, c.amount, c.status, c.decidedAt]), [['p1', 'a', 15000, 'paid', '2026-12-31']])
})

test('a claim for an unknown person or with no amount is refused', () => {
  const c = { id: 'k', ym: '2026-12', staffId: 'a', amount: 100, date: '2026-11-25', note: '', status: 'requested' as const }
  assert.ok('state' in backup((s) => { s.claims = [c] }))
  assert.ok('error' in backup((s) => { s.claims = [{ ...c, staffId: 'gone' }] }))
  assert.ok('error' in backup((s) => { s.claims = [{ ...c, amount: 0 }] }))
  assert.ok('error' in backup((s) => { s.claims = [c, { ...c }] }))
})

test('a cancelled bill matches by bill number and category; an old cancel without category matches both', () => {
  const s = emptyState()
  const bill = { billNo: 'A1', cat: 'water' } as State['sales'][number]
  assert.equal(isCancelled(s, bill), false)
  assert.equal(isCancelled({ ...s, cancels: [{ id: 'c', billNo: 'A1', date: '2026-11-26', cat: 'bag' }] }, bill), false)
  assert.equal(isCancelled({ ...s, cancels: [{ id: 'c', billNo: 'A1', date: '2026-11-26', cat: 'water' }] }, bill), true)
  assert.equal(isCancelled({ ...s, cancels: [{ id: 'c', billNo: 'A1', date: '2026-11-26' }] }, bill), true)
})
