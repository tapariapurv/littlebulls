// Pure paper trading rules, modelled on TradingView's paper engine: one netted position per
// stock, buy or sell first, 2x borrowing, exits, and a margin call when the safety deposit runs out.
export const MARGIN = 0.5
export const MAX_TRADES = 3000
export type Side = 'buy' | 'sell'
export type Position = { qty: number; avg: number; at?: number } // at: when it was opened, for dividends
export type Order = { id: string; sym: string; side: Side; qty: number; type: 'limit' | 'stop'; price: number; at: number; tp?: number; sl?: number; exit?: 'tp' | 'sl' }
export type DoneOrder = { id: string; sym: string; side: Side; qty: number; type: 'market' | 'limit' | 'stop'; price: number; at: number; closed: number; status: 'filled' | 'cancelled'; exit?: 'tp' | 'sl' }
export type Trade = { id: string; sym: string; side: Side; qty: number; price: number; at: number; pnl: number; forced?: boolean; fee?: number; div?: boolean }
export type Alert = { id: string; sym: string; price: number; above: boolean; at: number }
export type Watchlist = { id: string; name: string; syms: string[] }
export type Portfolio = {
  id: string; name: string; start: number; balance: number; realized: number; createdAt: number; exchange: string
  positions: Record<string, Position>; orders: Order[]; trades: Trade[]; done: DoneOrder[]
  log: { at: number; text: string }[]; alerts: Alert[]; watchlists: Watchlist[]; rev?: string
  fee: number // trading cost as a percent of each trade; 0 is off
  evAt?: number // dividends and splits are counted up to here
  game?: { code: string; ends: number; as: string } // made by joining a game; ends 0 means never, as is the name on its leaderboard
}
export type Candle = { t: number; o: number; h: number; l: number; c: number }
export type Prices = Record<string, number>
type Exits = { tp?: number; sl?: number }

/** Coins and indexes trade in parts of a unit; eight decimals is as fine as Bitcoin itself goes. */
export const round8 = (n: number) => Math.round(n * 1e8) / 1e8
export const uid = () => Math.random().toString(36).slice(2, 10)
const short = (sym: string) => sym.replace(/\.[A-Z]+$/, '')

export const FEE = 0.1
export const ended = (ends: number) => ends > 0 && ends <= Date.now()
export const newPortfolio = (name: string, start: number, exchange = 'NSE', fee = FEE): Portfolio => ({
  id: uid(), name, start, balance: start, realized: 0, createdAt: Date.now(), evAt: Date.now(), fee, exchange, positions: {}, orders: [], trades: [],
  done: [], log: [], alerts: [], watchlists: [{ id: 'main', name: 'My list', syms: [] }],
})

/** Portfolios saved before these fields existed are all NSE ones, and get trading costs like new ones. */
export const hydrate = (p: Partial<Portfolio>) =>
  ({ exchange: 'NSE', fee: FEE, done: [], log: [], alerts: [], watchlists: [{ id: 'main', name: 'My list', syms: [] }], ...p }) as Portfolio

const note = (p: Portfolio, text: string, at = Date.now()): Portfolio =>
  ({ ...p, log: [{ at, text }, ...p.log].slice(0, 200) })
const record = (p: Portfolio, o: Omit<DoneOrder, 'closed' | 'status'>, status: DoneOrder['status'], closed = Date.now()): Portfolio =>
  ({ ...p, done: [{ ...o, status, closed }, ...p.done].slice(0, 200) })

const signed = (side: Side, qty: number) => (side === 'buy' ? qty : -qty)

/** Shares of new exposure an order adds; closing a position needs no deposit. */
export const extra = (p: Portfolio, sym: string, side: Side, qty: number) => {
  const q = p.positions[sym]?.qty ?? 0
  return Math.max(0, Math.abs(q + signed(side, qty)) - Math.abs(q))
}

export function summary(p: Portfolio, prices: Prices) {
  let unrealized = 0, margin = 0
  for (const [sym, pos] of Object.entries(p.positions)) {
    const px = prices[sym] ?? pos.avg
    unrealized += pos.qty * (px - pos.avg)
    margin += Math.abs(pos.qty) * px * MARGIN
  }
  const ordersMargin = p.orders.reduce((s, o) => s + extra(p, o.sym, o.side, o.qty) * o.price * MARGIN, 0)
  const equity = p.balance + unrealized
  return { unrealized, margin, ordersMargin, equity, available: equity - margin - ordersMargin, realized: p.realized, balance: p.balance }
}

export const costOf = (p: Portfolio, qty: number, price: number) => qty * price * p.fee / 100

/** Shrinking a trade is always allowed: it frees deposit, so even with nothing free you can get out. */
export const canAfford = (p: Portfolio, prices: Prices, sym: string, side: Side, qty: number, price: number) => {
  if (!Number.isFinite(qty) || qty <= 0) return false
  const add = extra(p, sym, side, qty)
  return add === 0 || add * price * MARGIN + costOf(p, qty, price) <= summary(p, prices).available
}

export function fill(p: Portfolio, sym: string, side: Side, qty: number, price: number, at = Date.now(), forced = false): Portfolio {
  const pos = p.positions[sym] ?? { qty: 0, avg: 0 }
  const d = signed(side, qty)
  const closing = pos.qty * d < 0 ? Math.min(Math.abs(pos.qty), qty) : 0
  const pnl = closing * (price - pos.avg) * Math.sign(pos.qty)
  const fee = costOf(p, qty, price)
  const nq = round8(pos.qty + d) // so selling 0.3 after buying 0.1 and 0.2 leaves exactly nothing
  const avg = closing
    ? (qty > Math.abs(pos.qty) ? price : pos.avg) // flipped sides, so the rest opens at this price
    : (pos.avg * Math.abs(pos.qty) + price * qty) / Math.abs(nq)
  const positions = { ...p.positions }
  if (nq === 0) delete positions[sym]; else positions[sym] = { qty: nq, avg, at: pos.qty * nq > 0 ? pos.at : at }
  return note({
    ...p, positions, balance: p.balance + pnl - fee, realized: p.realized + pnl - fee,
    orders: closing && nq * pos.qty <= 0 ? p.orders.filter(o => !(o.exit && o.sym === sym)) : p.orders, // exits go away with their position
    // A saved portfolio can't pass 1 MB in the database, so only the latest trades are kept.
    trades: [{ id: uid(), sym, side, qty, price, at, pnl, ...(fee ? { fee } : {}), ...(forced ? { forced } : {}) }, ...p.trades].slice(0, MAX_TRADES),
  }, `${forced ? 'Bully closed' : side === 'buy' ? 'Bought' : 'Sold'} ${qty} ${short(sym)} at ${price.toFixed(2)}`, at)
}

/** Places the take-win and stop-loss orders for a position that was just opened or added to. */
function withExits(p: Portfolio, sym: string, side: Side, qty: number, { tp, sl }: Exits, at: number): Portfolio {
  if (signed(side, p.positions[sym]?.qty ?? 0) <= 0) return p
  const back: Side = side === 'buy' ? 'sell' : 'buy'
  const make = (type: Order['type'], price: number, exit: 'tp' | 'sl'): Order => ({ id: uid(), sym, side: back, qty, type, price, at, exit })
  return { ...p, orders: [...(tp ? [make('limit', tp, 'tp')] : []), ...(sl ? [make('stop', sl, 'sl')] : []), ...p.orders] }
}

/** Trades now at the market price. `type` is what was asked for: a limit or stop the price had already passed fills like this too. */
export function marketOrder(p: Portfolio, sym: string, side: Side, qty: number, price: number, exits: Exits = {}, forced = false, type: DoneOrder['type'] = 'market'): Portfolio {
  const at = Date.now()
  const next = withExits(fill(p, sym, side, qty, price, at, forced), sym, side, qty, exits, at)
  return record(next, { id: uid(), sym, side, qty, type, price, at }, 'filled', at)
}

/** Whether a limit or stop can happen right now: a buy limit above the price, or a stop the price is already past. */
export const marketable = (side: Side, type: Order['type'], limit: number, now: number) =>
  (side === 'buy') === (type === 'limit') ? now <= limit : now >= limit

/** A limit never fills worse than asked, and fills better when the price opens past it. A stop fills at its price. */
export const fillPrice = (o: Pick<Order, 'side' | 'type' | 'price'>, c: Candle) =>
  o.type !== 'limit' ? o.price : o.side === 'buy' ? Math.min(o.price, c.o) : Math.max(o.price, c.o)

export function touched(o: Order, candles: Candle[]) {
  const wantsLow = (o.side === 'buy') === (o.type === 'limit')
  return candles.find(c => c.t * 1000 > o.at && (wantsLow ? c.l <= o.price : c.h >= o.price))
}

/** Fills waiting orders the market reached, oldest first, then closes everything if the deposit has run out. Null if nothing changed. */
export function settle(p: Portfolio, candles: Record<string, Candle[]>, prices: Prices): Portfolio | null {
  let next = p
  const hits = p.orders.flatMap(o => { const hit = touched(o, candles[o.sym] ?? []); return hit ? [{ o, at: hit.t * 1000, px: fillPrice(o, hit) }] : [] }).sort((a, b) => a.at - b.at)
  for (const { o, at, px } of hits) {
    if (!next.orders.some(x => x.id === o.id)) continue // its partner exit already fired and removed it
    const { tp, sl, ...rest } = o
    next = { ...next, orders: next.orders.filter(x => x.id !== o.id) }
    const qty = o.exit ? Math.min(o.qty, Math.abs(next.positions[o.sym]?.qty ?? 0)) : o.qty
    if (!qty) continue
    next = withExits(fill(next, o.sym, o.side, qty, px, at), o.sym, o.side, qty, { tp, sl }, at)
    next = record(next, { ...rest, qty, price: px }, 'filled', at)
  }
  const s = summary(next, prices)
  // ponytail: closes everything at once; TradingView's engine does too on a full margin call.
  if (s.margin > 0 && s.equity < s.margin * 0.5) {
    for (const [sym, pos] of Object.entries(next.positions))
      next = marketOrder(next, sym, pos.qty > 0 ? 'sell' : 'buy', Math.abs(pos.qty), prices[sym] ?? pos.avg, {}, true)
  }
  return next === p ? null : next
}

export const addOrder = (p: Portfolio, o: Omit<Order, 'id' | 'at'>): Portfolio =>
  note({ ...p, orders: [{ ...o, id: uid(), at: Date.now() }, ...p.orders] }, `Waiting to ${o.side} ${o.qty} ${short(o.sym)} at ${o.price.toFixed(2)}`)

export function cancelOrder(p: Portfolio, id: string): Portfolio {
  const o = p.orders.find(x => x.id === id)
  if (!o) return p
  const { tp: _tp, sl: _sl, ...rest } = o
  return note(record({ ...p, orders: p.orders.filter(x => x.id !== id) }, rest, 'cancelled'), `Cancelled the order to ${o.side} ${o.qty} ${short(o.sym)}`)
}

export type Events = Record<string, { div: [number, number][]; split: [number, number][] }>

/** Pays dividends on shares held before the day they went out (a short pays them instead), and splits shares,
 * waiting orders and alerts the way the company did. Null if nothing changed. */
export function corporate(p: Portfolio, ev: Events, now = Date.now()): Portfolio | null {
  if (p.evAt == null) return { ...p, evAt: now } // older portfolios start counting from today
  const all = Object.entries(ev).flatMap(([sym, e]) => [
    ...e.div.map(([t, v]) => ({ sym, t: t * 1000, v, split: false })), ...e.split.map(([t, v]) => ({ sym, t: t * 1000, v, split: true })),
  ]).sort((a, b) => a.t - b.t)
  let next = p
  for (const { sym, t, v, split } of all) {
    const pos = next.positions[sym]
    if (!pos || !(v > 0) || t <= p.evAt || t <= (pos.at ?? 0) || t > now) continue
    if (split) {
      const k = (x?: number) => x && x / v
      next = note({
        ...next, positions: { ...next.positions, [sym]: { ...pos, qty: round8(pos.qty * v), avg: pos.avg / v } },
        orders: next.orders.map(o => o.sym === sym ? { ...o, qty: round8(o.qty * v), price: o.price / v, tp: k(o.tp), sl: k(o.sl) } : o),
        alerts: next.alerts.map(a => a.sym === sym ? { ...a, price: a.price / v } : a),
      }, `${short(sym)} split: every share became ${+v.toFixed(4)}`, t)
    } else {
      const cash = pos.qty * v
      next = note({
        ...next, balance: next.balance + cash, realized: next.realized + cash,
        trades: [{ id: uid(), sym, side: (pos.qty > 0 ? 'buy' : 'sell') as Side, qty: Math.abs(pos.qty), price: v, at: t, pnl: cash, div: true }, ...next.trades].slice(0, MAX_TRADES),
      }, `${short(sym)} ${cash > 0 ? 'paid you' : 'cost you'} ${Math.abs(cash).toFixed(2)} in dividends`, t)
    }
  }
  return next === p ? null : { ...next, evAt: now }
}

/** Starts the same portfolio again from zero; watchlists stay. */
export const resetPortfolio = (p: Portfolio, start = p.start): Portfolio =>
  note({ ...newPortfolio(p.name, start, p.exchange, p.fee), game: p.game, id: p.id, createdAt: p.createdAt, watchlists: p.watchlists }, `Started fresh with ${start.toFixed(2)}`)

export const addAlert = (p: Portfolio, sym: string, price: number, now: number): Portfolio =>
  note({ ...p, alerts: [...p.alerts, { id: uid(), sym, price, above: price > now, at: Date.now() }] }, `Set an alert for ${short(sym)} at ${price.toFixed(2)}`)
export const firedAlerts = (p: Portfolio, prices: Prices) =>
  p.alerts.filter(a => prices[a.sym] != null && (a.above ? prices[a.sym] >= a.price : prices[a.sym] <= a.price))
export const clearAlerts = (p: Portfolio, fired: Alert[]): Portfolio =>
  fired.reduce((n, a) => note(n, `Alert: ${short(a.sym)} reached ${a.price.toFixed(2)}`), { ...p, alerts: p.alerts.filter(a => !fired.some(f => f.id === a.id)) })

/** What the balance was after each finished trade, newest first. */
export function balanceHistory(p: Portfolio) {
  let balance = p.balance // counted back from now, so it stays right after the oldest trades are dropped
  return p.trades.filter(t => t.pnl || t.fee).map(t => {
    const change = t.pnl - (t.fee ?? 0), row = { at: t.at, sym: t.sym, change, balance, div: t.div, fee: t.fee }
    balance -= change
    return row
  })
}

export function analytics(p: Portfolio) {
  const closed = [...p.trades].reverse().filter(t => t.pnl && !t.div)
  const fees = p.trades.reduce((s, t) => s + (t.fee ?? 0), 0), dividends = p.trades.reduce((s, t) => s + (t.div ? t.pnl : 0), 0)
  const wins = closed.filter(t => t.pnl > 0), losses = closed.filter(t => t.pnl < 0)
  const won = wins.reduce((s, t) => s + t.pnl, 0), lost = -losses.reduce((s, t) => s + t.pnl, 0)
  let v = 0, peak = 0, trough = 0, drawdown = 0, runup = 0
  const curve = closed.map(t => {
    v += t.pnl; peak = Math.max(peak, v); trough = Math.min(trough, v)
    drawdown = Math.max(drawdown, peak - v); runup = Math.max(runup, v - trough)
    return { at: t.at, v }
  })
  const by: Record<string, number> = {}
  for (const t of closed) by[t.sym] = (by[t.sym] ?? 0) + t.pnl
  return {
    count: closed.length, wins: wins.length, losses: losses.length, total: v,
    winRate: closed.length ? wins.length / closed.length * 100 : 0,
    profitFactor: lost ? won / lost : null, expectancy: closed.length ? v / closed.length : 0,
    avgWin: wins.length ? won / wins.length : 0, avgLoss: losses.length ? lost / losses.length : 0,
    best: Math.max(0, ...closed.map(t => t.pnl)), worst: Math.min(0, ...closed.map(t => t.pnl)),
    drawdown, runup, curve, fees, dividends, byStock: Object.entries(by).sort((a, b) => b[1] - a[1]),
  }
}
