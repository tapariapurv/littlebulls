import assert from 'node:assert/strict'
import { MAX_TRADES, addOrder, canAfford, fill, newPortfolio, settle, summary, touched, type Portfolio } from './engine.ts'

let p = newPortfolio('t', 1000, 'NSE', 0)
assert(canAfford(p, {}, 'A', 'buy', 20, 100), '2x borrowing lets 1000 buy 2000 of stock')
assert(!canAfford(p, {}, 'A', 'buy', 21, 100))
p = fill(p, 'A', 'buy', 10, 100)
p = fill(p, 'A', 'buy', 10, 120)
assert.equal(p.positions.A.avg, 110)
let s = summary(p, { A: 130 })
assert.equal(s.unrealized, 400); assert.equal(s.equity, 1400); assert.equal(s.margin, 1300); assert.equal(s.available, 100)
p = fill(p, 'A', 'sell', 5, 130)
assert.equal(p.realized, 100); assert.equal(p.balance, 1100); assert.equal(p.positions.A.qty, 15)
p = fill(p, 'A', 'sell', 20, 100) // flips short: closes 15 at -10, opens 5 short at 100
assert.equal(p.realized, -50); assert.deepEqual([p.positions.A.qty, p.positions.A.avg], [-5, 100])
assert.equal(summary(p, { A: 90 }).unrealized, 50)
p = fill(p, 'A', 'buy', 5, 90)
assert.equal(p.realized, 0); assert.equal(p.positions.A, undefined)

const c = (t: number, l: number, h: number) => ({ t, o: l, h, l, c: h })
const lim = { id: 'x', sym: 'A', side: 'buy' as const, qty: 1, type: 'limit' as const, price: 95, at: 5000 }
assert(!touched(lim, [c(1, 90, 99)]), 'candles before the order do not count')
assert(!touched(lim, [c(6, 96, 99)]))
assert(touched(lim, [c(6, 94, 99)]))
assert(touched({ ...lim, side: 'sell', type: 'stop' }, [c(6, 94, 99)]), 'sell stop triggers on a fall')
assert(touched({ ...lim, side: 'buy', type: 'stop', price: 98 }, [c(6, 94, 99)]), 'buy stop triggers on a rise')

let q = addOrder(newPortfolio('t', 1000, 'NSE', 0), { sym: 'A', side: 'buy', qty: 2, type: 'limit', price: 95 })
assert.equal(summary(q, {}).ordersMargin, 95)
assert.equal(settle(q, {}, {}), null)
q = settle(q, { A: [c(Date.now() / 1000 + 9, 90, 99)] }, { A: 95 })!
assert.equal(q.orders.length, 0); assert.equal(q.positions.A.qty, 2)

let m = fill(newPortfolio('t', 1000, 'NSE', 0), 'A', 'buy', 20, 100)
assert.equal(settle(m, {}, { A: 90 }), null, 'a dip alone is no margin call')
m = settle(m, {}, { A: 55 })! // equity -900+1000=100 < deposit 550*.5
assert.equal(m.positions.A, undefined); assert.equal(m.trades[0].forced, true); assert.equal(m.balance, 100)
console.log('engine ok')

// Exits: the take-win fires, its stop-loss partner goes away, and the win is counted.
const { addAlert, analytics, balanceHistory, cancelOrder, firedAlerts, marketOrder, resetPortfolio } = await import('./engine.ts')
let x = marketOrder(newPortfolio('x', 10000, 'NSE', 0), 'A', 'buy', 10, 100, { tp: 110, sl: 90 })
assert.equal(x.orders.length, 2); assert.equal(x.done[0].type, 'market')
assert.equal(summary(x, { A: 100 }).ordersMargin, 0, 'exits need no deposit')
const later = (x.orders[0].at + 60000) / 1000
x = settle(x, { A: [{ t: later, o: 100, h: 111, l: 99, c: 110 }] }, { A: 110 })!
assert.equal(x.positions.A, undefined); assert.equal(x.orders.length, 0); assert.equal(x.realized, 100)
assert.equal(x.done[0].exit, 'tp'); assert.equal(balanceHistory(x)[0].balance, 10100)
// When a stop and a win are both touched, the earlier candle decides.
let y = marketOrder(newPortfolio('y', 10000, 'NSE', 0), 'A', 'buy', 10, 100, { tp: 110, sl: 90 })
const t0 = (y.orders[0].at + 60000) / 1000
y = settle(y, { A: [{ t: t0, o: 100, h: 100, l: 89, c: 90 }, { t: t0 + 300, o: 90, h: 112, l: 90, c: 111 }] }, { A: 111 })!
assert.equal(y.realized, -100); assert.equal(y.orders.length, 0)
assert.deepEqual([analytics(y).losses, analytics(y).worst], [1, -100])
// Closing by hand removes exits; a waiting entry brings its exits along when it fills.
let z = marketOrder(newPortfolio('z', 10000, 'NSE', 0), 'A', 'buy', 5, 100, { sl: 90 })
z = marketOrder(z, 'A', 'sell', 5, 105); assert.equal(z.orders.length, 0)
z = addOrder(z, { sym: 'B', side: 'buy', qty: 2, type: 'limit', price: 50, tp: 60 })
const t1 = (z.orders[0].at + 60000) / 1000
z = settle(z, { B: [{ t: t1, o: 55, h: 55, l: 49, c: 50 }] }, { B: 50 })!
assert.equal(z.positions.B.qty, 2); assert.equal(z.orders[0].exit, 'tp')
assert.equal(cancelOrder(z, z.orders[0].id).done[0].status, 'cancelled')
// Alerts fire when crossed in the direction they were set for.
const al = addAlert(newPortfolio('a', 1, 'NSE', 0), 'A', 110, 100)
assert.equal(firedAlerts(al, { A: 105 }).length, 0); assert.equal(firedAlerts(al, { A: 110 }).length, 1)
const r = resetPortfolio(z); assert.equal(r.balance, 10000); assert.equal(r.trades.length, 0); assert.equal(r.id, z.id)

// Money history stays right after old trades are dropped, and the trade list can't outgrow a database document.
{
  let p = newPortfolio('cap', 100000, 'NSE', 0)
  for (let i = 0; i < MAX_TRADES + 10; i++) p = fill(p, 'A', i % 2 ? 'sell' : 'buy', 1, i % 2 ? 101 : 100)
  assert.equal(p.trades.length, MAX_TRADES)
  const h = balanceHistory(p)
  assert.equal(h[0].balance, p.balance)
  assert.equal(h[1].balance, p.balance - h[0].change)
}

// A limit fills at a better price when the market opens past it, never a worse one.
{
  const { fillPrice, marketable, round8 } = await import('./engine.ts')
  const cd = { t: 1, o: 90, h: 99, l: 88, c: 95 }
  assert.equal(fillPrice({ side: 'buy', type: 'limit', price: 95 }, cd), 90, 'opened below the buy limit, so it got the cheaper open')
  assert.equal(fillPrice({ side: 'buy', type: 'limit', price: 89 }, cd), 89)
  assert.equal(fillPrice({ side: 'sell', type: 'limit', price: 85 }, cd), 90, 'opened above the sell limit')
  assert.equal(fillPrice({ side: 'sell', type: 'stop', price: 89 }, cd), 89)
  assert(marketable('buy', 'limit', 105, 100), 'buy limit above the price happens now')
  assert(!marketable('buy', 'limit', 95, 100), 'buy limit below the price waits')
  assert(marketable('sell', 'limit', 95, 100) && !marketable('sell', 'limit', 105, 100))
  assert(marketable('buy', 'stop', 95, 100) && !marketable('buy', 'stop', 105, 100))
  assert(marketable('sell', 'stop', 105, 100) && !marketable('sell', 'stop', 95, 100))
  let g = addOrder(newPortfolio('t', 1000, 'NSE', 0), { sym: 'A', side: 'buy', qty: 1, type: 'limit', price: 95 })
  g = settle(g, { A: [{ t: Date.now() / 1000 + 9, o: 90, h: 92, l: 89, c: 91 }] }, { A: 91 })!
  assert.equal(g.positions.A.avg, 90); assert.equal(g.done[0].price, 90)
  // Parts of a coin add up to exactly nothing when sold.
  let f = fill(fill(newPortfolio('t', 1000, 'NSE', 0), 'B', 'buy', 0.1, 10), 'B', 'buy', 0.2, 10)
  assert(canAfford(f, {}, 'B', 'buy', 0.5, 10))
  f = fill(f, 'B', 'sell', 0.3, 10)
  assert.equal(f.positions.B, undefined); assert.equal(round8(0.1 + 0.2), 0.3)
  console.log('fills ok')
}
{
  const { corporate, analytics, balanceHistory, hydrate } = await import('./engine.ts')
  // Trading costs come off the money and show in the Money tab, not in win or loss stats.
  let c = fill(newPortfolio('c', 10000), 'A', 'buy', 10, 100) // 0.1% of 1000 = 1
  assert.equal(c.balance, 9999); assert.equal(c.trades[0].fee, 1)
  c = fill(c, 'A', 'sell', 10, 110) // +100, minus 1.1
  assert.equal(c.balance, 9999 + 100 - 1.1); assert.equal(analytics(c).total, 100); assert.equal(analytics(c).fees, 2.1)
  assert.equal(balanceHistory(c).at(-1)!.balance, 9999)
  assert(!canAfford(newPortfolio('c', 100), {}, 'A', 'buy', 2, 100), 'the cost counts toward what you can afford')
  assert.equal(hydrate({}).fee, 0.1)
  // Dividends go to shares held before the day; a short pays them; splits scale shares, orders and alerts.
  const t0 = Date.now() - 10 * 86400000, s = (d: number) => (t0 + d * 86400000) / 1000
  let d: Portfolio = { ...fill(newPortfolio('d', 10000, 'NSE', 0), 'A', 'buy', 10, 100, t0 + 1), evAt: t0 }
  d = fill(d, 'B', 'sell', 5, 50, t0 + 1)
  d = addOrder(d, { sym: 'A', side: 'sell', qty: 10, type: 'limit', price: 150 })
  d = corporate(d, { A: { div: [[s(1), 2]], split: [[s(2), 2]] }, B: { div: [[s(1), 1], [s(-1), 9]], split: [] } }, t0 + 5 * 86400000)!
  assert.equal(d.balance, 10000 + 20 - 5); assert.equal(analytics(d).dividends, 15); assert.equal(analytics(d).count, 0)
  assert.deepEqual([d.positions.A.qty, d.positions.A.avg, d.orders[0].qty, d.orders[0].price], [20, 50, 20, 75])
  assert.equal(corporate(d, { A: { div: [[s(1), 2]], split: [] } }, t0 + 6 * 86400000), null, 'paid once')
  assert.equal(corporate({ ...d, evAt: undefined }, {})!.evAt! > 0, true, 'old portfolios start counting')
  console.log('costs and dividends ok')
}
