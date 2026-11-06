import { StrictMode, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react'
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, type User,
} from 'firebase/auth'
import { POPULAR, api, auth, candles, mutate, nameOf, savePortfolio, useQuotes, usePortfolios } from './data'
import { cancelOrder, fill, newPortfolio, settle, summary, type Portfolio } from './engine'
import { Stock } from './Stock'
import { Bully, Modal, Num, Tabs, Term, Tick, Toaster, money, signedMoney, spring, tone, useToast } from './ui'
import './styles.css'

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
        <h1>LittleBulls</h1>
        <p>Learn the stock market with real prices and pretend money. Nobody can lose a real rupee here.</p>
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
        <button className="ghost" onClick={() => signInWithPopup(auth, new GoogleAuthProvider()).catch(fail)}>Continue with Google</button>
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
  async function submit(e: FormEvent) {
    e.preventDefault()
    const p = newPortfolio(name.trim(), amount)
    await savePortfolio(uid, p)
    onDone(p.id)
  }
  return (
    <Modal onClose={onClose} label="New portfolio">
      <Bully size={64} />
      <h2>{first ? 'Let’s fill your piggy bank' : 'New portfolio'}</h2>
      <p className="muted">A portfolio is your collection of trades. Try different ideas in different ones.</p>
      <form onSubmit={submit}>
        <label>Name it<input required maxLength={30} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Pretend money to start with
          <input required inputMode="numeric" value={amount ? amount.toLocaleString('en-IN') : ''} onChange={e => setAmount(Math.min(1e9, Number(e.target.value.replace(/\D/g, ''))))} />
        </label>
        <div className="chips">{[10000, 100000, 1000000].map(a => (
          <button type="button" key={a} className={amount === a ? 'on' : ''} onClick={() => setAmount(a)}>₹{a.toLocaleString('en-IN')}</button>
        ))}</div>
        <motion.button className="primary buy" disabled={!amount} whileTap={{ scale: 0.97 }}>Create portfolio</motion.button>
      </form>
    </Modal>
  )
}

function Home({ uid, p }: { uid: string; p: Portfolio }) {
  const toast = useToast()
  const syms = [...Object.keys(p.positions), ...p.orders.map(o => o.sym), ...p.trades.slice(0, 20).map(t => t.sym)]
  const q = useQuotes(syms)
  const prices = Object.fromEntries(Object.values(q.bySym).map(x => [x.symbol, x.price]))
  const s = summary(p, prices)
  const [tab, setTab] = useState<'own' | 'wait' | 'done'>('own')
  const gain = s.equity - p.start
  const parts = [['free', Math.max(s.available, 0)], ['dep', s.margin], ['hold', s.ordersMargin]] as const
  const total = parts.reduce((a, [, v]) => a + v, 0) || 1
  const held = Object.entries(p.positions)

  const close = (sym: string) => {
    const pos = p.positions[sym], px = prices[sym]
    if (!px) return
    mutate(uid, p.id, c => c.positions[sym] ? fill(c, sym, pos.qty > 0 ? 'sell' : 'buy', Math.abs(c.positions[sym].qty), px) : null)
      .then(() => toast({ title: `Closed ${nameOf(sym)}`, body: 'That win or loss is now locked in.' }))
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
        <div className="jar" role="img" aria-label={`Free to use ${money(s.available)}, deposit ${money(s.margin)}, waiting orders ${money(s.ordersMargin)}`}>
          {parts.map(([k, v]) => v > 0 && <motion.i key={k} className={k} initial={false} animate={{ flexGrow: v / total }} transition={spring} />)}
        </div>
        <dl className="legend">
          <div><dt><i className="free" /><Term k="available">Free to use</Term></dt><dd className="num"><Num value={s.available} /></dd></div>
          <div><dt><i className="dep" /><Term k="margin">Deposit on open trades</Term></dt><dd className="num"><Num value={s.margin} /></dd></div>
          <div><dt><i className="hold" /><Term k="ordersMargin">Held for waiting orders</Term></dt><dd className="num"><Num value={s.ordersMargin} /></dd></div>
          <div><dt><Term k="balance">Your money</Term></dt><dd className="num"><Num value={s.balance} /></dd></div>
          <div><dt><Term k="realized">Locked-in wins and losses</Term></dt><dd className={'num ' + tone(s.realized)}><Num value={s.realized} format={signedMoney} /></dd></div>
          <div><dt><Term k="unrealized" end>Still-moving wins and losses</Term></dt><dd className={'num ' + tone(s.unrealized)}><Num value={s.unrealized} format={signedMoney} /></dd></div>
        </dl>
        <p className="muted small-note">You can trade up to twice your money. <Term k="marginCall">What if I lose too much?</Term></p>
      </section>
      <section className="card">
        <Tabs id="home" value={tab} onChange={setTab} options={[['own', `What I have (${held.length})`], ['wait', `Waiting orders (${p.orders.length})`], ['done', `History (${p.trades.length})`]]} />
        {tab === 'own' && (held.length ? (
          <div className="scroll"><table><thead><tr><th>Stock</th><th className="r">Shares</th><th className="r">My price</th><th className="r">Now</th><th className="r"><Term k="unrealized" end>Win or loss</Term></th><th /></tr></thead><tbody>
            <AnimatePresence initial={false}>{held.map(([sym, pos]) => {
              const px = prices[sym]; const pl = px ? (px - pos.avg) * pos.qty : null
              return <motion.tr key={sym} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                <td><a href={'#/stock/' + sym}><b>{nameOf(sym)}</b></a><small>{pos.qty < 0 ? 'Sold first, buy back later' : sym.replace('.NS', '')}</small></td>
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
        {tab === 'done' && (p.trades.length ? (
          <div className="scroll"><table><thead><tr><th>Stock</th><th>What happened</th><th className="r">Price</th><th className="r"><Term k="realized" end>Locked in</Term></th><th className="r">When</th></tr></thead><tbody>
            {p.trades.slice(0, 50).map(t => <tr key={t.id}>
              <td><a href={'#/stock/' + t.sym}><b>{nameOf(t.sym)}</b></a></td>
              <td>{t.forced ? 'Bully closed ' : t.side === 'buy' ? 'Bought ' : 'Sold '}{t.qty}{t.forced && <small>Losses ate half the deposit</small>}</td>
              <td className="r num">{money(t.price)}</td>
              <td className={'r num ' + tone(t.pnl)}>{t.pnl ? signedMoney(t.pnl) : '—'}</td>
              <td className="r muted">{new Date(t.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
            </tr>)}</tbody></table></div>
        ) : <Empty text="Your finished trades will show up here." />)}
      </section>
    </div>
  )
}

const Empty = ({ text }: { text: string }) => <div className="empty"><Bully size={48} mood="hmm" /><p>{text}</p></div>

function Stocks() {
  const [text, setText] = useState('')
  const [found, setFound] = useState<{ symbol: string; name: string }[] | null>(null)
  const q = useQuotes(POPULAR.map(p => p[0]))
  useEffect(() => {
    if (text.trim().length < 2) { setFound(null); return }
    const t = setTimeout(() => api<{ symbol: string; name: string }[]>('search?q=' + encodeURIComponent(text)).then(setFound).catch(() => setFound([])), 300)
    return () => clearTimeout(t)
  }, [text])
  const rows = found ?? POPULAR.map(([symbol, name]) => ({ symbol, name }))
  return (
    <div className="stocks">
      <header className="title"><div><h1>Stocks</h1><p className="muted">Companies on India’s biggest stock exchange, the NSE.</p></div></header>
      <input className="search" autoFocus type="search" aria-label="Search for a stock" placeholder="Search a company, like Tata or Nestle" value={text} onChange={e => setText(e.target.value)} />
      <section className="card stock-list">
        {rows.length === 0 && <Empty text={`Bully couldn’t find “${text}” on the NSE. Try another name.`} />}
        {rows.map(r => {
          const x = q.bySym[r.symbol]; const pct = x ? (x.price - x.prev) / x.prev * 100 : 0
          return <a key={r.symbol} href={'#/stock/' + r.symbol}>
            <span className="mono-mark" style={{ background: `hsl(${[...r.symbol].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360} 70% 92%)`, color: `hsl(${[...r.symbol].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360} 70% 25%)` }}>{r.name[0]}</span>
            <span><b>{r.name}</b><small>{r.symbol.replace('.NS', '')}</small></span>
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
  const key = p ? p.id + p.orders.length + Object.keys(p.positions).length : ''
  useEffect(() => {
    if (!p || (!p.orders.length && !Object.keys(p.positions).length)) return
    const run = async () => {
      const orderSyms = [...new Set(p.orders.map(o => o.sym))]
      const syms = [...new Set([...orderSyms, ...Object.keys(p.positions)])]
      const [hist, quotes] = await Promise.all([
        Promise.all(orderSyms.map(s => candles(s, 'orders'))),
        api<{ quotes: { symbol: string; price: number }[] }>('quote?symbols=' + encodeURIComponent(syms.join(','))),
      ])
      const byS = Object.fromEntries(orderSyms.map((s, i) => [s, hist[i]]))
      const prices = Object.fromEntries(quotes.quotes.map(x => [x.symbol, x.price]))
      let before = 0, after = 0, forced = false
      await mutate(uid, p.id, c => {
        const next = settle(c, byS, prices)
        before = c.trades.length; after = next?.trades.length ?? before; forced = !!next?.trades[0]?.forced
        return next
      })
      if (forced) toast({ title: 'Bully closed your trades', body: 'Losses ate half your deposit, so your trades were closed to protect your money.', mood: 'hmm' })
      else if (after > before) toast({ title: 'A waiting order happened', body: 'The market reached your price. Check your portfolio.', mood: 'wow' })
    }
    run().catch(() => {})
    const t = setInterval(() => run().catch(() => {}), 60000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key])
}

function Shell({ user }: { user: User }) {
  const hash = useHash()
  const list = usePortfolios(user.uid)
  const [pid, setPid] = useState(() => { try { return localStorage.getItem('pid') ?? '' } catch { return '' } })
  const [adding, setAdding] = useState(false)
  const p = list?.find(x => x.id === pid) ?? list?.[0]
  const pick = (id: string) => { setPid(id); setAdding(false); try { localStorage.setItem('pid', id) } catch { /* private window */ } }
  useSettler(user.uid, p)
  const stockSym = hash.startsWith('#/stock/') ? decodeURIComponent(hash.slice(8)) : ''
  const route = stockSym ? 'stock' : hash === '#/stocks' ? 'stocks' : 'home'

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <a className="brand" href="#/"><Bully size={36} /><span>LittleBulls</span></a>
        <label className="switch">Portfolio
          <select value={p?.id ?? ''} onChange={e => e.target.value === '+' ? setAdding(true) : pick(e.target.value)}>
            {list?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value="+">+ New portfolio</option>
          </select>
        </label>
        <LayoutGroup>
          {[['#/', 'My money', route === 'home'], ['#/stocks', 'Stocks', route !== 'home']].map(([h, label, on]) => (
            <a key={h as string} href={h as string} className={'nav' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined}>
              {on && <motion.i layoutId="nav" transition={spring} />}<span>{label}</span>
            </a>
          ))}
        </LayoutGroup>
        <div className="me"><span>{user.displayName || 'Trader'}</span><button className="link" onClick={() => signOut(auth)}>Log out</button></div>
      </nav>
      <main className="canvas">
        {list === null ? <div className="boot"><Bully size={72} /><p className="muted">Opening your piggy bank…</p></div> : p && (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={route + stockSym + p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
              {route === 'home' && <Home uid={user.uid} p={p} />}
              {route === 'stocks' && <Stocks />}
              {route === 'stock' && <Stock uid={user.uid} p={p} symbol={stockSym} />}
            </motion.div>
          </AnimatePresence>
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
  if (user === undefined) return <div className="boot full"><Bully size={72} /></div>
  return user ? <Shell key={user.uid} user={user} /> : <Login />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><MotionConfig reducedMotion="user"><Toaster><App /></Toaster></MotionConfig></StrictMode>,
)
