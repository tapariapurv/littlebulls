import assert from 'node:assert/strict'
import { addOrder, canAfford, fill, newPortfolio, settle, summary, touched } from './engine.ts'

let p = newPortfolio('t', 1000)
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
assert.equal(p.realized, -50); assert.deepEqual(p.positions.A, { qty: -5, avg: 100 })
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

let q = addOrder(newPortfolio('t', 1000), { sym: 'A', side: 'buy', qty: 2, type: 'limit', price: 95 })
assert.equal(summary(q, {}).ordersMargin, 95)
assert.equal(settle(q, {}, {}), null)
q = settle(q, { A: [c(Date.now() / 1000 + 9, 90, 99)] }, { A: 95 })!
assert.equal(q.orders.length, 0); assert.equal(q.positions.A.qty, 2)

let m = fill(newPortfolio('t', 1000), 'A', 'buy', 20, 100)
assert.equal(settle(m, {}, { A: 90 }), null, 'a dip alone is no margin call')
m = settle(m, {}, { A: 55 })! // equity -900+1000=100 < deposit 550*.5
assert.equal(m.positions.A, undefined); assert.equal(m.trades[0].forced, true); assert.equal(m.balance, 100)
console.log('engine ok')
