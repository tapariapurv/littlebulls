import { StrictMode, Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react'
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, updateProfile, type User,
} from 'firebase/auth'
import { api, auth, blip, candles, mutate, nameOf, notify, preload, savePortfolio, screen, useQuotes, usePortfolios, useSearch, useSettings, type Row } from './data'
import { cancelOrder, clearAlerts, firedAlerts, marketOrder, newPortfolio, settle, summary, type Portfolio } from './engine'
import { EXCHANGES, exchange, short } from './markets'
import { Analytics, History, Icon, SettingsPage, Watchlist } from './More'
import { Bully, Empty, Modal, Num, Tabs, Term, Tick, Toaster, money, setCurrency, signedMoney, spring, tone, useToast } from './ui'
import './styles.css'

// The chart library is big, so it arrives after login, in the background, before a stock is opened.
const loadStock = () => import('./Stock')
const Stock = lazy(() => loadStock().then(m => ({ default: m.Stock })))
const Discover = lazy(() => import('./Discover').then(m => ({ default: m.Discover })))
// A tab left open across a new release asks for files that are gone; reloading picks up the new ones.
addEventListener('vite:preloadError', () => location.reload())

const useHash = () => useSyncExternalStore(cb => {
  addEventListener('hashchange', cb)
  return () => removeEventListener('hashchange', cb)
}, () => location.hash || '#/')

const FRIENDLY: Record<string, string> = {
  'auth/invalid-credential': 'That email and password don’t match.',
  'auth/email-already-in-use': 'That email already has an account. Try logging in.',
  'auth/weak-password': 'Pick a password with at least 6 characters.',
  'auth/invalid-email': 'That doesn’t look like an email address.',
  'auth/popup-closed-by-user': 'The Google window was closed. Try again when you’re ready.',
}

function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [nick, setNick] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState('')
  const fail = (e: { code?: string }) => setMsg(FRIENDLY[e.code ?? ''] ?? `Something went wrong (${e.code ?? 'unknown'}). Try again.`)

  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg('')
    try {
      if (mode === 'in') await signInWithEmailAndPassword(auth, email, pass)
      else {
        const c = await createUserWithEmailAndPassword(auth, email, pass)
        await updateProfile(c.user, { displayName: nick.trim() })
      }
    } catch (err) { fail(err as { code?: string }) }
  }

  return (
    <main className="login">
      <section className="login-art">
        <motion.div initial={{ scale: 0.9, rotate: -4 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.5, duration: 0.7 }}><Bully size={168} /></motion.div>
        <h1>LittleBulls<small>Paper trading for kids</small></h1>
        <p>Learn the stock market with real prices and pretend money. Nobody can lose real money here.</p>
      </section>
      <section className="login-form">
        <h2>{mode === 'up' ? 'Make your account' : 'Welcome back'}</h2>
        <form onSubmit={submit}>
          {mode === 'up' && <label>Nickname<input required maxLength={24} value={nick} onChange={e => setNick(e.target.value)} autoComplete="nickname" /></label>}
          <label>Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
          <label>Password<input required type="password" minLength={6} value={pass} onChange={e => setPass(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} /></label>
          {msg && <p className="note bad" role="alert">{msg}</p>}
          <motion.button className="primary buy" whileTap={{ scale: 0.97 }}>{mode === 'up' ? 'Start trading' : 'Log in'}</motion.button>
        </form>
        <button className="ghost" onClick={() => signInWithPopup(auth, new GoogleAuthProvider()).catch(fail)}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.5 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8 6.2C12.5 13.6 17.8 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 2.9-2.2 5.4-4.6 7l7.2 5.6c4.2-3.9 7.2-9.6 7.2-17.1z" /><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-8-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2.2 1.5-5 2.4-8.7 2.4-6.2 0-11.5-4.1-13.4-9.8l-8 6.2C6.5 42.6 14.6 48 24 48z" /></svg>
          Continue with Google
        </button>
        <p className="muted">
          <button className="link" onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setMsg('') }}>{mode === 'up' ? 'I already have an account' : 'I need a new account'}</button>
          {mode === 'in' && <> · <button className="link" onClick={() => email ? sendPasswordResetEmail(auth, email).then(() => setMsg('Check your email for a reset link.')).catch(fail) : setMsg('Type your email first.')}>Forgot password</button></>}
        </p>
      </section>
    </main>
  )
}

function NewPortfolio({ uid, onDone, onClose, first }: { uid: string; onDone: (id: string) => void; onClose?: () => void; first: boolean }) {
  const [name, setName] = useState(first ? 'My first portfolio' : '')
  const [amount, setAmount] = useState(100000)
  const [ex, setEx] = useState('NSE')
  const m = exchange(ex)
  const big = { JPY: 10, KRW: 100, IDR: 1000 }[m.currency] ?? 1 // so the chips mean roughly the same in every currency
  const fmt = new Intl.NumberFormat(m.locale, { style: 'currency', currency: m.currency, maximumFractionDigits: 0 })
  const busy = useRef(false) // a ref because a double click can land before React redraws, and would make two portfolios
  const toast = useToast()
  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    busy.current = true
    const p = newPortfolio(name.trim(), amount, ex)
    onDone(p.id) // the database shows a new portfolio to this tab at once; the save carries on behind it
    savePortfolio(uid, p).catch(() => { busy.current = false; toast({ title: 'That didn’t go through', body: 'Check your internet and try again.', mood: 'hmm' }) })
  }
  return (
    <Modal onClose={onClose} label="New portfolio">
      <Bully size={64} />
      <h2>{first ? 'Let’s fill your piggy bank' : 'New portfolio'}</h2>
      <p className="muted">A portfolio is your collection of trades. Try different ideas in different ones.</p>
      <form onSubmit={submit}>
        <label>Name it<input required maxLength={30} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Stock exchange
          <select value={ex} onChange={e => setEx(e.target.value)}>
            {[...new Set(EXCHANGES.map(x => x.region))].map(r => <optgroup key={r} label={r}>
              {EXCHANGES.filter(x => x.region === r).map(x => <option key={x.id} value={x.id}>{x.name} ({x.currency})</option>)}
            </optgroup>)}
          </select>
          <small>This portfolio can only trade here, in {m.currency}. Make another portfolio to try a different exchange.</small>
        </label>
        <label>Pretend money to start with
          <input required inputMode="numeric" value={amount ? amount.toLocaleString(m.locale) : ''} onChange={e => setAmount(Math.min(1e9, Number(e.target.value.replace(/\D/g, ''))))} />
        </label>
        <div className="chips">{[10000, 100000, 1000000].map(x => x * big).map(a => (
          <button type="button" key={a} className={amount === a ? 'on' : ''} onClick={() => setAmount(a)}>{fmt.format(a)}</button>
        ))}</div>
        <motion.button className="primary buy" disabled={!amount} whileTap={{ scale: 0.97 }}>Create portfolio</motion.button>
      </form>
    </Modal>
  )
}

function Home({ uid, p }: { uid: string; p: Portfolio }) {
  const toast = useToast()
  const syms = [...Object.keys(p.positions), ...p.orders.map(o => o.sym)]
  const q = useQuotes(syms)
  const prices = Object.fromEntries(Object.values(q.bySym).map(x => [x.symbol, x.price]))
  const s = summary(p, prices)
  const [tab, setTab] = useState<'own' | 'wait'>('own')
  const gain = s.equity - p.start
  const parts = [['free', Math.max(s.available, 0)], ['dep', s.margin], ['hold', s.ordersMargin]] as const
  const total = parts.reduce((a, [, v]) => a + v, 0) || 1
  const held = Object.entries(p.positions)

  const close = (sym: string) => {
    const pos = p.positions[sym], px = prices[sym]
    if (!px) return
    mutate(uid, p.id, c => c.positions[sym] ? marketOrder(c, sym, pos.qty > 0 ? 'sell' : 'buy', Math.abs(c.positions[sym].qty), px) : null)
      .then(() => blip()).then(() => toast({ title: `Closed ${nameOf(sym)}`, body: 'That win or loss is now locked in.' }))
  }

  return (
    <div className="home">
      <header className="title">
        <div><h1>{p.name}</h1>
          <p className="muted">{gain === 0 ? `You started with ${money(p.start)}.` : <>You’re <b className={tone(gain)}>{gain > 0 ? 'up' : 'down'} {money(Math.abs(gain))}</b> since you started with {money(p.start)}.</>}</p>
        </div>
        <a className="primary buy small" href="#/stocks">Find a stock</a>
      </header>
      <section className="card worth">
        <div className="worth-top">
          <div><Term k="worth">Total worth</Term><b className="answer"><Num value={s.equity} /></b></div>
          <Bully size={72} mood={s.equity < p.start ? 'hmm' : 'happy'} />
        </div>
        <div className="jar" role="img" aria-label={`Free ${money(s.available)}, deposit ${money(s.margin)}, on hold ${money(s.ordersMargin)}`}>
          {parts.map(([k, v]) => v > 0 && <motion.i key={k} className={k} initial={false} animate={{ flexGrow: v / total }} transition={spring} />)}
        </div>
        <dl className="legend">
          <div><dt><i className="free" /><Term k="available">Free</Term></dt><dd className="num"><Num value={s.available} /></dd></div>
          <div><dt><i className="dep" /><Term k="margin">Deposit</Term></dt><dd className="num"><Num value={s.margin} /></dd></div>
          <div><dt><i className="hold" /><Term k="ordersMargin">On hold</Term></dt><dd className="num"><Num value={s.ordersMargin} /></dd></div>
          <div><dt><Term k="balance">Your money</Term></dt><dd className="num"><Num value={s.balance} /></dd></div>
          <div><dt><Term k="realized">Locked in</Term></dt><dd className={'num ' + tone(s.realized)}><Num value={s.realized} format={signedMoney} /></dd></div>
          <div><dt><Term k="unrealized" end>Still open</Term></dt><dd className={'num ' + tone(s.unrealized)}><Num value={s.unrealized} format={signedMoney} /></dd></div>
        </dl>
        <p className="muted small-note">You can trade up to twice your money. <Term k="marginCall">What if I lose too much?</Term></p>
      </section>
      <section className="card">
        <Tabs id="home" value={tab} onChange={setTab} options={[['own', `What I have (${held.length})`], ['wait', `Waiting orders (${p.orders.length})`]]} />
        {tab === 'own' && (held.length ? (
          <div className="scroll"><table><thead><tr><th>Stock</th><th className="r">Shares</th><th className="r">My price</th><th className="r">Now</th><th className="r"><Term k="unrealized" end>Win or loss</Term></th><th /></tr></thead><tbody>
            <AnimatePresence initial={false}>{held.map(([sym, pos]) => {
              const px = prices[sym]; const pl = px ? (px - pos.avg) * pos.qty : null
              return <motion.tr key={sym} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                <td><a href={'#/stock/' + sym}><b>{nameOf(sym)}</b></a><small>{pos.qty < 0 ? 'Sold first, buy back later' : short(sym)}</small></td>
                <td className="r num">{Math.abs(pos.qty)}</td><td className="r num">{money(pos.avg)}</td>
                <td className="r">{px ? <Tick value={px} /> : '—'}</td>
                <td className={'r num ' + tone(pl ?? 0)}>{pl === null ? '—' : signedMoney(pl)}</td>
                <td className="r"><button className="ghost tiny" disabled={!q.open || !px} title={q.open ? '' : 'The market is closed'} onClick={() => close(sym)}>Close</button></td>
              </motion.tr>
            })}</AnimatePresence></tbody></table></div>
        ) : <Empty text="Nothing here yet. Find a stock you know, like the company behind your favourite biscuits." />)}
        {tab === 'wait' && (p.orders.length ? (
          <div className="scroll"><table><thead><tr><th>Stock</th><th>Plan</th><th className="r">Shares</th><th className="r">Price</th><th /></tr></thead><tbody>
            {p.orders.map(o => <tr key={o.id}>
              <td><a href={'#/stock/' + o.sym}><b>{nameOf(o.sym)}</b></a></td>
              <td>{o.side === 'buy' ? 'Buy' : 'Sell'} <Term k={o.type}>{o.type === 'limit' ? 'at my price' : 'if it reaches'}</Term></td>
              <td className="r num">{o.qty}</td><td className="r num">{money(o.price)}</td>
              <td className="r"><button className="ghost tiny" onClick={() => mutate(uid, p.id, c => cancelOrder(c, o.id))}>Cancel</button></td>
            </tr>)}</tbody></table></div>
        ) : <Empty text="No waiting orders. When the market is closed, you can set a price and let your order wait for it." />)}
      </section>
    </div>
  )
}

function Stocks({ ex }: { ex: string }) {
  const [text, setText] = useState('')
  const found = useSearch(text, ex)
  const [giants, setGiants] = useState<Row[]>([])
  useEffect(() => { screen('giants', ex, 15).then(setGiants).catch(() => {}) }, [ex])
  useEffect(() => { if (found?.[0]) preload(found[0].symbol) }, [found]) // the likely pick is ready before it's tapped
  const rows = found ?? giants
  const q = useQuotes(rows.slice(0, 20).map(r => r.symbol))
  return (
    <div className="stocks">
      <header className="title"><div><h1>Stocks</h1><p className="muted">Companies on {exchange(ex).name}.</p></div></header>
      <input className="search" type="search" aria-label="Search for a stock" placeholder="Search a company or ticker" value={text} onChange={e => setText(e.target.value)} />
      <section className="card stock-list">
        {found?.length === 0 && <Empty text={`Bully couldn’t find “${text}” on ${exchange(ex).name}. Try another name.`} />}
        {rows.map(r => {
          const x = q.bySym[r.symbol]; const pct = x ? (x.price - x.prev) / x.prev * 100 : 0
          return <a key={r.symbol} href={'#/stock/' + r.symbol} onPointerEnter={() => preload(r.symbol)}>
            <span className="mono-mark" style={{ background: `hsl(${[...r.symbol].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360} 70% 92%)`, color: `hsl(${[...r.symbol].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360} 70% 25%)` }}>{r.name[0]}</span>
            <span><b>{r.name}</b><small>{short(r.symbol)}</small></span>
            {x && <span className="r"><Tick value={x.price} /><small className={'num ' + tone(pct)}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</small></span>}
          </a>
        })}
      </section>
    </div>
  )
}

/** Fills waiting orders and checks for margin calls, even for trades placed days ago. */
function useSettler(uid: string, p: Portfolio | undefined) {
  const toast = useToast()
  const latest = useRef(p)
  latest.current = p
  const key = p ? [p.id, ...p.orders.map(o => o.id), ...Object.keys(p.positions), ...p.alerts.map(a => a.id)].join() : ''
  useEffect(() => {
    if (!p || (!p.orders.length && !p.alerts.length && !Object.keys(p.positions).length)) return
    let wait = 0
    const run = async () => {
      const now = latest.current!
      // Only alerts and orders need a hidden tab to keep working. A closed market can't reach anything, so it's checked rarely.
      if (Date.now() < wait || (document.hidden && !now.orders.length && !now.alerts.length)) return
      const orderSyms = [...new Set(now.orders.map(o => o.sym))]
      const syms = [...new Set([...orderSyms, ...Object.keys(now.positions), ...now.alerts.map(a => a.sym)])]
      const oldest = (s: string) => Math.min(...now.orders.filter(o => o.sym === s).map(o => o.at))
      const [hist, quotes] = await Promise.all([
        Promise.all(orderSyms.map(async s => {
          const recent = await candles(s, 'orders') // small candles only go back a few days, so older orders also check daily ones
          return Date.now() - oldest(s) < 4 * 86400000 ? recent : [...await candles(s, '6M'), ...recent].sort((a, b) => a.t - b.t)
        })),
        api<{ open: boolean; quotes: { symbol: string; price: number }[] }>('quote?symbols=' + encodeURIComponent(syms.slice(0, 40).join(','))),
      ])
      wait = quotes.open ? 0 : Date.now() + 300000
      const byS = Object.fromEntries(orderSyms.map((s, i) => [s, hist[i]]))
      const prices = Object.fromEntries(quotes.quotes.map(x => [x.symbol, x.price]))
      const change = (c: Portfolio) => {
        const next = settle(c, byS, prices), hits = firedAlerts(next ?? c, prices)
        return { next: hits.length ? clearAlerts(next ?? c, hits) : next, settled: next, hits }
      }
      if (!change(now).next) return // nothing happened, which is nearly always, so no database read is spent finding that out
      let before = 0, after = 0, forced = false, fired: Portfolio['alerts'] = []
      await mutate(uid, now.id, c => {
        const { next, settled, hits } = change(c)
        before = c.trades.length; after = settled?.trades.length ?? before; forced = !!settled?.trades[0]?.forced; fired = hits
        return next
      }, false)
      for (const a of fired) {
        const body = `${nameOf(a.sym)} reached ${money(a.price)}.`
        toast({ title: 'Your alert went off', body, mood: 'wow' })
        blip()
        notify('LittleBulls alert', body)
      }
      if (after > before) notify('LittleBulls', forced ? 'Bully closed your trades to protect your money.' : 'A waiting order happened.')
      if (after > before) blip()
      if (forced) toast({ title: 'Bully closed your trades', body: 'Losses ate half your deposit, so your trades were closed to protect your money.', mood: 'hmm' })
      else if (after > before) toast({ title: 'A waiting order happened', body: 'The market reached your price. Check your portfolio.', mood: 'wow' })
    }
    run().catch(() => {})
    const t = setInterval(() => run().catch(() => {}), 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key])
}

const NAV = [['home', 'My money'], ['stocks', 'Stocks'], ['watchlist', 'Watchlist'], ['discover', 'Discover'], ['analytics', 'Analytics'], ['history', 'History'], ['settings', 'Settings']]

function Shell({ user }: { user: User }) {
  const hash = useHash()
  const list = usePortfolios(user.uid)
  const [pid, setPid] = useState(() => { try { return localStorage.getItem('pid') ?? '' } catch { return '' } })
  const [adding, setAdding] = useState(false)
  const p = list?.find(x => x.id === pid) ?? list?.[0]
  const pick = (id: string) => { setPid(id); setAdding(false); try { localStorage.setItem('pid', id) } catch { /* private window */ } }
  useSettler(user.uid, p)
  const stockSym = hash.startsWith('#/stock/') ? decodeURIComponent(hash.slice(8)) : ''
  const route = stockSym ? 'stock' : NAV.some(([id]) => id === hash.slice(2)) ? hash.slice(2) : 'home'
  useEffect(() => { loadStock().catch(() => {}) }, [])
  const m = p ? exchange(p.exchange) : null
  if (m) setCurrency(m.currency, m.locale)

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <a className="brand" href="#/"><Bully size={36} /><span>LittleBulls</span></a>
        <label className="switch">Portfolio
          <select value={p?.id ?? ''} onChange={e => e.target.value === '+' ? setAdding(true) : pick(e.target.value)}>
            {list?.map(x => <option key={x.id} value={x.id}>{x.name} · {x.exchange}</option>)}
            <option value="+">+ New portfolio</option>
          </select>
        </label>
        <LayoutGroup>
          <div className="nav-links">{NAV.map(([id, label]) => {
            const on = route === id || (id === 'stocks' && route === 'stock')
            return <a key={id} href={id === 'home' ? '#/' : '#/' + id} className={'nav' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined}>
              {on && <motion.i layoutId="nav" transition={spring} />}<Icon name={id} /><span>{label}</span>
            </a>
          })}</div>
        </LayoutGroup>
        <div className="me"><span>{user.displayName || 'Trader'}</span></div>
      </nav>
      <main className="canvas">
        {list === null ? <div className="boot"><Bully size={72} /><p className="muted">Opening your piggy bank…</p></div> : p && (
          <>
            {route === 'home' && <Home uid={user.uid} p={p} />}
            {route === 'stocks' && <Stocks key={p.exchange} ex={p.exchange} />}
            {route === 'watchlist' && <Watchlist uid={user.uid} p={p} />}
            {route === 'analytics' && <Analytics p={p} />}
            {route === 'history' && <History p={p} />}
            {route === 'settings' && <SettingsPage user={user} p={p} />}
            <Suspense fallback={<div className="boot"><Bully size={72} /></div>}>
              {route === 'discover' && <Discover key={p.exchange} ex={p.exchange} />}
              {route === 'stock' && <Stock key={stockSym + p.id} uid={user.uid} p={p} symbol={stockSym} />}
            </Suspense>
          </>
        )}
      </main>
      <AnimatePresence>
        {list && (list.length === 0 || adding) && (
          <NewPortfolio uid={user.uid} first={list.length === 0} onDone={pick} onClose={list.length ? () => setAdding(false) : undefined} />
        )}
      </AnimatePresence>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  useEffect(() => { document.getElementById('about')!.hidden = !!user }, [user]) // the public page text in index.html
  if (user === undefined) return <div className="boot full"><Bully size={72} /></div>
  return user ? <Shell key={user.uid} user={user} /> : <Login />
}

function Root() {
  const { calm } = useSettings()
  return <MotionConfig reducedMotion={calm ? 'always' : 'user'}><Toaster><App /></Toaster></MotionConfig>
}

if (import.meta.env.PROD) navigator.serviceWorker?.register('/sw.js').catch(() => {})

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>)
