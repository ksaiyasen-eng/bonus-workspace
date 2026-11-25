import test from 'node:test'
import assert from 'node:assert/strict'
import { merge3 } from './merge.ts'
import { emptyState, parseBackup, exportJson, type State } from './store.ts'
import type { Sale } from './rules.ts'

const sale = (id: string, extra: Partial<Sale> = {}): Sale => ({ id, billNo: id, date: '2026-11-25', cat: 'water', customerId: '', productId: 'w250', qty: 1, price: 40000, staff: { transport: 'a', onsite: '', follow: '', warehouse: '' }, status: 'pending', ...extra })
const start = (): State => ({ ...emptyState(), staff: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], sales: [sale('1'), sale('2')] })
const copy = (s: State): State => structuredClone(s)
const ids = (s: State) => s.sales.map((x) => x.id).sort().join()

test('nothing changed here: take the server state as it is', () => {
  const base = start(), remote = copy(base)
  remote.sales.push(sale('9'))
  assert.equal(merge3(base, base, remote), remote)
})

test('bills added on two devices are both kept', () => {
  const base = start(), local = copy(base), remote = copy(base)
  local.sales.push(sale('L'))
  remote.sales.push(sale('R'))
  assert.equal(ids(merge3(base, local, remote)), '1,2,L,R')
})

test('an edit here wins, an edit there is kept, a delete on either side sticks', () => {
  const base = start(), local = copy(base), remote = copy(base)
  local.sales[0].qty = 7 // edit bill 1 here
  remote.sales[1].qty = 9 // edit bill 2 there
  const m = merge3(base, local, remote)
  assert.deepEqual(m.sales.map((x) => x.qty), [7, 9])
  const l2 = copy(base), r2 = copy(base)
  l2.sales.shift() // delete bill 1 here
  r2.sales.pop() // delete bill 2 there
  assert.equal(ids(merge3(base, l2, r2)), '')
})

test('rules changed there are kept when not touched here, and the other way round', () => {
  const base = start(), local = copy(base), remote = copy(base)
  remote.settings.fuel = 2500
  local.sales.push(sale('L'))
  assert.equal(merge3(base, local, remote).settings.fuel, 2500)
  const l2 = copy(base)
  l2.settings.cutoffDay = 25
  assert.equal(merge3(base, l2, copy(base)).settings.cutoffDay, 25)
})

test('a person deleted on one device comes back if another device recorded a bill for them', () => {
  const base = start(), local = copy(base), remote = copy(base)
  remote.staff = remote.staff.filter((x) => x.id !== 'b') // manager deletes B, who had no records
  remote.followIds = []
  local.sales.push(sale('L', { staff: { transport: 'b', onsite: '', follow: '', warehouse: '' } })) // meanwhile a bill for B
  const m = merge3(base, local, remote)
  assert.ok(m.staff.some((x) => x.id === 'b'))
  assert.ok('state' in parseBackup(exportJson(m)), 'merged data still passes the full check')
})
