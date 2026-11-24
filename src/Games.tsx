import { useRef, useState, type FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { createGame, deleteGame, getGame, newCode, removePlayer, savePlayer, savePortfolio, useHosted, usePlayers, useQuotes, type Game } from './data'
import { FEE, ended, newPortfolio, type Portfolio } from './engine'
import { EXCHANGES, exchange } from './markets'
import { Empty, tone, useToast } from './ui'

const LENGTHS: [number, string][] = [[7, 'One week'], [14, 'Two weeks'], [30, 'One month'], [90, 'Three months'], [0, 'No end date']]
const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const when = (ends: number) => !ends ? 'No end date' : ended(ends) ? `Ended ${day(ends)}, final scores` : `Ends ${day(ends)}`

/** The exchange and starting money, shared by new portfolios and new games. */
export function StartFields({ ex, setEx, amount, setAmount, what }: { ex: string; setEx: (x: string) => void; amount: number; setAmount: (n: number) => void; what: string }) {
  const m = exchange(ex)
  const big = { JPY: 10, KRW: 100, IDR: 1000 }[m.currency] ?? 1 // so the chips mean roughly the same in every currency
  const fmt = new Intl.NumberFormat(m.locale, { style: 'currency', currency: m.currency, maximumFractionDigits: 0 })
  return <>
    <label>Stock exchange
      <select value={ex} onChange={e => setEx(e.target.value)}>
        {[...new Set(EXCHANGES.map(x => x.region))].map(r => <optgroup key={r} label={r}>
          {EXCHANGES.filter(x => x.region === r).map(x => <option key={x.id} value={x.id}>{x.name} ({x.currency})</option>)}
        </optgroup>)}
      </select>
      <small>{what} can only trade here, in {m.currency}.</small>
    </label>
    <label>Pretend money to start with
      <input required inputMode="numeric" value={amount ? amount.toLocaleString(m.locale) : ''} onChange={e => setAmount(Math.min(1e9, Number(e.target.value.replace(/\D/g, ''))))} />
    </label>
    <div className="chips">{[10000, 100000, 1000000].map(x => x * big).map(a => (
      <button type="button" key={a} className={amount === a ? 'on' : ''} onClick={() => setAmount(a)}>{fmt.format(a)}</button>
    ))}</div>
  </>
}

/** Everyone's worth at today's prices, worked out here from what each player holds, so it's live even for players who are away. */
function Board({ code, ex, me, host }: { code: string; ex: string; me: string; host?: boolean }) {
  const players = usePlayers(code)
  const q = useQuotes(players?.flatMap(x => Object.keys(x.positions)) ?? [])
  const m = exchange(ex), fmt = new Intl.NumberFormat(m.locale, { style: 'currency', currency: m.currency, maximumFractionDigits: 0 })
  if (!players) return <p className="muted">Fetching the scores…</p>
  if (!players.length) return <p className="muted">Nobody has joined yet. Share the code <b>{code}</b>.</p>
  const rows = players.map(x => {
    const worth = x.balance + Object.entries(x.positions).reduce((s, [sym, pos]) => s + pos.qty * ((q.bySym[sym]?.price ?? pos.avg) - pos.avg), 0)
    return { ...x, worth, pct: (worth / x.start - 1) * 100 }
  }).sort((a, b) => b.worth - a.worth)
  return (
    <div className="scroll"><table className="board"><thead><tr><th>#</th><th>Player</th><th className="r">Worth</th><th className="r">Since the start</th>{host && <th />}</tr></thead><tbody>
      {rows.map((x, i) => <tr key={x.uid} className={x.uid === me ? 'me-row' : ''}>
        <td className="num">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
        <td><b>{x.name}</b>{x.uid === me && <small>You</small>}</td>
        <td className="r num">{fmt.format(x.worth)}</td>
        <td className={'r num ' + tone(x.pct)}>{x.pct >= 0 ? '+' : ''}{x.pct.toFixed(2)}%</td>
        {host && <td className="r"><button className="ghost tiny" onClick={() => { if (confirm(`Remove ${x.name} from the leaderboard?`)) removePlayer(code, x.uid) }}>Remove</button></td>}
      </tr>)}
    </tbody></table></div>
  )
}

function Hosted({ g, me }: { g: Game; me: string }) {
  const [show, setShow] = useState(false)
  return (
    <li className="hosted">
      <div><b>{g.name}</b><small>Code <b className="code">{g.code}</b> · {exchange(g.exchange).name} · {when(g.ends)}</small></div>
      <div className="button-row">
        <button className="ghost tiny" aria-expanded={show} onClick={() => setShow(s => !s)}>{show ? 'Hide' : 'Leaderboard'}</button>
        <button className="ghost tiny danger" onClick={() => { if (confirm(`Delete the game ${g.name}? Players keep their portfolios, but the leaderboard goes.`)) deleteGame(g.code) }}>Delete</button>
      </div>
      {show && <Board code={g.code} ex={g.exchange} me={me} host />}
    </li>
  )
}

export function Games({ user, p, list, pick }: { user: User; p: Portfolio; list: Portfolio[]; pick: (id: string) => void }) {
  const toast = useToast()
  const hosted = useHosted(user.uid)
  const [code, setCode] = useState('')
  const [as, setAs] = useState(user.displayName || '')
  const [err, setErr] = useState('')
  const [name, setName] = useState('')
  const [ex, setEx] = useState(p.exchange)
  const [amount, setAmount] = useState(100000)
  const [days, setDays] = useState(14)
  const [costs, setCosts] = useState(true)
  const [made, setMade] = useState('')
  const busy = useRef(false) // a double click can land before React redraws
  const mine = list.filter(x => x.game)

  async function join(e: FormEvent) {
    e.preventDefault()
    const c = code.trim().toUpperCase(), have = list.find(x => x.game?.code === c)
    if (have) { pick(have.id); return }
    if (busy.current) return
    busy.current = true
    setErr('')
    try {
      const g = await getGame(c)
      if (!g) return setErr('No game has that code. Check it with whoever made the game.')
      if (ended(g.ends)) return setErr('That game has already ended.')
      const n = { ...newPortfolio(g.name, g.start, g.exchange, g.fee), game: { code: c, ends: g.ends, as: as.trim() } }
      await savePlayer(c, user.uid, { name: as.trim(), start: g.start, balance: g.start, positions: {}, at: Date.now() })
      await savePortfolio(user.uid, n)
      pick(n.id)
      setCode('')
      toast({ title: `You joined ${g.name}`, body: 'This is your portfolio for the game. Good luck!', mood: 'wow' })
    } catch {
      setErr('That didn’t go through. Check your internet and try again.')
    } finally { busy.current = false }
  }

  async function host(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    busy.current = true
    const g: Game = { code: newCode(), name: name.trim(), host: user.uid, hostName: user.displayName || '', start: amount, exchange: ex, fee: costs ? FEE : 0, ends: days ? Date.now() + days * 86400000 : 0, createdAt: Date.now() }
    try { await createGame(g); setMade(g.code); setName('') }
    catch { toast({ title: 'That didn’t go through', body: 'Check your internet and try again.', mood: 'hmm' }) }
    finally { busy.current = false }
  }

  return (
    <div className="stocks games">
      <header className="title"><div><h1>Games</h1><p className="muted">Play against your class, friends or family. Everyone starts with the same pretend money on the same market, and the leaderboard shows who’s ahead.</p></div></header>
      {p.game && <section className="card">
        <h2>{p.name}</h2>
        <p className="muted">Code <b className="code">{p.game.code}</b> · {when(p.game.ends)}</p>
        <Board code={p.game.code} ex={p.exchange} me={user.uid} />
      </section>}
      {mine.length > 0 && <section className="card">
        <h2>Games I’m in</h2>
        <ul className="plain">{mine.map(x => <li key={x.id}><span>{x.name}<small>{when(x.game!.ends)}</small></span>
          {x.id === p.id ? <small>Open now</small> : <button className="ghost tiny" onClick={() => pick(x.id)}>Switch to it</button>}</li>)}</ul>
      </section>}
      <section className="card">
        <h2>Join a game</h2>
        <form onSubmit={join}>
          <label>Game code<input required className="code" autoCapitalize="characters" maxLength={6} minLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></label>
          <label>Your name on the leaderboard<input required maxLength={30} value={as} onChange={e => setAs(e.target.value)} />
            <small>Use a nickname. Everyone in the game can see it.</small></label>
          {err && <p className="note bad">{err}</p>}
          <button className="primary buy">Join game</button>
        </form>
      </section>
      <section className="card">
        <h2>Host a game</h2>
        {made ? <div className="made">
          <p>Your game is ready. Share this code:</p>
          <b className="code big">{made}</b>
          <div className="button-row">
            <button className="ghost tiny" onClick={() => navigator.clipboard?.writeText(made).then(() => toast({ title: 'Code copied', body: made }))}>Copy code</button>
            <button className="ghost tiny" onClick={() => { setCode(made); setMade('') }}>Play in it too</button>
            <button className="ghost tiny" onClick={() => setMade('')}>Host another</button>
          </div>
        </div> : <form onSubmit={host}>
          <label>Name the game<input required maxLength={40} placeholder="Class 7B challenge" value={name} onChange={e => setName(e.target.value)} /></label>
          <StartFields ex={ex} setEx={setEx} amount={amount} setAmount={setAmount} what="Everyone in the game" />
          <label>How long it runs
            <select value={days} onChange={e => setDays(Number(e.target.value))}>{LENGTHS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>
          </label>
          <label className="check"><input type="checkbox" checked={costs} onChange={e => setCosts(e.target.checked)} /> Charge a {FEE}% cost on every trade, like a real broker</label>
          <button className="primary buy" disabled={!amount}>Create game</button>
        </form>}
      </section>
      <section className="card">
        <h2>Games I host</h2>
        {hosted === null ? <p className="muted">Fetching your games…</p> : hosted.length
          ? <ul className="plain">{hosted.map(g => <Hosted key={g.code} g={g} me={user.uid} />)}</ul>
          : <Empty text="Games you host show up here, with their codes and leaderboards." />}
      </section>
    </div>
  )
}
