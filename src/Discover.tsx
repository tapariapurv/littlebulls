import { useEffect, useState } from 'react'
import { candles, preload, screen, stockInfo, useQuotes, useSearch, type Info, type Row } from './data'
import { SPEC_WORDS, exchange, short } from './markets'
import { Tabs, Term, Tick, money, tone } from './ui'

type List = 'climbers' | 'drops' | 'busiest' | 'giants' | 'payers'
const WORTH = 1000

function Pulse({ ex }: { ex: string }) {
  const INDEXES = exchange(ex).indexes
  const q = useQuotes(INDEXES.map(i => i[0]))
  if (!INDEXES.length) return null
  return (
    <section className="card pulse" aria-label="How the market is doing today">
      {INDEXES.map(([sym, name]) => {
        const x = q.bySym[sym]; const pct = x ? (x.price - x.prev) / x.prev * 100 : 0
        return <div key={sym}><small>{name}</small>
          <b className="num">{x ? x.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</b>
          <small className={'num ' + tone(pct)}>{x ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% today` : ''}</small></div>
      })}
    </section>
  )
}

function Ideas({ ex }: { ex: string }) {
  const [list, setList] = useState<List>('climbers')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setFailed(false)
    screen(list, ex).then(r => { if (live) setRows(r) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [list, ex])
  return (
    <section className="card">
      <h2>Research lists</h2>
      <Tabs id="ideas" value={list} onChange={setList} options={[['climbers', 'Climbers'], ['drops', 'Drops'], ['busiest', 'Busiest'], ['giants', 'Giants'], ['payers', 'Payers']]} />
      <div className="stock-list">
        {failed && <p className="muted">Bully couldn’t fetch this list. Try again in a moment.</p>}
        {!failed && !rows && <p className="muted">Fetching the list…</p>}
        {!failed && rows?.map(r => (
          <a key={r.symbol} href={'#/stock/' + r.symbol} onPointerEnter={() => preload(r.symbol)}>
            <span><b>{r.name}</b><small>{short(r.symbol)}</small></span>
            <span className="r">{r.price != null ? <Tick value={r.price} /> : '—'}
              {list === 'payers' && r.yield != null
                ? <small className="num">{r.yield.toFixed(2)}% a year</small>
                : <small className={'num ' + tone(r.pct ?? 0)}>{r.pct != null ? `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%` : ''}</small>}
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}

function Pick({ ex, label, value, onPick }: { ex: string; label: string; value: string; onPick: (s: string) => void }) {
  const [text, setText] = useState(short(value))
  const [open, setOpen] = useState(false) // the list only shows after typing, not after a pick fills the box
  const found = useSearch(open ? text : '', ex) ?? []
  return (
    <div className="pick">
      <input aria-label={label} value={text} placeholder="Type a company" onChange={e => { setText(e.target.value); setOpen(true) }} onFocus={e => e.target.select()} />
      {found.length > 0 && <ul>{found.slice(0, 5).map(f => (
        <li key={f.symbol}><button onClick={() => { onPick(f.symbol); setText(short(f.symbol)); setOpen(false) }}>{f.name}</button></li>
      ))}</ul>}
    </div>
  )
}

/** Side-by-side facts, plus what 1,000 put in a year ago would be worth today. */
function Compare({ ex }: { ex: string }) {
  const [syms, setSyms] = useState<string[]>([])
  useEffect(() => { screen('giants', ex).then(r => setSyms(r.slice(0, 2).map(x => x.symbol))).catch(() => {}) }, [ex])
  const [info, setInfo] = useState<(Info | null)[]>([null, null])
  const [grown, setGrown] = useState<(number | null)[]>([null, null])
  useEffect(() => {
    let live = true
    syms.forEach((s, i) => {
      stockInfo(s).then(d => { if (live) setInfo(o => o.map((x, j) => j === i ? d : x)) }).catch(() => {})
      candles(s, '1Y').then(all => {
        const c = all.filter(x => x.t > Date.now() / 1000 - 31536000) // this range loads extra for scrolling back
        if (live && c.length) setGrown(o => o.map((x, j) => j === i ? WORTH * c[c.length - 1].c / c[0].c : x))
      }).catch(() => {})
    })
    return () => { live = false }
  }, [syms])
  const set = (i: number) => (s: string) => setSyms(o => o.map((x, j) => j === i ? s : x))
  const best = grown[0] != null && grown[1] != null ? (grown[0] >= grown[1] ? 0 : 1) : -1
  return (
    <section className="card">
      <h2>Compare two stocks</h2>
      {syms.length === 2 && <div className="picks"><Pick ex={ex} label="First stock" value={syms[0]} onPick={set(0)} /><Pick ex={ex} label="Second stock" value={syms[1]} onPick={set(1)} /></div>}
      <table className="compare"><tbody>
        <tr><td>{money(WORTH)} a year ago is now</td>{grown.map((g, i) => <td key={i} className={'r num ' + (i === best ? 'win ' : '') + tone((g ?? WORTH) - WORTH)}>{g != null ? money(g) : '—'}</td>)}</tr>
        {['Mkt. cap', 'P/E ratio', 'Dividend', '52-wk high', '52-wk low'].map(k => (
          <tr key={k}><td><Term k={k}>{SPEC_WORDS[k]}</Term></td>{info.map((d, i) => <td key={i} className="r num">{d?.specs[k] ?? '—'}</td>)}</tr>
        ))}
      </tbody></table>
      <p className="note">The past can’t promise the future. A stock that grew last year can still fall next year.</p>
    </section>
  )
}

export function Discover({ ex }: { ex: string }) {
  return (
    <div className="discover">
      <header className="title"><div><h1>Discover</h1><p className="muted">Look around and learn about companies. Nothing here buys or sells.</p></div></header>
      <Pulse ex={ex} />
      <Ideas ex={ex} />
      <Compare ex={ex} />
    </div>
  )
}
