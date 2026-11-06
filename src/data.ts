import { useEffect, useState, useSyncExternalStore } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { collection, deleteDoc, doc, initializeFirestore, onSnapshot, runTransaction, setDoc } from 'firebase/firestore'
import { hydrate, uid as newId, type Candle, type Portfolio } from './engine'
import { short } from './markets'

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
    const stop = onSnapshot(collection(db, 'users', uid, 'portfolios'), s => {
      const docs = s.docs.map(d => hydrate(d.data()))
      pending = pending.filter(x => !x.saved && !docs.some(d => d.rev === x.rev)) // this data already includes them
      setList(docs.sort((a, b) => a.createdAt - b.createdAt))
    })
    return () => { redraws.delete(again); stop() }
  }, [uid])
  return list && pending.length ? list.map(p => pending.reduce((c, x) => x.id === c.id ? x.fn(c) ?? c : c, p)) : list
}

export const savePortfolio = (uid: string, p: Portfolio) => setDoc(ref(uid, p.id), p)
export const deletePortfolio = (uid: string, id: string) => deleteDoc(ref(uid, id))

/** Money changes run in a transaction so two open tabs can't fill the same order twice. The promise says when it's saved. */
export function mutate(uid: string, id: string, fn: (p: Portfolio) => Portfolio | null, instant = true) {
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

export type Quote = { symbol: string; name: string; price: number; prev: number; open: boolean }
type Quotes = { bySym: Record<string, Quote>; failed: boolean }

let lastQuotes: Quotes = { bySym: {}, failed: false } // shown instantly when moving between pages
const POLL = 15000, CLOSED_POLL = 60000

/** Live prices. Nobody is asked for prices in a hidden tab, and a closed market is asked less often. */
export function useQuotes(symbols: string[]): Quotes & { open: boolean } {
  const key = [...new Set(symbols)].sort().join(',')
  const [q, setQ] = useState<Quotes>(lastQuotes)
  useEffect(() => {
    if (!key) return
    let live = true, wait = 0, at = 0
    const load = () => {
      at = Date.now()
      const all = key.split(','), parts = Array.from({ length: Math.ceil(all.length / 40) }, (_, i) => all.slice(i * 40, i * 40 + 40)) // the API takes 40 at a time
      Promise.all(parts.map(part => api<{ quotes: Quote[] }>('quote?symbols=' + encodeURIComponent(part.join(',')))))
        .then(rs => {
          const found = rs.flatMap(r => r.quotes)
          found.forEach(x => remember(x.symbol, x.name))
          wait = found.some(x => x.open) ? POLL : CLOSED_POLL
          lastQuotes = { failed: false, bySym: { ...lastQuotes.bySym, ...Object.fromEntries(found.map(x => [x.symbol, x])) } }
          if (live) setQ(lastQuotes)
        })
        .catch(() => { wait = POLL; if (live) setQ(old => ({ ...old, failed: true })) })
    }
    const check = () => { if (!document.hidden && Date.now() - at >= wait - 1000) load() }
    load()
    const t = setInterval(check, POLL)
    document.addEventListener('visibilitychange', check)
    return () => { live = false; clearInterval(t); document.removeEventListener('visibilitychange', check) }
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

export type Info = { name: string; specs: Record<string, string>; news: { source: string; when: string; url: string; title: string }[] }
export const stockInfo = (symbol: string) => cached<Info>('stock?symbol=' + encodeURIComponent(symbol), 600000)
/** Warms up a stock's page before it opens. */
export const preload = (symbol: string) => { candles(symbol, '1D').catch(() => {}); stockInfo(symbol).catch(() => {}) }

const read = <T,>(key: string, fallback: T): T => { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') } } catch { return fallback } }
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private window */ } }

const names = read<Record<string, string>>('names', {})
export const remember = (sym: string, name: string) => { if (name && names[sym] !== name) { names[sym] = name; write('names', names) } }
export const nameOf = (sym: string) => names[sym] ?? short(sym)

export type Row = { symbol: string; name: string; price?: number | null; pct?: number | null; yield?: number | null; cap?: number | null }
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

const DEFAULTS = { chartButtons: true, askFirst: true, chartLines: true, sound: true, notify: false, calm: false, shares: 1, list: 'main' }
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
