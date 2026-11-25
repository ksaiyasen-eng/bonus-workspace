import { createContext, useContext, useState, type ReactNode } from 'react'
import type { State } from './store.ts'
import type { Role } from './sync.ts'
import { fmtDate, shiftDate, today, type Sale } from './rules.ts'

export const Ctx = createContext<{
  s: State
  set: (fn: (s: State) => State) => void
  toast: (m: string) => void
  role: Role // local mode has no sign-in, so it is always the manager
  remote: boolean
  /** Shared mode only. Returns a Lao message when it fails. */
  changePin?: (role: Role, pin: string) => Promise<string | null>
}>(null!)
export const useApp = () => useContext(Ctx)

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  water: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  bag: 'M6 8h12l1 13H5L6 8zM9 8V6a3 3 0 0 1 6 0v2',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  stock: 'M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8',
  reports: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1',
  menu: 'M4 6h16M4 12h16M4 18h16',
  device: 'M5 4h14v12H5zM2 20h20',
}
export const Icon = ({ name }: { name: string }) => (
  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
)

export const WAIT = 'ລໍຖ້າຕັ້ງຄ່າ'
export const STATUS_LABEL: Record<Sale['status'], string> = { pending: 'ລໍຖ້າອະນຸມັດ', approved: 'ຮັບຮອງແລ້ວ', rejected: 'ຖືກປະຕິເສດ' }
const STATUS_KIND = { pending: 'pending', approved: 'ok', rejected: 'bad' } as const

/** One status look for the whole app. The text carries the meaning, colour only helps. */
export const Status = ({ kind, children }: { kind: 'pending' | 'ok' | 'bad' | 'wait'; children: ReactNode }) => (
  <span className={`st st-${kind}`}>{children}</span>
)
export const SaleStatus = ({ status }: { status: Sale['status'] }) => <Status kind={STATUS_KIND[status]}>{STATUS_LABEL[status]}</Status>
export const Wait = ({ why }: { why?: string }) => <Status kind="wait">{WAIT}{why ? ` · ${why}` : ''}</Status>

export function Card({ title, action, children, id }: { title?: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="card" id={id}>
      {(title || action) && <header className="card-head"><h2>{title}</h2>{action}</header>}
      {children}
    </section>
  )
}

export function Empty({ text, action, to, onClick, primary }: { text: string; action?: string; to?: string; onClick?: () => void; primary?: boolean }) {
  const cls = primary ? 'btn btn-primary' : 'btn'
  return (
    <div className="empty" data-ui={action ? 'empty' : undefined}>
      <p>{text}</p>
      {action && (to ? <a className={cls} href={to}>{action}</a> : <button type="button" className={cls} onClick={onClick}>{action}</button>)}
    </div>
  )
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className={`field${error ? ' has-err' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
      {error && <small className="err" role="alert">ກອກຜິດ: {error}</small>}
    </label>
  )
}

export function DateNav({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  return (
    <div className="datenav">
      <button type="button" className="btn" onClick={() => onChange(shiftDate(value, -1))}>‹ ມື້ກ່ອນ</button>
      <input type="date" aria-label="ເລືອກວັນທີເບິ່ງຍອດ" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button type="button" className="btn" onClick={() => onChange(shiftDate(value, 1))}>ມື້ຕໍ່ໄປ ›</button>
      <button type="button" className="btn" onClick={() => onChange(today())} disabled={value === today()}>ມື້ນີ້</button>
      <strong className="datenav-label">ວັນທີ {fmtDate(value)}</strong>
    </div>
  )
}

/** Edit and delete for one table row. Delete asks once more in place, because it cannot be undone. */
export function RowActions({ what, onEdit, onDelete }: { what: string; onEdit?: () => void; onDelete: () => void }) {
  const [ask, setAsk] = useState(false)
  return ask ? (
    <div className="row">
      <button type="button" className="btn btn-sm btn-danger" onClick={() => { setAsk(false); onDelete() }}>ລຶບ{what}ນີ້</button>
      <button type="button" className="btn btn-sm" onClick={() => setAsk(false)}>ບໍ່ລຶບ</button>
    </div>
  ) : (
    <div className="row">
      {onEdit && <button type="button" className="btn btn-sm" onClick={onEdit}>ແກ້ໄຂ</button>}
      <button type="button" className="btn btn-sm btn-danger" onClick={() => setAsk(true)}>ລຶບ</button>
    </div>
  )
}

export function downloadText(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Moves the cursor to the first field of the form on the page. */
export const focusForm = () => document.querySelector<HTMLElement>('main form input, main form select')?.focus()

export const Table = ({ head, children }: { head: string[]; children: ReactNode }) => (
  <div className="table-wrap" data-ui="content" tabIndex={0} role="region" aria-label="ຕາຕະລາງ ເລື່ອນຂ້າງໄດ້">
    <table>
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
)
