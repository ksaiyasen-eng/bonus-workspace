import { useState, type FormEvent } from 'react'
import { fmtDate, kip, today, type Cat } from '../rules.ts'
import { CAT_LABEL, nameOf, uid, type Cash } from '../store.ts'
import { Card, Empty, Field, RowActions, Table, Wait, focusForm, useApp } from '../ui.tsx'

export function CashPage() {
  const { s, set, toast } = useApp()
  const followers = s.staff.filter((x) => s.followIds.includes(x.id))
  const [f, setF] = useState({ date: today(), cat: 'water' as Cat, followId: '', amount: '' })
  const [tried, setTried] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  // checked on every render, shown after the first save attempt, so a message goes away once fixed
  const amount = Number(f.amount)
  const er: Record<string, string> = {}
  if (!f.date) er.date = 'ເລືອກວັນທີ'
  if (!f.followId) er.followId = 'ເລືອກຜູ້ຕິດຕາມທີ່ຮັບເງິນ'
  if (f.amount === '' || !(amount >= 0)) er.amount = 'ໃສ່ຍອດສົ່ງຕົວຈິງເປັນຕົວເລກ 0 ຂຶ້ນໄປ'
  const err = tried ? er : {}

  function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(er).length) return
    const row: Cash = { id: editId ?? uid(), date: f.date, cat: f.cat, followId: f.followId, amount }
    set((s) => ({ ...s, cash: editId ? s.cash.map((x) => (x.id === editId ? row : x)) : [...s.cash, row] }))
    toast(`ບັນທຶກສຳເລັດ: ສົ່ງເງິນ ${kip(amount)}`)
    stopEdit()
  }
  function startEdit(x: Cash) {
    setF({ date: x.date, cat: x.cat, followId: x.followId, amount: String(x.amount) })
    setEditId(x.id); setTried(false); window.scrollTo(0, 0)
  }
  function stopEdit() { setEditId(null); setF((f) => ({ ...f, amount: '' })); setTried(false) }
  function remove(x: Cash) {
    set((s) => ({ ...s, cash: s.cash.filter((y) => y.id !== x.id) }))
    if (editId === x.id) stopEdit()
    toast(`ລຶບລາຍການສົ່ງເງິນ ${kip(x.amount)} ແລ້ວ`)
  }

  const list = [...s.cash].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <p className="note">ຂັ້ນຕອນ: ລູກຄ້າຈ່າຍເງິນສົດ ແລ້ວພະນັກງານສົ່ງບິນ ແລະ ເງິນສົດໃຫ້ຜູ້ຕິດຕາມທຸກແລງ</p>
      <Card title={editId ? 'ແກ້ໄຂລາຍການສົ່ງເງິນສົດ' : 'ບັນທຶກການສົ່ງເງິນສົດປະຈຳວັນ'}>
        {followers.length === 0 ? (
          <Empty text="ຍັງບໍ່ໄດ້ກຳນົດຜູ້ຕິດຕາມ ກຳນົດຜູ້ຕິດຕາມກ່ອນຈຶ່ງບັນທຶກການສົ່ງເງິນໄດ້" action="ໄປຕັ້ງຄ່າ" to="#/settings" primary />
        ) : (
          <form className="form" data-ui="content" onSubmit={submit} noValidate>
            <Field label="ວັນທີ" error={err.date}><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="ໝວດ">
              <select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value as Cat })}>
                <option value="water">{CAT_LABEL.water}</option><option value="bag">{CAT_LABEL.bag}</option>
              </select>
            </Field>
            <Field label="ຜູ້ຕິດຕາມທີ່ຮັບເງິນ" error={err.followId}>
              <select value={f.followId} onChange={(e) => setF({ ...f, followId: e.target.value })}>
                <option value="">— ເລືອກ —</option>
                {followers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
            <Field label="ຍອດສົ່ງຕົວຈິງ (ກີບ)" error={err.amount}>
              <input type="number" inputMode="numeric" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            </Field>
            <div className="full">
              <span className="muted">ຍອດທີ່ຄວນໄດ້ຮັບ (ສຳລັບປຽບທຽບ): </span><Wait why="ລໍຖ້າກະຕິກາຄິດໄລ່" />
            </div>
            <div className="form-foot sticky">
              <button className="btn btn-primary" type="submit">{editId ? 'ບັນທຶກການແກ້ໄຂ' : 'ບັນທຶກການສົ່ງເງິນ'}</button>
              {editId && <button className="btn" type="button" onClick={stopEdit}>ຍົກເລີກການແກ້ໄຂ</button>}
            </div>
          </form>
        )}
      </Card>
      <Card title="ລາຍການສົ່ງເງິນ">
        {list.length === 0 ? <Empty text="ຍັງບໍ່ມີລາຍການສົ່ງເງິນ" {...(followers.length ? { action: 'ເລີ່ມບັນທຶກ', onClick: focusForm } : {})} /> : (
          <Table head={['ວັນທີ', 'ໝວດ', 'ຜູ້ຕິດຕາມ', 'ຍອດສົ່ງຕົວຈິງ', 'ຍອດທີ່ຄວນໄດ້ຮັບ', 'ຈັດການ']}>
            {list.slice(0, 50).map((x) => (
              <tr key={x.id} className={x.id === editId ? 'hl' : ''}>
                <td>{fmtDate(x.date)}</td><td>{CAT_LABEL[x.cat]}</td><td>{nameOf(s.staff, x.followId)}</td><td className="n">{kip(x.amount)}</td><td><Wait /></td>
                <td><RowActions what="ລາຍການ" onEdit={() => startEdit(x)} onDelete={() => remove(x)} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  )
}
