import { useState, type FormEvent } from 'react'
import { ROLES, fmtDate, kip, today } from '../rules.ts'
import { isCancelled, nameOf, uid, withCalc, type Claim } from '../store.ts'
import { Card, Empty, Field, RowActions, Status, Table, focusForm, useApp } from '../ui.tsx'

// Confirmed by the user 2026-11-25:
// - a person may claim no more than their commission from approved bills in the period, less what is already claimed or paid
// - claims are the only payment record: "paid" in reports is the sum of claims the manager marked paid
const CLAIM_STATUS: Record<Claim['status'], { kind: 'pending' | 'ok' | 'bad'; text: string }> = {
  requested: { kind: 'pending', text: 'ລໍຖ້າຈ່າຍ' },
  paid: { kind: 'ok', text: 'ຈ່າຍແລ້ວ' },
  rejected: { kind: 'bad', text: 'ຖືກປະຕິເສດ' },
}

export function Claims({ ym, from, to }: { ym: string; from: string; to: string }) {
  const { s, set, toast, role } = useApp()
  const manager = role === 'manager'
  const [f, setF] = useState({ staffId: '', amount: '', note: '' })
  const [tried, setTried] = useState(false)

  // commission each person earned from approved bills in this period, both categories together
  const approved = withCalc(s, s.sales.filter((x) => x.status === 'approved' && !isCancelled(s, x) && x.date >= from && x.date <= to))
  const earned = (id: string) => approved.reduce((a, { x, c }) => a + ROLES.reduce((b, r) => b + (x.staff[r] === id ? c.staff[r] : 0), 0), 0)
  const claims = s.claims.filter((c) => c.ym === ym)
  const sum = (id: string, status: Claim['status']) => claims.reduce((a, c) => a + (c.staffId === id && c.status === status ? c.amount : 0), 0)
  const people = s.staff
    .map((p) => {
      const e = earned(p.id), waiting = sum(p.id, 'requested'), paid = sum(p.id, 'paid')
      return { p, e, waiting, paid, owed: e - paid, left: e - waiting - paid }
    })
    .filter((x) => x.e > 0 || x.waiting > 0 || x.paid > 0)
  const leftOf = (id: string) => earned(id) - sum(id, 'requested') - sum(id, 'paid')

  // checked on every render, shown after the first save attempt, so a message goes away once fixed
  const amount = Number(f.amount)
  const left = f.staffId ? leftOf(f.staffId) : 0
  const er: Record<string, string> = {}
  if (!f.staffId) er.staffId = 'ເລືອກພະນັກງານທີ່ຂໍເບີກ'
  if (!Number.isInteger(amount) || amount < 1) er.amount = 'ໃສ່ຈຳນວນເງິນເປັນເລກເຕັມ 1 ກີບຂຶ້ນໄປ'
  else if (f.staffId && amount > left) er.amount = left > 0 ? `ເກີນຍອດທີ່ເບີກໄດ້ ຍັງເບີກໄດ້ອີກ ${kip(left)}` : 'ຄົນນີ້ບໍ່ມີຍອດທີ່ເບີກໄດ້ໃນຮອບນີ້ ຕ້ອງມີບິນທີ່ຮັບຮອງແລ້ວກ່ອນ'
  const err = tried ? er : {}

  function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(er).length) return
    const row: Claim = { id: uid(), ym, staffId: f.staffId, amount, date: today(), note: f.note.trim(), status: 'requested' }
    set((s) => ({ ...s, claims: [...s.claims, row] }))
    toast(`ບັນທຶກສຳເລັດ: ${nameOf(s.staff, f.staffId)} ຂໍເບີກ ${kip(amount)}`)
    setF({ staffId: f.staffId, amount: '', note: '' })
    setTried(false)
  }
  const decide = (c: Claim, status: Claim['status']) => {
    set((s) => ({ ...s, claims: s.claims.map((x) => (x.id !== c.id ? x : status === 'requested' ? { ...x, status, decidedAt: undefined } : { ...x, status, decidedAt: today() })) }))
    const who = nameOf(s.staff, c.staffId)
    toast(status === 'paid' ? `ໝາຍວ່າຈ່າຍ ${kip(c.amount)} ໃຫ້ ${who} ແລ້ວ` : status === 'rejected' ? `ປະຕິເສດໃບຂໍເບີກຂອງ ${who} ແລ້ວ` : `ໃບຂໍເບີກຂອງ ${who} ກັບໄປລໍຖ້າຈ່າຍ`)
  }
  const remove = (c: Claim) => {
    set((s) => ({ ...s, claims: s.claims.filter((x) => x.id !== c.id) }))
    toast(`ລຶບໃບຂໍເບີກ ${kip(c.amount)} ແລ້ວ`)
  }

  const total = people.reduce((a, x) => ({ e: a.e + x.e, waiting: a.waiting + x.waiting, paid: a.paid + x.paid, owed: a.owed + Math.max(x.owed, 0) }), { e: 0, waiting: 0, paid: 0, owed: 0 })
  const list = [...claims].sort((a, b) => (a.status === 'requested' ? 0 : 1) - (b.status === 'requested' ? 0 : 1) || b.date.localeCompare(a.date))

  if (!s.staff.length)
    return <Card title="ຂໍເບີກຄ່າຕອບແທນ"><Empty text="ຍັງບໍ່ມີລາຍຊື່ພະນັກງານ ເພີ່ມພະນັກງານກ່ອນຈຶ່ງຂໍເບີກໄດ້" action="ໄປຕັ້ງຄ່າ" to="#/settings" primary /></Card>

  return (
    <>
      <div className="cols">
        <Card title="ຂໍເບີກຄ່າຕອບແທນ">
          <form className="form" data-ui="content" onSubmit={submit} noValidate>
            <Field label="ພະນັກງານ" error={err.staffId}>
              <select value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
                <option value="">— ເລືອກ —</option>
                {s.staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="ຈຳນວນເງິນ (ກີບ)" error={err.amount} hint={f.staffId ? `ຍັງເບີກໄດ້ອີກ ${kip(Math.max(left, 0))}` : 'ເລືອກພະນັກງານກ່ອນ ເພື່ອເບິ່ງຍອດທີ່ເບີກໄດ້'}>
              <input type="number" inputMode="numeric" min={1} step={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            </Field>
            <div className="full">
              <Field label="ໝາຍເຫດ (ບໍ່ບັງຄັບ)"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            </div>
            <div className="form-foot sticky">
              <button className="btn btn-primary" type="submit">ສົ່ງໃບຂໍເບີກ</button>
              {f.staffId && Math.floor(left) > 0 && <button className="btn" type="button" onClick={() => setF({ ...f, amount: String(Math.floor(left)) })}>ເບີກທັງໝົດ {kip(Math.floor(left))}</button>}
            </div>
          </form>
          <p className="muted" style={{ marginTop: 8 }}>ເບີກໄດ້ບໍ່ເກີນຄ່າຕອບແທນຈາກບິນທີ່ຮັບຮອງແລ້ວໃນຮອບນີ້ ລົບຍອດທີ່ຂໍເບີກ ຫຼື ຈ່າຍໄປແລ້ວ · ຜູ້ຈັດການເປັນຜູ້ໝາຍວ່າຈ່າຍແລ້ວ</p>
        </Card>
        <Card title="ສະຫຼຸບການຈ່າຍໃນຮອບນີ້">
          <dl className="kv">
            <dt>ຄ່າຕອບແທນທີ່ໄດ້ (ຮັບຮອງແລ້ວ)</dt><dd>{kip(total.e)}</dd>
            <dt>ລໍຖ້າຈ່າຍ ({claims.filter((c) => c.status === 'requested').length} ໃບ)</dt><dd>{kip(total.waiting)}</dd>
            <dt>ຈ່າຍແລ້ວ ({people.filter((x) => x.paid > 0).length} ຄົນ)</dt><dd>{kip(total.paid)}</dd>
            <dt>ຍັງຄ້າງຈ່າຍ ({people.filter((x) => x.owed > 0).length} ຄົນ)</dt><dd>{kip(total.owed)}</dd>
          </dl>
        </Card>
      </div>
      <Card title="ຍອດຕາມພະນັກງານ">
        {people.length === 0 ? <p className="muted">ຍັງບໍ່ມີຄ່າຕອບແທນທີ່ຮັບຮອງແລ້ວ ຫຼື ໃບຂໍເບີກໃນຮອບນີ້</p> : (
          <Table head={['ພະນັກງານ', 'ຄ່າຕອບແທນທີ່ໄດ້', 'ລໍຖ້າຈ່າຍ', 'ຈ່າຍແລ້ວ', 'ຍັງຄ້າງຈ່າຍ', 'ຍັງເບີກໄດ້', 'ສະຖານະ']}>
            {people.map(({ p, e, waiting, paid, owed, left }) => (
              <tr key={p.id}>
                <td>{p.name}</td><td className="n">{kip(e)}</td><td className="n">{kip(waiting)}</td><td className="n">{kip(paid)}</td>
                <td className="n"><b>{kip(Math.max(owed, 0))}</b></td><td className="n">{kip(Math.max(left, 0))}</td>
                <td>{left < 0 ? <Status kind="bad">ເບີກເກີນຍອດ {kip(-left)}</Status>
                  : paid > 0 && owed <= 0 ? <Status kind="ok">ຈ່າຍຄົບແລ້ວ</Status>
                  : paid > 0 ? <Status kind="pending">ຈ່າຍບາງສ່ວນ</Status>
                  : <Status kind="pending">ຍັງບໍ່ໄດ້ຈ່າຍ</Status>}</td>
              </tr>
            ))}
          </Table>
        )}
        <p className="muted" style={{ marginTop: 8 }}>ຍັງຄ້າງຈ່າຍ = ຄ່າຕອບແທນທີ່ໄດ້ − ຈ່າຍແລ້ວ · ຍັງເບີກໄດ້ = ຄ່າຕອບແທນທີ່ໄດ້ − ລໍຖ້າຈ່າຍ − ຈ່າຍແລ້ວ · ເບີກເກີນຍອດ ເກີດໄດ້ເມື່ອບິນທີ່ຮັບຮອງແລ້ວຖືກແກ້ໄຂພາຍຫຼັງ</p>
      </Card>
      <Card title="ໃບຂໍເບີກໃນຮອບນີ້">
        {!manager && <p className="note" style={{ marginBottom: 12 }}>ການໝາຍວ່າຈ່າຍແລ້ວ ແລະ ການປະຕິເສດ ເຮັດໄດ້ສະເພາະຜູ້ຈັດການ ພະນັກງານລຶບໃບທີ່ຍັງລໍຖ້າຈ່າຍໄດ້</p>}
        {list.length === 0 ? <Empty text="ຍັງບໍ່ມີໃບຂໍເບີກໃນຮອບນີ້" action="ສົ່ງໃບຂໍເບີກ" onClick={focusForm} /> : (
          <Table head={['ວັນທີຂໍ', 'ພະນັກງານ', 'ຈຳນວນເງິນ', 'ໝາຍເຫດ', 'ສະຖານະ', 'ຈັດການ']}>
            {list.map((c) => {
              const st = CLAIM_STATUS[c.status]
              // flag every waiting claim of a person whose waiting and paid claims together pass what they earned
              const over = c.status === 'requested' && leftOf(c.staffId) < 0
              return (
                <tr key={c.id}>
                  <td>{fmtDate(c.date)}</td><td>{nameOf(s.staff, c.staffId)}</td><td className="n">{kip(c.amount)}</td><td>{c.note || '—'}</td>
                  <td><Status kind={st.kind}>{st.text}{c.decidedAt && c.status !== 'requested' ? ` ${fmtDate(c.decidedAt)}` : ''}</Status>{over && <> <Status kind="bad">ເກີນຍອດທີ່ໄດ້</Status></>}</td>
                  <td><div className="row">
                    {c.status === 'requested' && manager && <>
                      <button className="btn btn-sm" onClick={() => decide(c, 'paid')}>ໝາຍວ່າຈ່າຍແລ້ວ</button>
                      <button className="btn btn-sm btn-danger" onClick={() => decide(c, 'rejected')}>ປະຕິເສດ</button>
                    </>}
                    {c.status === 'requested' && <RowActions what="ໃບຂໍເບີກ" onDelete={() => remove(c)} />}
                    {c.status !== 'requested' && (manager
                      ? <button className="btn btn-sm" onClick={() => decide(c, 'requested')}>ຍົກເລີກ · ກັບໄປລໍຖ້າຈ່າຍ</button>
                      : <span className="muted">ສະເພາະຜູ້ຈັດການ</span>)}
                  </div></td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>
    </>
  )
}
