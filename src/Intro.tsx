import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CRYPTO_CCYS, EXCHANGES } from './markets'
import { Bully, Modal } from './ui'

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
  ['Scores to learn from', 'Win rate, profit factor, biggest drop and a full history of every trade you have made.'],
  ['Plain words', 'Every tricky word has a dotted line. Tap it and Bully explains it, with the grown-up name underneath.'],
]

const PROS = [
  'Free, with no payments, brokerage or real money anywhere.',
  `Real prices from ${EXCHANGES.length} exchanges around the world, in their own currencies.`,
  'Five kinds of things to trade, not just stocks.',
  'Several portfolios, so different ideas can be tried side by side.',
  'Works on phones, tablets and computers, and can be added to the home screen.',
]
const CONS = [
  'Prices come from free sources. Some exchanges are 15 to 20 minutes behind, and a source can briefly fail.',
  'Bonds are traded through bond funds; single bonds have no free prices.',
  'Real people can’t buy an index itself. Here you practise on the score, at 1 point for 1 unit of money.',
  `Crypto is priced only in ${CRYPTO_CCYS.join(', ')}.`,
  'No fees, taxes or slippage, so real trading would cost a little more.',
  'Alerts ring only while LittleBulls is open. Waiting orders are filled from price history when you come back.',
]

const FAQ: [string, string][] = [
  ['Is any real money involved?', 'No. There are no payments and no brokerage account. Every rupee, dollar and coin in LittleBulls is pretend.'],
  ['How much does it cost?', 'Nothing. LittleBulls is free.'],
  ['Does it give stock tips?', 'No. It is a place to practise and learn, not financial advice. What a price did before can’t promise what it will do next.'],
  ['What do you save?', 'A nickname, an email address and the portfolios your child makes, so they are there on any device.'],
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

const STEPS: { title: string; body: ReactNode }[] = [
  { title: 'Welcome to LittleBulls', body: <><p>Here you practise trading with <b>real prices</b> and <b>pretend money</b>. Nothing you do here can lose real money.</p><p>Bully the bull will explain the tricky words. Tap any word with a dotted line.</p></> },
  { title: 'Five kinds of things to trade', body: <ul className="tour-list">{KINDS.map(([t, d]) => <li key={t}><b>{t}</b> {d}</li>)}</ul> },
  { title: 'Three ways to place a trade', body: <ul className="tour-list">
    <li><b>Right now</b> buys or sells at today’s price while the market is open.</li>
    <li><b>At my price</b> waits for the price you pick. If it’s already better, it happens straight away.</li>
    <li><b>If it reaches</b> waits for a move, often to stop a loss.</li>
    <li>Waiting orders keep working, even after you close the app.</li></ul> },
  { title: 'Keeping score', body: <ul className="tour-list">
    <li><b>Total worth</b> is everything added up right now.</li>
    <li>You can trade up to <b>twice your money</b>. Half the trade is set aside as a deposit.</li>
    <li>If losses eat half your deposit, Bully closes your trades so you can’t lose more than you have.</li>
    <li>Analytics and History show what worked and what didn’t.</li></ul> },
  { title: 'Good to know', body: <ul className="tour-list">
    <li>Prices come from free sources, and some exchanges are 15 to 20 minutes behind.</li>
    <li>Each portfolio trades on one exchange, in its currency. Make more portfolios to try others.</li>
    <li>This is for learning, not advice. Past prices can’t promise future ones.</li></ul> },
]

const slide = {
  in: (d: number) => ({ opacity: 0, x: d * 16 }),
  show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } },
  out: (d: number) => ({ opacity: 0, x: d * -16, transition: { duration: 0.12 } }),
} as const

/** A short walk through the app. Skippable from any step, and it can be replayed from the menu. */
export function Tour({ first, onClose }: { first: boolean; onClose: (make: boolean) => void }) {
  const [[i, dir], go] = useState([0, 1])
  const last = i === STEPS.length
  const step = (d: number) => go([i + d, d])
  return (
    <Modal onClose={() => onClose(false)} label="Welcome tour">
      <div className="tour-top">
        <div className="dots" aria-label={`Step ${i + 1} of ${STEPS.length + 1}`}>{[...STEPS, null].map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        {!last && <button className="link" onClick={() => onClose(false)}>Skip</button>}
      </div>
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div key={i} className="tour-step" custom={dir} variants={slide} initial="in" animate="show" exit="out">
          {last ? <>
            <Bully size={72} mood="wow" />
            <h2>{first ? 'Let’s make your first portfolio' : 'Try a new idea'}</h2>
            <p className="muted">Pick an exchange, name it, and choose how much pretend money to start with.</p>
          </> : <>
            {i === 0 && <Bully size={72} />}
            <h2>{STEPS[i].title}</h2>
            <div className="tour-body">{STEPS[i].body}</div>
          </>}
        </motion.div>
      </AnimatePresence>
      <div className="tour-nav">
        {i > 0 && <button className="ghost tiny" onClick={() => step(-1)}>Back</button>}
        {last
          ? <button className="primary buy" autoFocus onClick={() => onClose(true)}>{first ? 'Create my first portfolio' : 'Make a new portfolio'}</button>
          : <button className="primary buy small" autoFocus onClick={() => step(1)}>{i === 0 ? 'Show me around' : 'Next'}</button>}
      </div>
      {last && !first && <button className="link" onClick={() => onClose(false)}>Back to my money</button>}
    </Modal>
  )
}
