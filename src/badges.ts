// Badges are worked out from what's already saved in the portfolios, so nothing new is stored in the database.
// Once earned, a badge keeps its date even if the thing behind it goes away (selling the shares, starting again).
import type { Portfolio } from './engine.ts'
import { coin, isIndex } from './markets.ts'

const DAY = 86400000
type Facts = Record<'portfolios' | 'toured' | 'trades' | 'wins' | 'watched' | 'alerts' | 'waited' | 'exits' | 'owned' | 'kinds' | 'held' | 'sip' | 'swp' | 'dividends' | 'gain' | 'games', number>

export function facts(list: Portfolio[], toured: boolean, now = Date.now()): Facts {
  const trades = list.flatMap(p => p.trades), done = list.flatMap(p => p.done.filter(o => o.status === 'filled'))
  const logs = list.flatMap(p => p.log.map(l => l.text))
  const longs = list.flatMap(p => Object.entries(p.positions).filter(([, x]) => x.qty > 0))
  return {
    portfolios: list.length, toured: +toured,
    trades: trades.filter(t => !t.div).length, wins: trades.filter(t => !t.div && t.pnl > 0).length,
    watched: new Set(list.flatMap(p => p.watchlists.flatMap(w => w.syms))).size,
    alerts: logs.filter(t => t.startsWith('Set an alert')).length,
    waited: done.filter(o => o.type !== 'market' && !o.exit).length, exits: done.filter(o => o.exit).length,
    owned: Math.max(0, ...list.map(p => Object.values(p.positions).filter(x => x.qty > 0).length)),
    kinds: Math.max(0, ...list.map(p => new Set(Object.keys(p.positions).filter(s => p.positions[s].qty > 0).map(s => coin(s) ? 'c' : isIndex(s) ? 'i' : 's')).size)),
    held: Math.floor(Math.max(0, ...longs.map(([, x]) => x.at ? (now - x.at) / DAY : 0))),
    sip: logs.filter(t => t.startsWith('Started a plan to put')).length, swp: logs.filter(t => t.startsWith('Started a plan to take')).length,
    dividends: trades.filter(t => t.div && t.pnl > 0).length,
    gain: Math.max(0, ...list.map(p => p.start ? p.realized / p.start * 100 : 0)),
    games: list.filter(p => p.game).length,
  }
}

export type Badge = { id: string; group: string; icon: string; name: string; how: string; fact: keyof Facts; goal: number }
const b = (group: string, id: string, icon: string, name: string, how: string, fact: keyof Facts, goal = 1): Badge => ({ id, group, icon, name, how, fact, goal })
export const GROUPS = ['Getting started', 'Trading milestones', 'Smart moves', 'Money milestones', 'Playing together']
export const BADGES: Badge[] = [
  b(GROUPS[0], 'piggy', '🐷', 'Piggy bank', 'Make your first portfolio.', 'portfolios'),
  b(GROUPS[0], 'explorer', '🧭', 'Explorer', 'Finish the tour of LittleBulls.', 'toured'),
  b(GROUPS[0], 'first-trade', '👣', 'First step', 'Make your first trade.', 'trades'),
  b(GROUPS[0], 'window', '👀', 'Window shopper', 'Add 5 things to your watchlists.', 'watched', 5),
  b(GROUPS[0], 'lookout', '🔔', 'Lookout', 'Set a price alert.', 'alerts'),
  b(GROUPS[1], 'trades-10', '🐝', 'Busy bee', 'Make 10 trades.', 'trades', 10),
  b(GROUPS[1], 'trades-50', '📈', 'Market regular', 'Make 50 trades.', 'trades', 50),
  b(GROUPS[1], 'trades-100', '🏅', 'Trading pro', 'Make 100 trades.', 'trades', 100),
  b(GROUPS[1], 'trades-500', '🏆', 'Market legend', 'Make 500 trades.', 'trades', 500),
  b(GROUPS[1], 'win-1', '🎉', 'First win', 'Finish a trade with a win.', 'wins'),
  b(GROUPS[1], 'win-10', '🔥', 'On a roll', 'Finish 10 trades with a win.', 'wins', 10),
  b(GROUPS[1], 'win-50', '🚀', 'Win machine', 'Finish 50 trades with a win.', 'wins', 50),
  b(GROUPS[2], 'patient', '⏳', 'Patient trader', 'Have a waiting order happen.', 'waited'),
  b(GROUPS[2], 'safety', '🪂', 'Safety net', 'Have a take-win or stop-loss happen.', 'exits'),
  b(GROUPS[2], 'spread', '🧺', 'Spread it out', 'Own 5 different things at once.', 'owned', 5),
  b(GROUPS[2], 'mix', '🎨', 'Mix master', 'Own a stock, a coin and an index at once.', 'kinds', 3),
  b(GROUPS[2], 'hold-30', '🧘', 'Steady hands', 'Keep something you own for 30 days.', 'held', 30),
  b(GROUPS[2], 'hold-180', '🐢', 'Long hauler', 'Keep something you own for 180 days.', 'held', 180),
  b(GROUPS[2], 'sip', '🌱', 'Little by little', 'Start a SIP that buys for you every week or month.', 'sip'),
  b(GROUPS[2], 'swp', '💸', 'Pocket money', 'Start an SWP that takes money out every week or month.', 'swp'),
  b(GROUPS[3], 'div-1', '💌', 'Thank-you money', 'Get your first dividend.', 'dividends'),
  b(GROUPS[3], 'div-10', '🍯', 'Dividend collector', 'Get 10 dividends.', 'dividends', 10),
  b(GROUPS[3], 'gain-5', '🌤️', 'Up 5%', 'Lock in wins worth 5% of a portfolio’s starting money.', 'gain', 5),
  b(GROUPS[3], 'gain-10', '☀️', 'Up 10%', 'Lock in wins worth 10% of a portfolio’s starting money.', 'gain', 10),
  b(GROUPS[3], 'gain-25', '🌟', 'Up 25%', 'Lock in wins worth 25% of a portfolio’s starting money.', 'gain', 25),
  b(GROUPS[3], 'gain-50', '💎', 'Up 50%', 'Lock in wins worth 50% of a portfolio’s starting money.', 'gain', 50),
  b(GROUPS[4], 'team', '🤝', 'Team player', 'Join or make a game.', 'games'),
  b(GROUPS[4], 'game-night', '🎲', 'Game night', 'Play in 3 games.', 'games', 3),
  b(GROUPS[4], 'big-plans', '🗂️', 'Big plans', 'Have 3 portfolios.', 'portfolios', 3),
]

/** How far along each badge is, from 0 to 1. */
export const progress = (f: Facts) => Object.fromEntries(BADGES.map(x => [x.id, Math.min(1, f[x.fact] / x.goal)]))

/** Adds today's date to every badge that's newly done. Returns the badges it added. */
export function award(earned: Record<string, number>, f: Facts, now = Date.now()) {
  const fresh = BADGES.filter(x => !earned[x.id] && f[x.fact] >= x.goal)
  return { earned: { ...earned, ...Object.fromEntries(fresh.map(x => [x.id, now])) }, fresh }
}

/** A PDF of full-page JPEG pictures, written by hand so the app needs no PDF library. Sizes are in points; A4 landscape by default. */
export function pdf(pages: { jpg: Uint8Array; w: number; h: number }[], W = 842, H = 595) {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], at: number[] = []
  let len = 0
  const put = (x: string | Uint8Array) => { const bytes = typeof x === 'string' ? enc.encode(x) : x; parts.push(bytes); len += bytes.length }
  const obj = (n: number, ...body: (string | Uint8Array)[]) => { at[n] = len; put(`${n} 0 obj\n`); body.forEach(put); put('\nendobj\n') }
  put('%PDF-1.4\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  pages.forEach((pg, i) => {
    const o = 3 + i * 3, draw = `q ${W} 0 0 ${H} 0 0 cm /Im Do Q`
    obj(o, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im ${o + 1} 0 R >> >> /Contents ${o + 2} 0 R >>`)
    obj(o + 1, `<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpg.length} >>\nstream\n`, pg.jpg, '\nendstream')
    obj(o + 2, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)
  })
  const xref = len, size = 3 + pages.length * 3
  put(`xref\n0 ${size}\n0000000000 65535 f \n${at.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
