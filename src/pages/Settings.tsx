import { useState, type FormEvent } from 'react'
import { ROLES, companyPerPack, kip, minPrice, num, priceCheck, tierPrices, today, type Cat, type Product, type Settings } from '../rules.ts'
import { BACKUP_VERSION, CAT_LABEL, exportJson, parseBackup, uid, type State } from '../store.ts'
import { Card, Field, RowActions, Status, Table, downloadText, useApp } from '../ui.tsx'
import { ROLE_LABEL } from './Sale.tsx'
import { ROLE_NAME, type Role } from '../sync.ts'

export function SettingsPage() {
  const { s, role, remote } = useApp()
  const locked = role !== 'manager'
  return (
    <>
      {locked && <p className="note">ໜ້ານີ້ແກ້ໄຂໄດ້ສະເພາະຜູ້ຈັດການ ຍົກເວັ້ນລາຍຊື່ລູກຄ້າ ທີ່ພະນັກງານເພີ່ມ ແລະ ແກ້ໄຂໄດ້</p>}
      <div className="cols" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <fieldset className="gate" disabled={locked}><People k="staff" title="ພະນັກງານ" unit="ຄົນ" /></fieldset>
        <People k="customers" title="ລູກຄ້າ" unit="ລາຍ" />
      </div>
      <fieldset className="gate" disabled={locked}>
      <RolePeople />
      <Products />
      {/* remount when settings change from outside the form, e.g. after an import */}
      <Rules key={JSON.stringify(s.settings)} />
      <Backup />
      {remote && !locked && <Pins />}
      </fieldset>
    </>
  )
}

function People({ k, title, unit }: { k: 'staff' | 'customers'; title: string; unit: string }) {
  const { s, set, toast } = useApp()
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [block, setBlock] = useState('') // why a delete was refused; not a typing mistake, so it is not shown as a field error
  const used = (id: string) =>
    k === 'staff'
      ? s.sales.some((x) => ROLES.some((r) => x.staff[r] === id)) || s.cash.some((x) => x.followId === id) || s.moves.some((x) => x.staffId === id) || s.payouts.some((x) => x.staffId === id) || s.claims.some((x) => x.staffId === id)
      : s.sales.some((x) => x.customerId === id)
  function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setErr(`ໃສ່ຊື່${title}ກ່ອນກົດບັນທຶກ`)
    if (s[k].some((x) => x.name === n && x.id !== editId)) return setErr(`ມີຊື່ "${n}" ຢູ່ແລ້ວ ໃສ່ຊື່ອື່ນ`)
    set((s) => ({ ...s, [k]: editId ? s[k].map((x) => (x.id === editId ? { ...x, name: n } : x)) : [...s[k], { id: uid(), name: n }] }))
    toast(`ບັນທຶກສຳເລັດ: ${editId ? 'ແກ້ໄຂຊື່ເປັນ' : 'ເພີ່ມ'} ${n}`)
    setName(''); setErr(''); setEditId(null)
  }
  function remove(x: { id: string; name: string }) {
    if (used(x.id)) return setBlock(`ລຶບ "${x.name}" ບໍ່ໄດ້ ເພາະມີລາຍການທີ່ອ້າງເຖິງຢູ່ ແກ້ໄຂຊື່ແທນໄດ້`)
    set((s) => ({ ...s, [k]: s[k].filter((y) => y.id !== x.id), followIds: s.followIds.filter((i) => i !== x.id), warehouseIds: s.warehouseIds.filter((i) => i !== x.id) }))
    if (editId === x.id) { setEditId(null); setName('') }
    setBlock('')
    toast(`ລຶບ ${x.name} ແລ້ວ`)
  }
  return (
    <Card title={`${title} (${s[k].length} ${unit})`}>
      <form className="row" onSubmit={save} noValidate style={{ alignItems: 'end' }}>
        <div style={{ flex: 1, minWidth: 160 }}><Field label={editId ? `ແກ້ໄຂຊື່${title}` : `ຊື່${title}`} error={err}><input value={name} onChange={(e) => { setName(e.target.value); setErr('') }} autoComplete="off" /></Field></div>
        <button className="btn" type="submit" style={{ marginBottom: err ? 24 : 0 }}>{editId ? 'ບັນທຶກຊື່' : `ເພີ່ມ${title}`}</button>
        {editId && <button className="btn" type="button" style={{ marginBottom: err ? 24 : 0 }} onClick={() => { setEditId(null); setName(''); setErr('') }}>ຍົກເລີກ</button>}
      </form>
      {block && <p className="err" role="alert" style={{ marginTop: 8 }}>{block}</p>}
      {s[k].length === 0 ? <p className="muted" style={{ marginTop: 8 }}>ຍັງບໍ່ມີລາຍຊື່ ໃສ່ຊື່ດ້ານເທິງແລ້ວກົດເພີ່ມ</p> : (
        <div style={{ marginTop: 12 }}>
          <Table head={[`ຊື່${title}`, 'ຈັດການ']}>
            {s[k].map((x) => (
              <tr key={x.id} className={x.id === editId ? 'hl' : ''}>
                <td>{x.name}</td>
                <td><RowActions what={title} onEdit={() => { setEditId(x.id); setName(x.name); setErr(''); setBlock('') }} onDelete={() => remove(x)} /></td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Card>
  )
}

function RolePeople() {
  const { s, set } = useApp()
  const toggle = (k: 'followIds' | 'warehouseIds', id: string) =>
    set((s) => ({ ...s, [k]: s[k].includes(id) ? s[k].filter((x) => x !== id) : [...s[k], id] }))
  return (
    <Card title="ຜູ້ຕິດຕາມ ແລະ ນາຍສາງ">
      {s.staff.length === 0 ? <p className="muted">ເພີ່ມພະນັກງານກ່ອນ ຈຶ່ງກຳນົດບົດບາດໄດ້</p> : (
        <>
          <p className="muted">ໝາຍເລືອກຈາກພະນັກງານ ຄົນດຽວຢູ່ໄດ້ຫຼາຍບົດບາດ ບັນທຶກທັນທີທີ່ໝາຍ</p>
          <Table head={['ພະນັກງານ', `ຜູ້ຕິດຕາມ (${s.followIds.length} ຄົນ)`, `ນາຍສາງ (${s.warehouseIds.length} ຄົນ)`]}>
            {s.staff.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td><label className="check"><input type="checkbox" checked={s.followIds.includes(p.id)} onChange={() => toggle('followIds', p.id)} /> ຕິດຕາມ</label></td>
                <td><label className="check"><input type="checkbox" checked={s.warehouseIds.includes(p.id)} onChange={() => toggle('warehouseIds', p.id)} /> ນາຍສາງ</label></td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Card>
  )
}

const PRICE_FIELDS = [['cost', 'ຕົ້ນທຶນ'], ['minProfit', 'ກຳໄລຂັ້ນຕ່ຳ'], ['recommended', 'ລາຄາແນະນຳ'], ['ceiling', 'ເພດານລາຄາ'], ['firstTier', 'ຂັ້ນທຳອິດ (ບໍ່ມີເພດານ)']] as const

function Products() {
  const { s, set, toast } = useApp()
  const st = s.settings
  const [name, setName] = useState('')
  const [cat, setCat] = useState<Cat>('water')
  const [editId, setEditId] = useState<string | null>(null)
  const [block, setBlock] = useState('')
  const [err, setErr] = useState('')
  const edit = (id: string, k: (typeof PRICE_FIELDS)[number][0], v: string) => {
    const n = v === '' ? (k === 'ceiling' || k === 'firstTier' ? null : 0) : Math.max(0, Number(v))
    set((s) => ({ ...s, products: s.products.map((p) => (p.id === id ? { ...p, [k]: n } : p)) }))
  }
  function add(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setErr('ໃສ່ຊື່ສິນຄ້າກ່ອນກົດບັນທຶກ')
    if (editId) {
      set((s) => ({ ...s, products: s.products.map((p) => (p.id === editId ? { ...p, name: n } : p)) }))
      toast(`ບັນທຶກສຳເລັດ: ແກ້ໄຂຊື່ເປັນ ${n}`)
      setName(''); setErr(''); setEditId(null)
      return
    }
    const p: Product = { id: uid(), name: n, cat, cost: 0, minProfit: 0, recommended: 0, ceiling: null, firstTier: null }
    set((s) => ({ ...s, products: [...s.products, p] }))
    toast(`ບັນທຶກສຳເລັດ: ເພີ່ມ ${n} ໃສ່ລາຄາໃນຕາຕະລາງຕໍ່`)
    setName(''); setErr('')
  }
  function remove(p: Product) {
    if (s.sales.some((x) => x.productId === p.id) || s.moves.some((x) => x.productId === p.id)) return setBlock(`ລຶບ "${p.name}" ບໍ່ໄດ້ ເພາະມີບິນ ຫຼື ລາຍການສະຕັອກທີ່ອ້າງເຖິງຢູ່ ແກ້ໄຂຊື່ແທນໄດ້`)
    set((s) => ({ ...s, products: s.products.filter((y) => y.id !== p.id) }))
    if (editId === p.id) { setEditId(null); setName('') }
    setBlock('')
    toast(`ລຶບ ${p.name} ແລ້ວ`)
  }
  return (
    <>
      <Card title={`ສິນຄ້າ (${s.products.length} ລາຍການ) · ກີບຕໍ່ແພັກ`}>
        <p className="muted" style={{ marginBottom: 8 }}>ແກ້ຕົວເລກໃນຕາຕະລາງໄດ້ເລີຍ ບັນທຶກທັນທີ ປະຊ່ອງເພດານຫວ່າງຖ້າບໍ່ມີເພດານ</p>
        <Table head={['ສິນຄ້າ', 'ໝວດ', ...PRICE_FIELDS.map((f) => f[1]), 'ຈັດການ']}>
          {s.products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{CAT_LABEL[p.cat]}</td>
              {PRICE_FIELDS.map(([k, label]) => (
                <td key={k}><input type="number" inputMode="numeric" min={0} aria-label={`${label} ${p.name}`} value={p[k] ?? ''} onChange={(e) => edit(p.id, k, e.target.value)} /></td>
              ))}
              <td><RowActions what="ສິນຄ້າ" onEdit={() => { setEditId(p.id); setName(p.name); setCat(p.cat); setErr(''); setBlock('') }} onDelete={() => remove(p)} /></td>
            </tr>
          ))}
        </Table>
        {block && <p className="err" role="alert" style={{ marginTop: 8 }}>{block}</p>}
        <form className="row" onSubmit={add} noValidate style={{ alignItems: 'end', marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 160 }}><Field label={editId ? 'ແກ້ໄຂຊື່ສິນຄ້າ' : 'ຊື່ສິນຄ້າໃໝ່'} error={err}><input value={name} onChange={(e) => { setName(e.target.value); setErr('') }} autoComplete="off" /></Field></div>
          <div style={{ minWidth: 150 }}><Field label="ໝວດ">
            <select value={cat} disabled={!!editId} onChange={(e) => setCat(e.target.value as Cat)}><option value="water">{CAT_LABEL.water}</option><option value="bag">{CAT_LABEL.bag}</option></select>
          </Field></div>
          <button className="btn" type="submit" style={{ marginBottom: err ? 24 : 0 }}>{editId ? 'ບັນທຶກຊື່' : 'ເພີ່ມສິນຄ້າ'}</button>
          {editId && <button className="btn" type="button" style={{ marginBottom: err ? 24 : 0 }} onClick={() => { setEditId(null); setName(''); setErr('') }}>ຍົກເລີກ</button>}
        </form>
      </Card>
      <Card title="ລາຄາຕາມຂັ້ນ ແລະ ສ່ວນບໍລິສັດ · ກີບຕໍ່ແພັກ">
        <Table head={['ສິນຄ້າ', 'ລາຄາຕ່ຳສຸດ', `1–${st.tier2From - 1} ແພັກ`, `${st.tier2From}–${st.tier3From - 1} ແພັກ`, `${st.tier3From}+ ແພັກ`, 'ສ່ວນບໍລິສັດຕໍ່ແພັກ', 'ຜົນກວດລາຄາ']}>
          {s.products.map((p) => {
            const t = tierPrices(p, st)
            const bad = priceCheck(p, st)
            return (
              <tr key={p.id}>
                <td>{p.name}</td><td className="n">{num(minPrice(p, st))}</td>
                {t.map((x, i) => <td className="n" key={i}>{num(x)}</td>)}
                <td className="n">{t.map((x) => num(companyPerPack(x, p, st))).join(' / ')}</td>
                <td>{bad ? <Status kind="bad">{bad}</Status> : <Status kind="ok">ຖືກຕ້ອງ</Status>}</td>
              </tr>
            )
          })}
        </Table>
        <p className="muted" style={{ marginTop: 8 }}>ລາຄາຕ່ຳສຸດ = ຕົ້ນທຶນ + ກຳໄລຂັ້ນຕ່ຳ + ຄ່າຕອບແທນພື້ນຖານ + ຄ່ານ້ຳມັນ · ສ່ວນບໍລິສັດ = ລາຄາຕາມຂັ້ນ − ຕົ້ນທຶນ − ຄ່າຕອບແທນພື້ນຖານ − ຄ່ານ້ຳມັນ</p>
      </Card>
    </>
  )
}

function Rules() {
  const { s, set, toast } = useApp()
  const st = s.settings
  const [d, setD] = useState({
    base: String(st.base), fuel: String(st.fuel), tier2From: String(st.tier2From), tier3From: String(st.tier3From),
    transport: String(st.pct.transport), onsite: String(st.pct.onsite), follow: String(st.pct.follow), warehouse: String(st.pct.warehouse),
    emptyRole: st.emptyRole, approver: st.approver, approvalOn: st.approvalOn,
  })
  const [tried, setTried] = useState(false)
  const n = (k: keyof typeof d) => Number(d[k])
  const pctSum = ROLES.reduce((a, r) => a + n(r), 0)
  const inp = (k: 'base' | 'fuel' | 'tier2From' | 'tier3From' | 'transport' | 'onsite' | 'follow' | 'warehouse') => (
    <input type="number" inputMode="numeric" min={0} data-ui="skip" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
  )

  // checked on every render, shown after the first save attempt, so a message goes away once fixed
  const er: Record<string, string> = {}
  const ok = (k: keyof typeof d) => d[k] !== '' && n(k) >= 0
  if (!ok('base')) er.base = 'ໃສ່ຕົວເລກ 0 ຂຶ້ນໄປ'
  if (!ok('fuel')) er.fuel = 'ໃສ່ຕົວເລກ 0 ຂຶ້ນໄປ'
  if (ROLES.some((r) => !ok(r)) || pctSum !== 100) er.pct = `ເປີເຊັນລວມຕ້ອງເທົ່າ 100% ຕອນນີ້ລວມໄດ້ ${pctSum}% ປັບໃຫ້ຄົບ 100`
  if (!Number.isInteger(n('tier2From')) || n('tier2From') < 2) er.tier2From = 'ຂັ້ນທີ 2 ຕ້ອງເລີ່ມທີ່ 2 ແພັກຂຶ້ນໄປ'
  if (!Number.isInteger(n('tier3From')) || n('tier3From') <= n('tier2From')) er.tier3From = 'ຂັ້ນທີ 3 ຕ້ອງຫຼາຍກວ່າຈຸດເລີ່ມຂັ້ນທີ 2'
  if (d.approvalOn && !d.approver.trim()) er.approver = 'ໃສ່ຊື່ຜູ້ອະນຸມັດກ່ອນເປີດໃຊ້ການອະນຸມັດ'
  const err = tried ? er : {}

  function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(er).length) return
    const next: Settings = {
      ...st, // overSharePct and cutoffDay are no longer used (rules confirmed 2026-11-26) but stay in stored data
      base: n('base'), fuel: n('fuel'), tier2From: n('tier2From'), tier3From: n('tier3From'),
      pct: { transport: n('transport'), onsite: n('onsite'), follow: n('follow'), warehouse: n('warehouse') },
      emptyRole: d.emptyRole, approver: d.approver.trim(), approvalOn: d.approvalOn,
    }
    set((s) => ({ ...s, settings: next }))
    toast('ບັນທຶກສຳເລັດ: ກະຕິກາ')
    setTried(false)
  }

  return (
    <Card title="ກະຕິກາຄ່າຕອບແທນ ແລະ ຮອບຕັດຍອດ">
      <form className="form" data-ui="content" onSubmit={submit} noValidate>
        <Field label="ຄ່າຕອບແທນພື້ນຖານ (ກີບຕໍ່ແພັກ)" error={err.base} hint="ຄົງທີ່ ບໍ່ຂຶ້ນກັບລາຄາຂາຍ">{inp('base')}</Field>
        <Field label="ຄ່ານ້ຳມັນ (ກີບຕໍ່ແພັກ)" error={err.fuel} hint="ຄິດຕາມຈຳນວນແພັກ">{inp('fuel')}</Field>
        {ROLES.map((r) => (
          <Field key={r} label={`${ROLE_LABEL[r]} (%)`} hint={`= ${kip((n('base') * n(r)) / 100 || 0)} ຕໍ່ແພັກ`}>{inp(r)}</Field>
        ))}
        <div className="full">
          {err.pct ? <small className="err" role="alert">ກອກຜິດ: {err.pct}</small> : <span className="muted">ເປີເຊັນລວມ: {pctSum}%</span>}
        </div>
        <Field label="ສ່ວນຂອງບົດບາດວ່າງ">
          <select value={d.emptyRole} onChange={(e) => setD({ ...d, emptyRole: e.target.value as Settings['emptyRole'] })}>
            <option value="transport">ຍ້າຍໄປໃຫ້ຂົນສົ່ງ</option><option value="company">ເຂົ້າບໍລິສັດ</option>
          </select>
        </Field>
        <Field label="ຂັ້ນທີ 2 ເລີ່ມທີ່ (ແພັກ)" error={err.tier2From}>{inp('tier2From')}</Field>
        <Field label="ຂັ້ນທີ 3 ເລີ່ມທີ່ (ແພັກ)" error={err.tier3From}>{inp('tier3From')}</Field>
        <Field label="ຊື່ຜູ້ອະນຸມັດ" error={err.approver} hint="ໃສ່ພາຍຫຼັງໄດ້">
          <input value={d.approver} onChange={(e) => setD({ ...d, approver: e.target.value })} autoComplete="off" />
        </Field>
        <label className="check full"><input type="checkbox" checked={d.approvalOn} onChange={(e) => setD({ ...d, approvalOn: e.target.checked })} /> ເປີດໃຊ້ການອະນຸມັດ (ເປີດຫຼັງຢືນຢັນສິດ ແລະ ຂັ້ນຕອນແລ້ວ)</label>
        <div className="form-foot sticky"><button className="btn btn-primary" type="submit">ບັນທຶກກະຕິກາ</button></div>
      </form>
    </Card>
  )
}

function Pins() {
  const { changePin, toast } = useApp()
  const [who, setWho] = useState<Role>('staff')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{8}$/.test(pin)) return setErr('PIN ຕ້ອງເປັນຕົວເລກ 8 ຫຼັກ')
    setBusy(true)
    const problem = await changePin!(who, pin)
    setBusy(false)
    if (problem) return setErr(problem)
    setPin(''); setErr('')
    toast(`ປ່ຽນ PIN ຂອງ${ROLE_NAME[who]}ແລ້ວ ອຸປະກອນທີ່ໃຊ້ PIN ເກົ່າຕ້ອງເຂົ້າລະບົບໃໝ່`)
  }
  return (
    <Card title="ປ່ຽນ PIN ເຂົ້າລະບົບ">
      <form className="row" onSubmit={submit} noValidate style={{ alignItems: 'end' }}>
        <div style={{ minWidth: 170 }}><Field label="PIN ຂອງ">
          <select value={who} onChange={(e) => setWho(e.target.value as Role)}><option value="staff">{ROLE_NAME.staff}</option><option value="manager">{ROLE_NAME.manager}</option></select>
        </Field></div>
        <div style={{ flex: 1, minWidth: 180 }}><Field label="PIN ໃໝ່ (ຕົວເລກ 8 ຫຼັກ)" error={err}>
          <input type="password" inputMode="numeric" maxLength={8} autoComplete="new-password" value={pin} onChange={(e) => { setPin(e.target.value); setErr('') }} />
        </Field></div>
        <button className="btn" type="submit" disabled={busy} style={{ marginBottom: err ? 24 : 0 }}>{busy ? 'ກຳລັງປ່ຽນ…' : 'ປ່ຽນ PIN'}</button>
      </form>
      <p className="muted" style={{ marginTop: 8 }}>PIN ຂອງຜູ້ຈັດການ ແລະ ພະນັກງານຕ້ອງບໍ່ຄືກັນ ຫຼັງປ່ຽນແລ້ວ ທຸກອຸປະກອນທີ່ໃຊ້ PIN ເກົ່າຈະຖືກອອກຈາກລະບົບ</p>
    </Card>
  )
}

function Backup() {
  const { s, set, toast } = useApp()
  const [incoming, setIncoming] = useState<State | null>(null)
  const [err, setErr] = useState('')

  function download() {
    downloadText(`bonus-workspace-backup-${today()}.json`, exportJson(s))
    toast('ດາວໂຫຼດໄຟລ໌ສຳຮອງແລ້ວ')
  }
  async function pick(file?: File) {
    if (!file) return
    const r = parseBackup(await file.text())
    if ('error' in r) { setErr(r.error); setIncoming(null) } else { setErr(''); setIncoming(r.state) }
  }
  const count = (x: State) => `ພະນັກງານ ${x.staff.length} · ລູກຄ້າ ${x.customers.length} · ສິນຄ້າ ${x.products.length} · ລາຍການຂາຍ ${x.sales.length} · ເງິນສົດ ${x.cash.length} · ສະຕັອກ ${x.moves.length}`

  return (
    <Card title={`ສຳຮອງ ແລະ ກູ້ຄືນຂໍ້ມູນ · ໄຟລ໌ສຳຮອງເວີຊັນ ${BACKUP_VERSION}`}>
      <div className="row">
        <button className="btn" onClick={download}>ດາວໂຫຼດ JSON</button>
        <label className="btn" style={{ position: 'relative' }}>
          ນຳເຂົ້າ JSON
          <input type="file" accept="application/json,.json" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', height: '100%' }}
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
      {err && <p className="warn" role="alert" style={{ marginTop: 12 }}>ນຳເຂົ້າບໍ່ໄດ້: {err}</p>}
      {incoming && (
        <div className="note" style={{ marginTop: 12 }} role="alertdialog" aria-label="ຢືນຢັນການນຳເຂົ້າ">
          <p><b>ໄຟລ໌ຜ່ານການກວດແລ້ວ</b> — {count(incoming)}</p>
          <p>ຂໍ້ມູນປັດຈຸບັນ ({count(s)}) ຈະຖືກແທນທີ່ທັງໝົດ ແລະ ກູ້ຄືນບໍ່ໄດ້ ຖ້າຍັງບໍ່ໄດ້ດາວໂຫຼດສຳຮອງໄວ້</p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-danger" onClick={() => { set(() => incoming); setIncoming(null); toast('ນຳເຂົ້າສຳເລັດ: ແທນທີ່ຂໍ້ມູນແລ້ວ') }}>ແທນທີ່ຂໍ້ມູນເກົ່າ</button>
            <button className="btn" onClick={() => setIncoming(null)}>ຍົກເລີກ</button>
          </div>
        </div>
      )}
    </Card>
  )
}
