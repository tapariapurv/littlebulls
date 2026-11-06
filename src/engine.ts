// Pure paper trading rules, modelled on TradingView's paper engine: one netted position per
// stock, buy or sell first, 2x borrowing, and a margin call when the safety deposit runs out.
export const MARGIN = 0.5
export type Side = 'buy' | 'sell'
export type Position = { qty: number; avg: number }
export type Order = { id: string; sym: string; side: Side; qty: number; type: 'limit' | 'stop'; price: number; at: number }
export type Trade = { id: string; sym: string; side: Side; qty: number; price: number; at: number; pnl: number; forced?: boolean }
export type Portfolio = {
  id: string; name: string; start: number; balance: number; realized: number; createdAt: number
  positions: Record<string, Position>; orders: Order[]; trades: Trade[]
}
export type Candle = { t: number; o: number; h: number; l: number; c: number }
export type Prices = Record<string, number>

const uid = () => Math.random().toString(36).slice(2, 10)

export const newPortfolio = (name: string, start: number): Portfolio => ({
  id: uid(), name, start, balance: start, realized: 0, createdAt: Date.now(), positions: {}, orders: [], trades: [],
})

const signed = (side: Side, qty: number) => (side === 'buy' ? qty : -qty)

/** Shares of new exposure an order adds; closing a position needs no deposit. */
const extra = (p: Portfolio, sym: string, side: Side, qty: number) => {
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

export const canAfford = (p: Portfolio, prices: Prices, sym: string, side: Side, qty: number, price: number) =>
  Number.isInteger(qty) && qty > 0 && extra(p, sym, side, qty) * price * MARGIN <= summary(p, prices).available

export function fill(p: Portfolio, sym: string, side: Side, qty: number, price: number, at = Date.now(), forced = false): Portfolio {
  const pos = p.positions[sym] ?? { qty: 0, avg: 0 }
  const d = signed(side, qty)
  const closing = pos.qty * d < 0 ? Math.min(Math.abs(pos.qty), qty) : 0
  const pnl = closing * (price - pos.avg) * Math.sign(pos.qty)
  const nq = pos.qty + d
  const avg = closing
    ? (qty > Math.abs(pos.qty) ? price : pos.avg) // flipped sides, so the rest opens at this price
    : (pos.avg * Math.abs(pos.qty) + price * qty) / Math.abs(nq)
  const positions = { ...p.positions }
  if (nq === 0) delete positions[sym]; else positions[sym] = { qty: nq, avg }
  return {
    ...p, positions, balance: p.balance + pnl, realized: p.realized + pnl,
    trades: [{ id: uid(), sym, side, qty, price, at, pnl, ...(forced ? { forced } : {}) }, ...p.trades],
  }
}

export function touched(o: Order, candles: Candle[]) {
  const wantsLow = (o.side === 'buy') === (o.type === 'limit')
  return candles.find(c => c.t * 1000 > o.at && (wantsLow ? c.l <= o.price : c.h >= o.price))
}

/** Fills waiting orders the market reached, then closes everything if the deposit has run out. Null if nothing changed. */
export function settle(p: Portfolio, candles: Record<string, Candle[]>, prices: Prices): Portfolio | null {
  let next = p
  for (const o of p.orders) {
    const hit = touched(o, candles[o.sym] ?? [])
    if (hit) {
      next = fill(next, o.sym, o.side, o.qty, o.price, hit.t * 1000)
      next = { ...next, orders: next.orders.filter(x => x.id !== o.id) }
    }
  }
  const s = summary(next, prices)
  // ponytail: closes everything at once; TradingView's engine does too on a full margin call.
  if (s.margin > 0 && s.equity < s.margin * 0.5) {
    for (const [sym, pos] of Object.entries(next.positions))
      next = fill(next, sym, pos.qty > 0 ? 'sell' : 'buy', Math.abs(pos.qty), prices[sym] ?? pos.avg, Date.now(), true)
  }
  return next === p ? null : next
}

export const addOrder = (p: Portfolio, o: Omit<Order, 'id' | 'at'>): Portfolio =>
  ({ ...p, orders: [{ ...o, id: uid(), at: Date.now() }, ...p.orders] })
export const cancelOrder = (p: Portfolio, id: string): Portfolio =>
  ({ ...p, orders: p.orders.filter(o => o.id !== id) })
