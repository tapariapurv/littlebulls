import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'

export const money = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const signedMoney = (n: number) => (n > 0 ? '+' : n < 0 ? '-' : '') + money(Math.abs(n))
export const tone = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '')

export const spring = { type: 'spring', duration: 0.35, bounce: 0.25 } as const

/** The mascot. Mood follows how the portfolio is doing; calm either way, never a slot machine. */
export function Bully({ size = 48, mood = 'happy' }: { size?: number; mood?: 'happy' | 'hmm' | 'wow' }) {
  const mouth = { happy: 'M26 49q6 5 12 0', hmm: 'M27 50h10', wow: 'M28 47q4-3 8 0q0 7-4 7t-4-7' }[mood]
  return (
    <svg className="bully" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Bully the bull">
      <path d="M14 22C6 20 4 11 7 6c2 7 7 9 13 10zM50 22c8-2 10-11 7-16-2 7-7 9-13 10z" fill="#e8b04a" />
      <ellipse cx="9" cy="30" rx="6" ry="4" fill="#0a3a80" /><ellipse cx="55" cy="30" rx="6" ry="4" fill="#0a3a80" />
      <rect x="12" y="14" width="40" height="44" rx="19" fill="#1d5fd6" />
      <rect x="18" y="38" width="28" height="20" rx="10" fill="#dcf1ff" />
      <g className="eyes"><circle cx="24" cy="29" r="3.4" fill="#fff" /><circle cx="40" cy="29" r="3.4" fill="#fff" />
        <circle cx="24.6" cy="29.4" r="1.7" fill="#1b1d1f" /><circle cx="40.6" cy="29.4" r="1.7" fill="#1b1d1f" /></g>
      <circle cx="27" cy="43" r="1.5" fill="#0a3a80" /><circle cx="37" cy="43" r="1.5" fill="#0a3a80" />
      <path d={mouth} fill={mood === 'wow' ? '#0a3a80' : 'none'} stroke="#0a3a80" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** Rolls to a new value, so changes read as the same number moving. */
export function Num({ value, format = money, className = '' }: { value: number; format?: (n: number) => string; className?: string }) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, format)
  useEffect(() => { const c = animate(mv, value, { duration: 0.4, ease: [0.23, 1, 0.32, 1] }); return c.stop }, [value, mv])
  return <motion.span className={'num ' + className}>{text}</motion.span>
}

/** A price that flashes its direction for a moment when it ticks. */
export function Tick({ value, className = '' }: { value: number; className?: string }) {
  const prev = useRef(value)
  const dir = value > prev.current ? 'up' : value < prev.current ? 'down' : ''
  useEffect(() => { prev.current = value }, [value])
  return <span key={value} className={`num tick ${dir} ${className}`}>{money(value)}</span>
}

export const TERMS: Record<string, [string, string]> = {
  worth: ['Equity', 'What everything adds up to right now: your money plus or minus the trades you still have open.'],
  balance: ['Account balance', 'Your money, counting only trades you have finished. It stays still while trades are open.'],
  realized: ['Realized P&L', 'Wins and losses from trades you finished. These are locked in and can no longer change.'],
  unrealized: ['Unrealized P&L', 'Wins and losses on trades still open. They change with the price and only count once you close.'],
  margin: ['Account margin', 'To keep a trade open, you set aside half its value as a deposit. You get it back when you close.'],
  ordersMargin: ['Orders margin', 'Money set aside for orders still waiting for their price, so it is there if they happen.'],
  available: ['Available funds', 'The money you can use for a new trade. Because the deposit is half, ₹100 here can open a ₹200 trade.'],
  borrow: ['Leverage', 'You can trade up to twice your money. Wins grow twice as fast, and so do losses.'],
  marginCall: ['Margin call', 'If losses eat half your deposit, Bully closes all your trades so you cannot lose more than you have.'],
  market: ['Market order', 'Buy or sell straight away at today’s price. Only works while the market is open.'],
  limit: ['Limit order', 'Name your price. Buy when it falls to your price, or sell when it rises to it.'],
  stop: ['Stop order', 'Wait for a move. Buy if the price climbs to your number, or sell if it drops to it, often to stop a loss.'],
  short: ['Short selling', 'Selling a share you don’t own and buying it back later. You win if the price falls and lose if it rises.'],
  candle: ['Candlestick', 'Each candle is one slice of time. Green means the price rose, red means it fell, and the thin lines show its highest and lowest.'],
  'Mkt. cap': ['Market cap', 'How much the whole company is worth if you bought every share.'],
  'P/E ratio': ['P/E ratio', 'How many rupees people pay for each rupee of yearly profit. A higher number means people expect more growth.'],
  Dividend: ['Dividend yield', 'The share of the price a company pays owners each year as a thank-you.'],
  '52-wk high': ['52-week high', 'The highest price in the last year.'],
  '52-wk low': ['52-week low', 'The lowest price in the last year.'],
  Volume: ['Volume', 'How many shares changed hands today.'],
  EPS: ['Earnings per share', 'The company’s yearly profit shared out across each share.'],
}

/** A word kids can tap to see what it means, along with the grown-up name for it. */
export function Term({ k, children, end }: { k: string; children: ReactNode; end?: boolean }) {
  const [open, setOpen] = useState(false)
  const t = TERMS[k]
  if (!t) return <>{children}</>
  return (
    <span className="term">
      <button type="button" onClick={() => setOpen(o => !o)} onBlur={() => setOpen(false)} aria-expanded={open}>{children}</button>
      <AnimatePresence>
        {open && (
          <motion.span role="tooltip" className={'pop' + (end ? ' end' : '')} style={{ originX: end ? 1 : 0, originY: 0 }}
            initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}>
            {t[1]}<small>Grown-ups call this: {t[0]}</small>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

export function Tabs<T extends string>({ id, value, onChange, options }: { id: string; value: T; onChange: (v: T) => void; options: [T, ReactNode][] }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
          {v === value && <motion.i layoutId={id} transition={spring} />}
        </button>
      ))}
    </div>
  )
}

export function Modal({ children, onClose, label }: { children: ReactNode; onClose?: () => void; label: string }) {
  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-label={label} className="modal" onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={spring}>
        {children}
      </motion.div>
    </motion.div>
  )
}

type Toast = { id: number; title: string; body?: string; mood?: 'happy' | 'hmm' | 'wow' }
const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})
export const useToast = () => useContext(Ctx)

export function Toaster({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const push = (t: Omit<Toast, 'id'>) => {
    const id = Date.now()
    setList(l => [...l, { ...t, id }])
    setTimeout(() => setList(l => l.filter(x => x.id !== id)), 4500)
  }
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        <AnimatePresence>
          {list.map(t => (
            <motion.div key={t.id} layout className="toast" transition={spring}
              initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}>
              <Bully size={40} mood={t.mood} /><div><b>{t.title}</b>{t.body && <p>{t.body}</p>}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}
