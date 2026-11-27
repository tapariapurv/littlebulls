import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { CRYPTO_CCYS, EXCHANGES } from './markets'
import { Bully } from './ui'

const KINDS: [string, string][] = [
  ['Stocks', 'A tiny piece of one company, from Reliance to Apple.'],
  ['ETFs', 'A basket of many companies in one trade, so your money is spread out.'],
  ['Bond funds', 'Loans to governments and companies, bundled into a fund. They usually move slowly.'],
  ['Indexes', 'The score of a whole market, like the Nifty 50 or the S&P 500.'],
  ['Crypto', 'Bitcoin, Ethereum and 12 more coins, trading all day, every day.'],
]

const FEATURES: [string, string][] = [
  ['Real prices and charts', 'Live prices that refresh every 15 seconds, and candle or line charts from one day back to five years.'],
  ['Three ways to trade', 'Buy or sell right now, at a price you pick, or once a price is reached. Waiting orders keep working while you are away.'],
  ['Fair fills', 'If the price is already better than the one you asked for, your order happens right away at the better price.'],
  ['A plan to get out', 'Set a take-profit and a stop-loss on any trade, so a win is locked in and a loss stays small.'],
  ['Twice your money, with a safety net', 'Trade up to 2× your cash with a deposit. If losses eat half of it, Bully closes the trades so you never owe anything.'],
  ['Research that makes sense', 'News, quick facts, research lists of climbers and drops, and what 1,000 from a year ago would be worth today.'],
  ['Watchlists and alerts', 'Keep an eye on favourites and get a ping when a price is reached.'],
  ['Games with your class or family', 'Host a game, share its six-letter code, and everyone trades the same pretend money on the same market. A live leaderboard shows who’s ahead.'],
  ['Dividends, splits and costs', 'Shares you own pay their real dividends and split when the company splits. Each trade costs 0.1%, like a real broker, and that can be turned off.'],
  ['Scores to learn from', 'Win rate, profit factor, biggest drop and a full history of every trade you have made.'],
  ['Plain words', 'Every tricky word has a dotted line. Tap it and Bully explains it, with the grown-up name underneath.'],
]

const PROS = [
  'Free, with no payments, brokerage or real money anywhere.',
  `Real prices from ${EXCHANGES.length} exchanges around the world, in their own currencies.`,
  'Five kinds of things to trade, not just stocks.',
  'Several portfolios, so different ideas can be tried side by side.',
  'Games with a live leaderboard for a class, a club or a family.',
  'Works on phones, tablets and computers, and can be added to the home screen.',
]
const CONS = [
  'Prices come from free sources. Some exchanges are 15 to 20 minutes behind, and a source can briefly fail.',
  'Bonds are traded through bond funds; single bonds have no free prices.',
  'Real people can’t buy an index itself. Here you practise on the score, at 1 point for 1 unit of money.',
  `Crypto is priced only in ${CRYPTO_CCYS.join(', ')}.`,
  'Trading costs are one simple percent. Real trading also has taxes and slippage, and costs vary by broker.',
  'Game scores are worked out from what each player reports, so a game is for learning, not for prizes.',
  'Alerts ring only while LittleBulls is open. Waiting orders are filled from price history when you come back.',
]

const FAQ: [string, string][] = [
  ['Is any real money involved?', 'No. There are no payments and no brokerage account. Every rupee, dollar and coin in LittleBulls is pretend.'],
  ['How much does it cost?', 'Nothing. LittleBulls is free.'],
  ['Does it give stock tips?', 'No. It is a place to practise and learn, not financial advice. What a price did before can’t promise what it will do next.'],
  ['What do you save?', 'A nickname, an email address and the portfolios your child makes, so they are there on any device.'],
  ['Can a class play together?', 'Yes. A teacher or parent hosts a game in Games, picks the market, the money and how long it runs, and shares the code. Players only see each other’s nicknames and scores.'],
  ['What does a child need to start?', 'A nickname and an email address, or a Google account. We suggest a parent helps set it up.'],
]

const rise = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] } } as const

/** The public front page: what LittleBulls is, what it can and can't do, and where its numbers come from. */
export function Landing() {
  return (
    <div className="land">
      <header className="land-bar">
        <a className="brand" href="#/"><Bully size={36} /><span>LittleBulls</span></a>
        <nav aria-label="Sections"><a href="#trade" onClick={jump}>What you can trade</a><a href="#features" onClick={jump}>Features</a><a href="#data" onClick={jump}>Data</a><a href="#limits" onClick={jump}>Pros and cons</a><a href="#faq" onClick={jump}>Parents</a></nav>
        <span className="land-actions"><a className="link" href="#/signin">Log in</a><a className="primary buy small" href="#/login">Start free</a></span>
      </header>

      <section className="land-hero">
        <motion.div {...rise}>
          <p className="eyebrow">Paper trading for kids</p>
          <h1>Real markets.<br />Pretend money.</h1>
          <p className="lead">LittleBulls lets kids practise trading stocks, ETFs, bond funds, indexes and crypto at real prices on {EXCHANGES.length} exchanges, and learn how markets work without risking a thing.</p>
          <div className="land-cta"><a className="primary buy" href="#/login">Make a free account</a><a className="ghost" href="#/signin">I already have one</a></div>
        </motion.div>
        <motion.div className="hero-card" {...rise} transition={{ ...rise.transition, delay: 0.08 }} aria-hidden="true">
          <Bully size={120} />
          <dl>
            <div><dt>Exchanges</dt><dd>{EXCHANGES.length}</dd></div>
            <div><dt>Kinds of things to trade</dt><dd>5</dd></div>
            <div><dt>Real money at risk</dt><dd>0</dd></div>
          </dl>
        </motion.div>
      </section>

      <Block id="trade" title="Five kinds of things to trade" lead="Every portfolio belongs to one exchange and its currency, just like a real account.">
        <div className="land-grid five">{KINDS.map(([t, d]) => <article key={t} className="card"><h3>{t}</h3><p>{d}</p></article>)}</div>
      </Block>

      <Block id="features" title="Everything a real trading app has, explained for kids">
        <div className="land-grid">{FEATURES.map(([t, d]) => <article key={t} className="card"><h3>{t}</h3><p>{d}</p></article>)}</div>
      </Block>

      <Block id="how" title="How it works">
        <ol className="land-steps">
          <li><b>Make a portfolio.</b> Pick an exchange and how much pretend money to start with.</li>
          <li><b>Find something to trade.</b> Search a company you know, or browse ETFs, bond funds, indexes and coins.</li>
          <li><b>Trade and learn.</b> Watch your wins and losses, read the news, and try again with a new idea.</li>
        </ol>
      </Block>

      <Block id="data" title="Where the numbers come from" lead="All data comes from free, public sources. Nobody needs an account with them.">
        <div className="land-grid">
          <article className="card"><h3>Prices and charts</h3><p>Yahoo Finance. Prices refresh every 15 seconds while the app is open. Some exchanges are delayed 15 to 20 minutes by the source.</p></article>
          <article className="card"><h3>Company facts</h3><p>Google Finance, for company size, price-to-profit, dividends and more. Yahoo fills in for funds, indexes and coins.</p></article>
          <article className="card"><h3>News</h3><p>Google News headlines about each company, fund, index or coin, linked to the original story.</p></article>
        </div>
      </Block>

      <Block id="limits" title="The good and the not-so-good" lead="We would rather you know the limits up front.">
        <div className="land-two">
          <article className="card"><h3>What it does well</h3><ul className="ticks">{PROS.map(x => <li key={x}>{x}</li>)}</ul></article>
          <article className="card"><h3>What to keep in mind</h3><ul className="dashes">{CONS.map(x => <li key={x}>{x}</li>)}</ul></article>
        </div>
      </Block>

      <Block id="faq" title="Questions parents ask">
        <div className="land-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </Block>

      <section className="land-end">
        <Bully size={72} />
        <h2>Ready for a first trade?</h2>
        <p>It takes a minute to set up, and it’s free.</p>
        <a className="primary buy small" href="#/login">Make a free account</a>
      </section>
      <footer className="land-foot">
        <span>© {new Date().getFullYear()} LittleBulls</span>
        <span>For learning only. Not financial advice. Prices may be delayed.</span>
      </footer>
    </div>
  )
}

// Section links scroll within the page; a real hash change would be read as a route.
const jump = (e: React.MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault()
  document.getElementById(e.currentTarget.hash.slice(1))?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

const Block = ({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) => (
  <section id={id} className="land-block"><h2>{title}</h2>{lead && <p className="lead">{lead}</p>}{children}</section>
)

type Stop = { to: string; title: string; body: ReactNode }
// '' is the hello in the middle of the screen; 'tour' points at the link that plays this again.
const STOPS: Stop[] = [
  { to: '', title: 'Hi, I’m Bully!', body: <><p>Here you practise trading with <b>real prices</b> and <b>pretend money</b>, so nothing you do can lose real money.</p><p>Let me show you around, one tab at a time.</p></> },
  { to: 'home', title: 'My money', body: <><p>Your <b>total worth</b> lives here: your cash plus what your trades are worth right now.</p><p>You can trade up to <b>twice your money</b>. Half of each trade is set aside as a deposit, and if losses eat half of it, I close your trades so you never owe anything.</p></> },
  { to: 'stocks', title: 'Markets', body: <><p>Find something to trade: stocks, ETFs, bond funds, indexes and crypto.</p><p>Tap one to see its chart, then buy or sell <b>right now</b>, <b>at a price you pick</b>, or <b>once a price is reached</b>. <b>Repeat</b> sets up a SIP that buys for you every week or month.</p></> },
  { to: 'watchlist', title: 'Watchlist', body: <p>Keep your favourites in one place, so you can see how they move without searching every time.</p> },
  { to: 'discover', title: 'Discover', body: <p>Research lists of today’s climbers and drops, and a way to compare two stocks side by side. Nothing here buys or sells.</p> },
  { to: 'games', title: 'Games', body: <p>Play with your class or family. Host a game, share its code, and everyone trades the same pretend money. A live leaderboard shows who’s ahead.</p> },
  { to: 'analytics', title: 'Analytics', body: <p>Once you finish a trade, see how you’re doing: how many trades won, your average win and loss, and your toughest stretch.</p> },
  { to: 'history', title: 'History', body: <p>Every order, trade, dividend and cost you’ve had, so you can look back at what worked and what didn’t.</p> },
  { to: 'badges', title: 'Badges', body: <p>Earn badges for good habits, like spreading your money out or holding for a month. Share them, or download them all as a PDF. You can turn badges off in Settings.</p> },
  { to: 'settings', title: 'Settings', body: <p>Change how trading works, set up alerts, and turn this portfolio’s trading costs on or off.</p> },
  { to: 'tour', title: 'One last tip', body: <><p>Words with a <b>dotted line</b> are tricky ones. Tap one and I’ll explain it.</p><p>Want this tour again? It’s right here.</p></> },
]
const target = (to: string) => !to ? null
  : document.querySelector(to === 'tour' ? '.me a[href="#/tour"]' : `a.nav[href="#/${to === 'home' ? '' : to}"]`)

type Spot = { ring: { x: number; y: number; w: number; h: number }; card: { x: number; y: number } }
/** Rings the tab and sets the card beside it on a computer, or above or below it on a phone, kept on screen. */
function place(el: Element | null, w: number, h: number): Spot {
  const vw = innerWidth, vh = innerHeight, clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))
  if (!el) return { ring: { x: vw / 2, y: vh / 2, w: 0, h: 0 }, card: { x: (vw - w) / 2, y: (vh - h) / 2 } }
  const r = el.getBoundingClientRect(), rx = Math.max(2, r.left - 4), ry = Math.max(2, r.top - 4) // a ring at the screen's edge stays in view
  const ring = { x: rx, y: ry, w: Math.min(vw - 2, r.right + 4) - rx, h: Math.min(vh - 2, r.bottom + 4) - ry }
  const x = r.right + 16 + w <= vw - 12 ? r.right + 16 : clamp(r.left + r.width / 2 - w / 2, 12, vw - w - 12)
  const y = x === r.right + 16 ? clamp(r.top + r.height / 2 - h / 2, 12, vh - h - 12) : r.top > vh / 2 ? r.top - h - 16 : r.bottom + 16
  return { ring, card: { x, y } }
}

/** Walks through the app one tab at a time, opening each tab behind a card that explains it.
 * Tapping a tab jumps the walk there; arrow keys step, Escape ends it. */
export function Tour({ route, onClose }: { route: string; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [spot, setSpot] = useState<Spot | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const shown = useRef(false) // the first placement jumps there; later ones glide
  const stop = STOPS[i], last = i === STOPS.length - 1
  useEffect(() => { // hand focus back to where it was once the tour ends
    const before = document.activeElement as HTMLElement | null
    return () => before?.focus?.()
  }, [])
  const go = (k: number) => {
    if (k < 0 || k >= STOPS.length) return
    const to = STOPS[k].to
    if (to && to !== 'tour') location.hash = to === 'home' ? '#/' : '#/' + to
    setI(k)
  }
  useEffect(() => { // a tab tapped mid-walk takes the walk there
    const k = STOPS.findIndex(s => s.to === route)
    if (k > 0 && i > 0 && !last && k !== i && location.hash !== '#/tour') setI(k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])
  useLayoutEffect(() => {
    const measure = () => {
      if (!card.current) return
      const el = target(stop.to)
      el?.scrollIntoView({ block: 'nearest' })
      setSpot(place(el, card.current.offsetWidth, card.current.offsetHeight))
    }
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [stop.to])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(i + 1)
      else if (e.key === 'ArrowLeft') go(i - 1)
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })
  const move = { type: 'spring', duration: 0.4, bounce: 0.15 } as const
  const pos = shown.current ? move : { duration: 0 }
  useEffect(() => { if (spot) shown.current = true }, [spot])
  return (
    <>
      {spot && <motion.div className="tour-ring" aria-hidden="true" exit={{ opacity: 0 }} transition={move}
        initial={{ opacity: 0, x: spot.ring.x, y: spot.ring.y, width: spot.ring.w, height: spot.ring.h }}
        animate={{ opacity: 1, x: spot.ring.x, y: spot.ring.y, width: spot.ring.w, height: spot.ring.h }} />}
      <motion.div ref={card} role="dialog" aria-label="Tour" className="tour-card" style={{ visibility: spot ? 'visible' : 'hidden' }}
        initial={{ opacity: 0, scale: 0.96 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
        animate={spot ? { opacity: 1, scale: 1, x: spot.card.x, y: spot.card.y } : {}} transition={{ ...move, x: pos, y: pos }}>
        <div className="tour-top">
          <span className="muted">{i + 1} of {STOPS.length}</span>
          {!last && <button className="link" onClick={onClose}>Skip tour</button>}
        </div>
        <div aria-live="polite">
          <motion.div key={i} className="tour-step" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            {(i === 0 || last) && <Bully size={56} mood={last ? 'wow' : 'happy'} />}
            <h2>{stop.title}</h2>
            <div className="tour-body">{stop.body}</div>
          </motion.div>
        </div>
        <div className="tour-nav">
          {i > 0 && <button className="ghost tiny" onClick={() => go(i - 1)}>Back</button>}
          {last
            ? <button className="primary buy small" autoFocus onClick={() => { location.hash = '#/stocks'; onClose() }}>Start trading</button>
            : <button key={i} className="primary buy small" autoFocus onClick={() => go(i + 1)}>{i === 0 ? 'Show me around' : `Next: ${STOPS[i + 1].title}`}</button>}
        </div>
      </motion.div>
    </>
  )
}
