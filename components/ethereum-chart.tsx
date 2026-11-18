"use client"

import { animate, stagger, utils, type JSAnimation } from "animejs"
import * as React from "react"

import { ChartButton } from "@/components/ui/chart-button"
import { ChartCard } from "@/components/ui/chart-card"
import { ArrowCircleDownIcon, ArrowCircleUpIcon } from "@/components/ui/chart-icons"
import { ChartSegmentedControl } from "@/components/ui/chart-segmented-control"
import { releaseStyles, useChartEntrance, useCountUp, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-chart-motion"
import { useChartSize } from "@/hooks/use-chart-size"
import { useControllableState } from "@/hooks/use-controllable-state"
import { formatCompactCurrency, formatCurrency, formatNumber, formatPercent, formatTime } from "@/lib/chart-format"
import { fittedDash, niceTicks, seededRandom } from "@/lib/chart-series"
import { cn } from "@/lib/utils"

type EthereumCandle = {
  /** When the candle starts, in ms since the epoch. */
  time: number
  open: number
  high: number
  low: number
  close: number
  /** What was traded in it (in the card's `symbol`). */
  volume: number
}

/** What the x axis names: the candles' days ("Mon"), weeks ("Oct 5") or months ("Nov"), each under its candles. */
type EthereumAxisUnit = "day" | "week" | "month"

/** One segment of the period control, with its candles. */
type EthereumPeriod = {
  value: string
  /** The segment's text ("W"). */
  label: string
  /** Its name for screen readers ("Week"). */
  name?: string
  /** Oldest first; the last close is the current price, and the badge is the change from the first open to it. */
  candles: EthereumCandle[]
  unit: EthereumAxisUnit
}

/** A figure under the price: its swatch, label and value over the change and its label. */
type EthereumStat = {
  label: string
  value: number
  changeLabel: string
  /** Red when negative, green when positive. */
  change: number
  /** The swatch's colour, a CSS colour ("var(--primary-purple-500)"). */
  color: string
}

type EthereumChartProps = Omit<React.ComponentProps<"div">, "children"> & {
  title?: string
  /** The 28px coin before the title. */
  icon?: React.ReactNode
  /** The unit of the volume ("ETH"). */
  symbol?: string
  periods?: EthereumPeriod[]
  period?: string
  defaultPeriod?: string
  onPeriodChange?: (period: string) => void
  /** The figures under the price (Figma: NAV and market price with their changes). `[]` hides them. */
  stats?: EthereumStat[]
  /** Text for a time on the x axis (`unit` is what the axis names) and in the tooltip. Times are in UTC by default. */
  formatTime?: (time: number, context: "axis" | "tooltip", unit: EthereumAxisUnit) => string
  /** Called by the sparkles button. */
  onInsightsClick?: () => void
  locale?: string
  currency?: string
}

/** A candle where it is drawn: its centre and body width, and the y of its high, low, body and open (px). */
type CandleShape = { x: number; width: number; high: number; low: number; top: number; bottom: number; open: number; up: boolean; volume: number }

// Figma geometry ("Ethereum Chart" 1473:82288)
const PLOT_WIDTH = 516
const PLOT_HEIGHT = 302
const GRID_END = 3 // the grid lines stop 3px short of the plot's right edge (513 of 516)
const GRID_TOP = 7 // the highest tick's dashed line is centred 7px down…
const BASE = PLOT_HEIGHT // …and the lowest tick's value is the plot's bottom edge, under the 1px Border/Sub axis
const TICK_COUNT = 6
const INSET_START = 7.0928 // the first candle's centre from the grid lines' left end…
const INSET_END = 7.7343 // …and the last one's from their right end: Figma's 77 candles are 6.555px apart at 516px
const BODY_RATIO = 5 / ((PLOT_WIDTH - GRID_END - INSET_START - INSET_END) / 76) // with 5px bodies
const BODY_MAX = 12
const BODY_RADIUS = 0.6
const RIM = 0.5 // the bodies' inside stroke, a shade darker
const MIN_BODY = 1
const VOLUME_HEIGHT = 42 // the tallest volume bar…
const VOLUME_BASE = BASE - 1 // …standing on the axis
const VOLUME_OPACITY = 0.336 // Figma: 56% fills in a 60% frame
const DIM = "opacity-45"
const TIP_GAP = 10 // between the hovered candle's body and the tooltip
const TIP_PADDING_X = 24 // the tooltip's 12px side padding, twice
const TIP_PADDING_Y = 16 // and its 8px top and bottom padding
const LABEL_CHAR = 7.5 // about how wide a character of Label/02 is
const LABEL_GAP = 8 // the least space between two x-axis labels
const CANDLES_AT = 350
const CANDLE_STAGGER = 11
const GROW = 650
const MORPH = 700
const RING = "focus-visible:ring-primary-blue-500/40" // the card's focus rings are blue, like the sparkles' end
const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** A 1px Background/Disable rim inside a 32px coin (0.75 units of 24): Figma separates the overlapping pair with it. */
const COIN_RIM = "M0 12a12 12 0 1 0 24 0a12 12 0 1 0 -24 0ZM0.75 12a11.25 11.25 0 1 0 22.5 0a11.25 11.25 0 1 0 -22.5 0Z"

/**
 * The ETH coin of the Figma cards (Streamline crypto logo, the same as the ETH/BTC Price Range card's): a violet disc
 * with a white glyph, drawn at 28px here. `ring` adds the rim it has when it overlaps another coin.
 */
function EthCoin({ ring, className, ...props }: React.ComponentProps<"svg"> & { ring?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden data-slot="coin" className={cn("shrink-0", className)} {...props}>
      <circle cx="12" cy="12" r="12" fill="#627eea" />
      {ring && <path d={COIN_RIM} fillRule="evenodd" className="fill-surface-disable" />}
      <path d="M12.373 3V9.6525L17.9958 12.165L12.373 3Z" fill="#fff" fillOpacity={0.602} />
      <path d="M12.3735 3L6.75 12.165L12.3735 9.6525V3Z" fill="#fff" />
      <path d="M12.373 16.4769V20.9971L17.9995 13.2129L12.373 16.4769Z" fill="#fff" fillOpacity={0.602} />
      <path d="M12.3735 20.9971V16.4761L6.75 13.2129L12.3735 20.9971Z" fill="#fff" />
      <path d="M12.373 15.4276L17.9958 12.1629L12.373 9.65186V15.4276Z" fill="#fff" fillOpacity={0.2} />
      <path d="M6.75 12.1629L12.3735 15.4276V9.65186L6.75 12.1629Z" fill="#fff" fillOpacity={0.602} />
    </svg>
  )
}

/** Untitled UI "stars-01" solid (Figma 16px), filled with Figma's gradient from Primary/Purple/purple-400 down to Primary/Blue/blue-500. */
function StarsIcon(props: React.ComponentProps<"svg">) {
  // useId() may contain characters that don't belong in a url(#…) reference
  const gradient = `ethereum-chart-stars-${React.useId().replace(/[^\w-]/g, "")}`
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden data-slot="icon" {...props}>
      <defs>
        <linearGradient id={gradient} x1="8" y1="0.667" x2="8" y2="15.333" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--primary-purple-400)" }} />
          <stop offset="1" style={{ stopColor: "var(--primary-blue-500)" }} />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradient})`}
        d="M10.6226 1.09385C10.5235 0.83639 10.2762 0.666504 10.0003 0.666504C9.72448 0.666504 9.47712 0.83639 9.3781 1.09385L8.59235 3.1368C8.39208 3.65749 8.32915 3.80754 8.24306 3.9286C8.15669 4.05007 8.05056 4.1562 7.92909 4.24258C7.80803 4.32866 7.65798 4.39159 7.13728 4.59186L5.09434 5.37761C4.83688 5.47663 4.66699 5.72399 4.66699 5.99984C4.66699 6.27569 4.83688 6.52304 5.09434 6.62207L7.13729 7.40782C7.65798 7.60808 7.80803 7.67102 7.92909 7.7571C8.05056 7.84347 8.15669 7.9496 8.24307 8.07107C8.32915 8.19213 8.39208 8.34218 8.59235 8.86288L9.3781 10.9058C9.47712 11.1633 9.72448 11.3332 10.0003 11.3332C10.2762 11.3332 10.5235 11.1633 10.6226 10.9058L11.4083 8.86288C11.6086 8.34218 11.6715 8.19213 11.7576 8.07107C11.844 7.9496 11.9501 7.84347 12.0716 7.7571C12.1926 7.67102 12.3427 7.60808 12.8634 7.40782L14.9063 6.62207C15.1638 6.52304 15.3337 6.27569 15.3337 5.99984C15.3337 5.72399 15.1638 5.47663 14.9063 5.37761L12.8634 4.59186C12.3427 4.39159 12.1926 4.32866 12.0716 4.24258C11.9501 4.1562 11.844 4.05007 11.7576 3.9286C11.6715 3.80754 11.6086 3.65749 11.4083 3.1368L10.6226 1.09385Z"
      />
      <path
        fill={`url(#${gradient})`}
        d="M4.92994 8.36836C4.81702 8.14251 4.58617 7.99984 4.33366 7.99984C4.08114 7.99984 3.8503 8.14251 3.73737 8.36836L3.2144 9.41431C3.02608 9.79095 2.96869 9.89934 2.89896 9.9898C2.82903 10.0805 2.74768 10.1619 2.65695 10.2318C2.56649 10.3015 2.45811 10.3589 2.08146 10.5472L1.03552 11.0702C0.80966 11.1831 0.666992 11.414 0.666992 11.6665C0.666992 11.919 0.80966 12.1499 1.03552 12.2628L2.08146 12.7858C2.45811 12.9741 2.56649 13.0315 2.65695 13.1012C2.74769 13.1711 2.82903 13.2525 2.89896 13.3432C2.96869 13.4337 3.02608 13.5421 3.2144 13.9187L3.73737 14.9646C3.8503 15.1905 4.08114 15.3332 4.33366 15.3332C4.58617 15.3332 4.81702 15.1905 4.92994 14.9646L5.45292 13.9187C5.64124 13.5421 5.69863 13.4337 5.76835 13.3432C5.83829 13.2525 5.91963 13.1711 6.01036 13.1012C6.10082 13.0315 6.20921 12.9741 6.58586 12.7858L7.6318 12.2628C7.85766 12.1499 8.00033 11.919 8.00033 11.6665C8.00033 11.414 7.85766 11.1831 7.6318 11.0702L6.58586 10.5472C6.20921 10.3589 6.10082 10.3015 6.01036 10.2318C5.91963 10.1619 5.83829 10.0805 5.76835 9.9898C5.69863 9.89934 5.64124 9.79095 5.45292 9.41431L4.92994 8.36836Z"
      />
    </svg>
  )
}

// The Figma week: 77 candles, 11 a day from Monday 19 October 2026, read off the drawing on the $0–$25K axis as
// [open, high, low, close, volume]; the volume is the drawn bar nearest each candle, 100 ETH a pixel.
const ETH_WEEK: [number, number, number, number, number][] = [
  [10635.59, 15042.37, 10127.12, 14025.42, 1100], [16652.54, 17669.49, 11398.31, 11906.78, 2200],
  [15042.37, 17076.27, 14025.42, 16737.29, 2800], [19025.42, 19364.41, 16144.07, 16313.56, 800],
  [13347.46, 15381.36, 12330.51, 15042.37, 1300], [17161.02, 17500, 14279.66, 14449.15, 1300],
  [8093.22, 12500, 7584.75, 11483.05, 2400], [14110.17, 15127.12, 6822.03, 7330.51, 1700],
  [13177.97, 14533.9, 11144.07, 14194.92, 2600], [16483.05, 16822.03, 12754.24, 14788.14, 1300],
  [11822.03, 12838.98, 11144.07, 12500, 1300], [13771.19, 14110.17, 12584.75, 12754.24, 1000],
  [7245.76, 11652.54, 6737.29, 10635.59, 1400], [16652.54, 17669.49, 8177.97, 13940.68, 1100],
  [13347.46, 15381.36, 12330.51, 15042.37, 1400], [15635.59, 15974.58, 14110.17, 14279.66, 1400],
  [12500, 14533.9, 11483.05, 14194.92, 1600], [14618.64, 14957.63, 13940.68, 14110.17, 2000],
  [14533.9, 16059.32, 14025.42, 15042.37, 2400], [16483.05, 17500, 14618.64, 15127.12, 2800],
  [11144.07, 19618.64, 7415.25, 18601.69, 2800], [19872.88, 20211.86, 12076.27, 17161.02, 1800],
  [15042.37, 17076.27, 14025.42, 16737.29, 1400], [18008.47, 18347.46, 13601.69, 14957.63, 2000],
  [10635.59, 15042.37, 10127.12, 14025.42, 3000], [16652.54, 17669.49, 14110.17, 14618.64, 3000],
  [15042.37, 17076.27, 14025.42, 16737.29, 1400], [19025.42, 19364.41, 16144.07, 16313.56, 2000],
  [13347.46, 15381.36, 12330.51, 15042.37, 1400], [17161.02, 17500, 6991.53, 8686.44, 2700],
  [8008.47, 12415.25, 7500, 11398.31, 2700], [14025.42, 15042.37, 8771.19, 9279.66, 3400],
  [12415.25, 14449.15, 11398.31, 14110.17, 1600], [16398.31, 16737.29, 13516.95, 13686.44, 2000],
  [12415.25, 14449.15, 11398.31, 14110.17, 2400], [15381.36, 15720.34, 12500, 12669.49, 2400],
  [9703.39, 14110.17, 9194.92, 13093.22, 2800], [10635.59, 11652.54, 5381.36, 5889.83, 2700],
  [10720.34, 12754.24, 9703.39, 12415.25, 2000], [11313.56, 11652.54, 8432.2, 8601.69, 2800],
  [11567.8, 13601.69, 10550.85, 13262.71, 2800], [13686.44, 14025.42, 11991.53, 12669.49, 2200],
  [8855.93, 16652.54, 8347.46, 15635.59, 1700], [12330.51, 13347.46, 7076.27, 7584.75, 2400],
  [11228.81, 12754.24, 10889.83, 12415.25, 2000], [12923.73, 13262.71, 12076.27, 12245.76, 2000],
  [11737.29, 12584.75, 10720.34, 12245.76, 1700], [12838.98, 13177.97, 8771.19, 8940.68, 2700],
  [11398.31, 14957.63, 10889.83, 13940.68, 2000], [15720.34, 16737.29, 10466.1, 10974.58, 1400],
  [15296.61, 16991.53, 14279.66, 16652.54, 1400], [16398.31, 16737.29, 15550.85, 15720.34, 2400],
  [14703.39, 16059.32, 13686.44, 15720.34, 1700], [14533.9, 14872.88, 11652.54, 11822.03, 3400],
  [12245.76, 16652.54, 11737.29, 15635.59, 4200], [16567.8, 17584.75, 11313.56, 11822.03, 4200],
  [12415.25, 14449.15, 11398.31, 14110.17, 2800], [16398.31, 16737.29, 13516.95, 13686.44, 2200],
  [14110.17, 16144.07, 13093.22, 15805.08, 2700], [17076.27, 17415.25, 14194.92, 14364.41, 2000],
  [10720.34, 14110.17, 10211.86, 13093.22, 2000], [15720.34, 16737.29, 10466.1, 10974.58, 1700],
  [14110.17, 16144.07, 13093.22, 15805.08, 1400], [18093.22, 18432.2, 11144.07, 12669.49, 3400],
  [12415.25, 14449.15, 11398.31, 14110.17, 3700], [14533.9, 14872.88, 11652.54, 11822.03, 3700],
  [8008.47, 12415.25, 7500, 11398.31, 2000], [12330.51, 13347.46, 7076.27, 7584.75, 1400],
  [11567.8, 13601.69, 10550.85, 13262.71, 2400], [15550.85, 15889.83, 12669.49, 12838.98, 1700],
  [9872.88, 11906.78, 8855.93, 11567.8, 1700], [13686.44, 14025.42, 10805.08, 10974.58, 2700],
  [11567.8, 13601.69, 10550.85, 13262.71, 2300], [15550.85, 15889.83, 8008.47, 11398.31, 1700],
  [9872.88, 11906.78, 8855.93, 11567.8, 1300], [12415.25, 14449.15, 11398.31, 14110.17, 1300],
  [15720.34, 16737.29, 10466.1, 10974.58, 2700],
]

const WEEK_START = Date.UTC(2026, 9, 19) // Monday 19 October 2026
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * `count` candles of `step` ms from `start`: a seeded random walk (the same on the server and in the browser) that
 * each candle opens where the one before closed, ends at `close` and stays in the sample's $6K–$19K band, its moves up
 * to `move` of the price and its wicks up to `reach` beyond the body.
 */
function walkCandles(seed: number, start: number, step: number, count: number, close: number, move: number, reach: number, volume: number) {
  const random = seededRandom(seed)
  const prices = [close]
  for (let i = 0; i < count; i++) {
    const after = prices[0]
    // walking back in time, pulled towards the middle of the band
    const pull = Math.log(12500 / after) * 0.35
    prices.unshift(Math.min(19000, Math.max(6000, after * Math.exp((random() - 0.5) * 2 * move + pull * move))))
  }
  return Array.from({ length: count }, (_, i): EthereumCandle => {
    const open = round2(prices[i])
    const end = round2(prices[i + 1])
    const high = round2(Math.min(21500, Math.max(open, end) * (1 + random() * reach)))
    const low = round2(Math.max(4500, Math.min(open, end) * (1 - random() * reach)))
    return { time: start + i * step, open, high, low, close: end, volume: Math.round((volume * (0.65 + random() * 0.7)) / 100) * 100 }
  })
}

/** The candles merged by `key`: the first open, the highest high, the lowest low, the last close and the volumes added up. */
function mergeCandles(candles: EthereumCandle[], key: (time: number) => number) {
  const groups = new Map<number, EthereumCandle>()
  for (const candle of candles) {
    const at = key(candle.time)
    const group = groups.get(at)
    if (!group) groups.set(at, { ...candle, time: at })
    else groups.set(at, { ...group, high: Math.max(group.high, candle.high), low: Math.min(group.low, candle.low), close: candle.close, volume: group.volume + candle.volume })
  }
  return [...groups.values()]
}

const dayOf = (time: number) => Math.floor(time / DAY) * DAY
// Mondays: 1 January 1970 was a Thursday
const weekOf = (time: number) => Math.floor((time - 4 * DAY) / WEEK) * WEEK + 4 * DAY
const monthOf = (time: number) => {
  const date = new Date(time)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
}

// The week is the Figma card, spread evenly over the seven days (one candle every 2h 11m, to the minute). The month is
// 21 sample days and the week's days; the year 48 sample weeks and the month's weeks, so the three agree where they
// overlap and end at the same price.
const sampleWeek = ETH_WEEK.map(([open, high, low, close, volume], i): EthereumCandle => ({
  time: WEEK_START + Math.round((i * WEEK) / ETH_WEEK.length / 60_000) * 60_000,
  open,
  high,
  low,
  close,
  volume,
}))
const sampleMonth = [...walkCandles(31, WEEK_START - 21 * DAY, DAY, 21, sampleWeek[0].open, 0.22, 0.3, 23000), ...mergeCandles(sampleWeek, dayOf)]
const sampleYear = [...walkCandles(5, WEEK_START - 51 * WEEK, WEEK, 48, sampleMonth[0].open, 0.2, 0.35, 160000), ...mergeCandles(sampleMonth, weekOf)]

const sampleEthereumPeriods: EthereumPeriod[] = [
  { value: "week", label: "W", name: "Week", candles: sampleWeek, unit: "day" },
  { value: "month", label: "M", name: "Month", candles: sampleMonth, unit: "week" },
  { value: "year", label: "Y", name: "Year", candles: sampleYear, unit: "month" },
]

// The market price is the last close and its change the last day's; the NAV stands a little above it.
const sampleEthereumStats: EthereumStat[] = [
  { label: "NAV", value: 11021.37, changeLabel: "NAV change", change: -836.52, color: "var(--primary-purple-500)" },
  { label: "Market price", value: 10974.58, changeLabel: "Market price change", change: -847.45, color: "#3a5eff" },
]

const round = (n: number) => Math.round(n * 1000) / 1000

/** A rounded rectangle as a closed subpath. */
function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  if (w <= 0 || h <= 0) return ""
  const rr = round(Math.max(0, Math.min(r, w / 2, h / 2)))
  const [l, t, rt, b] = [x, y, x + w, y + h].map(round)
  if (rr <= 0.001) return `M${l} ${t}H${rt}V${b}H${l}Z`
  return `M${round(l + rr)} ${t}H${round(rt - rr)}A${rr} ${rr} 0 0 1 ${rt} ${round(t + rr)}V${round(b - rr)}A${rr} ${rr} 0 0 1 ${round(rt - rr)} ${b}H${round(l + rr)}A${rr} ${rr} 0 0 1 ${l} ${round(b - rr)}V${round(t + rr)}A${rr} ${rr} 0 0 1 ${round(l + rr)} ${t}Z`
}

type CandlePaths = {
  wickUp: string
  wickDown: string
  rimUp: string
  rimDown: string
  fillUp: string
  fillDown: string
  /** Every body's fill, both colours: the white inner shadow's area… */
  fills: string
  /** …and the bodies 1px in (Figma's spread), blurred out of it. */
  cores: string
  volumeUp: string
  volumeDown: string
}

/**
 * Every candle of a colour in one path per part: the 1px wick behind the body; the body's 0.5px inside stroke as a 1px
 * ring under the fill, which starts at the stroke's inner edge (so each edge anti-aliases once); the volume bar under
 * it on the axis.
 */
function candlePaths(shapes: CandleShape[]): CandlePaths {
  const parts: CandlePaths = { wickUp: "", wickDown: "", rimUp: "", rimDown: "", fillUp: "", fillDown: "", fills: "", cores: "", volumeUp: "", volumeDown: "" }
  for (const s of shapes) {
    const side = s.up ? "Up" : "Down"
    const left = s.x - s.width / 2
    const height = s.bottom - s.top
    const radius = (BODY_RADIUS * s.width) / 5
    if (s.low - s.high > 0.01) parts[`wick${side}`] += roundedRect(s.x - 0.5, s.high, 1, s.low - s.high, 0)
    if (height > 0.01 && s.width > 0.01) {
      parts[`rim${side}`] += roundedRect(left, s.top, s.width, height, radius) + roundedRect(left + 1, s.top + 1, s.width - 2, height - 2, radius - 1)
      const fill = roundedRect(left + RIM, s.top + RIM, s.width - 2 * RIM, height - 2 * RIM, radius - RIM)
      parts[`fill${side}`] += fill
      parts.fills += fill
      parts.cores += roundedRect(left + 1, s.top + 1, s.width - 2, height - 2, radius - 1)
    }
    if (s.volume > 0.01) parts[`volume${side}`] += roundedRect(left, VOLUME_BASE - s.volume, s.width, s.volume, 0)
  }
  return parts
}

/**
 * Where everything sits for a period at a plot width: the y scale runs from the lowest of six round ticks at the
 * plot's bottom edge to the highest 7px down; the candles are spread evenly from 7.09px in from the grid lines' left
 * end to 7.73px in from their right end, their bodies 5px wide at Figma's spacing (wider when there are fewer), and the
 * volume bars scale to the period's largest, 42px tall.
 */
function layoutChart(candles: EthereumCandle[], width: number) {
  const lows = candles.map((c) => Math.min(c.low, c.open, c.close))
  const highs = candles.map((c) => Math.max(c.high, c.open, c.close))
  const min = lows.length ? Math.min(...lows) : 0
  const max = highs.length ? Math.max(...highs) : 1
  const ticks = niceTicks(min, max > min ? max : min + 1, TICK_COUNT)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const y = (value: number) => (hi > lo ? BASE - ((value - lo) / (hi - lo)) * (BASE - GRID_TOP) : BASE)
  const gridWidth = Math.max(0, width - GRID_END)
  const n = candles.length
  const pitch = n > 1 ? Math.max(0, gridWidth - INSET_START - INSET_END) / (n - 1) : gridWidth
  const bodyWidth = Math.max(1, Math.min(BODY_MAX, round(pitch * BODY_RATIO)))
  const peak = Math.max(0, ...candles.map((c) => c.volume))
  const shapes = candles.map((c, i): CandleShape => {
    const up = c.close >= c.open
    let top = y(Math.max(c.open, c.close))
    let bottom = y(Math.min(c.open, c.close))
    if (bottom - top < MIN_BODY) {
      const middle = (top + bottom) / 2
      top = middle - MIN_BODY / 2
      bottom = middle + MIN_BODY / 2
    }
    return {
      x: n > 1 ? INSET_START + i * pitch : gridWidth / 2,
      width: bodyWidth,
      high: y(c.high),
      low: y(c.low),
      top,
      bottom,
      open: y(c.open),
      up,
      volume: peak > 0 ? (c.volume / peak) * VOLUME_HEIGHT : 0,
    }
  })
  return { ticks, gridWidth, pitch, shapes }
}

/** Groups of consecutive candles in the same day, week or month: the first candle's time and the group's centre. */
function axisGroups(candles: EthereumCandle[], shapes: CandleShape[], unit: EthereumAxisUnit) {
  const key = unit === "day" ? dayOf : unit === "week" ? weekOf : monthOf
  const groups: { time: number; first: number; last: number }[] = []
  candles.forEach((candle, i) => {
    const at = key(candle.time)
    const group = groups[groups.length - 1]
    if (group && key(candles[group.first].time) === at) group.last = i
    else groups.push({ time: candle.time, first: i, last: i })
  })
  return groups.map((group) => ({ time: group.time, x: ((shapes[group.first]?.x ?? 0) + (shapes[group.last]?.x ?? 0)) / 2 }))
}

/** Figma "Swatch" (8px): the 14px legend swatch of the other cards scaled down, its ring the swatch's colour. */
function StatSwatch({ color }: { color: string }) {
  // useId() may contain characters that don't belong in a url(#…) reference
  const gradient = `ethereum-chart-swatch-${React.useId().replace(/[^\w-]/g, "")}`
  return (
    <span
      aria-hidden
      data-slot="ethereum-chart-swatch"
      className="relative inline-block size-2 shrink-0 overflow-hidden rounded-[2px] shadow-[0_4.114px_8.228px_-2.057px_rgb(38_45_58/0.2),0_0_0_0.571px_var(--swatch),inset_0_-2.057px_4.114px_-2.057px_rgb(0_0_0/0.05)]"
      style={{ background: color, ["--swatch" as string]: color }}
    >
      {/* Figma: a 0.57px inside stroke, white at 24% fading out toward the bottom */}
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={0.24} />
            <stop offset="1" stopColor="#fff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <rect x="0.286" y="0.286" rx="1.714" fill="none" stroke={`url(#${gradient})`} strokeWidth={0.571} style={{ width: "calc(100% - 0.571px)", height: "calc(100% - 0.571px)" }} />
      </svg>
    </span>
  )
}

/** A stat row: the swatch, the label and the value (counting when it changes). */
function StatRow({ color, label, value, format, tone }: { color: string; label: string; value: number; format: (value: number) => string; tone?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  useCountUp(ref, value, format, { duration: 800 })
  return (
    <p data-slot="ethereum-chart-stat" className="flex min-w-0 items-center gap-1.5">
      <StatSwatch color={color} />
      <span className="typo-label-01-medium hug-w -my-0.5 min-w-0 truncate py-0.5 text-fg-soft uppercase">{label}:</span>
      <span ref={ref} data-slot="ethereum-chart-stat-value" className={cn("typo-label-02-medium hug-w shrink-0 whitespace-nowrap transition-colors duration-300", tone ?? "text-fg-loud")}>
        {format(value)}
      </span>
    </p>
  )
}

/**
 * The candles of one layer: wicks, bodies and volume bars, green and red. Figma's inner shadow on the bodies (white
 * at 20%, spread 1, radius 2) is a white overlay masked by the bodies less their blurred 1px-in cores.
 */
function CandleLayer({ id, paths, blur, className, layerRef }: { id: string; paths: CandlePaths; blur: string; className?: string; layerRef?: React.Ref<SVGGElement> }) {
  return (
    <g ref={layerRef} className={className}>
      <mask id={id} maskUnits="userSpaceOnUse" x="-10" y="-10" width="200%" height="200%">
        <path data-part="fills" d={paths.fills} fill="#fff" />
        <path data-part="cores" d={paths.cores} fill="#000" filter={blur} />
      </mask>
      <path data-part="wickUp" d={paths.wickUp} className="fill-primary-green-500" />
      <path data-part="wickDown" d={paths.wickDown} className="fill-error-500" />
      <path data-part="rimUp" d={paths.rimUp} fillRule="evenodd" className="fill-primary-green-600" />
      <path data-part="rimDown" d={paths.rimDown} fillRule="evenodd" className="fill-error-600" />
      <path data-part="fillUp" d={paths.fillUp} className="fill-primary-green-500" />
      <path data-part="fillDown" d={paths.fillDown} className="fill-error-500" />
      <path data-part="fills" d={paths.fills} fill="#fff" fillOpacity={0.2} mask={`url(#${id})`} />
      <path data-part="volumeUp" d={paths.volumeUp} fillOpacity={VOLUME_OPACITY} className="fill-primary-green-500" />
      <path data-part="volumeDown" d={paths.volumeDown} fillOpacity={VOLUME_OPACITY} className="fill-error-500" />
    </g>
  )
}

/** Sets a layer's paths (by their data-part) without React, for the frames of an animation. */
function drawLayer(layer: SVGGElement | null, shapes: CandleShape[]) {
  if (!layer) return
  const paths = candlePaths(shapes)
  for (const path of Array.from(layer.querySelectorAll<SVGPathElement>("path[data-part]"))) {
    path.setAttribute("d", paths[path.dataset.part as keyof CandlePaths] ?? "")
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpShape = (a: CandleShape, b: CandleShape, t: number): CandleShape => ({
  x: lerp(a.x, b.x, t),
  width: lerp(a.width, b.width, t),
  high: lerp(a.high, b.high, t),
  low: lerp(a.low, b.low, t),
  top: lerp(a.top, b.top, t),
  bottom: lerp(a.bottom, b.bottom, t),
  open: lerp(a.open, b.open, t),
  up: b.up,
  volume: lerp(a.volume, b.volume, t),
})
/** A candle `t` of the way grown out of its open: the body from the open to the close, the wick out to the high and low. */
const grownShape = (s: CandleShape, t: number): CandleShape => ({
  ...s,
  high: lerp(s.open, s.high, t),
  low: lerp(s.open, s.low, t),
  top: lerp(s.open, s.top, t),
  bottom: lerp(s.open, s.bottom, t),
  volume: s.volume * t,
})
/** For each of `to` candles, the index of the `from` candle at the same place along the period. */
const counterparts = (from: number, to: number) => Array.from({ length: to }, (_, i) => (from > 1 && to > 1 ? Math.round((i * (from - 1)) / (to - 1)) : 0))

/** The tooltip's content. Rendered twice: visible, and as an invisible copy that is measured. */
function TooltipContent({ time, change, down, rows, volume }: { time: string; change: string; down: boolean; rows: { label: string; value: string }[]; volume: string }) {
  return (
    <>
      <span className="flex items-baseline justify-between gap-4 self-stretch">
        <span className="typo-label-02-regular hug-w text-fg-disable">{time}</span>
        <span className={cn("typo-label-02-medium hug-w", down ? "text-error-500" : "text-primary-green-500")}>{change}</span>
      </span>
      <span className="grid grid-cols-[auto_auto] gap-x-4 gap-y-2">
        {rows.map((row) => (
          <span key={row.label} className="flex items-baseline gap-1.5">
            <span className="typo-label-01-medium hug-w text-fg-soft">{row.label}</span>
            <span className="typo-label-03-medium hug-w text-fg-white">{row.value}</span>
          </span>
        ))}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="typo-label-01-medium hug-w text-fg-soft">Volume</span>
        <span className="typo-label-02-medium hug-w text-fg-white">{volume}</span>
      </span>
    </>
  )
}

/**
 * "Ethereum Chart" from the Keitoto library: the coin and its price with the change over the period, a Week / Month /
 * Year switch, the NAV and market price with their changes, and candles on a dashed price grid with the volume under
 * them, green when the price closed up and red when it closed down. Hover, drag or arrow along the candles: the
 * others fade back, a dashed guide marks the candle and a dark tooltip reads its time, open, high, low, close and
 * volume. Animated with anime.js: the coin spins in, the price and the figures count up, the grid draws across, then
 * the candles grow out of their opens one after another with their volume rising; a new period morphs the candles
 * into the new ones while the badge counts and the axes come in again.
 */
function EthereumChart({
  title = "Ethereum",
  icon = <EthCoin />,
  symbol = "ETH",
  periods = sampleEthereumPeriods,
  period: periodProp,
  defaultPeriod,
  onPeriodChange,
  stats = sampleEthereumStats,
  formatTime: formatTimeProp,
  onInsightsClick,
  locale = "en-US",
  currency = "USD",
  className,
  ...props
}: EthereumChartProps) {
  const [periodValue, setPeriod] = useControllableState({ value: periodProp, defaultValue: defaultPeriod ?? periods[0]?.value ?? "", onChange: onPeriodChange })
  const period = periods.find((option) => option.value === periodValue) ?? periods[0]
  const candles = React.useMemo(() => period?.candles ?? [], [period])
  const unit = period?.unit ?? "day"
  const n = candles.length
  const [plotRef, plot] = useChartSize<HTMLDivElement>({ width: PLOT_WIDTH, height: PLOT_HEIGHT })
  const width = plot.width || PLOT_WIDTH
  const { ticks, gridWidth, pitch, shapes } = React.useMemo(() => layoutChart(candles, width), [candles, width])
  const paths = React.useMemo(() => candlePaths(shapes), [shapes])
  // Content keys: parents may pass new arrays on every render, so changes are detected by value.
  const shapeKey = `${width}|${shapes.map((s) => `${s.x},${s.high},${s.low},${s.top},${s.bottom},${+s.up},${s.volume}`).join(";")}`
  const ticksKey = ticks.join(";")

  const last = candles[n - 1]
  const price = last?.close ?? 0
  const change = last ? last.close - candles[0].open : 0
  const down = change < 0

  const money = React.useCallback((value: number) => formatCurrency(value, { locale, currency }), [locale, currency])
  const wholeMoney = React.useCallback((value: number) => formatCurrency(Math.abs(value), { locale, currency, maximumFractionDigits: 0 }), [locale, currency])
  const statValue = React.useCallback((value: number) => formatCompactCurrency(value, { locale, currency, minimumFractionDigits: 1, maximumFractionDigits: 1 }), [locale, currency])
  const statChange = React.useCallback(
    (value: number) => formatCompactCurrency(value, { locale, currency, signDisplay: "exceptZero", minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale, currency],
  )
  const spacing = n > 1 ? (candles[n - 1].time - candles[0].time) / (n - 1) : DAY
  const timeText = (time: number, context: "axis" | "tooltip") => {
    if (formatTimeProp) return formatTimeProp(time, context, unit)
    if (context === "axis") return formatTime(time, unit === "day" ? { weekday: "short" } : unit === "week" ? { month: "short", day: "numeric" } : { month: "short" }, locale)
    if (spacing < DAY) return formatTime(time, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, locale)
    if (spacing < WEEK) return formatTime(time, { weekday: "short", month: "short", day: "numeric", year: "numeric" }, locale)
    return `Week of ${formatTime(time, { month: "short", day: "numeric", year: "numeric" }, locale)}`
  }
  const volumeText = (value: number) => `${formatNumber(value, { locale })} ${symbol}`

  // The x axis names each day, week or month centred under its candles, leaving out the ones that would run off the
  // plot or into the label before.
  const labels = React.useMemo(() => {
    const out: { time: number; x: number; text: string }[] = []
    let end = -Infinity
    for (const group of axisGroups(candles, shapes, unit)) {
      const text = formatTimeProp ? formatTimeProp(group.time, "axis", unit) : formatTime(group.time, unit === "day" ? { weekday: "short" } : unit === "week" ? { month: "short", day: "numeric" } : { month: "short" }, locale)
      const half = (text.length * LABEL_CHAR) / 2
      if (group.x - half < 0 || group.x + half > width || group.x - half < end + LABEL_GAP) continue
      out.push({ ...group, text })
      end = group.x + half
    }
    return out
  }, [candles, shapes, unit, width, locale, formatTimeProp])
  const labelsKey = labels.map((label) => label.text).join(";")

  // The candle under the pointer (or picked with the keys). The last one is kept after the pointer leaves, so the
  // tooltip can fade out with its text.
  const [inspect, setInspect] = React.useState({ index: -1, on: false })
  const setInspected = (index: number | null) => setInspect((current) => (index === null ? { ...current, on: false } : { index, on: true }))
  const k = inspect.index >= 0 && n ? Math.min(inspect.index, n - 1) : null
  const active = inspect.on ? k : null
  const inspected = k !== null ? candles[k] : undefined
  const inspectedShape = k !== null ? shapes[k] : undefined
  const highlight = React.useMemo(() => candlePaths(active !== null && shapes[active] ? [shapes[active]] : []), [active, shapes])
  const tooltip = inspected
    ? {
        time: timeText(inspected.time, "tooltip"),
        change: formatPercent(inspected.open ? ((inspected.close - inspected.open) / inspected.open) * 100 : 0, { locale, signDisplay: "exceptZero" }),
        down: inspected.close < inspected.open,
        rows: [
          { label: "Open", value: money(inspected.open) },
          { label: "High", value: money(inspected.high) },
          { label: "Low", value: money(inspected.low) },
          { label: "Close", value: money(inspected.close) },
        ],
        volume: volumeText(inspected.volume),
      }
    : null
  const [sizerRef, sizer] = useChartSize<HTMLSpanElement>({ width: 200, height: 84 })
  const tipWidth = sizer.width + TIP_PADDING_X
  const tipHeight = sizer.height + TIP_PADDING_Y
  // beside the candle, right of it unless that runs off the plot, centred on its range
  const tipFlipped = inspectedShape ? inspectedShape.x + inspectedShape.width / 2 + TIP_GAP + tipWidth > width : false
  const tipLeft = inspectedShape ? Math.round(tipFlipped ? Math.max(0, inspectedShape.x - inspectedShape.width / 2 - TIP_GAP - tipWidth) : inspectedShape.x + inspectedShape.width / 2 + TIP_GAP) : 0
  const tipTop = inspectedShape ? Math.round(Math.min(Math.max((inspectedShape.high + inspectedShape.low) / 2 - tipHeight / 2, 0), Math.max(0, VOLUME_BASE - tipHeight))) : 0

  const reduced = useReducedMotion()
  const root = React.useRef<HTMLDivElement>(null)
  const priceRef = React.useRef<HTMLParagraphElement>(null)
  const changeRef = React.useRef<HTMLSpanElement>(null)
  const mainRef = React.useRef<SVGGElement>(null)
  const outgoingRef = React.useRef<SVGGElement>(null)
  const tipRef = React.useRef<HTMLDivElement>(null)
  const ids = React.useId().replace(/[^\w-]/g, "")
  const texts = { price: money(price), change: wholeMoney(change) }
  // what the entrance's callbacks need at play time (the card may be resized before it scrolls into view)
  const latest = React.useRef({ shapes, price, change, texts })
  useIsomorphicLayoutEffect(() => {
    latest.current = { shapes, price, change, texts }
  })
  const all = (selector: string) => Array.from(root.current?.querySelectorAll<HTMLElement>(selector) ?? [])

  // New figures count from the previous ones.
  useCountUp(priceRef, price, money, { duration: 900 })
  useCountUp(changeRef, change, wholeMoney, { duration: 800 })

  // How far the entrance has grown each candle (null without one), so a redraw before it is done (the card resized as
  // its font loads) keeps the candles where the entrance has them.
  const growing = React.useRef<{ t: number }[] | null>(null)
  const drawGrowth = () => {
    const growth = growing.current
    if (!growth) return
    drawLayer(
      mainRef.current,
      latest.current.shapes.map((shape, i) => grownShape(shape, growth[i]?.t ?? 1)),
    )
  }

  // Entrance, once the card is in view: the coin spins in with the title, the price and the badge count up, the period
  // control and the figures come in, the grid draws across and the axes come in, then the candles grow out of their
  // opens from left to right, their volume rising with them.
  useChartEntrance(root, (timeline) => {
    const els = { price: priceRef.current, change: changeRef.current }
    const counter = { price: 0, change: 0 }
    const count = () => {
      const now = latest.current
      if (els.price) els.price.textContent = money(now.price * counter.price)
      if (els.change) els.change.textContent = wholeMoney(now.change * counter.change)
    }
    count()
    const growth = latest.current.shapes.map(() => ({ t: 0 }))
    growing.current = growth
    drawGrowth()
    timeline
      .add(all('[data-slot="ethereum-chart-coin"]'), { scale: { from: 0.4 }, rotate: { from: -180 }, opacity: { from: 0 }, duration: 900, ease: "outBack(1.4)" }, 0)
      .add(all('[data-slot="ethereum-chart-title"]'), { opacity: { from: 0 }, translateX: { from: -6 }, duration: 600, ease: "outQuad" }, 120)
      .add(all('[data-slot="ethereum-chart-insights"]'), { opacity: { from: 0 }, scale: { from: 0.8 }, rotate: { from: -45 }, duration: 700, ease: "outBack(1.8)" }, 200)
      .add(counter, { price: [0, 1], duration: 1400, ease: "outExpo", onUpdate: count }, 100)
      .add(all('[data-slot="ethereum-chart-badge"]'), { opacity: { from: 0 }, scale: { from: 0.8 }, duration: 550, ease: "outBack(1.8)" }, 300)
      .add(all('[data-slot="ethereum-chart-badge"] svg'), { translateY: { from: 3 }, rotate: { from: -90 }, duration: 700, ease: "outBack(1.6)" }, 350)
      .add(counter, { change: [0, 1], duration: 1100, ease: "outExpo", onUpdate: count }, 300)
      .add(all('[data-slot="ethereum-chart-periods"]'), { opacity: { from: 0 }, translateY: { from: -4 }, duration: 600, ease: "outQuad" }, 200)
      .add(all('[data-slot="ethereum-chart-stat"]'), { opacity: { from: 0 }, translateY: { from: 6 }, duration: 600, ease: "outQuad", delay: stagger(70) }, 300)
      .add(all('[data-slot="ethereum-chart-grid-line"]'), { x2: { from: 0 }, duration: 900, ease: "outQuad", delay: stagger(60) }, 200)
      .add(all('[data-slot="ethereum-chart-tick"]'), { opacity: { from: 0 }, translateX: { from: 4 }, duration: 600, ease: "outQuad", delay: stagger(45) }, 300)
      .add(all('[data-slot="ethereum-chart-axis-label"] > span'), { opacity: { from: 0 }, translateY: { from: 4 }, duration: 600, ease: "outQuad", delay: stagger(50) }, 350)
    growth.forEach((state, i) => timeline.add(state, { t: [0, 1], duration: GROW, ease: "outExpo" }, CANDLES_AT + i * CANDLE_STAGGER))
    // one redraw a frame for all of them: added last, so it runs after the candles' tweens in each tick
    if (growth.length) timeline.add({ p: 0 }, { p: [0, 1], duration: (growth.length - 1) * CANDLE_STAGGER + GROW, ease: "linear", onUpdate: drawGrowth }, CANDLES_AT)
    return () => {
      if (growing.current === growth) growing.current = null
      drawLayer(mainRef.current, latest.current.shapes)
      if (els.price) els.price.textContent = latest.current.texts.price
      if (els.change) els.change.textContent = latest.current.texts.change
    }
  })

  // A new period (or new data) morphs the candles: each new candle comes out of the drawn one at the same place along
  // the period, while the drawn ones close in on their new counterparts and fade out. A resize redraws them at once.
  const drawn = React.useRef(shapes)
  const lastShape = React.useRef({ key: shapeKey, width })
  const morph = React.useRef<JSAnimation | null>(null)
  useIsomorphicLayoutEffect(() => {
    const before = lastShape.current
    lastShape.current = { key: shapeKey, width }
    if (before.key === shapeKey) return
    morph.current?.cancel()
    morph.current = null
    const main = mainRef.current
    const outgoing = outgoingRef.current
    // from what is on screen (a morph cut short leaves its candles where they were)
    const from = drawn.current
    const to = shapes
    const finish = () => {
      drawn.current = to
      drawLayer(main, to)
      drawLayer(outgoing, [])
      main?.style.removeProperty("opacity")
      outgoing?.style.removeProperty("opacity")
    }
    if (growing.current?.some((state) => state.t < 1)) {
      drawn.current = to
      drawGrowth()
      return
    }
    if (reduced || before.width !== width || !from.length || !to.length) {
      finish()
      return
    }
    const incoming = counterparts(from.length, to.length)
    const leaving = counterparts(to.length, from.length)
    const state = { t: 0 }
    const frame = () => {
      drawn.current = to.map((shape, i) => lerpShape(from[incoming[i]], shape, state.t))
      drawLayer(main, drawn.current)
      drawLayer(
        outgoing,
        from.map((shape, j) => lerpShape(shape, { ...to[leaving[j]], up: shape.up }, state.t)),
      )
      if (main) main.style.opacity = String(Math.min(1, state.t * 1.6 + 0.2))
      if (outgoing) outgoing.style.opacity = String(Math.max(0, 1 - state.t * 1.6))
    }
    frame()
    morph.current = animate(state, {
      t: 1,
      duration: MORPH,
      ease: "outExpo",
      onUpdate: frame,
      onComplete: () => {
        morph.current = null
        finish()
      },
    })
  }, [shapeKey, reduced])
  React.useEffect(
    () => () => {
      morph.current?.cancel()
    },
    [],
  )

  // New ticks and new labels come in again.
  const lastAxes = React.useRef({ ticksKey, labelsKey })
  useIsomorphicLayoutEffect(() => {
    const before = lastAxes.current
    lastAxes.current = { ticksKey, labelsKey }
    if (reduced) return
    if (before.ticksKey !== ticksKey)
      animate(all('[data-slot="ethereum-chart-tick"]'), { opacity: [0, 1], translateX: [4, 0], duration: 450, delay: stagger(35), ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
    if (before.labelsKey !== labelsKey)
      animate(all('[data-slot="ethereum-chart-axis-label"] > span'), { opacity: [0, 1], translateY: [4, 0], duration: 450, delay: stagger(35), ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [ticksKey, labelsKey, reduced])

  // The tooltip fades in beside the inspected candle and slides along when another one is inspected.
  const lastTip = React.useRef({ shown: active !== null, left: tipLeft, top: tipTop, width })
  useIsomorphicLayoutEffect(() => {
    const before = lastTip.current
    const shown = active !== null
    lastTip.current = { shown, left: tipLeft, top: tipTop, width }
    const tip = tipRef.current
    if (!tip || reduced) return
    if (before.shown !== shown) {
      const from = tip.style.opacity === "" ? (shown ? 0 : 1) : Number(tip.style.opacity)
      animate(tip, {
        opacity: [from, shown ? 1 : 0],
        scale: shown ? [0.94, 1] : [1, 0.97],
        duration: shown ? 320 : 180,
        ease: shown ? "outBack(1.6)" : "outQuad",
        onComplete: releaseStyles("opacity", "transform"),
      })
      return
    }
    if (shown && (before.left !== tipLeft || before.top !== tipTop) && before.width === width)
      animate(tip, {
        translateX: [before.left - tipLeft + utils.get(tip, "translateX", false), 0],
        translateY: [before.top - tipTop + utils.get(tip, "translateY", false), 0],
        duration: 380,
        ease: "outExpo",
        onComplete: releaseStyles("transform"),
      })
  }, [active, tipLeft, tipTop, width, reduced])

  // The plot is a slider over the candles: the pointer or the arrow keys pick one.
  const candleAt = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.currentTarget
    const box = target.getBoundingClientRect()
    // CSS zoom (the live demo scales wide demos down) scales the box but not the layout
    const zoom = box.width / (target.offsetWidth || box.width || 1) || 1
    const x = (event.clientX - box.left) / zoom
    return n > 1 && pitch > 0 ? Math.min(n - 1, Math.max(0, Math.round((x - INSET_START) / pitch))) : 0
  }
  const resting = Math.max(0, n - 1)
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!n) return
    const at = active ?? resting
    const page = Math.max(1, Math.round(n / 10))
    const next = { ArrowRight: at + 1, ArrowUp: at + 1, ArrowLeft: at - 1, ArrowDown: at - 1, PageUp: at + page, PageDown: at - page, Home: 0, End: n - 1 }[event.key]
    if (event.key === "Escape") {
      setInspected(null)
      return
    }
    if (next === undefined) return
    event.preventDefault()
    setInspected(Math.min(n - 1, Math.max(0, next)))
  }
  const valueAt = (i: number) => {
    const candle = candles[i]
    if (!candle) return undefined
    return `${timeText(candle.time, "tooltip")}: open ${money(candle.open)}, high ${money(candle.high)}, low ${money(candle.low)}, close ${money(candle.close)}, volume ${volumeText(candle.volume)}`
  }
  const changePeriod = (next: string) => {
    setInspected(null)
    setPeriod(next)
  }

  const ChangeIcon = down ? ArrowCircleDownIcon : ArrowCircleUpIcon
  // the inspected candle's day (week, month) label darkens
  const groupOf = unit === "day" ? dayOf : unit === "week" ? weekOf : monthOf
  const activeGroup = inspected && active !== null ? groupOf(inspected.time) : null
  const gridDash = fittedDash(gridWidth, 4, 4)
  const blur = `url(#${ids}-blur)`
  const hovering = active !== null && inspectedShape

  return (
    <ChartCard ref={root} role="group" aria-label={title} className={cn("w-full", className)} {...props}>
      {/* Figma lays the title and the button out space-between, 80px apart; 16px here, the same at Figma's width */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span data-slot="ethereum-chart-coin" className="flex size-7 shrink-0 [&>svg]:size-full">
            {icon}
          </span>
          {/* the padding keeps the descenders out of truncate's clip (the text styles have a line height of 1) */}
          <p data-slot="ethereum-chart-title" className="typo-label-04-semibold -my-0.5 min-w-0 truncate py-0.5 text-fg-loud">
            {title}
          </p>
        </div>
        <span data-slot="ethereum-chart-insights" className="flex shrink-0">
          <ChartButton size="icon" corner="rounded" aria-label="Insights" onClick={onInsightsClick} className={RING}>
            <StarsIcon />
          </ChartButton>
        </span>
      </div>

      {/* on a narrow card the period control wraps under the price */}
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <div className="flex flex-[1_0_auto] flex-wrap items-end gap-2.5">
          <p ref={priceRef} className="typo-heading-04-semibold hug-w whitespace-nowrap text-fg-loud">
            {texts.price}
          </p>
          {last && (
            <span
              data-slot="ethereum-chart-badge"
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 transition-colors duration-300",
                down ? "bg-error-50 text-error-500" : "bg-primary-green-50 text-primary-green-500",
              )}
            >
              <ChangeIcon className="size-3 shrink-0" />
              <span className="sr-only">{down ? "Down " : "Up "}</span>
              <span ref={changeRef} className="typo-label-01-medium hug-w whitespace-nowrap">
                {texts.change}
              </span>
            </span>
          )}
        </div>
        {periods.length > 1 && (
          <div data-slot="ethereum-chart-periods" className="shrink-0">
            <ChartSegmentedControl
              aria-label="Period"
              variant="rounded"
              size="fit"
              value={period?.value}
              onValueChange={changePeriod}
              items={periods.map((option) => ({ value: option.value, label: option.label, "aria-label": option.name }))}
              className="[&_[data-slot=chart-segmented-control-item]]:focus-visible:ring-primary-blue-500/40"
            />
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
          {stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col gap-2.5">
              <StatRow color={stat.color} label={stat.label} value={stat.value} format={statValue} />
              <StatRow
                color={stat.color}
                label={stat.changeLabel}
                value={stat.change}
                format={statChange}
                tone={stat.change < 0 ? "text-error-500" : stat.change > 0 ? "text-primary-green-500" : undefined}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2.5">
          <div
            ref={plotRef}
            role="slider"
            tabIndex={n ? 0 : -1}
            aria-label={`${title} price${period?.name ? `, ${period.name.toLowerCase()}` : ""}`}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, n - 1)}
            aria-valuenow={active ?? resting}
            aria-valuetext={valueAt(active ?? resting)}
            data-slot="ethereum-chart-plot"
            onPointerMove={(event) => setInspected(candleAt(event))}
            onPointerLeave={() => setInspected(null)}
            onPointerDown={(event) => setInspected(candleAt(event))}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible")) setInspected(resting)
            }}
            onBlur={() => setInspected(null)}
            onKeyDown={onKeyDown}
            className={cn("relative min-w-0 flex-1 cursor-crosshair touch-pan-y rounded-lg outline-none focus-visible:ring-2", RING)}
            style={{ height: PLOT_HEIGHT }}
          >
            <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
              <defs>
                {/* blurs the bodies' cores out of the inner shadow's mask (Figma: radius 2, a Gaussian of σ ≈ 0.9) */}
                <filter id={`${ids}-blur`} filterUnits="userSpaceOnUse" x={-10} y={-10} width={width + 20} height={PLOT_HEIGHT + 20}>
                  <feGaussianBlur stdDeviation={0.9} />
                </filter>
              </defs>
              {/* Figma "Grid Line": 1.2px Border/Soft dashed 4/4 with round caps, one per tick but the lowest, which is
                  the 1px Border/Sub axis over [301, 302] */}
              {ticks.slice(1).map((tick, i) => {
                const y = BASE - ((i + 1) / (ticks.length - 1)) * (BASE - GRID_TOP)
                return (
                  <line
                    key={tick}
                    data-slot="ethereum-chart-grid-line"
                    x1={0}
                    x2={gridWidth}
                    y1={y}
                    y2={y}
                    strokeWidth={1.2}
                    strokeLinecap="round"
                    className="stroke-border-soft"
                    {...gridDash}
                  />
                )
              })}
              <line data-slot="ethereum-chart-grid-line" x1={0} x2={gridWidth} y1={BASE - 0.5} y2={BASE - 0.5} className="stroke-border-sub" />

              {hovering && <line x1={inspectedShape.x} x2={inspectedShape.x} y1={0} y2={VOLUME_BASE} className="stroke-border-sub" {...fittedDash(VOLUME_BASE, 4, 4)} />}
              <CandleLayer id={`${ids}-main`} paths={paths} blur={blur} layerRef={mainRef} className={cn("transition-opacity duration-200", hovering && DIM)} />
              <CandleLayer id={`${ids}-outgoing`} paths={candlePaths([])} blur={blur} layerRef={outgoingRef} />
              {hovering && (
                <g data-slot="ethereum-chart-highlight">
                  {/* the hovered volume bar knocks out its dimmed copy, so it keeps its colour */}
                  <path d={highlight.volumeUp + highlight.volumeDown} className="fill-surface-white" />
                  <CandleLayer id={`${ids}-highlight`} paths={highlight} blur={blur} />
                </g>
              )}
            </svg>

            {tooltip && (
              <div
                ref={tipRef}
                aria-hidden
                data-slot="ethereum-chart-tooltip"
                className={cn(
                  "pointer-events-none absolute z-10 flex flex-col items-start gap-2 overflow-hidden rounded-[10px] bg-surface-loud px-3 py-2 whitespace-nowrap",
                  // Figma paints later effects on top; CSS paints the first shadow on top
                  "shadow-[inset_0_2px_8px_rgb(255_255_255/0.24),0_0_0_1px_var(--surface-muted),0_2px_4px_rgb(0_0_0/0.06),0_4px_16px_rgb(0_0_0/0.08)]",
                  active !== null ? "opacity-100" : "opacity-0",
                )}
                style={{ left: tipLeft, top: tipTop }}
              >
                <TooltipContent {...tooltip} />
              </div>
            )}
            {/* the same content, measured to place the tooltip */}
            {tooltip && (
              <span ref={sizerRef} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex flex-col items-start gap-2 whitespace-nowrap">
                <TooltipContent {...tooltip} />
              </span>
            )}
          </div>

          {/* Figma "Y Axis Labels": 34px wide (wider labels widen it), right-aligned and spread over the plot's height */}
          <div aria-hidden className="hug-w flex min-w-[34px] shrink-0 flex-col items-end justify-between" style={{ height: PLOT_HEIGHT }}>
            {[...ticks].reverse().map((tick) => (
              <span key={tick} data-slot="ethereum-chart-tick" className="typo-label-02-regular whitespace-nowrap text-fg-soft">
                {formatCompactCurrency(tick, { locale, currency })}
              </span>
            ))}
          </div>
        </div>

        {/* each day (week, month) centred under its candles, 8px down */}
        <div aria-hidden className="relative h-[30px]">
          {labels.map((label) => (
            <span key={`${label.time}-${label.text}`} data-slot="ethereum-chart-axis-label" className="absolute top-2" style={{ left: label.x }}>
              <span
                className={cn(
                  "typo-label-02-regular block -translate-x-1/2 whitespace-nowrap transition-colors duration-200",
                  activeGroup !== null && groupOf(label.time) === activeGroup ? "text-fg-normal" : "text-fg-soft",
                )}
              >
                {label.text}
              </span>
            </span>
          ))}
        </div>
      </div>
    </ChartCard>
  )
}

export {
  EthCoin,
  EthereumChart,
  sampleEthereumPeriods,
  sampleEthereumStats,
  type EthereumAxisUnit,
  type EthereumCandle,
  type EthereumChartProps,
  type EthereumPeriod,
  type EthereumStat,
}
