import { useEffect, useRef } from 'react'
import { BaselineSeries, createChart, type UTCTimestamp } from 'lightweight-charts'

export default function Curve({ points }: { points: { at: number; v: number }[] }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const c = createChart(box.current!, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#5c6064', fontFamily: 'Manrope', fontSize: 12 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#eef1f4' } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false }, handleScroll: false, handleScale: false,
    })
    const s = c.addSeries(BaselineSeries, { baseValue: { type: 'price', price: 0 }, topLineColor: '#2f7a45', bottomLineColor: '#c41c29', topFillColor1: '#2f7a4533', topFillColor2: '#2f7a4505', bottomFillColor1: '#c41c2905', bottomFillColor2: '#c41c2933' })
    let last = 0 // two trades in one second still need their own spot on the line
    s.setData([{ at: points[0].at - 60000, v: 0 }, ...points].map(x => { last = Math.max(last + 1, Math.floor(x.at / 1000)); return { time: last as UTCTimestamp, value: x.v } }))
    c.timeScale().fitContent()
    return () => c.remove()
  }, [points])
  return <div className="curve" ref={box} />
}
