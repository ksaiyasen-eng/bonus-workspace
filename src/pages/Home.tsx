import { useState } from 'react'
import { kip, num, periodOf, periodRange, fmtDate, today } from '../rules.ts'
import { CAT_LABEL, nameOf, withCalc } from '../store.ts'
import { Card, DateNav, Empty, SaleStatus, Table, useApp } from '../ui.tsx'

export function Home() {
  const { s } = useApp()
  const [date, setDate] = useState(today)
  const rows = withCalc(s, s.sales.filter((x) => x.date === date && x.status !== 'rejected'))
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0)
  const revenue = sum((r) => r.c.revenue)
  const byCat = (cat: string) => sum((r) => (r.x.cat === cat ? r.c.revenue : 0))
  const pendingDay = rows.filter((r) => r.x.status === 'pending').length
  const pendingAll = s.sales.filter((x) => x.status === 'pending').length
  const max = Math.max(byCat('water'), byCat('bag'), 1)
  const [from, to] = periodRange(periodOf(date, s.settings.cutoffDay), s.settings.cutoffDay)

  return (
    <>
      <DateNav value={date} onChange={setDate} />
      <div className="grid4" data-ui="content">
        <div className="card stat"><small>ຍອດຂາຍ (ລວມລໍຖ້າອະນຸມັດ)</small><strong>{kip(revenue)}</strong><small>ວັນທີ {fmtDate(date)}</small></div>
        <div className="card stat"><small>ຈຳນວນແພັກ</small><strong>{num(sum((r) => r.x.qty))} ແພັກ</strong><small>{rows.length} ລາຍການຂາຍ</small></div>
        <div className="card stat"><small>ຄ່າຕອບແທນ (ສະເພາະຮັບຮອງແລ້ວ)</small><strong>{kip(sum((r) => (r.x.status === 'approved' ? r.c.staffTotal : 0)))}</strong><small>ບໍ່ນັບລາຍການລໍຖ້າອະນຸມັດ</small></div>
        <a className="card stat" href="#/reports/pending"><small>ລໍຖ້າອະນຸມັດ</small><strong>{pendingDay} ລາຍການ</strong><small>ຄ້າງທັງໝົດ {pendingAll} ລາຍການ · ກົດເພື່ອກວດ</small></a>
      </div>
      <div className="cols">
        <div className="stack">
          <Card title="ຍອດຂາຍຕາມປະເພດ">
            <div className="bars" role="img" aria-label={`ນ້ຳແພັກ ${kip(byCat('water'))}, ຖົງຂີ້ເຫຍື້ອ ${kip(byCat('bag'))}`}>
              {(['water', 'bag'] as const).map((c, i) => (
                <div className="bar-row" key={c}>
                  <span>{CAT_LABEL[c]}</span>
                  <div className="bar"><i className={i ? 'b2' : ''} style={{ width: `${(byCat(c) / max) * 100}%` }} /></div>
                  <b>{kip(byCat(c))}</b>
                </div>
              ))}
            </div>
          </Card>
          <Card title="ລາຍການຂາຍປະຈຳວັນ" action={<a className="btn" href="#/reports">ເບິ່ງລາຍງານ</a>}>
            {rows.length === 0 ? (
              <Empty text={`ຍັງບໍ່ມີລາຍການຂາຍໃນວັນທີ ${fmtDate(date)}`} action="ເລີ່ມບັນທຶກຂາຍ" to="#/water" primary />
            ) : (
              <>
                <Table head={['ເລກທີບິນ', 'ປະເພດ', 'ລູກຄ້າ', 'ຈຳນວນ', 'ຍອດຂາຍ', 'ສະຖານະ']}>
                  {rows.slice(0, 5).map(({ x, c }) => (
                    <tr key={x.id}>
                      <td>{x.billNo}</td><td>{CAT_LABEL[x.cat]}</td><td>{nameOf(s.customers, x.customerId)}</td>
                      <td className="n">{num(x.qty)}</td><td className="n">{kip(c.revenue)}</td><td><SaleStatus status={x.status} /></td>
                    </tr>
                  ))}
                </Table>
                {rows.length > 5 && <p className="muted">ສະແດງ 5 ຈາກ {rows.length} ລາຍການ · ເບິ່ງທັງໝົດໃນໜ້າ ນ້ຳແພັກ ຫຼື ຖົງຂີ້ເຫຍື້ອ</p>}
              </>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card title="ທາງລັດ">
            <div className="quick">
              <a className="btn" href="#/water">ຂາຍນ້ຳແພັກ</a>
              <a className="btn" href="#/bag">ຂາຍຖົງຂີ້ເຫຍື້ອ</a>
              <a className="btn" href="#/cash">ສົ່ງເງິນສົດ</a>
              <a className="btn" href="#/stock">ບັນທຶກສະຕັອກ</a>
            </div>
          </Card>
          <Card title="ຂໍ້ມູນພື້ນທີ່ເຮັດວຽກ" action={<a href="#/settings">ໄປຕັ້ງຄ່າ</a>}>
            <dl className="kv">
              <dt>ພະນັກງານ</dt><dd>{s.staff.length} ຄົນ</dd>
              <dt>ລູກຄ້າ</dt><dd>{s.customers.length} ລາຍ</dd>
              <dt>ສິນຄ້າ</dt><dd>{s.products.length} ລາຍການ</dd>
              <dt>ຮອບຕັດຍອດ</dt><dd>{fmtDate(from)} – {fmtDate(to)}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
