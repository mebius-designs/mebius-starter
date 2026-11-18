"use client"

import { animate, stagger, utils, type JSAnimation } from "animejs"
import * as React from "react"

import { ChartButton } from "@/components/ui/chart-button"
import { ChartCard } from "@/components/ui/chart-card"
import { DotsHorizontalIcon, DownloadIcon, PieChartSegmentsIcon } from "@/components/ui/chart-icons"
import { ChartTooltipLabel, ChartTooltipValue } from "@/components/ui/chart-tooltip-lines"
import { releaseStyles, useChartEntrance, useCountUp, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-chart-motion"
import { useChartSize } from "@/hooks/use-chart-size"
import { formatCurrency, formatPercent, formatTime } from "@/lib/chart-format"
import { cn } from "@/lib/utils"

type FinanceOverviewTimelineEntry = {
  /** When the spending started: an ISO date-time ("2026-10-27T07:20", read as UTC unless it names a zone) or ms. */
  start: string | number
  /** When it ended (the same as `start` for a single purchase). */
  end: string | number
  amount: number
  /** What the money went on ("Groceries"), in the tooltip. */
  label?: string
}

type FinanceOverviewTimelineChartProps = Omit<React.ComponentProps<"div">, "children"> & {
  title?: string
  /** The soft line under the title. */
  description?: string
  /** The glyph in the purple tile (24px, white). */
  icon?: React.ReactNode
  /** The spending, in any order: each entry is a bar over its time, darker the more it cost. */
  entries?: FinanceOverviewTimelineEntry[]
  /** The period's first day (ISO date); the timeline runs `days` days from its midnight (UTC). */
  start?: string
  days?: number
  /** What the period may cost: the budget status is the total's share of it. */
  budget?: number
  totalLabel?: string
  averageLabel?: string
  budgetLabel?: string
  /** The left action's text. */
  exportLabel?: string
  onExportClick?: () => void
  /** The right action's text. */
  shareLabel?: string
  onShareClick?: () => void
  /** Called by the ⋯ button. */
  onMoreClick?: () => void
  locale?: string
  currency?: string
}

type Bar = { key: number; entry: FinanceOverviewTimelineEntry; start: number; end: number; x: number; width: number; level: number }

// Figma geometry ("Finance Overview Timeline Chart" 1473:77424)
const PLOT_WIDTH = 680
const PLOT_HEIGHT = 200
const TRACK_TOP = 80 // Figma "Bars": the purple-50 track fills the plot's lower 120px…
const BAR_TOP = 40 // …and every spending bar stands 40px taller, from the plot's bottom to 40px under its top
const MIN_BAR = 3 // a purchase without a duration still shows as a 3px bar
const SNAP = 40 // the pointer picks the nearest bar within 40px (a quiet day shows nothing)
const TIP_GAP = 8 // between the tooltip and the bars' tops (the 32px tooltip fits in the 40px over them)
const TIP_PADDING_X = 24 // the tooltip's 12px side padding, twice
const TIP_PADDING_Y = 16 // and its 8px top and bottom padding
// purple-100 for the smallest amounts to purple-400 for the largest: each step is a quarter of the period's largest
const LEVELS = ["fill-primary-purple-100", "fill-primary-purple-200", "fill-primary-purple-300", "fill-primary-purple-400"]
const RING = "focus-visible:ring-primary-purple-500/40" // the card's focus rings are purple, like its bars
const SWEEP_AT = 350
const SWEEP = 1100
const RISE = 650
const RIDE = 450
const DAY = 86_400_000

/** Milliseconds for an ISO date or date-time, read as UTC unless it names a zone (so the server and the browser agree). */
function timeOf(value: string | number) {
  if (typeof value === "number") return value
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return Date.parse(value)
  return Date.parse(value.includes("T") ? `${value}Z` : `${value}T00:00:00Z`)
}

// The Figma card: the week of Sunday 25 October 2026. Each bar's start and end are where Figma draws it on the
// 680px week (to the minute, within 0.04px); the shades give the amounts' quarters of the largest ($224.83), and the
// amounts add up to the card's $874.92.
const sampleFinanceOverviewTimelineEntries: FinanceOverviewTimelineEntry[] = [
  { start: "2026-10-27T07:20", end: "2026-10-27T10:18", amount: 18.4, label: "Coffee & breakfast" },
  { start: "2026-10-27T19:42", end: "2026-10-27T22:40", amount: 89.3, label: "Dinner out" },
  { start: "2026-10-28T03:06", end: "2026-10-28T11:45", amount: 34.99, label: "Online orders" },
  { start: "2026-10-28T11:45", end: "2026-10-28T13:59", amount: 136.35, label: "Groceries" },
  { start: "2026-10-28T21:23", end: "2026-10-29T18:08", amount: 42.1, label: "Transport" },
  { start: "2026-10-30T00:04", end: "2026-10-30T08:58", amount: 149, label: "Hotel" },
  { start: "2026-10-30T13:25", end: "2026-10-31T02:45", amount: 48.25, label: "Food & drinks" },
  { start: "2026-10-31T09:55", end: "2026-10-31T14:37", amount: 131.7, label: "Home & garden" },
  { start: "2026-10-31T15:36", end: "2026-10-31T17:20", amount: 224.83, label: "Clothing" },
]
const SAMPLE_START = "2026-10-25"
const SAMPLE_BUDGET = 1370 // $874.92 of it is Figma's 64%

/** 0–3: which quarter of the largest amount this one falls in. */
const levelOf = (amount: number, max: number) => (max > 0 && amount > 0 ? Math.min(3, Math.max(0, Math.ceil((amount / max) * 4) - 1)) : 0)

/**
 * Where the bars sit at a plot width: the period runs linearly across the plot, each entry spans its own time (at
 * least MIN_BAR wide, centred on it) and takes its shade from its amount. Sorted by start: the arrow keys' order.
 */
function layoutBars(entries: FinanceOverviewTimelineEntry[], from: number, span: number, width: number) {
  const scale = span > 0 ? width / span : 0
  const inside: { entry: FinanceOverviewTimelineEntry; start: number; end: number; key: number }[] = []
  entries.forEach((entry, key) => {
    const a = timeOf(entry.start)
    const b = timeOf(entry.end)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return
    const start = Math.max(from, Math.min(a, b))
    const end = Math.min(from + span, Math.max(a, b))
    if (end >= start) inside.push({ entry, start, end, key })
  })
  const max = Math.max(0, ...inside.map((item) => item.entry.amount))
  return inside
    .map(({ entry, start, end, key }): Bar => {
      const x0 = (start - from) * scale
      const x1 = (end - from) * scale
      const w = Math.min(width, Math.max(MIN_BAR, x1 - x0))
      const x = Math.min(Math.max(0, (x0 + x1) / 2 - w / 2), Math.max(0, width - w))
      return { key, entry, start, end, x: x1 - x0 >= MIN_BAR ? x0 : x, width: w, level: levelOf(entry.amount, max) }
    })
    .sort((p, q) => p.start - q.start || p.end - q.end)
}

const rangeFormats = new Map<string, Intl.DateTimeFormat>()
/** "Tue 7:20 – 10:18 AM", or "Wed 9:23 PM – Thu 6:08 PM" across midnight (en-US); read in UTC like the bars. */
function formatSpan(start: number, end: number, locale: string) {
  const weekday = (time: number) => formatTime(time, { weekday: "short" }, locale)
  const clock = (time: number) => formatTime(time, { hour: "numeric", minute: "2-digit" }, locale)
  if (Math.floor(start / DAY) !== Math.floor(end / DAY)) return `${weekday(start)} ${clock(start)} – ${weekday(end)} ${clock(end)}`
  if (end === start) return `${weekday(start)} ${clock(start)}`
  let format = rangeFormats.get(locale)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    rangeFormats.set(locale, format)
  }
  return `${weekday(start)} ${format.formatRange(start, end)}`
}

/** Inverse of inOutSine: how far into the sweep (0–1) its edge reaches `fraction` of the plot. */
const sweepTime = (fraction: number) => Math.acos(1 - 2 * Math.min(1, Math.max(0, fraction))) / Math.PI

/** Untitled UI "share-02" solid, the "share-02-alt" of the Figma button (16px). */
function ShareIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden data-slot="icon" {...props}>
      <path d="M7.52835 1.52827C7.7887 1.26792 8.21081 1.26792 8.47116 1.52827L11.1378 4.19494C11.3982 4.45529 11.3982 4.8774 11.1378 5.13775C10.8775 5.3981 10.4554 5.3981 10.195 5.13775L8.66642 3.60915L8.66642 9.99967C8.66642 10.3679 8.36795 10.6663 7.99976 10.6663C7.63157 10.6663 7.33309 10.3679 7.33309 9.99967L7.33309 3.60915L5.80449 5.13775C5.54414 5.3981 5.12203 5.3981 4.86168 5.13775C4.60134 4.8774 4.60134 4.45529 4.86168 4.19494L7.52835 1.52827Z" />
      <path d="M5.99976 7.73304C5.99976 7.35967 5.99976 7.17299 5.92709 7.03038C5.86318 6.90494 5.76119 6.80295 5.63575 6.73903C5.49314 6.66637 5.30646 6.66637 4.93309 6.66637H4.57468C4.04443 6.66609 3.65066 6.66587 3.30955 6.75727C2.38931 7.00385 1.67052 7.72264 1.42394 8.64289C1.33254 8.98399 1.33275 9.37776 1.33304 9.90802L1.33307 10.8273C1.33306 11.3639 1.33306 11.8068 1.36253 12.1676C1.39315 12.5424 1.45886 12.8868 1.62372 13.2104C1.87938 13.7121 2.28733 14.1201 2.7891 14.3758C3.11265 14.5406 3.45712 14.6063 3.83185 14.6369C4.19266 14.6664 4.63557 14.6664 5.17222 14.6664H10.8273C11.3639 14.6664 11.8068 14.6664 12.1676 14.6369C12.5424 14.6063 12.8868 14.5406 13.2104 14.3758C13.7121 14.1201 14.1201 13.7121 14.3758 13.2104C14.5406 12.8868 14.6063 12.5424 14.6369 12.1676C14.6664 11.8068 14.6664 11.3639 14.6664 10.8273L14.6664 9.90802C14.6667 9.37776 14.6669 8.98399 14.5755 8.64289C14.329 7.72264 13.6102 7.00385 12.6899 6.75727C12.3488 6.66587 11.955 6.66609 11.4248 6.66637H11.0664C10.6931 6.66637 10.5064 6.66637 10.3638 6.73903C10.2383 6.80295 10.1363 6.90494 10.0724 7.03038C9.99976 7.17299 9.99976 7.35967 9.99976 7.73304V9.99967C9.99976 11.1042 9.10433 11.9997 7.99976 11.9997C6.89519 11.9997 5.99976 11.1042 5.99976 9.99967V7.73304Z" />
    </svg>
  )
}

/**
 * "Finance Overview Timeline Chart" from the Keitoto library: a week of spending on a timeline. Under a purple-tiled
 * title sit the total, the average a day and the share of the budget spent; the plot is a purple track over the week
 * with a bar for each spending, as wide as the time it took and darker the more it cost (each shade a quarter of the
 * largest amount), and the days under it. Hover (or drag on touch) picks the nearest bar and shows what it was, when
 * and how much, dimming the others; the arrow keys step through them. Animated with anime.js: the tile pops, the
 * numbers count up, the track sweeps across the week and every bar rises as the sweep reaches it; new entries rise
 * again and new totals count to their values.
 */
function FinanceOverviewTimelineChart({
  title = "Finance overview",
  description = "Track your income and expenses.",
  icon = <PieChartSegmentsIcon />,
  entries = sampleFinanceOverviewTimelineEntries,
  start = SAMPLE_START,
  days = 7,
  budget = SAMPLE_BUDGET,
  totalLabel = "Total spending",
  averageLabel = "Avg daily spending",
  budgetLabel = "Budget status",
  exportLabel = "Export report",
  onExportClick,
  shareLabel = "Share with friends",
  onShareClick,
  onMoreClick,
  locale = "en-US",
  currency = "USD",
  className,
  ...props
}: FinanceOverviewTimelineChartProps) {
  const dayCount = Math.max(1, Math.round(days))
  const from = timeOf(start)
  const span = dayCount * DAY
  const [plotRef, plot] = useChartSize<HTMLDivElement>({ width: PLOT_WIDTH, height: PLOT_HEIGHT })
  const width = plot.width || PLOT_WIDTH
  const bars = React.useMemo(() => layoutBars(entries, from, span, width), [entries, from, span, width])
  const n = bars.length
  // Content key: parents may pass a new array on every render, so a change is detected by value.
  const dataKey = `${from}|${span}|${bars.map((bar) => `${bar.start}-${bar.end}-${bar.entry.amount}`).join(";")}`

  const total = bars.reduce((sum, bar) => sum + bar.entry.amount, 0)
  const average = total / dayCount
  const share = budget > 0 ? (total / budget) * 100 : 0
  const over = budget > 0 && total > budget

  const money = React.useCallback((value: number) => formatCurrency(value, { locale, currency }), [locale, currency])
  const percentText = React.useCallback((value: number) => (budget > 0 ? formatPercent(value, { locale, maximumFractionDigits: 0 }) : "–"), [budget, locale])
  const dayLabels = React.useMemo(() => {
    // one label a day, centred under it; a long period names every few days by date
    const every = dayCount <= 10 ? 1 : Math.ceil(dayCount / 7)
    return Array.from({ length: dayCount }, (_, i) => i)
      .filter((i) => i % every === 0)
      .map((i) => ({ day: i, text: formatTime(from + i * DAY, dayCount <= 10 ? { weekday: "short" } : { month: "short", day: "numeric" }, locale) }))
  }, [dayCount, from, locale])
  // a label whose day is close to an end of the plot is aligned with that end instead of centred
  const edge = (day: number) => ((day + 0.5) * width) / dayCount < 24 ? "start" : ((dayCount - day - 0.5) * width) / dayCount < 24 ? "end" : "middle"

  const [hovered, setHovered] = React.useState<number | null>(null)
  const active = hovered !== null && hovered < n ? hovered : null
  const activeBar = active !== null ? bars[active] : undefined
  const spanText = (bar: Bar) => formatSpan(bar.start, bar.end, locale)
  const tooltip = activeBar ? { value: money(activeBar.entry.amount), label: activeBar.entry.label ? `${activeBar.entry.label} · ${spanText(activeBar)}` : spanText(activeBar) } : undefined
  // the days the active bar covers, whose labels light up
  const firstDay = activeBar ? Math.floor((activeBar.start - from) / DAY) : -1
  const lastDay = activeBar ? Math.floor((Math.max(activeBar.start, activeBar.end - 1) - from) / DAY) : -1

  // The tooltip sits centred over the bar in the 40px above the bars, inside the plot. Its size is measured on an
  // invisible copy that holds the same text.
  const [sizerRef, sizer] = useChartSize<HTMLSpanElement>({ width: 180, height: 16 })
  const tipWidth = sizer.width + TIP_PADDING_X
  const tipHeight = sizer.height + TIP_PADDING_Y
  const tipLeft = activeBar ? Math.round(Math.min(Math.max(activeBar.x + activeBar.width / 2 - tipWidth / 2, 0), Math.max(0, width - tipWidth))) : 0
  const tipTop = Math.round(BAR_TOP - TIP_GAP - tipHeight)

  const reduced = useReducedMotion()
  const root = React.useRef<HTMLDivElement>(null)
  const tipRef = React.useRef<HTMLDivElement>(null)
  const totalRef = React.useRef<HTMLParagraphElement>(null)
  const averageRef = React.useRef<HTMLParagraphElement>(null)
  const budgetRef = React.useRef<HTMLParagraphElement>(null)
  const totalText = money(total)
  const averageText = money(average)
  const budgetText = percentText(share)
  // what the entrance's callbacks need when they run (new entries may come before the card scrolls into view)
  const latest = React.useRef({ totalText, averageText, budgetText })
  useIsomorphicLayoutEffect(() => {
    latest.current = { totalText, averageText, budgetText }
  })
  const all = (selector: string) => Array.from(root.current?.querySelectorAll<HTMLElement>(selector) ?? [])

  // New totals count from the previous ones.
  useCountUp(totalRef, total, money, { duration: 900 })
  useCountUp(averageRef, average, money, { duration: 900 })
  useCountUp(budgetRef, share, percentText, { duration: 900 })

  // Entrance, once the card is in view: the tile pops and the header comes in, the numbers count up, the track sweeps
  // across the week and each bar rises from it as the sweep reaches it, the days come up under it and the actions
  // follow.
  useChartEntrance(root, (timeline) => {
    const totalEl = totalRef.current
    const averageEl = averageRef.current
    const budgetEl = budgetRef.current
    const counters = { total: 0, average: 0, share: 0 }
    const count = () => {
      if (totalEl) totalEl.textContent = money(counters.total)
      if (averageEl) averageEl.textContent = money(counters.average)
      if (budgetEl) budgetEl.textContent = percentText(counters.share)
    }
    count()
    timeline
      .add(all('[data-slot="finance-overview-timeline-chart-icon"]'), { scale: { from: 0.6 }, opacity: { from: 0 }, duration: 700, ease: "outBack(1.8)" }, 0)
      .add(all('[data-slot="finance-overview-timeline-chart-heading"] > *, [data-slot="finance-overview-timeline-chart-header"] > button'), { opacity: { from: 0 }, translateY: { from: 6 }, duration: 700, ease: "outExpo", delay: stagger(80) }, 80)
      .add(all('[data-slot="finance-overview-timeline-chart-stat"]'), { opacity: { from: 0 }, translateY: { from: 8 }, duration: 700, ease: "outExpo", delay: stagger(90) }, 160)
      .add(counters, { total: [0, total], average: [0, average], share: [0, share], duration: 1600, ease: "outExpo", onUpdate: count }, 220)
      .add(all('[data-slot="finance-overview-timeline-chart-track"]'), { scaleX: { from: 0 }, duration: SWEEP, ease: "inOutSine" }, SWEEP_AT)
    for (const bar of all('[data-slot="finance-overview-timeline-chart-bar"]')) {
      const at = Number(bar.dataset.at ?? 0)
      timeline.add(bar, { scaleY: { from: 0 }, duration: RISE, ease: "outBack(1.4)" }, SWEEP_AT + SWEEP * sweepTime(at))
    }
    for (const label of all('[data-slot="finance-overview-timeline-chart-day"]')) {
      const at = Number(label.dataset.at ?? 0)
      timeline.add(label, { opacity: { from: 0 }, translateY: { from: 4 }, duration: 600, ease: "outQuad" }, SWEEP_AT + SWEEP * sweepTime(at))
    }
    timeline.add(all('[data-slot="finance-overview-timeline-chart-actions"] > *'), { opacity: { from: 0 }, translateY: { from: 8 }, duration: 700, ease: "outExpo", delay: stagger(100) }, 700)
    return () => {
      if (totalEl) totalEl.textContent = latest.current.totalText
      if (averageEl) averageEl.textContent = latest.current.averageText
      if (budgetEl) budgetEl.textContent = latest.current.budgetText
    }
  })

  // New entries rise from the track again, left to right.
  const lastData = React.useRef(dataKey)
  useIsomorphicLayoutEffect(() => {
    const before = lastData.current
    lastData.current = dataKey
    const rising = all('[data-slot="finance-overview-timeline-chart-bar"]')
    if (before === dataKey || reduced || !rising.length) return
    animate(rising, {
      scaleY: [0, 1],
      duration: RISE,
      delay: stagger(45),
      ease: "outBack(1.4)",
      onComplete: releaseStyles("transform"),
    })
  }, [dataKey, reduced])

  // The tooltip pops in over the first bar and slides from bar to bar.
  const lastTip = React.useRef({ active, tipLeft })
  const slide = React.useRef<JSAnimation | null>(null)
  useIsomorphicLayoutEffect(() => {
    const before = lastTip.current
    lastTip.current = { active, tipLeft }
    const tip = tipRef.current
    if (reduced || !tip || active === null || (before.active === active && before.tipLeft === tipLeft)) return
    const entering = before.active === null
    slide.current?.cancel()
    slide.current = animate(tip, {
      translateX: [entering ? 0 : before.tipLeft - tipLeft + utils.get(tip, "translateX", false), 0],
      ...(entering ? { opacity: [0, 1], scale: [0.94, 1], translateY: [4, 0] } : {}),
      duration: RIDE,
      ease: "outExpo",
      onComplete: releaseStyles("opacity", "transform"),
    })
  }, [active, tipLeft, reduced])
  React.useEffect(
    () => () => {
      slide.current?.cancel()
    },
    [],
  )

  // Pointer positions in the plot's own pixels (the live demo may scale the card with CSS zoom); the nearest bar
  // within SNAP wins.
  const pointAt = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.currentTarget
    const box = target.getBoundingClientRect()
    const zoom = box.width / (target.offsetWidth || box.width || 1) || 1
    const x = (event.clientX - box.left) / zoom
    let best: number | null = null
    let distance = SNAP
    bars.forEach((bar, i) => {
      const d = x < bar.x ? bar.x - x : x > bar.x + bar.width ? x - bar.x - bar.width : 0
      if (d <= distance && (best === null || d < distance)) {
        best = i
        distance = d
      }
    })
    return best
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!n) return
    if (event.key === "Escape") {
      setHovered(null)
      return
    }
    const at = active ?? -1
    const next = { ArrowRight: at + 1, ArrowUp: at + 1, ArrowLeft: at - 1, ArrowDown: at - 1, Home: 0, End: n - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    setHovered(Math.min(Math.max(next, 0), n - 1))
  }
  const valueText = activeBar ? `${activeBar.entry.label ? `${activeBar.entry.label}, ` : ""}${spanText(activeBar)}: ${money(activeBar.entry.amount)}` : undefined

  const stats = [
    { label: totalLabel, ref: totalRef, text: totalText, tone: "text-fg-loud" },
    { label: averageLabel, ref: averageRef, text: averageText, tone: "text-fg-loud" },
    // over budget reads red
    { label: budgetLabel, ref: budgetRef, text: budgetText, tone: over ? "text-error-500" : "text-fg-loud" },
  ]

  return (
    <ChartCard ref={root} role="group" aria-label={title} className={cn("w-full", className)} {...props}>
      <div data-slot="finance-overview-timeline-chart-header" className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Figma: purple-500 with a 1px inside stroke from purple-600 to purple-700, a white gloss fading down from
              the top, an inner shadow along the bottom and two drop shadows */}
          <span
            data-slot="finance-overview-timeline-chart-icon"
            className={cn(
              "relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[13.2px] bg-primary-purple-500 text-fg-white [&_svg]:size-6",
              // Figma paints later effects on top; CSS paints the first shadow on top
              "shadow-[0_8.8px_8.8px_-6.6px_rgb(0_0_0/0.16),0_4.4px_8.8px_rgb(1_1_1/0.08)]",
            )}
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[-19.8px] h-[37.4px] bg-linear-to-b from-white/60 to-white/0" />
            <span className="relative flex">{icon}</span>
            {/* Figma paints the frame's inner shadow and stroke over its children */}
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_-4.4px_6.6px_rgb(0_0_0/0.08)]" />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [background:linear-gradient(var(--primary-purple-600),var(--primary-purple-700))_border-box] [mask:linear-gradient(#000_0_0)_padding-box_exclude,linear-gradient(#000_0_0)]"
            />
          </span>
          <div data-slot="finance-overview-timeline-chart-heading" className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            {/* the padding keeps the descenders out of truncate's clip (the text styles have a line height of 1) */}
            <p className="typo-heading-01-semibold -my-0.5 w-full truncate py-0.5 text-fg-loud">{title}</p>
            {description && <p className="typo-label-03-medium hug-w -my-0.5 max-w-full truncate py-0.5 text-fg-soft">{description}</p>}
          </div>
        </div>
        <ChartButton corner="rounded" size="icon" aria-label="More options" onClick={onMoreClick} className={RING}>
          <DotsHorizontalIcon />
        </ChartButton>
      </div>

      {/* Figma: three equal columns 8px apart; they wrap when the card gets too narrow for the amounts */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] items-start gap-x-2 gap-y-4">
        {stats.map((stat) => (
          <div key={stat.label} data-slot="finance-overview-timeline-chart-stat" className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
            <p className="typo-label-03-medium hug-w -my-0.5 max-w-full truncate py-0.5 text-fg-soft">{stat.label}</p>
            <p ref={stat.ref} className={cn("typo-heading-04-semibold hug-w whitespace-nowrap transition-colors duration-300", stat.tone)}>
              {stat.text}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div ref={plotRef} data-slot="finance-overview-timeline-chart-plot" className="relative" style={{ height: PLOT_HEIGHT }}>
          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
            <rect
              data-slot="finance-overview-timeline-chart-track"
              x={0}
              y={TRACK_TOP}
              width="100%"
              height={PLOT_HEIGHT - TRACK_TOP}
              className="origin-left fill-primary-purple-50 [transform-box:fill-box]"
            />
            {bars.map((bar, i) => (
              <rect
                key={`${bar.key}-${bar.start}`}
                data-slot="finance-overview-timeline-chart-bar"
                data-at={width ? bar.x / width : 0}
                x={bar.x}
                y={BAR_TOP}
                width={bar.width}
                height={PLOT_HEIGHT - BAR_TOP}
                className={cn(
                  "origin-bottom transition-opacity duration-300 [transform-box:fill-box]",
                  LEVELS[bar.level],
                  active !== null && active !== i && "opacity-40",
                )}
              />
            ))}
          </svg>

          <div
            role="slider"
            tabIndex={n ? 0 : -1}
            aria-label={`${title}: spending`}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, n - 1)}
            aria-valuenow={Math.max(0, active ?? 0)}
            aria-valuetext={valueText}
            data-slot="finance-overview-timeline-chart-scrubber"
            onPointerMove={(event) => setHovered(pointAt(event))}
            onPointerDown={(event) => {
              // a tap or a drag across the plot reads the bars on touch screens; the tooltip stays until the plot
              // loses focus (a tap elsewhere)
              if (event.pointerType !== "mouse") setHovered(pointAt(event))
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setHovered(null)
            }}
            onKeyDown={onKeyDown}
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible")) setHovered((at) => at ?? (n ? 0 : null))
            }}
            onBlur={() => setHovered(null)}
            className={cn("absolute inset-0 touch-pan-y rounded-lg outline-none focus-visible:ring-2", RING)}
          />

          {tooltip && (
            <div
              ref={tipRef}
              aria-hidden
              data-slot="finance-overview-timeline-chart-tooltip"
              className={cn(
                "pointer-events-none absolute flex origin-bottom items-center gap-1.5 rounded-xl bg-surface-white px-3 py-2 whitespace-nowrap",
                // Figma paints later effects on top; CSS paints the first shadow on top
                "shadow-[0_0_0_1px_#ececec,0_2px_4px_rgb(0_0_0/0.06),0_4px_16px_rgb(0_0_0/0.08)]",
              )}
              style={{ left: tipLeft, top: tipTop }}
            >
              <ChartTooltipValue variant="light">{tooltip.value}</ChartTooltipValue>
              <ChartTooltipLabel variant="light">{tooltip.label}</ChartTooltipLabel>
            </div>
          )}
          {/* the same row, measured to place the tooltip */}
          {tooltip && (
            <span ref={sizerRef} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex items-center gap-1.5 whitespace-nowrap">
              <ChartTooltipValue variant="light">{tooltip.value}</ChartTooltipValue>
              <ChartTooltipLabel variant="light">{tooltip.label}</ChartTooltipLabel>
            </span>
          )}
        </div>

        {/* Figma "X Axis Labels": each day's name centred under its day */}
        <div aria-hidden className="relative h-[26px]">
          {dayLabels.map(({ day, text }) => (
            <span
              key={`${from}-${day}`}
              data-slot="finance-overview-timeline-chart-day"
              data-at={(day + 0.5) / dayCount}
              className="absolute top-1.5"
              style={{ left: { start: 0, middle: `${((day + 0.5) / dayCount) * 100}%`, end: "100%" }[edge(day)] }}
            >
              <span
                className={cn(
                  "typo-label-02-regular block whitespace-nowrap transition-colors duration-200",
                  { start: "", middle: "-translate-x-1/2", end: "-translate-x-full" }[edge(day)],
                  day >= firstDay && day <= lastDay ? "text-fg-loud" : "text-fg-soft",
                )}
              >
                {text}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div data-slot="finance-overview-timeline-chart-actions" className="flex items-center justify-between gap-6">
        <ChartButton corner="rounded" onClick={onExportClick} className={cn("text-fg-normal", RING)}>
          <DownloadIcon />
          {exportLabel}
        </ChartButton>
        <ChartButton corner="rounded" onClick={onShareClick} className={cn("text-fg-normal", RING)}>
          <ShareIcon />
          {shareLabel}
        </ChartButton>
      </div>
    </ChartCard>
  )
}

export {
  FinanceOverviewTimelineChart,
  sampleFinanceOverviewTimelineEntries,
  type FinanceOverviewTimelineChartProps,
  type FinanceOverviewTimelineEntry,
}
