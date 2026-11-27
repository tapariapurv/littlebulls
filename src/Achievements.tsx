import { useState } from 'react'
import { motion } from 'motion/react'
import { BADGES, GROUPS, pdf, type Badge } from './badges'
import { Modal, useToast } from './ui'

const SITE = 'https://littlebulls.vercel.app/'
const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/** Draws text in lines that fit `w`, centred on x. Returns where the next line would go. */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number) {
  let line = ''
  for (const word of text.split(' ')) {
    if (line && g.measureText(line + ' ' + word).width > w) { g.fillText(line, x, y); y += lh; line = word } else line = line ? line + ' ' + word : word
  }
  g.fillText(line, x, y)
  return y + lh
}

async function canvas(w: number, h: number) {
  await Promise.all(['600 80px Fredoka', '600 40px Manrope'].map(f => document.fonts.load(f).catch(() => {})))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#eaf4fb'; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'
  return { c, g }
}

/** A square picture of one badge, for sharing as an image. */
async function badgeImage(x: Badge, at: number) {
  const { c, g } = await canvas(1080, 1080)
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(80, 80, 920, 920, 60); g.fill()
  g.fillStyle = '#dcf1ff'; g.beginPath(); g.arc(540, 380, 190, 0, 7); g.fill()
  g.font = '200px serif'; g.fillText(x.icon, 540, 395)
  g.fillStyle = '#1b1d1f'; g.font = '600 80px Fredoka, sans-serif'; g.fillText(x.name, 540, 660)
  g.fillStyle = '#5c6064'; g.font = '600 40px Manrope, sans-serif'; wrap(g, x.how, 540, 750, 760, 52)
  g.fillStyle = '#0a3a80'; g.font = '600 34px Manrope, sans-serif'; g.fillText(`Earned ${day(at)} on LittleBulls`, 540, 910)
  return c
}

/** An A4 landscape certificate of every earned badge, as a PDF. */
async function certificate(name: string, earned: Record<string, number>) {
  const { c, g } = await canvas(1754, 1240)
  const got = BADGES.filter(x => earned[x.id])
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(50, 50, 1654, 1140, 40); g.fill()
  g.strokeStyle = '#1d5fd6'; g.lineWidth = 6; g.beginPath(); g.roundRect(80, 80, 1594, 1080, 28); g.stroke()
  g.fillStyle = '#0a3a80'; g.font = '600 40px Manrope, sans-serif'; g.fillText('LITTLEBULLS ACHIEVEMENTS', 877, 170)
  g.fillStyle = '#1b1d1f'; g.font = '600 96px Fredoka, sans-serif'; g.fillText(name, 877, 280)
  g.fillStyle = '#5c6064'; g.font = '600 38px Manrope, sans-serif'
  g.fillText(`earned ${got.length} of ${BADGES.length} badges, as of ${day(Date.now())}`, 877, 370)
  const cols = 8, cw = 180, top = got.length > 16 ? 450 : 520, rh = got.length > 16 ? 215 : 250, left = 877 - (Math.min(cols, got.length) * cw) / 2 + cw / 2
  got.forEach((x, i) => {
    const cx = left + (i % cols) * cw, cy = top + Math.floor(i / cols) * rh
    g.fillStyle = '#dcf1ff'; g.beginPath(); g.arc(cx, cy, 62, 0, 7); g.fill()
    g.font = '64px serif'; g.fillText(x.icon, cx, cy + 4)
    g.fillStyle = '#1b1d1f'; g.font = '600 24px Manrope, sans-serif'; wrap(g, x.name, cx, cy + 100, cw - 14, 30)
  })
  if (!got.length) g.fillText('The first badge is one trade away.', 877, 650)
  g.fillStyle = '#5c6064'; g.font = '600 28px Manrope, sans-serif'; g.fillText('Paper trading with pretend money · littlebulls.vercel.app', 877, 1110)
  const jpg = new Uint8Array(await (await blob(c, 'image/jpeg')).arrayBuffer())
  return pdf([{ jpg, w: c.width, h: c.height }])
}

const blob = (c: HTMLCanvasElement, type = 'image/png') => new Promise<Blob>((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('canvas')), type, 0.92))
function save(b: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Share buttons for the usual sites, plus the phone's own share sheet where there is one. Only the badge and a link go out: no name. */
function Share({ text, image, file }: { text: string; image?: () => Promise<Blob>; file: string }) {
  const toast = useToast()
  const t = encodeURIComponent(text), u = encodeURIComponent(SITE)
  const sites: [string, string][] = [
    ['X', `https://twitter.com/intent/tweet?text=${t}&url=${u}`], ['WhatsApp', `https://wa.me/?text=${t}%20${u}`],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`], ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ['Telegram', `https://t.me/share/url?url=${u}&text=${t}`], ['Email', `mailto:?subject=${encodeURIComponent('My LittleBulls badge')}&body=${t}%20${u}`],
  ]
  async function native() {
    const pic = image && new File([await image()], file, { type: 'image/png' })
    const data: ShareData = pic && navigator.canShare?.({ files: [pic] }) ? { files: [pic], text: `${text} ${SITE}` } : { text, url: SITE }
    navigator.share(data).catch(() => {}) // closing the share sheet isn't an error
  }
  return (
    <div className="share">
      {'share' in navigator && <button className="primary buy small" onClick={native}>Share…</button>}
      {sites.map(([n, href]) => <a key={n} className="ghost tiny" href={href} target="_blank" rel="noreferrer">{n}</a>)}
      <button className="ghost tiny" onClick={() => navigator.clipboard.writeText(`${text} ${SITE}`).then(() => toast({ title: 'Copied', body: 'Paste it anywhere you like.' }))}>Copy</button>
      {image && <button className="ghost tiny" onClick={() => image().then(b => save(b, file))}>Save picture</button>}
    </div>
  )
}

export function Achievements({ name, earned, progress }: { name: string; earned: Record<string, number>; progress: Record<string, number> }) {
  const [open, setOpen] = useState<Badge | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const count = BADGES.filter(x => earned[x.id]).length
  const next = BADGES.filter(x => !earned[x.id]).sort((a, b) => progress[b.id] - progress[a.id]).slice(0, 3)
  const download = () => {
    setBusy(true)
    certificate(name, earned).then(b => save(b, 'LittleBulls achievements.pdf'))
      .catch(() => toast({ title: 'That didn’t work', body: 'Try again in a moment.', mood: 'hmm' })).finally(() => setBusy(false))
  }
  return (
    <div className="stocks badges">
      <header className="title">
        <div><h1>Badges</h1><p className="muted">You’ve earned <b>{count}</b> of {BADGES.length}. They count across all your portfolios.</p></div>
        <button className="ghost tiny" disabled={busy} onClick={download}>{busy ? 'Making it…' : 'Download PDF'}</button>
      </header>
      <section className="card">
        <div className="bar" role="progressbar" aria-valuenow={count} aria-valuemax={BADGES.length} aria-label="Badges earned"><i style={{ width: `${count / BADGES.length * 100}%` }} /></div>
        {next.length > 0 && <p className="muted small-note">Closest next: {next.map(x => x.name).join(', ')}.</p>}
        {count > 0 && <Share text={`I’ve earned ${count} badges learning to invest on LittleBulls!`} file="LittleBulls badges.png" />}
      </section>
      {GROUPS.map(g => (
        <section className="card" key={g}>
          <h2>{g}</h2>
          <div className="badge-grid">{BADGES.filter(x => x.group === g).map(x => {
            const at = earned[x.id], pct = progress[x.id]
            return <button key={x.id} className={'badge' + (at ? ' got' : '')} onClick={() => setOpen(x)}>
              <span className="medal" aria-hidden="true">{x.icon}</span>
              <b>{x.name}</b>
              {at ? <small>{day(at)}</small> : <span className="bar mini" aria-label={`${Math.round(pct * 100)}% done`}><i style={{ width: `${pct * 100}%` }} /></span>}
            </button>
          })}</div>
        </section>
      ))}
      {open && <Modal label={open.name} onClose={() => setOpen(null)}>
        <motion.span className={'medal big' + (earned[open.id] ? ' got' : '')} aria-hidden="true" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', duration: 0.35, bounce: 0.3 }}>{open.icon}</motion.span>
        <h2>{open.name}</h2>
        <p className="muted">{open.how}</p>
        {earned[open.id] ? <>
          <p>Earned on {day(earned[open.id])}.</p>
          <Share text={`I earned the “${open.name}” badge on LittleBulls!`} image={() => badgeImage(open, earned[open.id]).then(c => blob(c))} file={`${open.name}.png`} />
        </> : <p>{Math.round(progress[open.id] * 100)}% of the way there.</p>}
      </Modal>}
    </div>
  )
}
