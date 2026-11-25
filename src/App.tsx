import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { brokenCopy, check, dropBrokenCopy, emptyState, load, save, type State } from './store.ts'
import { today } from './rules.ts'
import { merge3 } from './merge.ts'
import { API, ROLE_NAME, api, keepAuth, savedAuth, type Auth, type Role } from './sync.ts'
import { Ctx, Field, Icon, downloadText } from './ui.tsx'
import { Home } from './pages/Home.tsx'
import { SalePage } from './pages/Sale.tsx'
import { CashPage } from './pages/Cash.tsx'
import { StockPage } from './pages/Stock.tsx'
import { Reports } from './pages/Reports.tsx'
import { SettingsPage } from './pages/Settings.tsx'

const PAGES = [
  ['home', 'ພາບລວມ'], ['water', 'ນ້ຳແພັກ'], ['bag', 'ຖົງຂີ້ເຫຍື້ອ'], ['cash', 'ເງິນສົດ'],
  ['stock', 'ສະຕັອກ'], ['reports', 'ລາຍງານ'], ['settings', 'ຕັ້ງຄ່າ'],
] as const

const route = () => location.hash.replace(/^#\/?/, '').split('/')

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(savedAuth)
  const sign = useCallback((a: Auth | null) => { keepAuth(a); setAuth(a) }, [])
  if (!API) return <Local />
  if (!auth) return <PinGate onLogin={sign} />
  return <Shared key={auth.token} auth={auth} sign={sign} />
}

// ---- local mode: data stays in this browser ----

function Local() {
  const [s, setS] = useState<State>(load)
  const [broken, setBroken] = useState(brokenCopy) // read after load, which is what sets the copy aside
  const [brokenSaved, setBrokenSaved] = useState(false)
  useEffect(() => save(s), [s])
  return (
    <Shell s={s} set={setS} role="manager" remote={false} foot={<><Icon name="device" />ຂໍ້ມູນເກັບຢູ່ໃນອຸປະກອນນີ້</>}
      banner={broken && (
        <div className="warn" role="alert">
          <p>ອ່ານຂໍ້ມູນທີ່ເກັບໄວ້ບໍ່ໄດ້ ແອັບຈຶ່ງເລີ່ມຈາກຂໍ້ມູນຫວ່າງ ສຳເນົາຂໍ້ມູນເກົ່າຍັງຢູ່ໃນອຸປະກອນນີ້ ດາວໂຫຼດເກັບໄວ້ກ່ອນ ແລ້ວຈຶ່ງລຶບໄດ້</p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => { downloadText(`bonus-workspace-unreadable-${today()}.json`, broken); setBrokenSaved(true) }}>ດາວໂຫຼດສຳເນົາຂໍ້ມູນເກົ່າ</button>
            <button className="btn btn-danger" disabled={!brokenSaved} onClick={() => { dropBrokenCopy(); setBroken(null) }}>ລຶບສຳເນົາອອກຈາກອຸປະກອນ</button>
          </div>
        </div>
      )} />
  )
}

// ---- shared mode: sign in with a PIN, data lives on the server ----

function PinGate({ onLogin }: { onLogin: (a: Auth) => void }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{8}$/.test(pin)) return setErr('PIN ຕ້ອງເປັນຕົວເລກ 8 ຫຼັກ')
    setBusy(true)
    try {
      const r = await api({ action: 'login', pin })
      if (r.status === 200) return onLogin({ token: r.body.token, role: r.body.role })
      setErr(r.status === 429 ? 'ໃສ່ PIN ຜິດຫຼາຍຄັ້ງ ລໍຖ້າ 15 ນາທີແລ້ວລອງໃໝ່' : r.status === 401 ? 'PIN ບໍ່ຖືກ ກວດແລ້ວລອງໃໝ່' : 'ລະບົບກາງຂັດຂ້ອງ ລອງໃໝ່ອີກຄັ້ງ')
    } catch {
      setErr('ເຊື່ອມຕໍ່ບໍ່ໄດ້ ກວດອິນເຕີເນັດແລ້ວລອງໃໝ່')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="gate-page">
      <form className="card" onSubmit={submit} noValidate>
        <div className="logo" style={{ padding: 0 }}>bonus<i>.</i></div>
        <h1 style={{ fontSize: 18 }}>ເຂົ້າລະບົບ Bonus Workspace</h1>
        <Field label="PIN (ຕົວເລກ 8 ຫຼັກ)" error={err} hint="ໃຊ້ PIN ຂອງພະນັກງານ ຫຼື ຜູ້ຈັດການ">
          <input type="password" inputMode="numeric" maxLength={8} autoComplete="current-password" autoFocus value={pin} onChange={(e) => { setPin(e.target.value); setErr('') }} />
        </Field>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'ກຳລັງກວດ…' : 'ເຂົ້າລະບົບ'}</button>
      </form>
    </div>
  )
}

type SyncStatus = 'loading' | 'saved' | 'saving' | 'offline' | 'stuck'
const STATUS_TEXT: Record<SyncStatus, string> = { loading: 'ກຳລັງໂຫຼດ…', saved: 'ບັນທຶກແລ້ວ', saving: 'ກຳລັງບັນທຶກ…', offline: 'ບໍ່ໄດ້ເຊື່ອມຕໍ່ · ຈະລອງບັນທຶກໃໝ່', stuck: 'ບັນທຶກບໍ່ໄດ້' }

// Changes not yet on the server are also kept in this browser, so closing the tab while offline does not lose them.
const PENDING_KEY = 'bonus-workspace/pending'
interface Pending { base: State; version: number; local: State }
const readPending = (): Pending | null => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') } catch { return null } }
const keepPending = (p: Pending | null) => {
  try { p ? localStorage.setItem(PENDING_KEY, JSON.stringify(p)) : localStorage.removeItem(PENDING_KEY) } catch { /* storage full: the change is still in memory and still being sent */ }
}

function Shared({ auth, sign }: { auth: Auth; sign: (a: Auth | null) => void }) {
  const [pending] = useState(readPending)
  const [s, setS] = useState<State | null>(pending?.local ?? null)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [problem, setProblem] = useState('')
  const [refused, setRefused] = useState('') // a copy of changes the server would not take, for the user to download
  const base = useRef<State | null>(pending?.base ?? null) // the server state this device last saw
  const version = useRef(pending?.version ?? 0)
  const cur = useRef<State | null>(null)
  const busy = useRef(false)
  const retry = useRef(0)
  cur.current = s

  /** Takes in a newer server state, keeping whatever this device changed and has not saved yet. */
  const adopt = (data: unknown, v: number) => {
    const remote = data === null ? emptyState() : check(data)
    const next = cur.current && base.current ? merge3(base.current, cur.current, remote) : remote
    base.current = remote
    version.current = v
    setS(next)
  }

  const pull = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const r = await api({ action: 'load', token: auth.token })
      if (r.status === 401) return sign(null)
      if (r.status !== 200) throw new Error('load')
      if (!cur.current || r.body.version !== version.current) adopt(r.body.data, r.body.version)
      setStatus((x) => (x === 'loading' || x === 'offline' ? (cur.current && cur.current !== base.current ? 'saving' : 'saved') : x))
    } catch (e) {
      // data that fails the check must never be overwritten by an empty app
      if (e instanceof Error && e.message !== 'load' && !(e instanceof TypeError)) setProblem(`ຂໍ້ມູນໃນລະບົບກາງອ່ານບໍ່ໄດ້: ${e.message} ຕິດຕໍ່ຜູ້ດູແລລະບົບ`)
      else setStatus('offline')
    } finally {
      busy.current = false
    }
  }, [auth.token, sign])

  const push = useCallback(async () => {
    clearTimeout(retry.current)
    const again = (ms: number) => { retry.current = window.setTimeout(push, ms) }
    if (busy.current) return again(300)
    const local = cur.current
    if (!local || local === base.current) return
    busy.current = true
    try {
      const r = await api({ action: 'save', token: auth.token, data: local, baseVersion: version.current })
      if (r.status === 200) {
        base.current = local
        version.current = r.body.version
        if (cur.current === local) { keepPending(null); setStatus('saved') }
      } else if (r.status === 409) {
        adopt(r.body.data, r.body.version) // someone saved first: merge, then the effect below saves again
      } else if (r.status === 401) {
        sign(null)
      } else if (r.status === 403) {
        // The whole unsaved batch is rolled back, so hand the user a copy of it first.
        setRefused(JSON.stringify(local, null, 2))
        setProblem(r.body.part === 'first-save' ? 'ຜູ້ຈັດການຕ້ອງເຂົ້າລະບົບ ແລະ ຕັ້ງຄ່າຄັ້ງທຳອິດກ່ອນ ພະນັກງານຈຶ່ງບັນທຶກໄດ້' : 'ມີການປ່ຽນແປງທີ່ເຮັດໄດ້ສະເພາະຜູ້ຈັດການ ຈຶ່ງບໍ່ໄດ້ບັນທຶກ ຂໍ້ມູນຖືກດຶງກັບຄືນແລ້ວ ລາຍການທີ່ຫາກໍ່ປ້ອນຕ້ອງປ້ອນໃໝ່')
        keepPending(null)
        setS(base.current)
      } else if (r.status === 400) {
        // The server will never take this as it is, so retrying is pointless. Keep it on screen and say why.
        setRefused(JSON.stringify(local, null, 2))
        setProblem(r.body.error === 'too-big' ? 'ຂໍ້ມູນໃຫຍ່ເກີນກຳນົດຂອງລະບົບກາງ ຈຶ່ງບັນທຶກບໍ່ໄດ້ ຕິດຕໍ່ຜູ້ດູແລລະບົບ' : `ລະບົບກາງບໍ່ຮັບຂໍ້ມູນ: ${r.body.detail ?? ''} ແກ້ໄຂລາຍການນັ້ນ ຫຼື ຕິດຕໍ່ຜູ້ດູແລລະບົບ`)
        setStatus('stuck')
      } else throw new Error('save')
    } catch {
      setStatus('offline')
      again(5000)
    } finally {
      busy.current = false
    }
  }, [auth.token, sign])

  useEffect(() => {
    pull()
    const t = setInterval(pull, 20000)
    const onShow = () => document.visibilityState === 'visible' && pull()
    document.addEventListener('visibilitychange', onShow)
    return () => { clearInterval(t); clearTimeout(retry.current); document.removeEventListener('visibilitychange', onShow) }
  }, [pull])

  useEffect(() => {
    if (!s) return
    if (s === base.current) return setStatus((x) => (x === 'saving' ? 'saved' : x)) // e.g. after a refused change was rolled back
    if (base.current) keepPending({ base: base.current, version: version.current, local: s })
    setStatus('saving')
    const t = setTimeout(push, 500)
    return () => clearTimeout(t)
  }, [s, push])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (cur.current && cur.current !== base.current) e.preventDefault() }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [])

  const changePin = useCallback(async (role: Role, pin: string) => {
    try {
      const r = await api({ action: 'setPin', token: auth.token, role, newPin: pin })
      if (r.status === 200) { if (r.body.token) sign({ token: r.body.token, role: 'manager' }); return null }
      return r.body.error === 'same-pin' ? 'PIN ນີ້ຄືກັບ PIN ຂອງອີກລະດັບ ໃຊ້ PIN ອື່ນ' : r.status === 401 ? 'ໝົດເວລາເຂົ້າລະບົບ ເຂົ້າລະບົບໃໝ່ແລ້ວລອງອີກຄັ້ງ' : 'ປ່ຽນ PIN ບໍ່ໄດ້ ລອງໃໝ່ອີກຄັ້ງ'
    } catch {
      return 'ເຊື່ອມຕໍ່ບໍ່ໄດ້ ກວດອິນເຕີເນັດແລ້ວລອງໃໝ່'
    }
  }, [auth.token, sign])

  if (!s)
    return (
      <div className="gate-page">
        <div className="card" role="status">
          <p>{problem || (status === 'offline' ? 'ເຊື່ອມຕໍ່ລະບົບກາງບໍ່ໄດ້ ກວດອິນເຕີເນັດ' : 'ກຳລັງໂຫຼດຂໍ້ມູນ…')}</p>
          {status === 'offline' && !problem && <button className="btn btn-primary" onClick={() => { setStatus('loading'); pull() }}>ລອງໃໝ່</button>}
          <button className="btn" onClick={() => sign(null)}>ອອກຈາກລະບົບ</button>
        </div>
      </div>
    )

  return (
    <Shell s={s} set={setS as (fn: (s: State) => State) => void} role={auth.role} remote changePin={changePin}
      foot={<>
        <span>ຂໍ້ມູນຢູ່ລະບົບກາງ · {ROLE_NAME[auth.role]}</span>
        <span role="status">{STATUS_TEXT[status]}</span>
        <button className="btn btn-sm" onClick={() => sign(null)}>ອອກຈາກລະບົບ</button>
      </>}
      banner={problem && (
        <div className="warn" role="alert">
          <p>{problem}</p>
          <div className="row" style={{ marginTop: 8 }}>
            {refused && <button className="btn btn-sm" onClick={() => downloadText(`bonus-workspace-not-saved-${today()}.json`, refused)}>ດາວໂຫຼດສຳເນົາທີ່ບໍ່ໄດ້ບັນທຶກ</button>}
            <button className="btn btn-sm" onClick={() => { setProblem(''); setRefused('') }}>ຮັບຊາບ</button>
          </div>
        </div>
      )} />
  )
}

// ---- layout shared by both modes ----

function Shell({ s, set, role, remote, changePin, foot, banner }: {
  s: State; set: (fn: (s: State) => State) => void; role: Role; remote: boolean
  changePin?: (role: Role, pin: string) => Promise<string | null>; foot: ReactNode; banner: ReactNode
}) {
  const [[page, sub], setRoute] = useState(route)
  const [menu, setMenu] = useState(false)
  const [msg, setMsg] = useState('')
  const timer = useRef(0)

  useEffect(() => {
    const on = () => { setRoute(route()); setMenu(false); window.scrollTo(0, 0) }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  const toast = useCallback((m: string) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(''), 4000)
  }, [])

  const current = PAGES.find(([id]) => id === page) ?? PAGES[0]
  const id = current[0]

  return (
    <Ctx.Provider value={{ s, set, toast, role, remote, changePin }}>
      <div className="shell">
        <aside className={`side${menu ? ' open' : ''}`}>
          <div className="logo">bonus<i>.</i></div>
          <nav aria-label="ເມນູຫຼັກ">
            {PAGES.map(([pid, label]) => (
              <a key={pid} href={`#/${pid}`} className={pid === id ? 'on' : ''} aria-current={pid === id ? 'page' : undefined}>
                <Icon name={pid} />{label}
              </a>
            ))}
          </nav>
          <div className="side-foot">{foot}</div>
        </aside>
        {menu && <button className="scrim" aria-label="ປິດເມນູ" onClick={() => setMenu(false)} />}
        <div className="main">
          <header className="top">
            <button className="menu-btn" aria-label="ເປີດເມນູ" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>
            <h1>{current[1]}</h1>
            <div className="top-meta">
              <span>ຕັດຍອດວັນທີ {s.settings.cutoffDay}</span>
              <span>ສະກຸນເງິນ ກີບ</span>
              <b>Bonus Workspace</b>
            </div>
          </header>
          <main>
            {banner}
            {id === 'home' && <Home />}
            {(id === 'water' || id === 'bag') && <SalePage key={id} cat={id} />}
            {id === 'cash' && <CashPage />}
            {id === 'stock' && <StockPage />}
            {id === 'reports' && <Reports tab={sub} />}
            {id === 'settings' && <SettingsPage />}
          </main>
        </div>
        <div className="toast" role="status" aria-live="polite">{msg && <span>✓ {msg}</span>}</div>
      </div>
    </Ctx.Provider>
  )
}
