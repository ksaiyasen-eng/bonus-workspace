import { DEFAULT_PRODUCTS, DEFAULT_SETTINGS, saleCalc, type Cat, type Product, type Sale, type Settings } from './rules.ts'
import { check as checkData } from '../supabase/functions/bonus-workspace/check.ts'

export interface Named { id: string; name: string }
export interface Cash { id: string; date: string; cat: Cat; followId: string; amount: number }
export interface Move { id: string; date: string; type: 'out' | 'return' | 'damage'; productId: string; qty: number; note: string; staffId?: string } // staffId: who the goods were issued to or came back from
/** Marks that a person's commission for one period and category was paid. `amount` is what was due when it was marked. */
export interface Payout { id: string; ym: string; cat: Cat; staffId: string; amount: number; date: string }
export interface Cancel { id: string; billNo: string; date: string; cat?: Cat } // cat is missing on entries saved before the field existed

export interface State {
  staff: Named[]
  customers: Named[]
  followIds: string[]
  warehouseIds: string[]
  products: Product[]
  sales: Sale[]
  cash: Cash[]
  moves: Move[]
  cancels: Cancel[]
  payouts: Payout[]
  settings: Settings
}

const KEY = 'bonus-workspace/v1'
export const BACKUP_VERSION = 1

export const emptyState = (): State => ({
  staff: [], customers: [], followIds: [], warehouseIds: [],
  products: structuredClone(DEFAULT_PRODUCTS),
  sales: [], cash: [], moves: [], cancels: [], payouts: [],
  settings: structuredClone(DEFAULT_SETTINGS),
})

const BROKEN_KEY = `${KEY}.unreadable`

export function load(): State {
  const raw = localStorage.getItem(KEY)
  if (!raw) return emptyState()
  try {
    return check(JSON.parse(raw))
  } catch {
    // The app saves right after loading, so keep the unreadable text aside first. The oldest copy wins: it holds the real data.
    if (!localStorage.getItem(BROKEN_KEY)) localStorage.setItem(BROKEN_KEY, raw)
    return emptyState()
  }
}
export const brokenCopy = () => localStorage.getItem(BROKEN_KEY)
export const dropBrokenCopy = () => localStorage.removeItem(BROKEN_KEY)
export const save = (s: State) => localStorage.setItem(KEY, JSON.stringify(s))

export const uid = () => crypto.randomUUID()
export const nameOf = (list: Named[], id: string) => list.find((x) => x.id === id)?.name ?? '—'
export const CAT_LABEL: Record<Cat, string> = { water: 'ນ້ຳແພັກ', bag: 'ຖົງຂີ້ເຫຍື້ອ' }

export const withCalc = (s: State, sales: Sale[]) =>
  sales.flatMap((x) => {
    const p = s.products.find((p) => p.id === x.productId)
    return p ? [{ x, p, c: saleCalc(x, p, s.settings) }] : []
  })

// ---- backup ----

export const exportJson = (s: State) =>
  JSON.stringify({ app: 'bonus-workspace', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: s }, null, 2)

export const check = checkData as (d: any) => State

export function parseBackup(text: string): { state: State } | { error: string } {
  try {
    const j = JSON.parse(text)
    if (j?.app !== 'bonus-workspace') return { error: 'ໄຟລ໌ນີ້ບໍ່ແມ່ນໄຟລ໌ສຳຮອງຂອງ Bonus Workspace ເລືອກໄຟລ໌ທີ່ດາວໂຫຼດຈາກໜ້ານີ້' }
    if (j.version !== BACKUP_VERSION) return { error: `ໄຟລ໌ເປັນເວີຊັນ ${j.version} ແຕ່ແອັບຮອງຮັບເວີຊັນ ${BACKUP_VERSION} ເທົ່ານັ້ນ` }
    return { state: check(j.data) }
  } catch (e) {
    return { error: e instanceof SyntaxError ? 'ອ່ານໄຟລ໌ບໍ່ໄດ້ ໄຟລ໌ຕ້ອງເປັນ JSON ທີ່ດາວໂຫຼດຈາກໜ້ານີ້' : `ຂໍ້ມູນໃນໄຟລ໌ບໍ່ຄົບ: ${(e as Error).message}` }
  }
}
