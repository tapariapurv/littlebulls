import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, LineSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { AnimatePresence, motion } from 'motion/react'
import { api, candles, mutate, nameOf, useQuotes } from './data'
import { MARGIN, addOrder, canAfford, fill, summary, type Candle, type Portfolio, type Side } from './engine'
import { Bully, Num, Tabs, Term, Tick, money, signedMoney, spring, tone, useToast } from './ui'

const IST = 19800 // Lightweight Charts draws timestamps as UTC, so shift them to show Indian time.
type Range = '1D' | '5D' | '1M' | '6M' | '1Y' | '5Y'
type Info = { name: string; specs: Record<string, string>; news: { source: string; when: string; url: string; title: string }[] }

function Chart({ symbol, live }: { symbol: string; live?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Candlestick' | 'Line'> | null>(null)
  const last = useRef<Candle | null>(null)
  const [range, setRange] = useState<Range>('1D')
  const [kind, setKind] = useState<'candles' | 'line'>('candles')
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    const c = createChart(box.current!, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#5c6064', fontFamily: 'Manrope', fontSize: 12 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#eef1f4' } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    })
    chart.current = c
    return () => { c.remove(); chart.current = null }
  }, [])

  useEffect(() => {
    let live = true
    setState('loading')
    candles(symbol, range).then(data => {
      if (!live || !chart.current) return
      if (series.current) chart.current.removeSeries(series.current)
      const t = (x: Candle) => (x.t + IST) as UTCTimestamp
      if (kind === 'candles') {
        const s = chart.current.addSeries(CandlestickSeries, { upColor: '#2f7a45', downColor: '#c41c29', borderVisible: false, wickUpColor: '#2f7a45', wickDownColor: '#c41c29' })
        s.setData(data.map(x => ({ time: t(x), open: x.o, high: x.h, low: x.l, close: x.c })))
        series.current = s
      } else {
        const s = chart.current.addSeries(LineSeries, { color: '#1d5fd6', lineWidth: 2 })
        s.setData(data.map(x => ({ time: t(x), value: x.c })))
        series.current = s
      }
      last.current = data.at(-1) ?? null
      chart.current.timeScale().fitContent()
      setState(data.length ? 'ok' : 'error')
    }).catch(() => live && setState('error'))
    return () => { live = false }
  }, [symbol, range, kind])

  useEffect(() => { // Grow the newest candle with each price tick.
    const c = last.current
    if (!live || !c || !series.current || (range !== '1D' && range !== '5D')) return
    const time = (c.t + IST) as UTCTimestamp
    c.h = Math.max(c.h, live); c.l = Math.min(c.l, live); c.c = live
    series.current.update(kind === 'candles' ? { time, open: c.o, high: c.h, low: c.l, close: live } : { time, value: live })
  }, [live, range, kind])

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
        {state === 'error' && <p className="chart-note">Bully couldn’t fetch this chart. Try another time range.</p>}
      </div>
    </section>
  )
}

function Ticket({ uid, p, symbol, price, open }: { uid: string; p: Portfolio; symbol: string; price?: number; open: boolean }) {
  const toast = useToast()
  const [side, setSide] = useState<Side>('buy')
  const [chosen, setType] = useState<'market' | 'limit' | 'stop' | null>(null)
  const type = chosen === 'market' || !chosen ? (open ? 'market' : chosen ?? 'limit') : chosen
  const [qty, setQty] = useState(1)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(0)

  const prices = price ? { [symbol]: price } : {}
  const at = type === 'market' ? price ?? 0 : Number(typed) || 0
  const s = summary(p, prices)
  const held = p.positions[symbol]?.qty ?? 0
  const isShort = side === 'sell' && qty > Math.max(held, 0)
  const afford = canAfford(p, prices, symbol, side, qty, at)
  const deposit = qty * at * MARGIN
  const ready = at > 0 && qty > 0 && afford && !busy
  const word = side === 'buy' ? 'Buy' : 'Sell'
  const shares = `${qty} ${qty === 1 ? 'share' : 'shares'}`

  async function place() {
    if (!ready) { setShake(n => n + 1); return }
    setBusy(true)
    const first = p.trades.length === 0
    try {
      await mutate(uid, p.id, cur => type === 'market'
        ? fill(cur, symbol, side, qty, at)
        : addOrder(cur, { sym: symbol, side, qty, type, price: at }))
      if (type === 'market') toast(first
        ? { title: 'Your first trade!', body: `${word === 'Buy' ? 'Bought' : 'Sold'} ${shares} at ${money(at)}. Bully is proud of you for trying.`, mood: 'wow' }
        : { title: `${word === 'Buy' ? 'Bought' : 'Sold'} ${shares}`, body: `At ${money(at)} each.` })
      else toast({ title: 'Order is waiting', body: `${word} ${shares} when the price reaches ${money(at)}.` })
    } catch { toast({ title: 'That didn’t go through', body: 'Check your internet and try again.', mood: 'hmm' }) }
    setBusy(false)
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
            <button type="button" aria-label="Fewer shares" onClick={() => setQty(q => Math.max(1, q - 1))}>-</button>
            <input inputMode="numeric" value={qty} onChange={e => setQty(Math.max(0, Math.floor(Number(e.target.value)) || 0))} />
            <button type="button" aria-label="More shares" onClick={() => setQty(q => q + 1)}>+</button>
          </span>
        </label>
        {type !== 'market' && (
          <label>Your price (₹)
            <input inputMode="decimal" value={typed} placeholder={price?.toFixed(2)} onChange={e => setTyped(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
        )}
      </div>
      <dl className="rows">
        <div><dt><Term k="margin">Deposit needed</Term></dt><dd className="num">{at ? money(deposit) : '—'}</dd></div>
        <div><dt><Term k="available">Free to use</Term></dt><dd className="num"><Num value={s.available} /></dd></div>
      </dl>
      <AnimatePresence initial={false}>
        {isShort && (
          <motion.p className="note" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            You’d be selling shares you don’t own. <Term k="short">You win if the price falls.</Term>
          </motion.p>
        )}
      </AnimatePresence>
      {at > 0 && !afford && qty > 0 && <p className="note bad">That’s more than you can use right now. Try fewer shares.</p>}
      <motion.button key={shake} className={'primary ' + side} onClick={place} disabled={busy || (type === 'market' && !open)}
        animate={shake ? { x: [0, -6, 6, -3, 3, 0] } : undefined} transition={{ duration: 0.3 }} whileTap={{ scale: 0.97 }}>
        {busy ? 'Placing…' : `${word} ${shares}`}
      </motion.button>
    </div>
  )
}

export function Stock({ uid, p, symbol }: { uid: string; p: Portfolio; symbol: string }) {
  const q = useQuotes([symbol, ...Object.keys(p.positions)])
  const quote = q.bySym[symbol]
  const [info, setInfo] = useState<Info | null>(null)
  const [infoFailed, setInfoFailed] = useState(false)
  useEffect(() => {
    setInfo(null); setInfoFailed(false)
    api<Info>('stock?symbol=' + encodeURIComponent(symbol)).then(setInfo).catch(() => setInfoFailed(true))
  }, [symbol])

  const prices = Object.fromEntries(Object.values(q.bySym).map(x => [x.symbol, x.price]))
  const s = summary(p, prices)
  const pos = p.positions[symbol]
  const change = quote ? quote.price - quote.prev : 0
  const name = info?.name ?? nameOf(symbol)
  const specs = ['Mkt. cap', 'P/E ratio', 'Dividend', '52-wk high', '52-wk low', 'Volume', 'EPS'].filter(k => info?.specs[k])
  const SPEC_WORDS: Record<string, string> = { 'Mkt. cap': 'Company size', 'P/E ratio': 'Price vs profit', Dividend: 'Thank-you money', '52-wk high': 'Year’s highest', '52-wk low': 'Year’s lowest', Volume: 'Traded today', EPS: 'Profit per share' }

  return (
    <div className="stock">
      <div className="stock-main">
        <header className="title">
          <div><h1>{name}</h1><p className="muted">{symbol.replace('.NS', '')} on NSE · <span className={q.open ? 'open' : ''}>{q.open ? 'Market open' : 'Market closed'}</span></p></div>
        </header>
        <Chart symbol={symbol} live={q.open ? quote?.price : undefined} />
        <section className="card strip" aria-label="Your account">
          <div><Term k="balance">Your money</Term><b className="num"><Num value={s.balance} /></b></div>
          <div><Term k="worth">Total worth</Term><b className="num"><Num value={s.equity} /></b></div>
          <div><Term k="realized">Locked-in</Term><b className={'num ' + tone(s.realized)}><Num value={s.realized} format={signedMoney} /></b></div>
          <div><Term k="unrealized">Still moving</Term><b className={'num ' + tone(s.unrealized)}><Num value={s.unrealized} format={signedMoney} /></b></div>
          <div><Term k="margin">Deposit</Term><b className="num"><Num value={s.margin} /></b></div>
          <div><Term k="available" end>Free to use</Term><b className="num"><Num value={s.available} /></b></div>
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
          <Ticket uid={uid} p={p} symbol={symbol} price={quote?.price} open={q.open} />
        </section>
        <section className="card">
          <h2>Quick facts</h2>
          {specs.length ? <dl className="rows">{specs.map(k => (
            <div key={k}><dt><Term k={k}>{SPEC_WORDS[k]}</Term></dt><dd className="num">{info!.specs[k]}</dd></div>
          ))}</dl> : <p className="muted">{infoFailed || info ? 'No facts for this one right now.' : 'Looking these up…'}</p>}
        </section>
        <section className="card">
          <h2>In the news</h2>
          {info?.news.length ? <ul className="news">{info.news.map(n => (
            <li key={n.url}><a href={n.url} target="_blank" rel="noreferrer"><b>{n.title}</b><small>{n.source} · {n.when}</small></a></li>
          ))}</ul> : <p className="muted">{infoFailed || info ? 'No news for this one right now.' : 'Fetching the headlines…'}</p>}
        </section>
      </aside>
    </div>
  )
}
