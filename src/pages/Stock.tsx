import { useState, type FormEvent } from 'react'
import { fmtDate, num, today } from '../rules.ts'
import { nameOf, uid, type Move } from '../store.ts'
import { Card, Empty, Field, RowActions, Status, Table, focusForm, useApp } from '../ui.tsx'

export const MOVE_LABEL: Record<Move['type'], string> = { out: 'ເບີກ', return: 'ສົ່ງຄືນ', damage: 'ເສຍຫາຍ' }
const NOBODY = 'ບໍ່ລະບຸຄົນ'

export function StockPage() {
  const { s, set, toast } = useApp()
  const [f, setF] = useState({ date: today(), type: 'out' as Move['type'], productId: s.products[0]?.id ?? '', staffId: '', qty: '', note: '' })
  const [tried, setTried] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const productName = (id: string) => s.products.find((p) => p.id === id)?.name ?? '—'

  const rows = s.products.map((p) => {
    const mv = (t: Move['type']) => s.moves.reduce((a, m) => a + (m.productId === p.id && m.type === t ? m.qty : 0), 0)
    const sold = s.sales.reduce((a, x) => a + (x.productId === p.id && x.status !== 'rejected' ? x.qty : 0), 0)
    const out = mv('out'), ret = mv('return'), dmg = mv('damage')
    return { p, out, sold, ret, dmg, left: out - sold - ret - dmg }
  })
  // confirmed by the user 2026-11-25: balance = issued - sold - returned - damaged, same as the per-person summary
  const negative = rows.filter((r) => r.left < 0)

  // Per delivery person and product: what was issued, sold, returned, damaged, and what is still with them.
  // Confirmed by the user 2026-11-25: "sold" = bills where the person is the transport staff, rejected bills left out;
  // still held = issued - sold - returned - damaged.
  const held = new Map<string, { staffId: string; productId: string; out: number; sold: number; return: number; damage: number }>()
  const cell = (staffId: string, productId: string) => {
    const k = `${staffId}|${productId}`
    if (!held.has(k)) held.set(k, { staffId, productId, out: 0, sold: 0, return: 0, damage: 0 })
    return held.get(k)!
  }
  for (const m of s.moves) cell(m.staffId ?? '', m.productId)[m.type] += m.qty
  for (const x of s.sales) if (x.status !== 'rejected') cell(x.staff.transport, x.productId).sold += x.qty
  const byPerson = [...held.values()]
    .map((r) => ({ ...r, left: r.out - r.sold - r.return - r.damage, who: r.staffId ? nameOf(s.staff, r.staffId) : NOBODY }))
    .sort((a, b) => a.who.localeCompare(b.who) || productName(a.productId).localeCompare(productName(b.productId)))
  const owing = byPerson.filter((r) => r.left > 0)
  const owingPeople = new Set(owing.map((r) => r.staffId)).size

  // checked on every render, shown after the first save attempt, so a message goes away once fixed
  const qty = Number(f.qty)
  const er: Record<string, string> = {}
  if (!f.date) er.date = 'ເລືອກວັນທີ'
  if (!f.productId) er.productId = 'ເລືອກສິນຄ້າ'
  if (!Number.isInteger(qty) || qty < 1) er.qty = 'ຈຳນວນແພັກຕ້ອງເປັນເລກເຕັມ 1 ຂຶ້ນໄປ'
  if (f.type !== 'damage' && s.staff.length > 0 && !f.staffId) er.staffId = f.type === 'out' ? 'ເລືອກພະນັກງານທີ່ເບີກສິນຄ້າ' : 'ເລືອກພະນັກງານທີ່ສົ່ງຄືນ'
  if (f.type === 'damage' && !f.note.trim()) er.note = 'ໃສ່ເຫດຜົນຂອງການເສຍຫາຍ'
  const err = tried ? er : {}

  function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(er).length) return
    const row: Move = { id: editId ?? uid(), date: f.date, type: f.type, productId: f.productId, qty, note: f.note.trim(), ...(f.staffId ? { staffId: f.staffId } : {}) }
    set((s) => ({ ...s, moves: editId ? s.moves.map((x) => (x.id === editId ? row : x)) : [...s.moves, row] }))
    toast(`ບັນທຶກສຳເລັດ: ${MOVE_LABEL[f.type]} ${num(qty)} ແພັກ`)
    stopEdit()
  }
  function startEdit(m: Move) {
    setF({ date: m.date, type: m.type, productId: m.productId, staffId: m.staffId ?? '', qty: String(m.qty), note: m.note })
    setEditId(m.id); setTried(false); window.scrollTo(0, 0)
  }
  function stopEdit() { setEditId(null); setF((f) => ({ ...f, qty: '', note: '' })); setTried(false) }
  function remove(m: Move) {
    set((s) => ({ ...s, moves: s.moves.filter((y) => y.id !== m.id) }))
    if (editId === m.id) stopEdit()
    toast(`ລຶບລາຍການ${MOVE_LABEL[m.type]} ${num(m.qty)} ແພັກ ແລ້ວ`)
  }

  const list = [...s.moves].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      {negative.length > 0 && <p className="warn" role="alert">ຄຳເຕືອນ: ຍອດຄົງເຫຼືອຕິດລົບ — {negative.map((r) => r.p.name).join(', ')} ກວດຍອດເບີກ ແລະ ຍອດຂາຍຄືນ</p>}
      <Card title={editId ? 'ແກ້ໄຂລາຍການສະຕັອກ' : 'ບັນທຶກສະຕັອກ'}>
        <form className="form" data-ui="content" onSubmit={submit} noValidate>
          <Field label="ວັນທີ" error={err.date}><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="ປະເພດ">
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Move['type'] })}>
              {(['out', 'return', 'damage'] as const).map((t) => <option key={t} value={t}>{MOVE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="ສິນຄ້າ" error={err.productId}>
            <select value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
              {s.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label={f.type === 'out' ? 'ເບີກໃຫ້ພະນັກງານຈັດສົ່ງ' : f.type === 'return' ? 'ພະນັກງານທີ່ສົ່ງຄືນ' : 'ພະນັກງານທີ່ກ່ຽວຂ້ອງ (ບໍ່ບັງຄັບ)'} error={err.staffId}
            hint={s.staff.length ? undefined : <>ຍັງບໍ່ມີລາຍຊື່ພະນັກງານ <a href="#/settings">ໄປຕັ້ງຄ່າ</a></>}>
            <select value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
              <option value="">— {NOBODY} —</option>
              {s.staff.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="ຈຳນວນແພັກ" error={err.qty}>
            <input type="number" inputMode="numeric" min={1} step={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          </Field>
          <Field label={f.type === 'damage' ? 'ເຫດຜົນ' : 'ໝາຍເຫດ (ບໍ່ບັງຄັບ)'} error={err.note}>
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
          <div className="form-foot sticky">
            <button className="btn btn-primary" type="submit">{editId ? 'ບັນທຶກການແກ້ໄຂ' : 'ບັນທຶກສະຕັອກ'}</button>
            {editId && <button className="btn" type="button" onClick={stopEdit}>ຍົກເລີກການແກ້ໄຂ</button>}
          </div>
        </form>
      </Card>
      <Card title="ສະຫຼຸບການເບີກຕາມພະນັກງານຈັດສົ່ງ (ແພັກ)">
        {byPerson.length === 0 ? <Empty text="ຍັງບໍ່ມີການເບີກສິນຄ້າ" action="ເລີ່ມບັນທຶກການເບີກ" onClick={focusForm} /> : (
          <>
            <p style={{ marginBottom: 10 }}>
              {owing.length ? <Status kind="pending">ຍັງຄ້າງ {owingPeople} ຄົນ ລວມ {num(owing.reduce((a, r) => a + r.left, 0))} ແພັກ</Status> : <Status kind="ok">ບໍ່ມີໃຜຄ້າງສິນຄ້າ</Status>}
            </p>
            <Table head={['ພະນັກງານ', 'ສິນຄ້າ', 'ເບີກ', 'ຂາຍ', 'ຄືນ', 'ເສຍ', 'ຍັງຄ້າງ', 'ສະຖານະ']}>
              {byPerson.map((r) => (
                <tr key={`${r.staffId}|${r.productId}`}>
                  <td>{r.who}</td><td>{productName(r.productId)}</td>
                  <td className="n">{num(r.out)}</td><td className="n">{num(r.sold)}</td><td className="n">{num(r.return)}</td><td className="n">{num(r.damage)}</td>
                  <td className="n"><b>{num(r.left)}</b></td>
                  <td>{r.left > 0 ? <Status kind="pending">ຍັງຄ້າງ</Status> : r.left === 0 ? <Status kind="ok">ຄົບແລ້ວ</Status> : <Status kind="bad">ຂາຍເກີນຍອດເບີກ</Status>}</td>
                </tr>
              ))}
            </Table>
            <p className="muted" style={{ marginTop: 8 }}>ຍັງຄ້າງ = ເບີກ − ຂາຍ − ຄືນ − ເສຍ · ຂາຍ = ບິນທີ່ຄົນນັ້ນເປັນພະນັກງານຂົນສົ່ງ ຍົກເວັ້ນບິນທີ່ຖືກປະຕິເສດ</p>
          </>
        )}
      </Card>
      <Card title="ຍອດສະຕັອກຕາມສິນຄ້າ (ແພັກ)">
        <Table head={['ສິນຄ້າ', 'ເບີກ', 'ຂາຍ', 'ຄືນ', 'ເສຍ', 'ຄົງເຫຼືອ']}>
          {rows.map((r) => (
            <tr key={r.p.id}>
              <td>{r.p.name}</td><td className="n">{num(r.out)}</td><td className="n">{num(r.sold)}</td><td className="n">{num(r.ret)}</td><td className="n">{num(r.dmg)}</td>
              <td className="n">{r.left < 0 ? <Status kind="bad">ຕິດລົບ {num(r.left)}</Status> : num(r.left)}</td>
            </tr>
          ))}
        </Table>
        <p className="muted" style={{ marginTop: 8 }}>ຄົງເຫຼືອ = ເບີກ − ຂາຍ − ຄືນ − ເສຍ · ຂາຍ = ທຸກບິນ ຍົກເວັ້ນບິນທີ່ຖືກປະຕິເສດ</p>
      </Card>
      <Card title="ລາຍການເຄື່ອນໄຫວ">
        {list.length === 0 ? <Empty text="ຍັງບໍ່ມີລາຍການເຄື່ອນໄຫວ" action="ເລີ່ມບັນທຶກ" onClick={focusForm} /> : (
          <Table head={['ວັນທີ', 'ປະເພດ', 'ສິນຄ້າ', 'ພະນັກງານ', 'ຈຳນວນ', 'ໝາຍເຫດ', 'ຈັດການ']}>
            {list.slice(0, 50).map((m) => (
              <tr key={m.id} className={m.id === editId ? 'hl' : ''}>
                <td>{fmtDate(m.date)}</td><td>{MOVE_LABEL[m.type]}</td><td>{productName(m.productId)}</td><td>{m.staffId ? nameOf(s.staff, m.staffId) : NOBODY}</td>
                <td className="n">{num(m.qty)}</td><td>{m.note || '—'}</td>
                <td><RowActions what="ລາຍການ" onEdit={() => startEdit(m)} onDelete={() => remove(m)} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  )
}
