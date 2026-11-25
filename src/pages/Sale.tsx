import { useState, type FormEvent } from 'react'
import { ROLES, fmtDate, kip, minPrice, num, splitBase, tierIndex, tierPrices, today, type Cat, type Role, type Sale } from '../rules.ts'
import { CAT_LABEL, nameOf, uid, withCalc } from '../store.ts'
import { Card, DateNav, Empty, Field, RowActions, SaleStatus, Table, focusForm, useApp } from '../ui.tsx'

export const ROLE_LABEL: Record<Role, string> = { transport: 'ຂົນສົ່ງ', onsite: 'ຂາຍໜ້າງານ', follow: 'ຕິດຕາມ', warehouse: 'ນາຍສາງ' }
const NO_STAFF = { transport: '', onsite: '', follow: '', warehouse: '' }

export function SalePage({ cat }: { cat: Cat }) {
  const { s, set, toast, role } = useApp()
  const st = s.settings
  const products = s.products.filter((p) => p.cat === cat)
  const [view, setView] = useState(today)
  const [f, setF] = useState({ billNo: '', date: today(), customerId: '', productId: products[0]?.id ?? '', qty: '' })
  const [staff, setStaff] = useState<Record<Role, string>>(NO_STAFF)
  const [priceIn, setPriceIn] = useState<string | null>(null) // null = follow the tier price
  const [tried, setTried] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  if (!s.staff.length || !products.length)
    return (
      <Card title={`ຂາຍ${CAT_LABEL[cat]}`}>
        <Empty
          text={!s.staff.length ? 'ຍັງບໍ່ມີລາຍຊື່ພະນັກງານ ເພີ່ມພະນັກງານກ່ອນຈຶ່ງບັນທຶກການຂາຍໄດ້' : `ຍັງບໍ່ມີສິນຄ້າໃນໝວດ${CAT_LABEL[cat]} ເພີ່ມສິນຄ້າກ່ອນ`}
          action="ໄປຕັ້ງຄ່າ" to="#/settings" primary
        />
      </Card>
    )

  const p = products.find((x) => x.id === f.productId) ?? products[0]
  const qty = Number(f.qty)
  const qtyOk = Number.isInteger(qty) && qty >= 1
  const tiers = tierPrices(p, st)
  const ti = qtyOk ? tierIndex(qty, st) : 0
  const price = priceIn ?? String(tiers[ti])
  const per = splitBase({ transport: !!staff.transport, onsite: !!staff.onsite, follow: !!staff.follow, warehouse: !!staff.warehouse }, st)
  const tierNames = [`1–${st.tier2From - 1} ແພັກ`, `${st.tier2From}–${st.tier3From - 1} ແພັກ`, `${st.tier3From}+ ແພັກ`]
  const people = (r: Role) => (r === 'follow' ? s.staff.filter((x) => s.followIds.includes(x.id)) : r === 'warehouse' ? s.staff.filter((x) => s.warehouseIds.includes(x.id)) : s.staff)

  // checked on every render, shown after the first save attempt, so a message goes away once fixed
  const er: Record<string, string> = {}
  const pr = Number(price)
  if (!f.billNo.trim()) er.billNo = 'ໃສ່ເລກທີບິນກ່ອນບັນທຶກ'
  if (!f.date) er.date = 'ເລືອກວັນທີຂາຍ'
  if (!qtyOk) er.qty = 'ຈຳນວນແພັກຕ້ອງເປັນເລກເຕັມ 1 ຂຶ້ນໄປ'
  if (!(pr >= minPrice(p, st))) er.price = `ລາຄາຕ່ຳກວ່າລາຄາຕ່ຳສຸດ ${kip(minPrice(p, st))} ໃສ່ລາຄາບໍ່ຕ່ຳກວ່ານີ້`
  if (!staff.transport) er.transport = 'ເລືອກພະນັກງານຂົນສົ່ງ'
  const err = tried ? er : {}
  // a warning only: whether a repeated number is ever allowed is not confirmed yet
  const dupBill = !!f.billNo.trim() && s.sales.some((x) => x.cat === cat && x.billNo === f.billNo.trim() && x.status !== 'rejected' && x.id !== editId)

  function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(er).length) return
    // confirmed by the user 2026-11-25: an edited bill goes back to waiting for approval, so approved totals never change unseen
    const row: Sale = { id: editId ?? uid(), billNo: f.billNo.trim(), date: f.date, cat, customerId: f.customerId, productId: p.id, qty, price: pr, staff, status: 'pending' }
    set((s) => ({ ...s, sales: editId ? s.sales.map((x) => (x.id === editId ? row : x)) : [...s.sales, row] }))
    toast(`ບັນທຶກສຳເລັດ: ບິນ ${f.billNo.trim()} ວັນທີ ${fmtDate(f.date)}`)
    setView(f.date)
    setF({ ...f, billNo: '', qty: '' })
    setPriceIn(null)
    setEditId(null)
    setTried(false)
  }
  function startEdit(x: Sale) {
    setF({ billNo: x.billNo, date: x.date, customerId: x.customerId, productId: x.productId, qty: String(x.qty) })
    setStaff(x.staff); setPriceIn(String(x.price)); setEditId(x.id); setTried(false); window.scrollTo(0, 0)
  }
  function stopEdit() { setEditId(null); setF({ ...f, billNo: '', qty: '' }); setPriceIn(null); setTried(false) }
  function remove(x: Sale) {
    set((s) => ({ ...s, sales: s.sales.filter((y) => y.id !== x.id) }))
    if (editId === x.id) stopEdit()
    toast(`ລຶບບິນ ${x.billNo} ແລ້ວ`)
  }

  const rows = withCalc(s, s.sales.filter((x) => x.cat === cat && x.date === view))

  return (
    <>
      <DateNav value={view} onChange={setView} />
      <div className="cols">
        <Card title={editId ? `ແກ້ໄຂບິນຂາຍ${CAT_LABEL[cat]}` : `ບັນທຶກຂາຍ${CAT_LABEL[cat]}`}>
          <p className="note" style={{ marginBottom: 12 }}>ແບບຟອມນີ້ເປັນສະບັບຮ່າງ ຊ່ອງຂໍ້ມູນອາດປ່ຽນຫຼັງຢືນຢັນແບບຟອມບິນຕົວຈິງ</p>
          {editId && <p className="note" style={{ marginBottom: 12 }}>ກຳລັງແກ້ໄຂບິນ ບິນທີ່ແກ້ໄຂແລ້ວຈະກັບໄປລໍຖ້າອະນຸມັດ</p>}
          <form className="form" data-ui="content" onSubmit={submit} noValidate>
            <Field label="ເລກທີບິນ" error={err.billNo} hint={dupBill ? <span className="err">ຄຳເຕືອນ: ເລກທີບິນນີ້ມີຢູ່ແລ້ວໃນໝວດນີ້ ກວດເບິ່ງກ່ອນບັນທຶກ</span> : undefined}>
              <input value={f.billNo} onChange={(e) => setF({ ...f, billNo: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="ວັນທີຂາຍ (ຕາມບິນ)" error={err.date} hint="ປ່ຽນໄດ້ ບໍ່ຂຶ້ນກັບວັນທີເບິ່ງຍອດດ້ານເທິງ">
              <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Field>
            <Field label="ລູກຄ້າ" hint={s.customers.length ? undefined : <>ຍັງບໍ່ມີລາຍຊື່ລູກຄ້າ <a href="#/settings">ໄປຕັ້ງຄ່າ</a></>}>
              <select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
                <option value="">— ບໍ່ລະບຸ —</option>
                {s.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="ສິນຄ້າ">
              <select value={p.id} onChange={(e) => { setF({ ...f, productId: e.target.value }); setPriceIn(null) }}>
                {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
            <Field label="ຈຳນວນແພັກ" error={err.qty}>
              <input type="number" inputMode="numeric" min={1} step={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
            </Field>
            <Field label="ລາຄາຂາຍ (ກີບຕໍ່ແພັກ)" error={err.price} hint={`ລາຄາອ້າງອີງ ${kip(tiers[ti])} · ຕ່ຳສຸດ ${kip(minPrice(p, st))}`}>
              <input type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPriceIn(e.target.value)} />
            </Field>
            {ROLES.map((r) => (
              <Field key={r} label={`ພະນັກງານ${ROLE_LABEL[r]}`} error={err[r]}
                hint={(r === 'follow' || r === 'warehouse') && !people(r).length ? <>ຍັງບໍ່ໄດ້ກຳນົດ{ROLE_LABEL[r]} <a href="#/settings">ໄປຕັ້ງຄ່າ</a></> : undefined}>
                <select value={staff[r]} onChange={(e) => setStaff({ ...staff, [r]: e.target.value })}>
                  <option value="">— ບໍ່ມີ —</option>
                  {people(r).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
            ))}
            <div className="form-foot sticky">
              <button className="btn btn-primary" type="submit">{editId ? 'ບັນທຶກການແກ້ໄຂ' : 'ບັນທຶກການຂາຍ'}</button>
              {editId && <button className="btn" type="button" onClick={stopEdit}>ຍົກເລີກການແກ້ໄຂ</button>}
              {qtyOk && Number(price) > 0 && <span>ລວມ <b>{kip(qty * Number(price))}</b></span>}
            </div>
          </form>
        </Card>
        <div className="stack">
          <Card title={`ລາຄາອ້າງອີງ · ${p.name}`}>
            <Table head={['ຂັ້ນ', 'ລາຄາຕໍ່ແພັກ']}>
              {tiers.map((t, i) => <tr key={i} className={qtyOk && i === ti ? 'hl' : ''}><td>{tierNames[i]}</td><td className="n">{kip(t)}</td></tr>)}
            </Table>
            <h3>ຄ່າຕອບແທນພື້ນຖານ {kip(st.base)} ຕໍ່ແພັກ</h3>
            <dl className="kv">
              {ROLES.map((r) => <div key={r} style={{ display: 'contents' }}><dt>{ROLE_LABEL[r]}{staff[r] ? '' : ' (ວ່າງ)'}</dt><dd>{kip(per[r] * (qtyOk ? qty : 1))}</dd></div>)}
              {per.company > 0 && <><dt>ສ່ວນບົດບາດວ່າງ ເຂົ້າບໍລິສັດ</dt><dd>{kip(per.company * (qtyOk ? qty : 1))}</dd></>}
            </dl>
            <p className="muted">{qtyOk ? `ຄິດຈາກ ${num(qty)} ແພັກ` : 'ສະແດງຕໍ່ 1 ແພັກ ຈົນກວ່າຈະໃສ່ຈຳນວນ'}</p>
          </Card>
        </div>
      </div>
      <Card title={`ລາຍການຂາຍ${CAT_LABEL[cat]} ວັນທີ ${fmtDate(view)}`}>
        {rows.length === 0 ? (
          <Empty text="ຍັງບໍ່ມີລາຍການຂາຍໃນວັນນີ້" action="ເລີ່ມບັນທຶກ" onClick={focusForm} />
        ) : (
          <Table head={['ເລກທີບິນ', 'ລູກຄ້າ', 'ສິນຄ້າ', 'ຈຳນວນ', 'ລາຄາ', 'ລວມ', 'ຂົນສົ່ງ', 'ສະຖານະ', 'ຈັດການ']}>
            {rows.map(({ x, p, c }) => (
              <tr key={x.id} className={x.id === editId ? 'hl' : ''}>
                <td>{x.billNo}</td><td>{nameOf(s.customers, x.customerId)}</td><td>{p.name}</td>
                <td className="n">{num(x.qty)}</td><td className="n">{kip(x.price)}</td><td className="n">{kip(c.revenue)}</td>
                <td>{nameOf(s.staff, x.staff.transport)}</td><td><SaleStatus status={x.status} /></td>
                <td>{role === 'manager' || x.status === 'pending' ? <RowActions what="ບິນ" onEdit={() => startEdit(x)} onDelete={() => remove(x)} /> : <span className="muted">ສະເພາະຜູ້ຈັດການ</span>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  )
}
