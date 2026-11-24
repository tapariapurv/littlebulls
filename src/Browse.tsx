import { useEffect, useState } from 'react'
import { funds, preload, screen, useQuotes, useSearch, type Row } from './data'
import { COINS, CRYPTO_CCYS, KIND, exchange, kindOf, short } from './markets'
import { Empty, Tabs, Term, Tick, tone } from './ui'

type Tab = 'stocks' | 'etfs' | 'bonds' | 'indexes' | 'crypto'
const TABS: [Tab, string][] = [['stocks', 'Stocks'], ['etfs', 'ETFs'], ['bonds', 'Bonds'], ['indexes', 'Indexes'], ['crypto', 'Crypto']]
let lastTab: Tab = 'stocks' // coming back from a stock page lands on the same list

const hue = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360

function List({ rows, empty }: { rows: Row[] | null; empty: string }) {
  const q = useQuotes((rows ?? []).slice(0, 20).map(r => r.symbol))
  if (!rows) return <p className="muted pad">Fetching the list…</p>
  if (!rows.length) return <Empty text={empty} />
  return <>{rows.map(r => {
    const x = q.bySym[r.symbol], price = x?.price ?? r.price
    const pct = x ? (x.price - x.prev) / x.prev * 100 : r.pct
    const kind = KIND[kindOf(r.symbol, r.kind ?? x?.kind)] ?? KIND.EQUITY
    return <a key={r.symbol} href={'#/stock/' + r.symbol} onPointerEnter={() => preload(r.symbol)}>
      <span className="mono-mark" style={{ background: `hsl(${hue(r.symbol)} 70% 92%)`, color: `hsl(${hue(r.symbol)} 70% 25%)` }}>{r.name[0]}</span>
      <span><b>{r.name}</b><small>{short(r.symbol)} <em className="kind">{kind[0]}</em></small></span>
      {price != null && <span className="r"><Tick value={price} />{pct != null && <small className={'num ' + tone(pct)}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</small>}</span>}
    </a>
  })}</>
}

/** Everything a portfolio can trade, one kind of thing per tab, with one search across all of them. */
export function Markets({ ex }: { ex: string }) {
  const m = exchange(ex)
  const [tab, setTab] = useState<Tab>(lastTab)
  const [text, setText] = useState('')
  const found = useSearch(text, ex)
  const [giants, setGiants] = useState<Row[] | null>(null)
  const [fund, setFund] = useState<{ etfs: Row[]; bonds: Row[] } | null>(null)
  useEffect(() => { screen('giants', ex, 15).then(setGiants).catch(() => setGiants([])) }, [ex])
  useEffect(() => { funds(ex).then(setFund).catch(() => setFund({ etfs: [], bonds: [] })) }, [ex])
  useEffect(() => { if (found?.[0]) preload(found[0].symbol) }, [found]) // the likely pick is ready before it's tapped
  const pick = (t: Tab) => { lastTab = t; setTab(t) }

  const crypto = CRYPTO_CCYS.includes(m.currency)
  const lists: Record<Tab, Row[] | null> = {
    stocks: giants, etfs: fund?.etfs ?? null, bonds: fund?.bonds ?? null,
    indexes: m.indexes.map(([symbol, name]) => ({ symbol, name, kind: 'INDEX' })),
    crypto: crypto ? COINS.map(([b, name]) => ({ symbol: `${b}-${m.currency}`, name, kind: 'CRYPTOCURRENCY' })) : [],
  }
  // Yahoo's search covers stocks and funds; coins, indexes and the fund lists are matched here as well.
  const word = text.trim().toLowerCase()
  const results = word.length < 2 || !found ? null : (() => {
    const local = [...lists.indexes!, ...lists.crypto!, ...(fund?.etfs ?? []), ...(fund?.bonds ?? [])]
      .filter(r => r.name.toLowerCase().includes(word) || short(r.symbol).toLowerCase().startsWith(word))
    const seen = new Set<string>()
    return [...local, ...found].filter(r => !seen.has(r.symbol) && seen.add(r.symbol))
  })()
  const notes: Record<Tab, React.ReactNode> = {
    stocks: <>The biggest companies on {m.name}. A <Term k="stock">stock</Term> is a tiny piece of one.</>,
    etfs: <>An <Term k="etf">ETF</Term> holds many companies at once, so one trade spreads your money out.</>,
    bonds: <>You buy bonds here through <Term k="bond">bond funds</Term>. Their prices usually move slowly.</>,
    indexes: <>Practise trading a whole market’s <Term k="index">score</Term>. One point costs one {m.currency}, and you can buy part of one.</>,
    crypto: <><Term k="crypto">Coins</Term> trade all day, every day, priced in {m.currency}. You can buy part of a coin.</>,
  }
  const empties: Record<Tab, string> = {
    stocks: 'Bully couldn’t fetch the list. Try searching instead.',
    etfs: `Bully couldn’t find funds on ${m.name}. Try searching for one by name.`,
    bonds: `Bully couldn’t find bond funds on ${m.name}. Try an exchange like NSE, NYSE or Toronto.`,
    indexes: `Bully has no index to follow for ${m.name}.`,
    crypto: `Free coin prices aren’t available in ${m.currency}. Make a portfolio in ${CRYPTO_CCYS.join(', ')} to trade crypto.`,
  }

  return (
    <div className="stocks">
      <header className="title"><div><h1>Markets</h1><p className="muted">Everything you can trade on {m.name}, in {m.currency}.</p></div></header>
      <input className="search" type="search" aria-label="Search stocks, funds, indexes and coins" placeholder="Search a company, fund, index or coin" value={text} onChange={e => setText(e.target.value)} />
      <section className="card stock-list">
        {results ? <List rows={results} empty={`Bully couldn’t find “${text}” on ${m.name}. Try another name.`} /> : <>
          <Tabs id="market" value={tab} onChange={pick} options={TABS} />
          <p className="muted list-note">{notes[tab]}</p>
          <List key={tab} rows={lists[tab]} empty={empties[tab]} />
        </>}
      </section>
    </div>
  )
}
