import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PRODUCTS as P, DEFAULT_SETTINGS as S, companyPerPack, minPrice, pctTotal, periodOf, periodRange,
  priceCheck, saleCalc, shiftDate, fmtDate, splitBase, tierPrice, type Sale,
} from './rules.ts'

// name -> [min price, tier prices at 1/9/10/99/100 packs, company share per tier]
const EXPECT: Record<string, [number, number[], number[]]> = {
  w250: [35000, [40000, 40000, 38000, 38000, 35000], [8000, 6000, 3000]],
  w600: [35000, [40000, 40000, 38000, 38000, 35000], [8000, 6000, 3000]],
  w2l: [40000, [48000, 48000, 44000, 44000, 40000], [11000, 7000, 3000]],
  bagblack: [38000, [40000, 40000, 38000, 38000, 38000], [4000, 2000, 2000]],
}

test('tier prices at 9/10 and 99/100, min price, company share', () => {
  for (const p of P) {
    const [min, prices, shares] = EXPECT[p.id]
    assert.equal(minPrice(p, S), min, p.name)
    assert.deepEqual([1, 9, 10, 99, 100].map((q) => tierPrice(p, q, S)), prices, p.name)
    assert.deepEqual([1, 10, 100].map((q) => companyPerPack(tierPrice(p, q, S), p, S)), shares, p.name)
    assert.equal(priceCheck(p, S), null, p.name)
  }
})

test('base commission split', () => {
  assert.equal(pctTotal(S), 100)
  const all = { transport: true, onsite: true, follow: true, warehouse: true }
  assert.deepEqual(splitBase(all, S), { transport: 1500, onsite: 750, follow: 300, warehouse: 450, company: 0 })
  // empty role goes to transport by default
  assert.deepEqual(splitBase({ ...all, follow: false, warehouse: false }, S), { transport: 2250, onsite: 750, follow: 0, warehouse: 0, company: 0 })
  // or to the company when set so
  assert.deepEqual(splitBase({ ...all, follow: false }, { ...S, emptyRole: 'company' }), { transport: 1500, onsite: 750, follow: 0, warehouse: 450, company: 300 })
})

test('sale totals', () => {
  const sale: Sale = { id: '1', billNo: 'B1', date: '2026-11-25', cat: 'water', customerId: '', productId: 'w250', qty: 10, price: 38000, staff: { transport: 'a', onsite: 'b', follow: 'c', warehouse: 'd' }, status: 'approved' }
  const c = saleCalc(sale, P[0], S)
  assert.deepEqual([c.revenue, c.cost, c.fuel, c.staffTotal, c.company], [380000, 270000, 20000, 30000, 60000])
  assert.deepEqual(c.staff, { transport: 15000, onsite: 7500, follow: 3000, warehouse: 4500 })
  // price off the tier: company share waits for the rule
  assert.equal(saleCalc({ ...sale, price: 39000 }, P[0], S).company, null)
})

test('dates and periods', () => {
  assert.deepEqual(periodRange('2026-11', 20), ['2026-10-21', '2026-11-20'])
  assert.deepEqual(periodRange('2027-01', 20), ['2026-12-21', '2027-01-20'])
  assert.equal(periodOf('2026-11-20', 20), '2026-11')
  assert.equal(periodOf('2026-11-21', 20), '2026-12')
  assert.equal(periodOf('2026-12-25', 20), '2027-01')
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01')
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28')
  assert.equal(fmtDate('2026-11-25'), '25/11/2026')
})
