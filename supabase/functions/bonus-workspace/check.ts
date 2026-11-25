// Full check of the workspace data. Used by the app (loading, importing a backup) and by the server before every save,
// so one bad save can never lock every device out. Self-contained on purpose: the edge function cannot import from src/.

const ROLES = ['transport', 'onsite', 'follow', 'warehouse']
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown) => typeof v === 'string'
const fail = (m: string): never => { throw new Error(m) }

/** Checks the shape of saved data. Throws a Lao message naming the first problem. */
export function check(d: any): any {
  if (!d || typeof d !== 'object') fail('ບໍ່ພົບຂໍ້ມູນໃນໄຟລ໌')
  d.payouts ??= [] // added later: older saved data and backups do not have it
  if (!Array.isArray(d.payouts)) fail('ລາຍການຈ່າຍຄ່າຕອບແທນບໍ່ຖືກຮູບແບບ')
  d.claims ??= [] // added 2026-11-25
  if (!Array.isArray(d.claims)) fail('ລາຍການຂໍເບີກບໍ່ຖືກຮູບແບບ')
  for (const k of ['staff', 'customers', 'followIds', 'warehouseIds', 'products', 'sales', 'cash', 'moves', 'cancels'])
    if (!Array.isArray(d[k])) fail(`ຂາດລາຍການ "${k}"`)
  // Old per-category payout marks (before 2026-11-25) become paid claims, so all payment tracking lives in one list.
  // Done here, not only in the app, so the server compares old and new data in the same form and staff saves are not refused.
  if (d.payouts.length) {
    for (const p of d.payouts) if (!isStr(p?.id) || !isStr(p?.ym) || !isStr(p?.staffId) || !isNum(p?.amount) || !/^\d{4}-\d\d-\d\d$/.test(p?.date)) fail('ລາຍການຈ່າຍຄ່າຕອບແທນເດີມມີແຖວທີ່ບໍ່ຄົບ')
    d.claims = [...d.claims, ...d.payouts.map((p: any) => ({ id: p.id, ym: p.ym, staffId: p.staffId, amount: p.amount, date: p.date, note: 'ຍ້າຍມາຈາກການໝາຍຈ່າຍເດີມ', status: 'paid', decidedAt: p.date }))]
    d.payouts = []
  }
  for (const k of ['staff', 'customers'])
    for (const x of d[k]) if (!isStr(x?.id) || !isStr(x?.name)) fail(`ລາຍຊື່ "${k}" ມີແຖວທີ່ບໍ່ຄົບ`)
  for (const p of d.products) {
    if (!isStr(p?.id) || !isStr(p?.name) || !['water', 'bag'].includes(p?.cat)) fail('ສິນຄ້າມີແຖວທີ່ບໍ່ຄົບ')
    for (const k of ['cost', 'minProfit', 'recommended']) if (!isNum(p[k]) || p[k] < 0) fail(`ສິນຄ້າ "${p.name}" ມີຕົວເລກບໍ່ຖືກ (${k})`)
    for (const k of ['ceiling', 'firstTier']) if (p[k] !== null && !isNum(p[k])) fail(`ສິນຄ້າ "${p.name}" ມີຕົວເລກບໍ່ຖືກ (${k})`)
  }
  for (const x of d.sales) {
    if (!isStr(x?.id) || !isStr(x?.billNo) || !/^\d{4}-\d\d-\d\d$/.test(x?.date) || !isNum(x?.qty) || !isNum(x?.price)
      || !['pending', 'approved', 'rejected'].includes(x?.status) || !x.staff || ROLES.some((r) => !isStr(x.staff[r])))
      fail(`ລາຍການຂາຍມີແຖວທີ່ບໍ່ຄົບ (ບິນ ${x?.billNo ?? '?'})`)
  }
  for (const x of d.cash) if (!isNum(x?.amount) || !isStr(x?.date)) fail('ລາຍການເງິນສົດມີແຖວທີ່ບໍ່ຄົບ')
  for (const x of d.moves) if (!isNum(x?.qty) || !isStr(x?.date) || !['out', 'return', 'damage'].includes(x?.type)) fail('ລາຍການສະຕັອກມີແຖວທີ່ບໍ່ຄົບ')
  for (const x of d.cancels) if (!isStr(x?.billNo) || !isStr(x?.date)) fail('ລາຍການບິນຍົກເລີກມີແຖວທີ່ບໍ່ຄົບ')

  // two rows with one id would let a permission check look at one row while the app counts the other
  for (const k of ['staff', 'customers', 'products', 'sales', 'cash', 'moves', 'cancels', 'payouts', 'claims']) {
    const ids = d[k].map((x: any) => x?.id)
    if (ids.some((id: unknown) => !isStr(id) || !id) || new Set(ids).size !== ids.length) fail(`ລາຍການ "${k}" ມີລະຫັດຊ້ຳ ຫຼື ຂາດລະຫັດ`)
  }

  // every reference must point at something that exists, or a bill would silently drop out of the totals
  const staffIds = new Set(d.staff.map((x: any) => x.id))
  const customerIds = new Set(d.customers.map((x: any) => x.id))
  const productCat = new Map<string, string>(d.products.map((p: any) => [p.id, p.cat]))
  for (const id of [...d.followIds, ...d.warehouseIds]) if (!staffIds.has(id)) fail('ຜູ້ຕິດຕາມ ຫຼື ນາຍສາງ ອ້າງເຖິງພະນັກງານທີ່ບໍ່ມີໃນລາຍຊື່')
  for (const x of d.sales) {
    if (!Number.isInteger(x.qty) || x.qty < 1 || x.price < 0) fail(`ບິນ ${x.billNo} ມີຈຳນວນ ຫຼື ລາຄາບໍ່ຖືກ`)
    if (!productCat.has(x.productId)) fail(`ບິນ ${x.billNo} ອ້າງເຖິງສິນຄ້າທີ່ບໍ່ມີໃນລາຍການ`)
    if (productCat.get(x.productId) !== x.cat) fail(`ບິນ ${x.billNo} ມີໝວດບໍ່ກົງກັບສິນຄ້າ`)
    if (x.customerId && !customerIds.has(x.customerId)) fail(`ບິນ ${x.billNo} ອ້າງເຖິງລູກຄ້າທີ່ບໍ່ມີໃນລາຍຊື່`)
    for (const r of ROLES) if (x.staff[r] && !staffIds.has(x.staff[r])) fail(`ບິນ ${x.billNo} ອ້າງເຖິງພະນັກງານທີ່ບໍ່ມີໃນລາຍຊື່`)
  }
  for (const x of d.cash) if (!staffIds.has(x.followId) || !['water', 'bag'].includes(x.cat)) fail('ລາຍການເງິນສົດອ້າງເຖິງຜູ້ຕິດຕາມ ຫຼື ໝວດທີ່ບໍ່ມີ')
  for (const x of d.moves) if (!productCat.has(x.productId) || (x.staffId && !staffIds.has(x.staffId))) fail('ລາຍການສະຕັອກອ້າງເຖິງສິນຄ້າ ຫຼື ພະນັກງານທີ່ບໍ່ມີໃນລາຍການ')
  for (const x of d.payouts) if (!isStr(x?.ym) || !isNum(x?.amount) || !staffIds.has(x?.staffId)) fail('ລາຍການຈ່າຍຄ່າຕອບແທນມີແຖວທີ່ບໍ່ຄົບ ຫຼື ອ້າງເຖິງພະນັກງານທີ່ບໍ່ມີ')

  for (const x of d.claims)
    if (!isStr(x?.ym) || !/^\d{4}-\d\d-\d\d$/.test(x?.date) || !isNum(x?.amount) || x.amount <= 0 || !isStr(x?.note)
      || !['requested', 'paid', 'rejected'].includes(x?.status) || !staffIds.has(x?.staffId))
      fail('ລາຍການຂໍເບີກມີແຖວທີ່ບໍ່ຄົບ ຫຼື ອ້າງເຖິງພະນັກງານທີ່ບໍ່ມີ')

  const st = d.settings
  if (!st || !st.pct) fail('ຂາດການຕັ້ງຄ່າກະຕິກາ')
  for (const k of ['base', 'fuel', 'overSharePct', 'tier2From', 'tier3From', 'cutoffDay']) if (!isNum(st[k])) fail(`ການຕັ້ງຄ່າ "${k}" ບໍ່ແມ່ນຕົວເລກ`)
  for (const r of ROLES) if (!isNum(st.pct[r])) fail('ເປີເຊັນຕາມບົດບາດບໍ່ຄົບ')
  return d
}

