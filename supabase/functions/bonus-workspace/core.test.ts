import test from 'node:test'
import assert from 'node:assert/strict'
import { handle, hashPin, memoryStore, staffBlock, stable } from './core.ts'

const sale = (id: string, status: string, qty = 1) => ({ id, billNo: `W-${id}`, date: '2026-11-25', cat: 'water', customerId: '', productId: 'p', qty, price: 40000, staff: { transport: 'a', onsite: '', follow: '', warehouse: '' }, status })
const data = () => ({
  staff: [{ id: 'a', name: 'A' }], customers: [] as { id: string; name: string }[], followIds: [] as string[], warehouseIds: [] as string[],
  products: [{ id: 'p', name: 'P', cat: 'water', cost: 1, minProfit: 0, recommended: 2, ceiling: null, firstTier: null }],
  sales: [sale('1', 'approved'), sale('2', 'pending')],
  cash: [], moves: [], cancels: [], payouts: [] as { id: string; ym: string; cat: string; staffId: string; amount: number; date: string }[],
  claims: [{ id: 'k1', ym: '2026-12', staffId: 'a', amount: 1000, date: '2026-11-25', note: '', status: 'paid' }, { id: 'k2', ym: '2026-12', staffId: 'a', amount: 500, date: '2026-11-25', note: '', status: 'requested' }] as { id: string; ym: string; staffId: string; amount: number; date: string; note: string; status: string }[],
  settings: { base: 3000, fuel: 2000, overSharePct: 0, tier2From: 10, tier3From: 100, cutoffDay: 20, pct: { transport: 50, onsite: 25, follow: 10, warehouse: 15 } },
})
const setup = async () => {
  const store = memoryStore({ manager: await hashPin('11112222'), staff: await hashPin('33334444') })
  const login = async (pin: string) => (await handle({ action: 'login', pin }, 'ip', store)).body.token as string
  return { store, manager: await login('11112222'), staff: await login('33334444') }
}

test('login: right PIN gives its role, wrong PIN is refused and locks after 10 tries', async () => {
  const { store } = await setup()
  assert.equal((await handle({ action: 'login', pin: '33334444' }, 'x', store)).body.role, 'staff')
  for (let i = 0; i < 9; i++) assert.equal((await handle({ action: 'login', pin: '00000000' }, 'x', store)).status, 401)
  assert.equal((await handle({ action: 'login', pin: '33334444' }, 'x', store)).status, 429)
  assert.equal((await handle({ action: 'login', pin: '33334444' }, 'other-ip', store)).status, 200)
})

test('200 wrong PINs sent at the same moment: at most 10 are even looked at', async () => {
  const { store } = await setup()
  const all = await Promise.all(Array.from({ length: 200 }, () => handle({ action: 'login', pin: '00000000' }, 'burst', store)))
  assert.ok(all.filter((r) => r.status === 401).length <= 10)
  assert.equal(all.filter((r) => r.status === 429).length >= 190, true)
})

test('tries from many addresses together are capped too', async () => {
  const { store } = await setup()
  for (let i = 0; i < 100; i++) await handle({ action: 'login', pin: '00000000' }, `ip-${i}`, store)
  assert.equal((await handle({ action: 'login', pin: '33334444' }, 'fresh-ip', store)).status, 429)
})

test('a token does not verify without the server secret it was signed with', async () => {
  const store = memoryStore({ manager: await hashPin('11112222') })
  const token = (await handle({ action: 'login', pin: '11112222' }, 'ip', store, Date.now(), 'secret-a')).body.token
  assert.equal((await handle({ action: 'load', token }, 'ip', store, Date.now(), 'secret-a')).status, 200)
  assert.equal((await handle({ action: 'load', token }, 'ip', store, Date.now(), 'secret-b')).status, 401)
})

test('no token, a made-up token and an expired token are refused', async () => {
  const { store, manager } = await setup()
  assert.equal((await handle({ action: 'load' }, 'ip', store)).status, 401)
  assert.equal((await handle({ action: 'load', token: `manager.${Date.now() + 1e6}.abc` }, 'ip', store)).status, 401)
  assert.equal((await handle({ action: 'load', token: manager.replace('manager', 'staff') }, 'ip', store)).status, 401)
  assert.equal((await handle({ action: 'load', token: manager }, 'ip', store, Date.now() + 31 * 864e5)).status, 401)
  assert.equal((await handle({ action: 'load', token: manager }, 'ip', store)).status, 200)
})

test('save: version check stops one device overwriting another', async () => {
  const { store, manager } = await setup()
  assert.deepEqual((await handle({ action: 'save', token: manager, data: data(), baseVersion: 0 }, 'ip', store)).body, { version: 1 })
  const stale = await handle({ action: 'save', token: manager, data: data(), baseVersion: 0 }, 'ip', store)
  assert.equal(stale.status, 409)
  assert.equal(stale.body.version, 1)
  const bad = await handle({ action: 'save', token: manager, data: { nope: 1 }, baseVersion: 1 }, 'ip', store)
  assert.equal(bad.status, 400)
  assert.ok(bad.body.detail)
})

test('staff may record, but not approve, change rules or prices, or touch decided bills', async () => {
  const { store, manager, staff } = await setup()
  assert.equal((await handle({ action: 'save', token: staff, data: data(), baseVersion: 0 }, 'ip', store)).status, 403) // first save is the manager's
  await handle({ action: 'save', token: manager, data: data(), baseVersion: 0 }, 'ip', store)
  const tryStaff = async (change: (d: ReturnType<typeof data>) => void) => {
    const d = data(); change(d)
    return (await handle({ action: 'save', token: staff, data: d, baseVersion: store.row!.version }, 'ip', store)).status
  }
  assert.equal(await tryStaff((d) => { d.settings.base = 1 }), 403)
  assert.equal(await tryStaff((d) => { d.products[0].cost = 2 }), 403)
  assert.equal(await tryStaff((d) => { d.payouts.push({ id: 'x', ym: '2026-12', cat: 'water', staffId: 'a', amount: 1, date: '2026-12-01' }) }), 403)
  assert.equal(await tryStaff((d) => { d.staff.push({ id: 'b', name: 'B' }) }), 403)
  assert.equal(await tryStaff((d) => { (d.cancels as unknown[]).push({ id: 'x', billNo: 'W-1', date: '2026-11-25', cat: 'water' }) }), 403) // cancelled-bill records are the manager's
  assert.equal(await tryStaff((d) => { d.sales[1].status = 'approved' }), 403) // approve
  assert.equal(await tryStaff((d) => { d.sales[0].qty = 9 }), 403) // edit an approved bill
  assert.equal(await tryStaff((d) => { d.sales.shift() }), 403) // delete an approved bill
  assert.equal(await tryStaff((d) => { d.sales.push(sale('3', 'approved')) }), 403)
  // pay claims: staff may ask and withdraw while waiting; paying, rejecting and paid claims are the manager's
  const claim = (id: string, status: string, amount = 100) => ({ id, ym: '2026-12', staffId: 'a', amount, date: '2026-11-25', note: '', status })
  assert.equal(await tryStaff((d) => { d.claims[1].status = 'paid' }), 403) // mark own claim paid
  assert.equal(await tryStaff((d) => { d.claims[0].amount = 9999 }), 403) // change a paid claim
  assert.equal(await tryStaff((d) => { d.claims.shift() }), 403) // delete a paid claim
  assert.equal(await tryStaff((d) => { d.claims.push(claim('k3', 'paid')) }), 403) // add a claim already paid
  assert.equal(await tryStaff((d) => { d.claims.push(claim('k3', 'requested')); d.claims[1].amount = 600 }), 200)
  assert.equal(await tryStaff((d) => { d.claims = d.claims.filter((c) => c.id === 'k1') }), 200) // withdraw waiting claims
  assert.equal(await tryStaff((d) => { d.claims.push(claim('k4', 'requested', 0)) }), 400) // zero amount fails the data check
  // the same id twice must not hide a forged approved bill behind a harmless one
  assert.equal(await tryStaff((d) => { d.sales.unshift(sale('1', 'approved', 999)) }), 400)
  assert.equal(await tryStaff((d) => { d.sales.push(sale('3', 'approved'), sale('3', 'pending')) }), 400)
  // data that would fail the full check on every device is refused, not stored
  assert.equal(await tryStaff((d) => { d.sales.push({ ...sale('3', 'pending'), productId: 'gone' }) }), 400)
  assert.equal(await tryStaff((d) => { d.sales.push(sale('3', 'pending')); d.sales[1].qty = 5; d.customers.push({ id: 'c', name: 'C' }) }), 200)
})

test('stored data with old payout marks: a staff save is not refused because of the conversion', async () => {
  const { store, manager, staff } = await setup()
  await handle({ action: 'save', token: manager, data: data(), baseVersion: 0 }, 'ip', store)
  store.row!.data.payouts = [{ id: 'old1', ym: '2026-12', cat: 'water', staffId: 'a', amount: 3000, date: '2026-12-01' }] // as an old page left it
  const d = data()
  d.claims.push({ id: 'old1', ym: '2026-12', staffId: 'a', amount: 3000, date: '2026-12-01', note: 'ຍ້າຍມາຈາກການໝາຍຈ່າຍເດີມ', status: 'paid', decidedAt: '2026-12-01' } as never)
  d.sales.push(sale('9', 'pending'))
  assert.equal((await handle({ action: 'save', token: staff, data: d, baseVersion: 1 }, 'ip', store)).status, 200)
  // and a staff save that silently drops the converted paid claim is still refused
  const drop = data(); drop.sales.push(sale('10', 'pending'))
  store.row!.data.payouts = [{ id: 'old2', ym: '2026-12', cat: 'water', staffId: 'a', amount: 1, date: '2026-12-01' }]
  assert.equal((await handle({ action: 'save', token: staff, data: drop, baseVersion: 2 }, 'ip', store)).status, 403)
})

test('key order from the database does not look like a change', () => {
  const a = data(), b = JSON.parse(JSON.stringify(data()))
  b.settings = { ...b.settings }
  b.sales = b.sales.map((x: any) => Object.fromEntries(Object.entries(x).reverse()))
  assert.equal(staffBlock(a, b), null)
  assert.equal(stable({ b: 1, a: [{ d: 1, c: undefined }] }), '{"a":[{"d":1}],"b":1}')
})

test('PIN change: manager only, 8 digits, the two PINs must differ, old sign-ins stop working', async () => {
  const { store, manager, staff } = await setup()
  assert.equal((await handle({ action: 'setPin', token: staff, role: 'staff', newPin: '55556666' }, 'ip', store)).status, 403)
  assert.equal((await handle({ action: 'setPin', token: manager, role: 'staff', newPin: '123' }, 'ip', store)).status, 400)
  assert.equal((await handle({ action: 'setPin', token: manager, role: 'staff', newPin: '11112222' }, 'ip', store)).body.error, 'same-pin')
  assert.equal((await handle({ action: 'setPin', token: manager, role: 'staff', newPin: '55556666' }, 'ip', store)).status, 200)
  assert.equal((await handle({ action: 'load', token: staff }, 'ip', store)).status, 401)
  assert.equal((await handle({ action: 'login', pin: '55556666' }, 'ip', store)).body.role, 'staff')
  const r = await handle({ action: 'setPin', token: manager, role: 'manager', newPin: '77778888' }, 'ip', store)
  assert.equal((await handle({ action: 'load', token: manager }, 'ip', store)).status, 401)
  assert.equal((await handle({ action: 'load', token: r.body.token }, 'ip', store)).status, 200)
})
