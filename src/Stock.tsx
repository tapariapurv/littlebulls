import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, LineSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { AnimatePresence, motion } from 'motion/react'
import { askToNotify, blip, candles, getSettings, mutate, nameOf, older, setSetting, stockInfo, useQuotes, useSettings, zoneOf, type Info } from './data'
import { MARGIN, addAlert, addOrder, canAfford, marketOrder, summary, type Candle, type Portfolio, type Side } from './engine'
import { SPEC_WORDS, exchange, matches, short } from './markets'
import { Bully, Modal, Num, Tabs, Term, Tick, decimal, money, signedMoney, spring, tone, useToast } from './ui'

type Range = '1D' | '5D' | '1M' | '6M' | '1Y' | '5Y'
// Seconds each candle covers, so a page left open starts new candles rather than stretching the last one.
const STEP: Record<Range, number> = { '1D': 300, '5D': 1800, '1M': 7200, '6M': 86400, '1Y': 259200, '5Y': 1814400 }
// How many bars each tab opens on; the larger candle sizes come from the API, and older ones load on scrolling back.
const BARS: Record<Range, number> = { '1D': 78, '5D': 65, '1M': 78, '6M': 126, '1Y': 84, '5Y': 87 }
type Line = { price: number; title: string; color: string }

function Chart({ symbol, live, lines, buttons }: { symbol: string; live?: number; lines: Line[]; buttons?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Candlestick' | 'Line'> | null>(null)
  const last = useRef<Candle | null>(null)
  const paging = useRef({ busy: false, end: false, added: 0, fresh: true, first: 0, more: () => {} })
  const [range, setRange] = useState<Range>('1D')
  const [kind, setKind] = useState<'candles' | 'line'>('candles')
  const [data, setData] = useState<Candle[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const c = createChart(box.current!, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#5c6064', fontFamily: 'Manrope', fontSize: 12 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#eef1f4' } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    })
    chart.current = c
    // Dragging near the left edge pulls in the next page of older bars.
    c.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r && r.from < 15) paging.current.more() })
    return () => { c.remove(); chart.current = null; series.current = null }
  }, [])

  useEffect(() => { // Fetch only when the stock or time range changes; the old chart stays up meanwhile.
    let current = true
    paging.current = { ...paging.current, busy: true, end: false, more: () => {} }
    candles(symbol, range)
      .then(d => {
        if (!current) return
        setFailed(!d.length)
        if (!d.length) return
        paging.current = {
          busy: false, end: false, added: 0, fresh: true, first: d[0].t,
          more() {
            const g = paging.current
            if (g.busy || g.end) return
            g.busy = true
            older(symbol, range, g.first).then(page => {
              if (!current) return
              const add = page.filter(x => x.t < g.first)
              g.busy = false
              if (!add.length) { g.end = true; return }
              g.first = add[0].t; g.added = add.length
              setData(old => [...add, ...(old ?? [])])
            }).catch(() => { if (current) { g.busy = false; g.end = true } })
          },
        }
        setData(d)
      })
      .catch(() => { if (current) setFailed(true) })
    return () => { current = false }
  }, [symbol, range])

  useEffect(() => { // Fill the other time ranges in the background so switching feels instant.
    const t = setTimeout(() => (['5D', '1M', '6M', '1Y', '5Y'] as Range[]).forEach(r => candles(symbol, r).catch(() => {})), 400)
    return () => clearTimeout(t)
  }, [symbol])

  useEffect(() => { // Candles vs line reuses the same data and keeps the same view.
    const c = chart.current
    if (!c || !data) return
    const g = paging.current
    const view = g.fresh ? null : c.timeScale().getVisibleLogicalRange()
    const shift = g.added
    g.fresh = false; g.added = 0
    if (series.current) c.removeSeries(series.current)
    const zone = zoneOf(symbol)
    const t = (x: Candle) => (x.t + zone) as UTCTimestamp
    if (kind === 'candles') {
      const s = c.addSeries(CandlestickSeries, { upColor: '#2f7a45', downColor: '#c41c29', borderVisible: false, wickUpColor: '#2f7a45', wickDownColor: '#c41c29' })
      s.setData(data.map(x => ({ time: t(x), open: x.o, high: x.h, low: x.l, close: x.c })))
      series.current = s
    } else {
      const s = c.addSeries(LineSeries, { color: '#1d5fd6', lineWidth: 2 })
      s.setData(data.map(x => ({ time: t(x), value: x.c })))
      series.current = s
    }
    if (view) c.timeScale().setVisibleLogicalRange({ from: view.from + shift, to: view.to + shift })
    else c.timeScale().setVisibleLogicalRange({ from: data.length - BARS[range], to: data.length + 3 })
    last.current = { ...data[data.length - 1] }
  }, [data, kind])

  useEffect(() => { // Grow the newest candle with each price tick.
    let c = last.current
    if (!live || !c || !series.current) return
    const passed = Math.floor((Date.now() / 1000 - c.t) / STEP[range])
    if (passed > 0) c = last.current = { t: c.t + passed * STEP[range], o: live, h: live, l: live, c: live }
    const time = (c.t + zoneOf(symbol)) as UTCTimestamp
    c.h = Math.max(c.h, live); c.l = Math.min(c.l, live); c.c = live
    series.current.update(kind === 'candles' ? { time, open: c.o, high: c.h, low: c.l, close: live } : { time, value: live })
  }, [live, symbol, kind, data])

  const lineKey = JSON.stringify(lines)
  useEffect(() => { // Waiting orders, exits and your own price, drawn right on the chart.
    const s = series.current
    if (!s) return
    const made = lines.map(l => s.createPriceLine({ price: l.price, title: l.title, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true }))
    return () => { if (series.current === s) made.forEach(m => s.removePriceLine(m)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineKey, data, kind])

  return (
    <section className="card chart">
      <div className="chart-bar">
        <Tabs id={'range'} value={range} onChange={setRange} options={(['1D', '5D', '1M', '6M', '1Y', '5Y'] as Range[]).map(r => [r, r])} />
        <span className="chart-kind">
          <Term k="candle" end>What’s this?</Term>
          <Tabs id="kind" value={kind} onChange={setKind} options={[['candles', 'Candles'], ['line', 'Line']]} />
        </span>
      </div>
      <div className="chart-box" ref={box}>
        {buttons}
        {failed && <p className="chart-note">Bully couldn’t fetch this chart. Try another time range.</p>}
      </div>
    </section>
  )
}

function Ticket({ uid, p, symbol, price, open, qty, setQty }: { uid: string; p: Portfolio; symbol: string; price?: number; open: boolean; qty: number; setQty: (n: number) => void }) {
  const toast = useToast()
  const [side, setSide] = useState<Side>('buy')
  const [chosen, setType] = useState<'market' | 'limit' | 'stop' | null>(null)
  const type = chosen === 'market' || !chosen ? (open ? 'market' : chosen ?? 'limit') : chosen
  const [typed, setTyped] = useState('')
  const [exits, setExits] = useState(false)
  const [tpText, setTp] = useState('')
  const [slText, setSl] = useState('')
  const busy = useRef(false) // a ref because a double click can land before React redraws
  const [shake, setShake] = useState(0)

  const prices = price ? { [symbol]: price } : {}
  const at = type === 'market' ? price ?? 0 : Number(typed) || price || 0 // a blank box means the price shown in it
  const s = summary(p, prices)
  const held = p.positions[symbol]?.qty ?? 0
  const isShort = side === 'sell' && qty > Math.max(held, 0)
  const afford = canAfford(p, prices, symbol, side, qty, at)
  const deposit = qty * at * MARGIN
  const tp = exits ? Number(tpText) || undefined : undefined, sl = exits ? Number(slText) || undefined : undefined
  const up = side === 'buy' ? 1 : -1 // a take-win sits past your price in the winning direction, a stop on the other side
  const badExit = at > 0 && ((tp && (tp - at) * up <= 0) || (sl && (sl - at) * up >= 0))
  const ready = at > 0 && qty > 0 && afford && !badExit
  const word = side === 'buy' ? 'Buy' : 'Sell'
  const shares = `${qty} ${qty === 1 ? 'share' : 'shares'}`

  async function place() {
    if (!ready) { setShake(n => n + 1); return }
    if (busy.current) return // a double click isn't two trades
    busy.current = true
    setTimeout(() => { busy.current = false }, 400)
    const first = p.trades.length === 0
    // The trade shows straight away while it saves; if the save fails it comes back off the screen and this says so.
    mutate(uid, p.id, cur => type === 'market'
      ? marketOrder(cur, symbol, side, qty, at, { tp, sl })
      : addOrder(cur, { sym: symbol, side, qty, type, price: at, tp, sl }))
      .catch(() => toast({ title: 'That didn’t go through', body: 'Check your internet and try again.', mood: 'hmm' }))
    blip()
    if (type === 'market') toast(first
      ? { title: 'Your first trade!', body: `${word === 'Buy' ? 'Bought' : 'Sold'} ${shares} at ${money(at)}. Bully is proud of you for trying.`, mood: 'wow' }
      : { title: `${word === 'Buy' ? 'Bought' : 'Sold'} ${shares}`, body: `At ${money(at)} each.` })
    else toast({ title: 'Order is waiting', body: `${word} ${shares} when the price reaches ${money(at)}.` })
  }

  return (
    <div className="ticket">
      <div className={'seg ' + side} role="tablist">
        {(['buy', 'sell'] as Side[]).map(x => (
          <button key={x} role="tab" aria-selected={side === x} onClick={() => setSide(x)} className={side === x ? 'on' : ''}>
            {side === x && <motion.i layoutId="side" transition={spring} />}<span>{x === 'buy' ? 'Buy' : 'Sell'}</span>
          </button>
        ))}
      </div>
      <Tabs id="otype" value={type} onChange={setType} options={[
        ['market', <span key="m" title={open ? '' : 'The market is closed'}>Right now</span>],
        ['limit', 'At my price'], ['stop', 'If it reaches'],
      ]} />
      {type === 'market' && !open && <p className="note">The market is closed, so Bully can’t trade right now. Pick a price and your order will wait for it.</p>}
      <div className="field-row">
        <label>Shares
          <span className="stepper">
            <button type="button" aria-label="Fewer shares" onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
            <input inputMode="numeric" value={qty} onChange={e => setQty(Math.max(0, Math.floor(Number(e.target.value)) || 0))} />
            <button type="button" aria-label="More shares" onClick={() => setQty(qty + 1)}>+</button>
          </span>
        </label>
        {type !== 'market' && (
          <label>Your price
            <input inputMode="decimal" value={typed} placeholder={price?.toFixed(2)} onChange={e => setTyped(decimal(e.target.value))} />
          </label>
        )}
      </div>
      <label className="check"><input type="checkbox" checked={exits} onChange={e => setExits(e.target.checked)} /> Plan my way out</label>
      {exits && <div className="field-row">
        <label><Term k="tp">Take my win at</Term><input inputMode="decimal" value={tpText} placeholder="Optional" onChange={e => setTp(decimal(e.target.value))} /></label>
        <label><Term k="sl" end>Stop my loss at</Term><input inputMode="decimal" value={slText} placeholder="Optional" onChange={e => setSl(decimal(e.target.value))} /></label>
      </div>}
      {badExit && <p className="note bad">{side === 'buy' ? 'When buying, your win goes above the price and your stop goes below it.' : 'When selling first, your win goes below the price and your stop goes above it.'}</p>}
      <dl className="rows">
        <div><dt><Term k="margin">Deposit needed</Term></dt><dd className="num">{at ? money(deposit) : '—'}</dd></div>
        <div><dt><Term k="available">Free</Term></dt><dd className="num"><Num value={s.available} /></dd></div>
      </dl>
      <AnimatePresence initial={false}>
        {isShort && (
          <motion.p className="note" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            You’d be selling shares you don’t own. <Term k="short">You win if the price falls.</Term>
          </motion.p>
        )}
      </AnimatePresence>
      {at > 0 && !afford && qty > 0 && <p className="note bad">That’s more than you can use right now. Try fewer shares.</p>}
      <motion.button key={shake} className={'primary ' + side} onClick={place} disabled={type === 'market' && !open}
        animate={shake ? { x: [0, -6, 6, -3, 3, 0] } : undefined} transition={{ duration: 0.3 }} whileTap={{ scale: 0.97 }}>
        {`${word} ${shares}`}
      </motion.button>
    </div>
  )
}

function Alerts({ uid, p, symbol, price, onClose }: { uid: string; p: Portfolio; symbol: string; price?: number; onClose: () => void }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const mine = p.alerts.filter(a => a.sym === symbol)
  function add(e: React.FormEvent) {
    e.preventDefault()
    const at = Number(text)
    if (!at || !price) return
    if (!getSettings().notify) askToNotify() // not awaited: the alert shouldn't wait on the browser's permission prompt
    mutate(uid, p.id, c => addAlert(c, symbol, at, price)) // a failed save is caught by the Toaster
    setText('')
    toast({ title: 'Alert set', body: `Bully will tell you when ${nameOf(symbol)} reaches ${money(at)}.` })
  }
  return (
    <Modal onClose={onClose} label="Price alerts">
      <h2>Tell me when {nameOf(symbol)} reaches</h2>
      <p className="muted">It works while LittleBulls is open, even in another tab. It’s {price ? money(price) : '—'} right now.</p>
      <form onSubmit={add}>
        <label>Price<input autoFocus required inputMode="decimal" value={text} onChange={e => setText(decimal(e.target.value))} /></label>
        <button className="primary buy">Set alert</button>
      </form>
      {mine.length > 0 && <ul className="plain">{mine.map(a => <li key={a.id}><span className="num">{a.above ? 'Up to' : 'Down to'} {money(a.price)}</span>
        <button className="ghost tiny" onClick={() => mutate(uid, p.id, c => ({ ...c, alerts: c.alerts.filter(x => x.id !== a.id) }))}>Remove</button></li>)}</ul>}
    </Modal>
  )
}

export function Stock({ uid, p, symbol }: { uid: string; p: Portfolio; symbol: string }) {
  const toast = useToast()
  const set = useSettings()
  const [qty, setQty] = useState(set.shares)
  const [alerts, setAlerts] = useState(false)
  const q = useQuotes([symbol, ...Object.keys(p.positions)])
  const quote = q.bySym[symbol]
  const open = !!quote?.open
  const [info, setInfo] = useState<Info | null>(null)
  const [infoFailed, setInfoFailed] = useState(false)
  useEffect(() => {
    stockInfo(symbol).then(setInfo).catch(() => setInfoFailed(true))
  }, [symbol])

  const prices = Object.fromEntries(Object.values(q.bySym).map(x => [x.symbol, x.price]))
  const s = summary(p, prices)
  const pos = p.positions[symbol]
  const change = quote ? quote.price - quote.prev : 0
  const name = info?.name ?? nameOf(symbol)
  const fits = matches(p.exchange, symbol)
  const list = p.watchlists.find(l => l.id === set.list) ?? p.watchlists[0]
  const watching = list.syms.includes(symbol)
  const busy = useRef(false)
  const toggleWatch = () => mutate(uid, p.id, c => ({ ...c, watchlists: c.watchlists.map(l => l.id === list.id ? { ...l, syms: watching ? l.syms.filter(x => x !== symbol) : [...l.syms, symbol] } : l) }))
    .then(() => { setSetting({ list: list.id }); toast({ title: watching ? `Removed from ${list.name}` : `Added to ${list.name}`, body: name }) })
  function quick(side: Side) {
    if (!quote || !canAfford(p, prices, symbol, side, qty, quote.price)) { toast({ title: 'That’s more than you can use', body: 'Try fewer shares.', mood: 'hmm' }); return }
    if (busy.current) return // a double click isn't two trades
    if (set.askFirst && !confirm(`${side === 'buy' ? 'Buy' : 'Sell'} ${qty} ${short(symbol)} at about ${money(quote.price)}?`)) return
    busy.current = true
    setTimeout(() => { busy.current = false }, 400)
    mutate(uid, p.id, c => marketOrder(c, symbol, side, qty, quote.price))
      .catch(() => toast({ title: 'That didn’t go through', body: 'Check your internet and try again.', mood: 'hmm' }))
    blip()
    toast({ title: `${side === 'buy' ? 'Bought' : 'Sold'} ${qty}`, body: `At ${money(quote.price)} each.` })
  }
  const lines: Line[] = !set.chartLines ? [] : [
    ...(pos ? [{ price: pos.avg, title: `${pos.qty > 0 ? 'You own' : 'You sold'} ${Math.abs(pos.qty)}`, color: '#1d5fd6' }] : []),
    ...p.orders.filter(o => o.sym === symbol).map(o => ({
      price: o.price, color: o.exit === 'tp' ? '#2f7a45' : o.exit === 'sl' ? '#c41c29' : '#8a6d1f',
      title: o.exit === 'tp' ? 'Take win' : o.exit === 'sl' ? 'Stop loss' : `${o.side === 'buy' ? 'Buy' : 'Sell'} ${o.qty}`,
    })),
    ...p.alerts.filter(a => a.sym === symbol).map(a => ({ price: a.price, title: 'Alert', color: '#5c6064' })),
  ]
  const specs = ['Mkt. cap', 'P/E ratio', 'Dividend', '52-wk high', '52-wk low', 'Volume', 'EPS'].filter(k => info?.specs[k])

  return (
    <div className="stock">
      <div className="stock-main">
        <header className="title">
          <div><h1>{name}</h1><p className="muted">{short(symbol)} · <span className={open ? 'open' : ''}>{open ? 'Market open' : 'Market closed'}</span></p></div>
          <span className="title-actions">
            <button className={'ghost tiny' + (watching ? ' on' : '')} aria-pressed={watching} onClick={toggleWatch}>{watching ? '★ Watching' : '☆ Watch'}</button>
            <button className="ghost tiny" onClick={() => setAlerts(true)}>Alert{p.alerts.some(a => a.sym === symbol) ? ` (${p.alerts.filter(a => a.sym === symbol).length})` : ''}</button>
          </span>
        </header>
        <Chart symbol={symbol} live={open ? quote?.price : undefined} lines={lines} buttons={set.chartButtons && fits && open && quote ? (
          <div className="chart-trade">
            <button className="sell" onClick={() => quick('sell')}>Sell {qty}</button>
            <button className="buy" onClick={() => quick('buy')}>Buy {qty}</button>
          </div>
        ) : null} />
        <section className="card strip" aria-label="Your account">
          <div><Term k="balance">Your money</Term><b className="num"><Num value={s.balance} /></b></div>
          <div><Term k="worth">Total worth</Term><b className="num"><Num value={s.equity} /></b></div>
          <div><Term k="realized">Locked in</Term><b className={'num ' + tone(s.realized)}><Num value={s.realized} format={signedMoney} /></b></div>
          <div><Term k="unrealized">Still open</Term><b className={'num ' + tone(s.unrealized)}><Num value={s.unrealized} format={signedMoney} /></b></div>
          <div><Term k="margin">Deposit</Term><b className="num"><Num value={s.margin} /></b></div>
          <div><Term k="available" end>Free</Term><b className="num"><Num value={s.available} /></b></div>
        </section>
      </div>
      <aside className="stock-side">
        <section className="card">
          <div className="price-head">
            <div>{quote ? <Tick value={quote.price} className="big" /> : <span className="big muted">—</span>}
              <p className={'num ' + tone(change)}>{quote ? `${signedMoney(change)} (${change >= 0 ? '+' : ''}${(change / quote.prev * 100).toFixed(2)}%) since yesterday` : q.failed ? 'Price is taking a nap. Trying again soon.' : 'Fetching the price…'}</p>
            </div>
            <Bully size={44} mood={change < 0 ? 'hmm' : 'happy'} />
          </div>
          {pos && <p className="note holding">You {pos.qty > 0 ? 'own' : 'sold first'} {Math.abs(pos.qty)} at {money(pos.avg)}. <b className={tone((( quote?.price ?? pos.avg) - pos.avg) * pos.qty)}>{signedMoney(((quote?.price ?? pos.avg) - pos.avg) * pos.qty)}</b> so far.</p>}
          {fits ? <Ticket uid={uid} p={p} symbol={symbol} price={quote?.price} open={open} qty={qty} setQty={setQty} />
            : <p className="note">This portfolio trades on {exchange(p.exchange).name}, and this stock isn’t there. Make another portfolio to trade it.</p>}
        </section>
        <section className="card">
          <h2>Quick facts</h2>
          {specs.length ? <dl className="rows">{specs.map(k => (
            <div key={k}><dt><Term k={k}>{SPEC_WORDS[k]}</Term></dt><dd className="num">{info!.specs[k]}</dd></div>
          ))}</dl> : <p className="muted">{infoFailed || info ? 'No facts for this one right now.' : 'Looking these up…'}</p>}
        </section>
        <section className="card">
          <h2>News about {short(symbol)}</h2>
          {info?.news.length ? <ul className="news">{info.news.map(n => (
            <li key={n.url}><a href={n.url} target="_blank" rel="noreferrer"><b>{n.title}</b><small>{n.source} · {n.when}</small></a></li>
          ))}</ul> : <p className="muted">{infoFailed || info ? 'No news for this one right now.' : 'Fetching the headlines…'}</p>}
        </section>
      </aside>
      <AnimatePresence>{alerts && <Alerts uid={uid} p={p} symbol={symbol} price={quote?.price} onClose={() => setAlerts(false)} />}</AnimatePresence>
    </div>
  )
}
