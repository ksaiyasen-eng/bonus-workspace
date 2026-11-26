// Calculation rules only. No screen code here, so rules can be changed and tested alone.
// Run the checks with: npm test

export type Cat = 'water' | 'bag'
export const ROLES = ['transport', 'onsite', 'follow', 'warehouse'] as const
export type Role = (typeof ROLES)[number]

export interface Product {
  id: string
  name: string
  cat: Cat
  cost: number
  minProfit: number
  recommended: number
  ceiling: number | null
  firstTier: number | null // first-tier price, used only when there is no ceiling
}

export interface Settings {
  base: number // base commission, kip per pack
  pct: Record<Role, number>
  emptyRole: 'transport' | 'company'
  overSharePct: number // staff share of the amount sold above the recommended price
  fuel: number // kip per pack
  tier2From: number
  tier3From: number
  cutoffDay: number // shortcut: unused since calendar-month periods were confirmed, kept so stored data still passes the server check; drop with the next server deploy
  approver: string
  approvalOn: boolean
}

export interface Sale {
  id: string
  billNo: string
  date: string // YYYY-MM-DD
  cat: Cat
  customerId: string
  productId: string
  qty: number
  price: number // kip per pack
  staff: Record<Role, string> // staff id per role, '' = nobody
  status: 'pending' | 'approved' | 'rejected'
  decidedAt?: string // set when approved or rejected; an edit clears them
  decidedBy?: string
}

export const DEFAULT_SETTINGS: Settings = {
  base: 3000,
  pct: { transport: 50, onsite: 25, follow: 10, warehouse: 15 },
  emptyRole: 'transport',
  overSharePct: 0,
  fuel: 2000,
  tier2From: 10,
  tier3From: 100,
  cutoffDay: 20,
  approver: '',
  approvalOn: false,
}

export const DEFAULT_PRODUCTS: Product[] = [
  { id: 'w250', name: 'ນ້ຳ 250 ມລ.', cat: 'water', cost: 27000, minProfit: 3000, recommended: 38000, ceiling: 40000, firstTier: null },
  { id: 'w600', name: 'ນ້ຳ 600 ມລ.', cat: 'water', cost: 27000, minProfit: 3000, recommended: 38000, ceiling: 40000, firstTier: null },
  { id: 'w2l', name: 'ນ້ຳ 2 ລິດ', cat: 'water', cost: 32000, minProfit: 3000, recommended: 44000, ceiling: 48000, firstTier: null },
  { id: 'bagblack', name: 'ຖົງຂີ້ເຫຍື້ອດຳ', cat: 'bag', cost: 31000, minProfit: 2000, recommended: 38000, ceiling: null, firstTier: 40000 },
]

// ---- prices ----

export const minPrice = (p: Product, s: Settings) => p.cost + p.minProfit + s.base + s.fuel

/** Price per pack for tier 1, 2, 3. */
export const tierPrices = (p: Product, s: Settings): [number, number, number] => [
  p.ceiling ?? p.firstTier ?? p.recommended,
  p.recommended,
  minPrice(p, s),
]

export const tierIndex = (qty: number, s: Settings) => (qty >= s.tier3From ? 2 : qty >= s.tier2From ? 1 : 0)
export const tierPrice = (p: Product, qty: number, s: Settings) => tierPrices(p, s)[tierIndex(qty, s)]

/** Company share per pack at a given price. */
export const companyPerPack = (price: number, p: Product, s: Settings) => price - p.cost - s.base - s.fuel

/** Returns a Lao message when the product prices do not fit together, or null when fine. */
export function priceCheck(p: Product, s: Settings): string | null {
  const [t1, t2, t3] = tierPrices(p, s)
  if (t2 < t3) return 'ລາຄາແນະນຳຕ່ຳກວ່າລາຄາຕ່ຳສຸດ'
  if (t1 < t2) return 'ລາຄາຂັ້ນທຳອິດຕ່ຳກວ່າລາຄາແນະນຳ'
  return null
}

// ---- commission ----

export const pctTotal = (s: Settings) => ROLES.reduce((a, r) => a + s.pct[r], 0)

/** Base commission per pack for each role. The share of an empty role moves by the setting. */
export function splitBase(filled: Record<Role, boolean>, s: Settings): Record<Role | 'company', number> {
  const out = { transport: 0, onsite: 0, follow: 0, warehouse: 0, company: 0 }
  for (const r of ROLES) {
    const amount = (s.base * s.pct[r]) / 100
    if (filled[r]) out[r] += amount
    // confirmed 2026-11-26: when transport itself is empty, every empty share goes to the company
    else if (s.emptyRole === 'transport' && filled.transport) out.transport += amount
    else out.company += amount
  }
  return out
}

export interface SaleCalc {
  revenue: number
  cost: number
  fuel: number
  staff: Record<Role, number>
  staffTotal: number
  atTier: boolean
  company: number // confirmed 2026-11-26: the company keeps all that is left, also when the price differs from the tier price
}

// shortcut: uses today's cost and settings for old bills too, snapshot them on the bill once that rule is confirmed
export function saleCalc(x: Sale, p: Product, s: Settings): SaleCalc {
  const per = splitBase({ transport: !!x.staff.transport, onsite: !!x.staff.onsite, follow: !!x.staff.follow, warehouse: !!x.staff.warehouse }, s)
  const staff = { transport: per.transport * x.qty, onsite: per.onsite * x.qty, follow: per.follow * x.qty, warehouse: per.warehouse * x.qty }
  const staffTotal = ROLES.reduce((a, r) => a + staff[r], 0)
  const revenue = x.qty * x.price
  const cost = x.qty * p.cost
  const fuel = x.qty * s.fuel
  const atTier = x.price === tierPrice(p, x.qty, s)
  return { revenue, cost, fuel, staff, staffTotal, atTier, company: revenue - cost - fuel - staffTotal }
}

// ---- dates (business dates are YYYY-MM-DD strings) ----

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date())
export const fmtDate = (iso: string) => iso.split('-').reverse().join('/')
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
export const shiftDate = (d: string, n: number) => {
  const [y, m, day] = d.split('-').map(Number)
  return iso(y, m - 1, day + n)
}

/** Pay period = calendar month, first to last day (confirmed 2026-11-26). */
export function periodRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  return [`${ym}-01`, iso(y, m, 0)]
}
export const periodOf = (date: string) => date.slice(0, 7)

export const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
export const kip = (n: number) => `${num(n)} ກີບ`
