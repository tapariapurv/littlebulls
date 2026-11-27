import { useEffect, useState, useSyncExternalStore } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth, signOut } from 'firebase/auth'
import { collection, deleteDoc, doc, getDoc, initializeFirestore, onSnapshot, query, runTransaction, setDoc, where } from 'firebase/firestore'
import { hydrate, uid as newId, type Candle, type Events, type Portfolio, type Position } from './engine'
import { fractional, short } from './markets'

// Firebase web config is public by design; firestore.rules is what protects the data.
const app = initializeApp({
  apiKey: 'AIzaSyB0xWkXP4ffBIryn7Zd1xWdWPL3Ji-z6Vk',
  authDomain: 'littlebulls-kids.firebaseapp.com',
  projectId: 'littlebulls-kids',
  appId: '1:383339151526:web:8571c379b351c0be677467',
})
export const auth = getAuth(app)
const db = initializeFirestore(app, { ignoreUndefinedProperties: true })

const ref = (uid: string, id: string) => doc(db, 'users', uid, 'portfolios', id)

// Tester portal: a set email, then a 6-digit code. Both come from .env.local (gitignored); with neither set, it's off.
// Its portfolios live in this browser only, so testing never touches real accounts. Beta-only code can check `isTester()`.
// ponytail: the email and code ship inside the site's code, so anyone determined can find them. Fine while the portal only holds browser-local pretend data.
export const TESTER = 'tester'
const TEST_EMAIL = (import.meta.env.VITE_TESTER_EMAIL ?? '').trim().toLowerCase(), TEST_CODE = import.meta.env.VITE_TESTER_CODE ?? ''
export const isTesterEmail = (email: string) => !!TEST_EMAIL && email.trim().toLowerCase() === TEST_EMAIL
const testerListeners = new Set<() => void>()
const flip = (on: boolean) => { if (on) localStorage.setItem(TESTER, '1'); else localStorage.removeItem(TESTER); testerListeners.forEach(l => l()) }
export const isTester = () => localStorage.getItem(TESTER) === '1'
export const useTester = () => useSyncExternalStore(cb => { testerListeners.add(cb); return () => testerListeners.delete(cb) }, isTester)
export const enterTester = (code: string) => { const ok = !!TEST_CODE && code === TEST_CODE; if (ok) flip(true); return ok }
export const logOut = () => isTester() ? flip(false) : signOut(auth)
const local = (): Record<string, Portfolio> => JSON.parse(localStorage.getItem('tester:portfolios') || '{}')
const keep = (all: Record<string, Portfolio>) => { localStorage.setItem('tester:portfolios', JSON.stringify(all)); redraw() }
const localList = () => Object.values(local()).map(x => hydrate(x)).sort((a, b) => a.createdAt - b.createdAt)

/** Changes still on their way to the database. They're drawn on top of the saved data so a trade shows the moment it's made. */
type Pending = { id: string; rev: string; fn: (p: Portfolio) => Portfolio | null; saved: boolean }
let pending: Pending[] = []
const redraws = new Set<() => void>()
const redraw = () => redraws.forEach(f => f())

export function usePortfolios(uid: string) {
  const [list, setList] = useState<Portfolio[] | null>(null)
  const [, setTick] = useState(0)
  useEffect(() => {
    const again = () => setTick(n => n + 1)
    redraws.add(again)
    if (uid === TESTER) {
      const load = () => setList(localList())
      load(); redraws.add(load)
      return () => { redraws.delete(again); redraws.delete(load) }
    }
    const stop = onSnapshot(collection(db, 'users', uid, 'portfolios'), s => {
      const docs = s.docs.map(d => hydrate(d.data()))
      pending = pending.filter(x => !x.saved && !docs.some(d => d.rev === x.rev)) // this data already includes them
      setList(docs.sort((a, b) => a.createdAt - b.createdAt))
    })
    return () => { redraws.delete(again); stop() }
  }, [uid])
  return list && pending.length ? list.map(p => pending.reduce((c, x) => x.id === c.id ? x.fn(c) ?? c : c, p)) : list
}

export const savePortfolio = async (uid: string, p: Portfolio) => uid === TESTER ? keep({ ...local(), [p.id]: p }) : setDoc(ref(uid, p.id), p)
export const deletePortfolio = async (uid: string, id: string) => {
  if (uid !== TESTER) return deleteDoc(ref(uid, id))
  const { [id]: _, ...rest } = local(); keep(rest)
}

/** Money changes run in a transaction so two open tabs can't fill the same order twice. The promise says when it's saved. */
export function mutate(uid: string, id: string, fn: (p: Portfolio) => Portfolio | null, instant = true) {
  if (uid === TESTER) {
    const all = local(), next = all[id] ? fn(hydrate(all[id])) : null
    if (next) keep({ ...all, [id]: next })
    return Promise.resolve()
  }
  const entry: Pending = { id, rev: newId(), fn, saved: false }
  const drop = () => { pending = pending.filter(x => x !== entry); redraw() }
  if (instant) { pending.push(entry); redraw() }
  // One at a time: changes racing each other to the same document make Firestore retry with growing delays, and then give up.
  const done = saving.then(() => runTransaction(db, async t => {
    const s = await t.get(ref(uid, id))
    const next = s.exists() ? fn(hydrate(s.data())) : null
    if (next) t.set(ref(uid, id), { ...next, rev: entry.rev })
    return !!next
  })).then(changed => { if (changed) entry.saved = true; else drop() }, e => { drop(); throw e })
  saving = done.catch(() => {})
  return done
}
let saving: Promise<unknown> = Promise.resolve()
// The screen shows a trade before it's saved, so leaving in that moment gets the browser's "are you sure?".
addEventListener('beforeunload', e => { if (pending.some(x => !x.saved)) e.preventDefault() })

export async function api<T>(path: string): Promise<T> {
  const r = await fetch('/api/' + path)
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

/** Remembers responses, so going back to a chart or toggling a view never waits on the network. */
const memory = new Map<string, { at: number; value: Promise<unknown> }>()
export function cached<T>(path: string, ttl: number): Promise<T> {
  const hit = memory.get(path)
  if (hit && Date.now() - hit.at < ttl) return hit.value as Promise<T>
  const value = api<T>(path)
  memory.set(path, { at: Date.now(), value })
  value.catch(() => memory.delete(path))
  return value
}

export type Quote = { symbol: string; name: string; price: number; prev: number; open: boolean; kind?: string }
type Quotes = { bySym: Record<string, Quote>; failed: boolean }

let lastQuotes: Quotes = { bySym: {}, failed: false } // shown instantly when moving between pages
const POLL = 15000, CLOSED_POLL = 60000, STREAMED_POLL = 60000
const quoteListeners = new Set<() => void>()

/** Yahoo's live price stream: ticks arrive within a second, so polling only has to fill in names, open/closed and yesterday's close. */
const watched = new Map<string, number>() // symbol -> how many screens want it
let sock: WebSocket | null = null, retry = 2000, flush = 0
const heard: Record<string, number> = {} // symbol -> time of its last streamed tick
const send = (k: 'subscribe' | 'unsubscribe', syms: string[]) => { if (syms.length && sock?.readyState === 1) sock.send(JSON.stringify({ [k]: syms })) }
function connect() {
  if (sock || !watched.size || typeof WebSocket === 'undefined') return
  const ws = sock = new WebSocket('wss://streamer.finance.yahoo.com/?version=2')
  ws.onopen = () => send('subscribe', [...watched.keys()])
  ws.onmessage = e => {
    retry = 2000
    try { tick(decode(JSON.parse(e.data).message)) } catch { /* a message we don't understand */ }
  }
  ws.onclose = () => {
    if (sock !== ws) return // closed on purpose
    sock = null
    if (watched.size) setTimeout(connect, retry)
    retry = Math.min(retry * 2, 60000)
  }
}
const SUBUNIT: Record<string, number> = { GBp: 100, GBX: 100, ZAc: 100, ZAC: 100, ILA: 100 } // same as the API
function tick(m: Record<number, string | number>) {
  const sym = m[1], old = typeof sym === 'string' && lastQuotes.bySym[sym]
  let price = m[2] as number
  if (!old || !old.open || !(price > 0)) return // closed markets stream pre/after-hours prices; the app shows the regular session
  price = +(price / (SUBUNIT[m[4] as string] ?? 1)).toPrecision(price >= 1e5 ? 8 : 7) // sent as a 32-bit float
  if (Math.abs(price / old.price - 1) > 0.5) return // not the same units as the API gave; trust the API
  heard[sym] = Date.now()
  lastQuotes = { ...lastQuotes, bySym: { ...lastQuotes.bySym, [sym]: { ...old, price } } }
  flush ||= window.setTimeout(() => { flush = 0; quoteListeners.forEach(f => f()) }, 1000) // at most one redraw a second
}
/** Just enough protobuf for Yahoo's PricingData: 1 id, 2 price (float), 4 currency. */
function decode(b64: string) {
  const b = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), v = new DataView(b.buffer), o: Record<number, string | number> = {}
  let i = 0
  const n = () => { let x = 0, k = 1, c; do { c = b[i++]; x += (c & 127) * k; k *= 128 } while (c & 128 && i < b.length); return x }
  while (i < b.length) {
    const t = n(), f = Math.floor(t / 8), w = t % 8
    if (w === 0) o[f] = n()
    else if (w === 5) { o[f] = v.getFloat32(i, true); i += 4 }
    else if (w === 1) i += 8
    else if (w === 2) { const len = n(); o[f] = new TextDecoder().decode(b.subarray(i, i + len)); i += len }
    else break
  }
  return o
}
function watch(syms: string[], on: boolean) {
  const added: string[] = [], gone: string[] = []
  for (const s of syms) {
    const c = (watched.get(s) ?? 0) + (on ? 1 : -1)
    if (c > 0) { if (!watched.has(s)) added.push(s); watched.set(s, c) } else { watched.delete(s); gone.push(s) }
  }
  send('subscribe', added); send('unsubscribe', gone)
  if (on) connect(); else if (!watched.size) { sock?.close(); sock = null }
}

/** Live prices. Nobody is asked for prices in a hidden tab, and a closed market is asked less often. */
export function useQuotes(symbols: string[]): Quotes & { open: boolean } {
  const key = [...new Set(symbols)].sort().join(',')
  const [q, setQ] = useState<Quotes>(lastQuotes)
  useEffect(() => {
    if (!key) return
    let live = true, wait = 0, at = 0
    const load = () => {
      const sent = at = Date.now()
      const all = key.split(','), parts = Array.from({ length: Math.ceil(all.length / 40) }, (_, i) => all.slice(i * 40, i * 40 + 40)) // the API takes 40 at a time
      Promise.all(parts.map(part => api<{ quotes: Quote[] }>('quote?symbols=' + encodeURIComponent(part.join(',')))))
        .then(rs => {
          const found = rs.flatMap(r => r.quotes)
          found.forEach(x => remember(x.symbol, x.name))
          const now = Date.now(), streamed = (x: Quote) => now - (heard[x.symbol] ?? 0) < 30000
          wait = !found.some(x => x.open) ? CLOSED_POLL : found.every(x => !x.open || streamed(x)) ? STREAMED_POLL : POLL
          // A tick newer than this request beats the API's cached price.
          const keep = (x: Quote) => (heard[x.symbol] ?? 0) > sent && lastQuotes.bySym[x.symbol] ? { ...x, price: lastQuotes.bySym[x.symbol].price } : x
          lastQuotes = { failed: false, bySym: { ...lastQuotes.bySym, ...Object.fromEntries(found.map(x => [x.symbol, keep(x)])) } }
          if (live) setQ(lastQuotes)
        })
        .catch(() => { wait = POLL; if (live) setQ(old => ({ ...old, failed: true })) })
    }
    const check = () => { if (!document.hidden && Date.now() - at >= wait - 1000) load() }
    const fresh = () => { if (live) setQ(lastQuotes) }
    const syms = key.split(',')
    load()
    watch(syms, true); quoteListeners.add(fresh)
    const t = setInterval(check, POLL)
    document.addEventListener('visibilitychange', check)
    return () => { live = false; clearInterval(t); document.removeEventListener('visibilitychange', check); quoteListeners.delete(fresh); watch(syms, false) }
  }, [key])
  return { ...q, open: symbols.some(s => q.bySym[s]?.open) }
}

type History = { tz: number; bars: Candle[] }
const zones: Record<string, number> = {}
const history = (path: string, symbol: string, ttl: number) => cached<History>(path, ttl).then(h => { if (h.tz) zones[symbol] = h.tz; return h.bars })
const historyPath = (symbol: string, range: string) => `history?symbol=${encodeURIComponent(symbol)}&range=${range}`
export const candles = (symbol: string, range: string) => history(historyPath(symbol, range), symbol, ['1D', '5D', 'orders'].includes(range) ? 30000 : 600000)
/** The next page of history, older than the given time. */
export const older = (symbol: string, range: string, before: number) => history(`${historyPath(symbol, range)}&before=${before}`, symbol, 3600000)
/** Charts draw timestamps as UTC, so they get shifted to the exchange's own clock. */
export const zoneOf = (symbol: string) => zones[symbol] ?? 0

/** Dividends and splits for the held shares since the portfolio last counted them. Null unless every symbol answered. */
export async function events(p: Portfolio): Promise<Events | null> {
  const syms = Object.keys(p.positions).filter(s => !fractional(s)).slice(0, 40)
  if (!syms.length || p.evAt == null) return syms.length ? {} : null
  const day = Math.floor(p.evAt / 86400000) * 86400 // a whole day, so an hour's checks reuse one answer
  const ev = await cached<Events>(`events?symbols=${encodeURIComponent(syms.join(','))}&since=${day}`, 3600000)
  return syms.every(s => ev[s]) ? ev : null
}

/** A game everyone joins with its code: the same money, market and costs, and one leaderboard. */
export type Game = { code: string; name: string; host: string; hostName: string; start: number; exchange: string; fee: number; ends: number; createdAt: number }
export type Player = { name: string; start: number; balance: number; positions: Record<string, Position>; at: number }
const CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O or 1/I/L to mix up when reading it off a board
export const newCode = () => Array.from(crypto.getRandomValues(new Uint32Array(6)), n => CODE[n % CODE.length]).join('')
export const createGame = (g: Game) => setDoc(doc(db, 'games', g.code), g)
export const deleteGame = (code: string) => deleteDoc(doc(db, 'games', code))
export const getGame = (code: string) => getDoc(doc(db, 'games', code)).then(s => s.exists() ? s.data() as Game : null)
export const savePlayer = (code: string, uid: string, x: Player) => setDoc(doc(db, 'games', code, 'players', uid), x)
export const removePlayer = (code: string, uid: string) => deleteDoc(doc(db, 'games', code, 'players', uid))

function useLive<T>(listen: (set: (v: T) => void) => () => void, key: string) {
  const [v, setV] = useState<T | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setV(null); return listen(setV) }, [key])
  return v
}
export const usePlayers = (code: string) => useLive<(Player & { uid: string })[]>(set =>
  onSnapshot(collection(db, 'games', code, 'players'), s => set(s.docs.map(d => ({ ...d.data() as Player, uid: d.id }))), () => set([])), code)
export const useHosted = (uid: string) => useLive<Game[]>(set =>
  onSnapshot(query(collection(db, 'games'), where('host', '==', uid)), s => set(s.docs.map(d => d.data() as Game).sort((a, b) => b.createdAt - a.createdAt)), () => set([])), uid)

export type Info = { name: string; specs: Record<string, string>; news: { source: string; when: string; url: string; title: string }[] }
export const stockInfo = (symbol: string) => cached<Info>('stock?symbol=' + encodeURIComponent(symbol), 600000)
/** Warms up a stock's page before it opens. */
export const preload = (symbol: string) => { candles(symbol, '1D').catch(() => {}); stockInfo(symbol).catch(() => {}) }

const read = <T,>(key: string, fallback: T): T => { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') } } catch { return fallback } }
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private window */ } }

const names = read<Record<string, string>>('names', {})
export const remember = (sym: string, name: string) => { if (name && names[sym] !== name) { names[sym] = name; write('names', names) } }
export const nameOf = (sym: string) => names[sym] ?? short(sym)

export type Row = { symbol: string; name: string; price?: number | null; pct?: number | null; yield?: number | null; cap?: number | null; kind?: string }
export const search = (text: string, ex: string) => cached<Row[]>(`search?q=${encodeURIComponent(text.trim())}&ex=${ex}`, 600000)
/** Search results for what's typed, after a short pause. An older answer arriving late can't replace a newer one. */
export function useSearch(text: string, ex: string) {
  const [found, setFound] = useState<Row[] | null>(null)
  useEffect(() => {
    if (text.trim().length < 2) { setFound(null); return }
    let live = true
    const t = setTimeout(() => search(text, ex).then(r => {
      r.forEach(x => remember(x.symbol, x.name))
      if (live) setFound(r)
    }).catch(() => { if (live) setFound([]) }), 150)
    return () => { live = false; clearTimeout(t) }
  }, [text, ex])
  return found
}
export const screen = (list: string, ex: string, n = 8) => cached<Row[]>(`discover?list=${list}&ex=${ex}&n=${n}`, 120000)
  .then(r => { r.forEach(x => remember(x.symbol, x.name)); return r })

/** The exchange's biggest funds, with bond funds apart. */
export const funds = (ex: string) => cached<{ etfs: Row[]; bonds: Row[] }>('funds?ex=' + ex, 300000)
  .then(r => { [...r.etfs, ...r.bonds].forEach(x => remember(x.symbol, x.name)); return r })

const DEFAULTS = { chartButtons: true, askFirst: true, chartLines: true, sound: true, notify: false, calm: false, shares: 1, list: 'main', badges: true }
export type Settings = typeof DEFAULTS
let settings: Settings = read('settings', DEFAULTS)
const listeners = new Set<() => void>()
export const useSettings = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => settings)
export const getSettings = () => settings
export const setSetting = (patch: Partial<Settings>) => { settings = { ...settings, ...patch }; write('settings', settings); listeners.forEach(l => l()) }

/** A short calm tone when a trade happens. */
export function blip() {
  if (!settings.sound) return
  try {
    const ctx = new AudioContext(), osc = ctx.createOscillator(), vol = ctx.createGain()
    osc.frequency.value = 660; vol.gain.value = 0.05
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2)
    osc.connect(vol).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2)
  } catch { /* no sound on this device */ }
}

export async function askToNotify() {
  if (!('Notification' in window)) return false
  const ok = await Notification.requestPermission() === 'granted'
  setSetting({ notify: ok })
  return ok
}

/** Phones only allow notifications through the service worker, so that's tried first. */
export async function notify(title: string, body: string) {
  if (!settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker?.getRegistration()
  if (reg) reg.showNotification(title, { body, icon: '/icon-192.png' })
  else new Notification(title, { body, icon: '/icon-192.png' })
}
