import { useEffect, useState } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { collection, doc, getFirestore, onSnapshot, runTransaction, setDoc } from 'firebase/firestore'
import type { Candle, Portfolio } from './engine'

// Firebase web config is public by design; firestore.rules is what protects the data.
const app = initializeApp({
  apiKey: 'AIzaSyB0xWkXP4ffBIryn7Zd1xWdWPL3Ji-z6Vk',
  authDomain: 'littlebulls-kids.firebaseapp.com',
  projectId: 'littlebulls-kids',
  appId: '1:383339151526:web:8571c379b351c0be677467',
})
export const auth = getAuth(app)
const db = getFirestore(app)

const ref = (uid: string, id: string) => doc(db, 'users', uid, 'portfolios', id)

export function usePortfolios(uid: string) {
  const [list, setList] = useState<Portfolio[] | null>(null)
  useEffect(() => onSnapshot(collection(db, 'users', uid, 'portfolios'), s =>
    setList(s.docs.map(d => d.data() as Portfolio).sort((a, b) => a.createdAt - b.createdAt))), [uid])
  return list
}

export const savePortfolio = (uid: string, p: Portfolio) => setDoc(ref(uid, p.id), p)

/** Money changes run in a transaction so two open tabs can't fill the same order twice. */
export const mutate = (uid: string, id: string, fn: (p: Portfolio) => Portfolio | null) =>
  runTransaction(db, async t => {
    const s = await t.get(ref(uid, id))
    const next = s.exists() ? fn(s.data() as Portfolio) : null
    if (next) t.set(ref(uid, id), next)
  })

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

export type Quote = { symbol: string; price: number; prev: number; high: number; low: number }
export type Quotes = { open: boolean; bySym: Record<string, Quote>; failed: boolean }

let lastQuotes: Quotes = { open: false, bySym: {}, failed: false } // shown instantly when moving between pages

export function useQuotes(symbols: string[]): Quotes {
  const key = [...new Set(symbols)].sort().join(',')
  const [q, setQ] = useState<Quotes>(lastQuotes)
  useEffect(() => {
    if (!key) return
    let live = true
    const load = () => api<{ open: boolean; quotes: Quote[] }>('quote?symbols=' + encodeURIComponent(key))
      .then(r => {
        lastQuotes = { open: r.open, failed: false, bySym: { ...lastQuotes.bySym, ...Object.fromEntries(r.quotes.map(x => [x.symbol, x])) } }
        if (live) setQ(lastQuotes)
      })
      .catch(() => live && setQ(old => ({ ...old, failed: true })))
    load()
    const t = setInterval(load, 15000)
    return () => { live = false; clearInterval(t) }
  }, [key])
  return q
}

export const candles = (symbol: string, range: string) =>
  cached<Candle[]>(`history?symbol=${encodeURIComponent(symbol)}&range=${range}`, ['1D', '5D', 'orders'].includes(range) ? 30000 : 600000)

export type Info = { name: string; specs: Record<string, string>; news: { source: string; when: string; url: string; title: string }[] }
export const stockInfo = (symbol: string) => cached<Info>('stock?symbol=' + encodeURIComponent(symbol), 600000)
/** Warms up a stock's page before it opens. */
export const preload = (symbol: string) => { candles(symbol, '1D').catch(() => {}); stockInfo(symbol).catch(() => {}) }

export const POPULAR: [string, string][] = [
  ['RELIANCE.NS', 'Reliance Industries'], ['TCS.NS', 'Tata Consultancy Services'], ['HDFCBANK.NS', 'HDFC Bank'],
  ['INFY.NS', 'Infosys'], ['ITC.NS', 'ITC'], ['BHARTIARTL.NS', 'Bharti Airtel'], ['SBIN.NS', 'State Bank of India'],
  ['MARUTI.NS', 'Maruti Suzuki'], ['ASIANPAINT.NS', 'Asian Paints'], ['NESTLEIND.NS', 'Nestle India'],
  ['TITAN.NS', 'Titan'], ['BRITANNIA.NS', 'Britannia'],
]
export const nameOf = (sym: string) => POPULAR.find(p => p[0] === sym)?.[1] ?? sym.replace('.NS', '')
