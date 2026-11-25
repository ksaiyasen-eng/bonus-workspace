import type { State } from './store.ts'

// Two devices can save at almost the same time. Instead of the later one wiping the earlier one,
// each device merges: what it changed since it last synced wins, everything else comes from the server.

type Row = { id: string }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const LISTS = ['staff', 'customers', 'products', 'sales', 'cash', 'moves', 'cancels', 'payouts', 'claims'] as const

function mergeList<T extends Row>(base: T[], local: T[], remote: T[]): T[] {
  const was = new Map(base.map((x) => [x.id, x]))
  const mine = new Map(local.map((x) => [x.id, x]))
  const out: T[] = []
  for (const r of remote) {
    const m = mine.get(r.id), b = was.get(r.id)
    if (!m) { if (!b) out.push(r); continue } // new on the server: keep. Gone here but known before: deleted here.
    out.push(b && !same(m, b) ? m : r) // edited here: mine wins
  }
  const onServer = new Set(remote.map((x) => x.id))
  for (const m of local) if (!onServer.has(m.id) && !was.has(m.id)) out.push(m) // added here. Known before but gone from the server: deleted there.
  return out
}

export function merge3(base: State, local: State, remote: State): State {
  if (local === base) return remote
  const out = { ...remote } as State
  for (const k of LISTS) (out[k] as Row[]) = mergeList(base[k] as Row[], local[k] as Row[], remote[k] as Row[])
  for (const k of ['followIds', 'warehouseIds', 'settings'] as const) if (!same(local[k], base[k])) (out[k] as unknown) = local[k]

  // One device may delete a person or product while another records a bill for them. Bring those back, so no record points at nothing.
  const restore = <T extends Row>(k: 'staff' | 'customers' | 'products', ids: Iterable<string | undefined>) => {
    const have = new Set((out[k] as Row[]).map((x) => x.id))
    for (const id of ids) {
      if (!id || have.has(id)) continue
      const found = [...local[k], ...remote[k], ...base[k]].find((x) => x.id === id) as T | undefined
      if (found) { (out[k] as Row[]).push(found); have.add(id) }
    }
  }
  restore('products', [...out.sales.map((x) => x.productId), ...out.moves.map((x) => x.productId)])
  restore('customers', out.sales.map((x) => x.customerId))
  restore('staff', [...out.sales.flatMap((x) => Object.values(x.staff)), ...out.cash.map((x) => x.followId), ...out.moves.map((x) => x.staffId), ...out.payouts.map((x) => x.staffId), ...out.claims.map((x) => x.staffId)])
  const staffIds = new Set(out.staff.map((x) => x.id))
  out.followIds = out.followIds.filter((id) => staffIds.has(id))
  out.warehouseIds = out.warehouseIds.filter((id) => staffIds.has(id))
  return out
}
