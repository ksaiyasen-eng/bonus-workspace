import { useEffect, useState, type FormEvent } from 'react'
import { ROLES, fmtDate, kip, num, periodOf, periodRange, today, type Cat, type Role, type Sale } from '../rules.ts'
import { CAT_LABEL, isCancelled, uid, withCalc } from '../store.ts'
import { Card, Empty, Field, RowActions, SaleStatus, Status, Table, Wait, useApp } from '../ui.tsx'
import { ROLE_LABEL } from './Sale.tsx'
import { Claims } from './Claims.tsx'

const TABS = [['water', 'ນ້ຳແພັກ'], ['bag', 'ຖົງຂີ້ເຫຍື້ອ'], ['pending', 'ລໍຖ້າອະນຸມັດ'], ['bills', 'ກວດເລກທີບິນ'], ['claims', 'ຂໍເບີກຄ່າຕອບແທນ']] as const

export function Reports({ tab = 'water' }: { tab?: string }) {
  const { s } = useApp()
  const now = periodOf(today())
  const [ym, setYm] = useState(now)
  const [from, to] = periodRange(ym)
  // next month, this month and 12 back
  const periods = Array.from({ length: 14 }, (_, i) => {
    const [y, m] = now.split('-').map(Number)
    return new Date(Date.UTC(y, m - i, 1)).toISOString().slice(0, 7)
  })
  const pending = s.sales.filter((x) => x.status === 'pending').length
  const claimsWaiting = s.claims.filter((x) => x.ym === ym && x.status === 'requested').length
  const active = TABS.some(([id]) => id === tab) ? tab : 'water'
  // on a phone the tab row scrolls sideways; keep the open tab in view
  useEffect(() => { document.querySelector('.tabs a.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [active])

  return (
    <>
      <div className="row">
        <Field label="ຮອບເດືອນ">
          <select value={ym} onChange={(e) => setYm(e.target.value)} style={{ minWidth: 240 }}>
            {periods.map((p) => { const [a, b] = periodRange(p); return <option key={p} value={p}>{fmtDate(a)} – {fmtDate(b)}</option> })}
          </select>
        </Field>
        <p className="muted">ຮອບເດືອນ ວັນທີ 1 ຫາທ້າຍເດືອນ · ບໍ່ນັບລາຍການລໍຖ້າອະນຸມັດ ຖືກປະຕິເສດ ແລະ ບິນຍົກເລີກ</p>
      </div>
      <nav className="tabs" aria-label="ພາກສ່ວນລາຍງານ">
        {TABS.map(([id, label]) => (
          <a key={id} data-ui="tab" href={`#/reports/${id}`} className={id === active ? 'on' : ''} aria-current={id === active ? 'page' : undefined}>
            {label}{id === 'pending' && pending > 0 ? ` (${pending})` : ''}{id === 'claims' && claimsWaiting > 0 ? ` (${claimsWaiting})` : ''}
          </a>
        ))}
      </nav>
      {(active === 'water' || active === 'bag') && <CatReport cat={active} from={from} to={to} />}
      {active === 'pending' && <Pending />}
      {active === 'bills' && <Bills from={from} to={to} />}
      {active === 'claims' && <Claims key={ym} ym={ym} from={from} to={to} />}
    </>
  )
}

function CatReport({ cat, from, to }: { cat: Cat; from: string; to: string }) {
  const { s } = useApp()
  const inRange = (d: string) => d >= from && d <= to
  const rows = withCalc(s, s.sales.filter((x) => x.cat === cat && x.status === 'approved' && !isCancelled(s, x) && inRange(x.date)))
  const products = s.products.filter((p) => p.cat === cat)
  const agg = (list: typeof rows) => ({
    qty: list.reduce((a, r) => a + r.x.qty, 0),
    revenue: list.reduce((a, r) => a + r.c.revenue, 0),
    cost: list.reduce((a, r) => a + r.c.cost, 0),
    fuel: list.reduce((a, r) => a + r.c.fuel, 0),
    staff: list.reduce((a, r) => a + r.c.staffTotal, 0),
    company: list.reduce((a, r) => a + r.c.company, 0),
  })
  const total = agg(rows)
  const damageCost = s.moves.reduce((a, m) => {
    const p = products.find((p) => p.id === m.productId)
    return a + (p && m.type === 'damage' && inRange(m.date) ? m.qty * p.cost : 0)
  }, 0)
  const byRole = (r: Role) => rows.reduce((a, x) => a + x.c.staff[r], 0)
  const people = s.staff
    .map((p) => ({ p, v: ROLES.map((r) => rows.reduce((a, x) => a + (x.x.staff[r] === p.id ? x.c.staff[r] : 0), 0)) }))
    .filter((x) => x.v.some((n) => n > 0))

  if (rows.length === 0)
    return (
      <Card title={`ລາຍງານ${CAT_LABEL[cat]}`}>
        <Empty text={`ຍັງບໍ່ມີລາຍການທີ່ຮັບຮອງແລ້ວໃນຮອບ ${fmtDate(from)} – ${fmtDate(to)}`} action="ເບິ່ງລາຍການລໍຖ້າອະນຸມັດ" to="#/reports/pending" />
      </Card>
    )

  return (
    <>
      <Card title={`${CAT_LABEL[cat]} · ຕາມສິນຄ້າ`}>
        <Table head={['ສິນຄ້າ', 'ຈຳນວນແພັກ', 'ລາຍຮັບ', 'ຕົ້ນທຶນ', 'ຄ່ານ້ຳມັນ', 'ສ່ວນພະນັກງານ', 'ສ່ວນບໍລິສັດ']}>
          {products.map((p) => {
            const a = agg(rows.filter((r) => r.p.id === p.id))
            return a.qty === 0 ? null : (
              <tr key={p.id}><td>{p.name}</td><td className="n">{num(a.qty)}</td><td className="n">{kip(a.revenue)}</td><td className="n">{kip(a.cost)}</td><td className="n">{kip(a.fuel)}</td><td className="n">{kip(a.staff)}</td><td className="n">{kip(a.company)}</td></tr>
            )
          })}
          <tr className="total"><td>ລວມ</td><td className="n">{num(total.qty)}</td><td className="n">{kip(total.revenue)}</td><td className="n">{kip(total.cost)}</td><td className="n">{kip(total.fuel)}</td><td className="n">{kip(total.staff)}</td><td className="n">{kip(total.company)}</td></tr>
        </Table>
        <p className="muted" style={{ marginTop: 8 }}>ສ່ວນບໍລິສັດ = ລາຍຮັບ − ຕົ້ນທຶນ − ຄ່ານ້ຳມັນ − ສ່ວນພະນັກງານ ລວມບິນທີ່ຂາຍລາຄາຕ່າງຈາກລາຄາຕາມຂັ້ນ</p>
      </Card>
      <div className="cols">
        <Card title="ສະຫຼຸບ">
          <dl className="kv">
            {cat === 'water' && <><dt>ຍອດສົ່ງສຳນັກງານໃຫຍ່ (ລາຄາທຶນ)</dt><dd>{kip(total.cost)}</dd></>}
            <dt>ສ່ວນບໍລິສັດຈາກການຂາຍ</dt><dd>{kip(total.company)}</dd>
            {cat === 'water' ? (
              <><dt>ຕົ້ນທຶນຂອງເສຍທີ່ບໍ່ໄດ້ເຄລມ</dt><dd><Wait why="ວິທີແຍກຂອງເຄລມ" /></dd><dt>ກຳໄລສຸດທິ</dt><dd><Wait /></dd></>
            ) : (
              <><dt>ຕົ້ນທຶນຂອງເສຍ</dt><dd>{kip(damageCost)}</dd><dt>ກຳໄລສຸດທິ</dt><dd>{kip(total.company - damageCost)}</dd></>
            )}
          </dl>
        </Card>
        <Card title="ເງິນພະນັກງານຕາມບົດບາດ">
          <dl className="kv">
            {ROLES.map((r) => <div key={r} style={{ display: 'contents' }}><dt>{ROLE_LABEL[r]}</dt><dd>{kip(byRole(r))}</dd></div>)}
            <dt><b>ລວມ</b></dt><dd>{kip(total.staff)}</dd>
          </dl>
        </Card>
      </div>
      <Card title="ເງິນພະນັກງານລາຍບຸກຄົນ" action={<a className="btn" href="#/reports/claims">ຕິດຕາມການຂໍເບີກ</a>}>
        <Table head={['ພະນັກງານ', ...ROLES.map((r) => ROLE_LABEL[r]), 'ລວມ']}>
          {people.map(({ p, v }) => (
            <tr key={p.id}><td>{p.name}</td>{v.map((n, i) => <td className="n" key={i}>{kip(n)}</td>)}<td className="n"><b>{kip(v.reduce((a, n) => a + n, 0))}</b></td></tr>
          ))}
        </Table>
        <p className="muted" style={{ marginTop: 8 }}>ການຂໍເບີກ ແລະ ການຈ່າຍເງິນ ຕິດຕາມຢູ່ແທັບ ຂໍເບີກຄ່າຕອບແທນ ລວມທັງສອງໝວດ</p>
        <p className="muted" style={{ marginTop: 8 }}>ຄົນດຽວຫຼາຍບົດບາດ: ສະແດງແຍກຕາມບົດບາດ ແລ້ວບວກລວມ ວິທີລວມລໍຖ້າຢືນຢັນ</p>
      </Card>
    </>
  )
}

function Pending() {
  const { s, set, toast, role, remote } = useApp()
  // shared mode: the manager PIN is the approval right. Local mode: the switch and approver name in settings.
  const can = remote ? role === 'manager' : s.settings.approvalOn && !!s.settings.approver.trim()
  const rows = withCalc(s, s.sales.filter((x) => x.status === 'pending'))
  const decide = (id: string, status: Sale['status'], bill: string) => {
    set((s) => ({ ...s, sales: s.sales.map((x) => (x.id === id ? { ...x, status, decidedAt: today(), decidedBy: s.settings.approver.trim() || 'ຜູ້ຈັດການ' } : x)) }))
    toast(`ບິນ ${bill}: ${status === 'approved' ? 'ຮັບຮອງແລ້ວ' : 'ຖືກປະຕິເສດ'}`)
  }
  return (
    <Card title="ລາຍການລໍຖ້າອະນຸມັດ">
      {!can && remote && <p className="note" style={{ marginBottom: 12 }}>ການຮັບຮອງ ແລະ ປະຕິເສດ ເຮັດໄດ້ສະເພາະຜູ້ຈັດການ</p>}
      {!can && !remote && <p className="note" style={{ marginBottom: 12 }}>ການອະນຸມັດຍັງປິດຢູ່ ເປີດໃຊ້ ແລະ ໃສ່ຊື່ຜູ້ອະນຸມັດທີ່ <a href="#/settings">ຕັ້ງຄ່າ</a> ຫຼັງຢືນຢັນສິດ ແລະ ຂັ້ນຕອນແລ້ວ</p>}
      {can && s.settings.approver && <p className="muted" style={{ marginBottom: 12 }}>ຜູ້ອະນຸມັດ: {s.settings.approver}</p>}
      {rows.length === 0 ? (
        <Empty text="ບໍ່ມີລາຍການລໍຖ້າອະນຸມັດ" action="ກັບໄປພາບລວມ" to="#/home" />
      ) : (
        <Table head={['ວັນທີ', 'ເລກທີບິນ', 'ໝວດ', 'ສິນຄ້າ', 'ຈຳນວນ', 'ຍອດຂາຍ', 'ສະຖານະ', 'ການອະນຸມັດ']}>
          {rows.map(({ x, p, c }) => (
            <tr key={x.id}>
              <td>{fmtDate(x.date)}</td><td>{x.billNo}</td><td>{CAT_LABEL[x.cat]}</td><td>{p.name}</td><td className="n">{num(x.qty)}</td><td className="n">{kip(c.revenue)}</td>
              <td><SaleStatus status={x.status} /></td>
              <td><div className="row">
                <button className="btn" disabled={!can} onClick={() => decide(x.id, 'approved', x.billNo)}>ຮັບຮອງ</button>
                <button className="btn btn-danger" disabled={!can} onClick={() => decide(x.id, 'rejected', x.billNo)}>ປະຕິເສດ</button>
              </div></td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  )
}

function Bills({ from, to }: { from: string; to: string }) {
  const { s, set, toast, role } = useApp()
  const manager = role === 'manager' // confirmed by the user 2026-11-25: only the manager records or removes cancelled bills
  const [f, setF] = useState({ billNo: '', date: today(), cat: 'water' as Cat })
  const [tried, setTried] = useState(false)
  const list = s.sales.filter((x) => x.date >= from && x.date <= to).sort((a, b) => a.billNo.localeCompare(b.billNo, undefined, { numeric: true }))
  const dup = (x: Sale) => list.filter((y) => y.billNo === x.billNo && y.cat === x.cat).length > 1
  const cancelled = (x: Sale) => isCancelled(s, x)
  const dups = list.filter(dup).length

  // checked on every render, shown after the first save attempt, so a message goes away once fixed
  const er: Record<string, string> = {}
  if (!f.billNo.trim()) er.billNo = 'ໃສ່ເລກທີບິນທີ່ຍົກເລີກ'
  if (!f.date) er.date = 'ເລືອກວັນທີ'
  const err = tried ? er : {}

  function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(er).length) return
    set((s) => ({ ...s, cancels: [...s.cancels, { id: uid(), billNo: f.billNo.trim(), date: f.date, cat: f.cat }] }))
    toast(`ບັນທຶກສຳເລັດ: ບິນຍົກເລີກ ${f.billNo.trim()}`)
    setF({ ...f, billNo: '' })
    setTried(false)
  }

  return (
    <>
      <Card title="ກວດເລກທີບິນໃນຮອບ">
        <div className="row" style={{ marginBottom: 12 }}>
          {dups > 0 ? <Status kind="bad">ພົບເລກທີບິນຊ້ຳ {dups} ແຖວ</Status> : <Status kind="ok">ບໍ່ພົບເລກທີບິນຊ້ຳ</Status>}
          <span className="muted">ກວດເລກທີບິນຂາດ: </span><Wait why="ວິທີກວດ" />
        </div>
        {list.length === 0 ? <Empty text="ຍັງບໍ່ມີບິນໃນຮອບນີ້" action="ໄປບັນທຶກຂາຍ" to="#/water" /> : (
          <Table head={['ເລກທີບິນ', 'ວັນທີ', 'ໝວດ', 'ສະຖານະ', 'ຜົນກວດ']}>
            {list.map((x) => (
              <tr key={x.id}>
                <td>{x.billNo}</td><td>{fmtDate(x.date)}</td><td>{CAT_LABEL[x.cat]}</td><td><SaleStatus status={x.status} /></td>
                <td>{dup(x) && <Status kind="bad">ເລກຊ້ຳ</Status>} {cancelled(x) && <Status kind="wait">ມີບັນທຶກຍົກເລີກ</Status>}{!dup(x) && !cancelled(x) && '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="ບັນທຶກບິນຍົກເລີກ">
        <p className="note" style={{ marginBottom: 12 }}>ບິນທີ່ບັນທຶກຍົກເລີກ ບໍ່ນັບເຂົ້າຍອດຂາຍ ຄ່າຕອບແທນ ແລະ ສະຕັອກ (ສິນຄ້າກັບຄືນສະຕັອກ) ແຕ່ຍັງສະແດງໃນລາຍການກວດເລກທີບິນ</p>
        {!manager && <p className="note" style={{ marginBottom: 12 }}>ການບັນທຶກ ແລະ ລຶບບິນຍົກເລີກ ເຮັດໄດ້ສະເພາະຜູ້ຈັດການ</p>}
        <fieldset className="gate" disabled={!manager}>
        <form className="form" data-ui="content" onSubmit={submit} noValidate>
          <Field label="ເລກທີບິນ" error={err.billNo}><input value={f.billNo} onChange={(e) => setF({ ...f, billNo: e.target.value })} autoComplete="off" /></Field>
          <Field label="ວັນທີ" error={err.date}><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="ໝວດ">
            <select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value as Cat })}>
              <option value="water">{CAT_LABEL.water}</option><option value="bag">{CAT_LABEL.bag}</option>
            </select>
          </Field>
          <div className="form-foot"><button className="btn" type="submit">ບັນທຶກບິນຍົກເລີກ</button></div>
        </form>
        </fieldset>
        {s.cancels.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Table head={['ເລກທີບິນຍົກເລີກ', 'ວັນທີ', 'ໝວດ', 'ຈັດການ']}>
              {s.cancels.map((c) => (
                <tr key={c.id}>
                  <td>{c.billNo}</td><td>{fmtDate(c.date)}</td><td>{c.cat ? CAT_LABEL[c.cat] : '—'}</td>
                  <td>{manager ? <RowActions what="ລາຍການ" onDelete={() => { set((s) => ({ ...s, cancels: s.cancels.filter((y) => y.id !== c.id) })); toast(`ລຶບບັນທຶກຍົກເລີກບິນ ${c.billNo} ແລ້ວ`) }} /> : <span className="muted">ສະເພາະຜູ້ຈັດການ</span>}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </>
  )
}
