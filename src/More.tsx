import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BaselineSeries, createChart, type UTCTimestamp } from 'lightweight-charts'
import { sendPasswordResetEmail, signOut, updateProfile, type User } from 'firebase/auth'
import { askToNotify, auth, deletePortfolio, mutate, nameOf, preload, remember, search, setSetting, useQuotes, useSettings, type Row } from './data'
import { analytics, balanceHistory, resetPortfolio, uid as newId, type Portfolio } from './engine'
import { exchange, short } from './markets'
import { Empty, Tabs, Term, Tick, money, signedMoney, tone, useToast } from './ui'

const ICONS: Record<string, string> = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  stocks: 'M4 19l5-6 4 4 7-9M15 8h5v5',
  watchlist: 'M12 4l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z',
  discover: 'M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.5l-2 5-5 2 2-5z',
  analytics: 'M5 20v-7M12 20V5M19 20v-11',
  history: 'M4 12a8 8 0 108-8 8 8 0 00-6 2.7L4 9M4 4v5h5M12 8v4l3 2',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4.5v5h4v-5zM6 14.5v5h4v-5z',
}
export const Icon = ({ name }: { name: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
)

const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const time = (at: number) => `${day(at)}, ${new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`

export function Watchlist({ uid, p }: { uid: string; p: Portfolio }) {
  const set = useSettings()
  const list = p.watchlists.find(l => l.id === set.list) ?? p.watchlists[0]
  const [naming, setNaming] = useState('')
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [found, setFound] = useState<Row[]>([])
  const q = useQuotes(list.syms)
  useEffect(() => {
    if (text.trim().length < 2) { setFound([]); return }
    const t = setTimeout(() => search(text, p.exchange).then(setFound).catch(() => setFound([])), 200)
    return () => clearTimeout(t)
  }, [text, p.exchange])
  const change = (id: string, syms: (s: string[]) => string[]) => mutate(uid, p.id, c => ({ ...c, watchlists: c.watchlists.map(l => l.id === id ? { ...l, syms: syms(l.syms) } : l) }))
  function create(e: FormEvent) {
    e.preventDefault()
    const id = newId(), name = naming.trim().slice(0, 24)
    mutate(uid, p.id, c => ({ ...c, watchlists: [...c.watchlists, { id, name, syms: [] }] })).then(() => setSetting({ list: id }))
    setNaming(''); setAdding(false)
  }
  return (
    <div className="stocks">
      <header className="title"><div><h1>Watchlist</h1><p className="muted">Stocks you want to keep an eye on, without buying them.</p></div></header>
      <div className="list-bar">
        <Tabs id="lists" value={list.id} onChange={id => setSetting({ list: id })} options={p.watchlists.map(l => [l.id, l.name])} />
        <button className="ghost tiny" onClick={() => setAdding(a => !a)}>New list</button>
        {p.watchlists.length > 1 && <button className="ghost tiny" onClick={() => {
          if (confirm(`Delete the list “${list.name}”?`)) mutate(uid, p.id, c => ({ ...c, watchlists: c.watchlists.filter(l => l.id !== list.id) }))
        }}>Delete list</button>}
      </div>
      {adding && <form className="inline-form" onSubmit={create}><input autoFocus required aria-label="List name" placeholder="Name your list" maxLength={24} value={naming} onChange={e => setNaming(e.target.value)} /><button className="primary buy small">Create</button></form>}
      <input className="search" type="search" aria-label="Add a stock" placeholder={`Add a stock to ${list.name}`} value={text} onChange={e => setText(e.target.value)} />
      {found.length > 0 && <section className="card stock-list">{found.slice(0, 6).map(r => (
        <button key={r.symbol} className="row-btn" onClick={() => { remember(r.symbol, r.name); change(list.id, s => s.includes(r.symbol) ? s : [...s, r.symbol]); setText('') }}>
          <span><b>{r.name}</b><small>{short(r.symbol)}</small></span><span className="muted">Add</span>
        </button>
      ))}</section>}
      <section className="card stock-list">
        {!list.syms.length && <Empty text="Nothing here yet. Search above, or tap Watch on any stock’s page." />}
        {list.syms.map(sym => {
          const x = q.bySym[sym]; const pct = x ? (x.price - x.prev) / x.prev * 100 : 0
          return <div className="watch-row" key={sym}>
            <a href={'#/stock/' + sym} onPointerEnter={() => preload(sym)}>
              <span><b>{x?.name ?? nameOf(sym)}</b><small>{short(sym)}</small></span>
              {x && <span className="r"><Tick value={x.price} /><small className={'num ' + tone(pct)}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</small></span>}
            </a>
            <button className="ghost tiny" aria-label={`Remove ${nameOf(sym)}`} onClick={() => change(list.id, s => s.filter(y => y !== sym))}>Remove</button>
          </div>
        })}
      </section>
    </div>
  )
}

function Curve({ points }: { points: { at: number; v: number }[] }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const c = createChart(box.current!, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#5c6064', fontFamily: 'Manrope', fontSize: 12 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#eef1f4' } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false }, handleScroll: false, handleScale: false,
    })
    const s = c.addSeries(BaselineSeries, { baseValue: { type: 'price', price: 0 }, topLineColor: '#2f7a45', bottomLineColor: '#c41c29', topFillColor1: '#2f7a4533', topFillColor2: '#2f7a4505', bottomFillColor1: '#c41c2905', bottomFillColor2: '#c41c2933' })
    let last = 0 // two trades in one second still need their own spot on the line
    s.setData([{ at: points[0].at - 60000, v: 0 }, ...points].map(x => { last = Math.max(last + 1, Math.floor(x.at / 1000)); return { time: last as UTCTimestamp, value: x.v } }))
    c.timeScale().fitContent()
    return () => c.remove()
  }, [points])
  return <div className="curve" ref={box} />
}

export function Analytics({ p }: { p: Portfolio }) {
  const a = analytics(p)
  const stats: [string, string, string, string][] = [
    ['winRate', 'Trades that won', `${a.winRate.toFixed(0)}%`, `${a.wins} of ${a.count}`],
    ['profitFactor', 'Wins vs losses', a.profitFactor == null ? '—' : a.profitFactor.toFixed(2), 'Above 1 is good'],
    ['expectancy', 'Average trade', signedMoney(a.expectancy), 'Per finished trade'],
    ['', 'Average win', money(a.avgWin), `Best ${money(a.best)}`],
    ['', 'Average loss', money(a.avgLoss), `Worst ${money(Math.abs(a.worst))}`],
    ['drawdown', 'Toughest stretch', money(a.drawdown), `Best stretch ${money(a.runup)}`],
  ]
  return (
    <div className="stocks">
      <header className="title"><div><h1>Analytics</h1><p className="muted">How your finished trades in {p.name} have gone.</p></div></header>
      {!a.count ? <section className="card"><Empty text="Finish a trade and Bully will start working out how you’re doing." /></section> : <>
        <section className="card">
          <h2>Wins and losses added up <b className={'num ' + tone(a.total)}>{signedMoney(a.total)}</b></h2>
          <Curve points={a.curve} />
        </section>
        <section className="stats">{stats.map(([k, label, value, sub]) => (
          <div className="card" key={label}><Term k={k}>{label}</Term><b className="num">{value}</b><small>{sub}</small></div>
        ))}</section>
        <section className="card">
          <h2>Stock by stock</h2>
          <dl className="rows">{a.byStock.map(([sym, pnl]) => <div key={sym}><dt><a href={'#/stock/' + sym}>{nameOf(sym)}</a></dt><dd className={'num ' + tone(pnl)}>{signedMoney(pnl)}</dd></div>)}</dl>
        </section>
      </>}
    </div>
  )
}

const KIND = { market: 'Right now', limit: 'At my price', stop: 'If it reaches' }

export function History({ p }: { p: Portfolio }) {
  const [tab, setTab] = useState<'orders' | 'trades' | 'money' | 'log'>('orders')
  const balances = balanceHistory(p)
  return (
    <div className="stocks">
      <header className="title"><div><h1>History</h1><p className="muted">Everything that has happened in {p.name}.</p></div></header>
      <section className="card">
        <Tabs id="hist" value={tab} onChange={setTab} options={[['orders', 'Orders'], ['trades', 'Trades'], ['money', 'Money'], ['log', 'Activity']]} />
        {tab === 'orders' && (p.done.length ? (
          <div className="scroll"><table><thead><tr><th>Stock</th><th>Plan</th><th className="r">Shares</th><th className="r">Price</th><th>Result</th><th className="r">When</th></tr></thead><tbody>
            {p.done.map(o => <tr key={o.id}>
              <td><a href={'#/stock/' + o.sym}><b>{nameOf(o.sym)}</b></a></td>
              <td>{o.side === 'buy' ? 'Buy' : 'Sell'}<small>{o.exit === 'tp' ? 'Take my win' : o.exit === 'sl' ? 'Stop my loss' : KIND[o.type]}</small></td>
              <td className="r num">{o.qty}</td><td className="r num">{money(o.price)}</td>
              <td>{o.status === 'filled' ? 'Happened' : 'Cancelled'}</td><td className="r muted">{time(o.closed)}</td>
            </tr>)}</tbody></table></div>
        ) : <Empty text="Orders that happened or were cancelled will show up here." />)}
        {tab === 'trades' && (p.trades.length ? (
          <div className="scroll"><table><thead><tr><th>Stock</th><th>What happened</th><th className="r">Price</th><th className="r"><Term k="realized" end>Locked in</Term></th><th className="r">When</th></tr></thead><tbody>
            {p.trades.slice(0, 200).map(t => <tr key={t.id}>
              <td><a href={'#/stock/' + t.sym}><b>{nameOf(t.sym)}</b></a></td>
              <td>{t.forced ? 'Bully closed ' : t.side === 'buy' ? 'Bought ' : 'Sold '}{t.qty}{t.forced && <small>Losses ate half the deposit</small>}</td>
              <td className="r num">{money(t.price)}</td>
              <td className={'r num ' + tone(t.pnl)}>{t.pnl ? signedMoney(t.pnl) : '—'}</td>
              <td className="r muted">{time(t.at)}</td>
            </tr>)}</tbody></table></div>
        ) : <Empty text="Your trades will show up here." />)}
        {tab === 'money' && (balances.length ? (
          <div className="scroll"><table><thead><tr><th>From</th><th className="r">Change</th><th className="r"><Term k="balance" end>Your money</Term></th><th className="r">When</th></tr></thead><tbody>
            {balances.map((b, i) => <tr key={i}><td>{nameOf(b.sym)}</td><td className={'r num ' + tone(b.change)}>{signedMoney(b.change)}</td><td className="r num">{money(b.balance)}</td><td className="r muted">{time(b.at)}</td></tr>)}
          </tbody></table></div>
        ) : <Empty text={`You started with ${money(p.start)}. It changes when you finish a trade.`} />)}
        {tab === 'log' && (p.log.length ? <ul className="plain">{p.log.map((l, i) => <li key={i}><span>{l.text}</span><small>{time(l.at)}</small></li>)}</ul>
          : <Empty text="Everything you do in this portfolio will be listed here." />)}
      </section>
    </div>
  )
}

// Chrome and Android offer an install prompt; it has to be caught when it fires and used later.
let installer: (Event & { prompt: () => void }) | null = null
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installer = e as typeof installer })

const Toggle = ({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="toggle"><span>{label}{hint && <small>{hint}</small>}</span><input type="checkbox" role="switch" checked={on} onChange={e => set(e.target.checked)} /></label>
)

export function SettingsPage({ user, p }: { user: User; p: Portfolio }) {
  const toast = useToast()
  const s = useSettings()
  const [nick, setNick] = useState(user.displayName ?? '')
  const [start, setStart] = useState(p.start)
  const [name, setName] = useState(p.name)
  const blocked = 'Notification' in window && Notification.permission === 'denied'
  useEffect(() => { setName(p.name); setStart(p.start) }, [p.id, p.name, p.start])
  return (
    <div className="stocks settings">
      <header className="title"><div><h1>Settings</h1></div></header>
      <section className="card">
        <h2>Trading</h2>
        <Toggle on={s.chartButtons} set={v => setSetting({ chartButtons: v })} label="Buy and Sell buttons on the chart" />
        <Toggle on={s.askFirst} set={v => setSetting({ askFirst: v })} label="Ask me before those buttons trade" hint="Turn this off for one-tap trading." />
        <Toggle on={s.chartLines} set={v => setSetting({ chartLines: v })} label="Show my orders and shares on the chart" />
        <Toggle on={s.sound} set={v => setSetting({ sound: v })} label="Play a sound when a trade happens" />
        <label className="toggle"><span>Shares to start with on each stock</span>
          <input className="tiny-input" inputMode="numeric" aria-label="Shares to start with" value={s.shares} onChange={e => setSetting({ shares: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} /></label>
      </section>
      <section className="card">
        <h2>Alerts</h2>
        <Toggle on={s.notify} set={v => { if (v) askToNotify().then(ok => { if (!ok) toast({ title: 'Your browser said no', body: 'Allow notifications for this site in your browser’s settings.', mood: 'hmm' }) }); else setSetting({ notify: false }) }}
          label="Browser notifications" hint={blocked ? 'Blocked in your browser’s settings for this site.' : 'For price alerts and waiting orders, while LittleBulls is open.'} />
      </section>
      <section className="card">
        <h2>This portfolio</h2>
        <p className="muted">Trades on {exchange(p.exchange).name}, in {exchange(p.exchange).currency}.</p>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); mutate(user.uid, p.id, c => ({ ...c, name: name.trim() })).then(() => toast({ title: 'Renamed', body: name.trim() })) }}>
          <input required aria-label="Portfolio name" maxLength={30} value={name} onChange={e => setName(e.target.value)} /><button className="ghost tiny">Rename</button>
        </form>
        <form className="inline-form" onSubmit={e => {
          e.preventDefault()
          if (confirm(`Start ${p.name} again with ${money(start)}? All its trades, orders and alerts will be gone.`))
            mutate(user.uid, p.id, c => resetPortfolio(c, start)).then(() => toast({ title: 'Fresh start', body: `You have ${money(start)} again.` }))
        }}>
          <input aria-label="Money to start again with" inputMode="numeric" value={start || ''} onChange={e => setStart(Math.min(1e9, Number(e.target.value.replace(/\D/g, ''))))} />
          <button className="ghost tiny" disabled={!start}>Start again</button>
        </form>
        <button className="ghost tiny danger" onClick={() => { if (confirm(`Delete ${p.name} for good? This can’t be undone.`)) deletePortfolio(user.uid, p.id) }}>Delete this portfolio</button>
      </section>
      <section className="card">
        <h2>App</h2>
        <Toggle on={s.calm} set={v => setSetting({ calm: v })} label="Fewer animations" />
        <div className="toggle"><span>Install LittleBulls<small>On iPhone or iPad: open it in Safari, tap Share, then Add to Home Screen.</small></span>
          <button className="ghost tiny" onClick={() => {
            if (installer) installer.prompt()
            else toast({ title: 'Nothing to install here', body: 'It’s either installed already, or this browser installs from its own menu.', mood: 'hmm' })
          }}>Install</button></div>
      </section>
      <section className="card">
        <h2>Account</h2>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); updateProfile(user, { displayName: nick.trim() }).then(() => toast({ title: 'Nickname saved', body: nick.trim() })) }}>
          <input required aria-label="Nickname" maxLength={30} value={nick} onChange={e => setNick(e.target.value)} /><button className="ghost tiny">Save nickname</button>
        </form>
        <div className="button-row">
          {user.providerData.some(x => x.providerId === 'password') && <button className="ghost tiny" onClick={() => sendPasswordResetEmail(auth, user.email!).then(() => toast({ title: 'Check your email', body: 'A link to change your password is on its way.' }))}>Change password</button>}
          <button className="ghost tiny" onClick={() => signOut(auth)}>Log out</button>
        </div>
      </section>
    </div>
  )
}
