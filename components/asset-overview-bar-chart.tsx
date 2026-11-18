"use client"

import { animate, stagger, utils, type AnimationParams, type JSAnimation } from "animejs"
import * as React from "react"

import { ChartButton } from "@/components/ui/chart-button"
import { ChartCard } from "@/components/ui/chart-card"
import { ArrowUpRightIcon, DotsHorizontalIcon, InsightIcon } from "@/components/ui/chart-icons"
import { ChartSegmentedControl } from "@/components/ui/chart-segmented-control"
import { ChartSwatch } from "@/components/ui/chart-swatch"
import { releaseStyles, useChartEntrance, useCountUp, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-chart-motion"
import { useChartSize } from "@/hooks/use-chart-size"
import { useControllableState } from "@/hooks/use-controllable-state"
import { formatCurrency, formatTime } from "@/lib/chart-format"
import { seededRandom } from "@/lib/chart-series"
import { cn } from "@/lib/utils"

type AssetOverviewColor = "blue" | "orange" | "purple" | "green" | "yellow"

/** One stacked series: its stat at the top of the card, its segment in every bar and its row in the tooltip. */
type AssetOverviewSeries = {
  /** The key of the series' amount in each bar's `values`. */
  key: string
  label: string
  color?: AssetOverviewColor
}

/** One slot of a period: a stacked bar. */
type AssetOverviewBar = {
  /** The slot's amount per series key (a missing key counts as 0; amounts below zero count as 0). */
  values: Record<string, number>
  /** The bar's name in the tooltip ("Oct 5"); by default the tick of the part of the period it falls in ("Mon"). */
  label?: string
}

/** One segment of the Week / Month / Year control and what the card shows for it. */
type AssetOverviewPeriod = {
  value: string
  label: string
  /** The period in equal slots, oldest first: one stacked bar each. */
  bars: AssetOverviewBar[]
  /** Names for equal parts of the period, each centred under the bars it covers ("Mon" … "Sat"). */
  ticks: string[]
  /** The stats' amounts per series key; the sums of the period's bars by default. */
  totals?: Record<string, number>
  /** The line in the insight box; without one there is no box. */
  insight?: string
}

type AssetOverviewBarChartProps = Omit<React.ComponentProps<"div">, "children"> & {
  title?: string
  /** The series, stacked bottom to top (and listed left to right in the stats). */
  series?: AssetOverviewSeries[]
  periods?: AssetOverviewPeriod[]
  period?: string
  defaultPeriod?: string
  onPeriodChange?: (period: string) => void
  /** Keys of the series taken off the chart; each stat toggles its own. */
  hiddenSeries?: string[]
  defaultHiddenSeries?: string[]
  onHiddenSeriesChange?: (hidden: string[]) => void
  /** The bold lead-in of the insight box. */
  insightLabel?: string
  /** The button under the chart; hidden when empty. */
  seeInsightLabel?: string
  onSeeInsightClick?: () => void
  /** Called by the ⋯ button. */
  onMoreClick?: () => void
  locale?: string
  currency?: string
}

type Segment = { top: number; bottom: number }
/** A bar on screen: where it stands, how wide it is and its segments (one per series, zero high when hidden or empty). */
type Drawn = { x: number; w: number; segments: Segment[] }
type Stack = Drawn & { values: number[] }

// Figma geometry ("Asset Overview Bar Chart" 1473:81664)
const PLOT_WIDTH = 374
const PLOT_HEIGHT = 119 // the Bars frame: as tall as the tallest stack
const BAR_GAP = 2 // the bars (and the tick cells under them) sit 2px apart
const SEGMENT_GAP = 1 // a segment leaves 1px free under it when another one sits below
const BAR_RADIUS = 1
const TIP_GAP = 8 // the tooltip sits 8px right of the active bar (left of it near the edge)
const TIP_PADDING_X = 24 // its 12px side padding
const TIP_PADDING_Y = 16 // and 8px top and bottom
const LABEL_CHAR = 7.5 // about how wide a character of Label/02 is
const LABEL_GAP = 8 // the least space between two ticks
const BARS_AT = 220
const BAR_STAGGER = 18
const STACK = 950 // a bar's segments stack up one after another within this time
const STACK_DELAY = 0.24 // each segment starts this share of the time after the one under it
const MORPH = 650
const MORPH_STAGGER = 6 // a morph runs over the bars left to right, 6ms apart
const RING = "focus-visible:ring-primary-blue-500/40" // the card's focus rings are blue
const SEGMENT_RING = "[&_[data-slot=chart-segmented-control-item]]:focus-visible:ring-primary-blue-500/40"

/**
 * Each colour's stat swatch and the gradient of its segments: white at the top to the 500 step at the bottom. Figma's
 * swatches are raw colours (#3192f7, #ff8459) and its orange gradient runs to 155% of a segment's height, so the orange
 * caps read lighter; the other colours are the palette's.
 */
const colors: Record<AssetOverviewColor, { swatch: string; to: string; from: number; end: number }> = {
  blue: { swatch: "bg-[#3192f7]", to: "var(--primary-blue-500)", from: 0, end: 1 },
  orange: { swatch: "bg-[#ff8459]", to: "var(--primary-orange-500)", from: 0.0019, end: 1.551 },
  purple: { swatch: "bg-primary-purple-400", to: "var(--primary-purple-500)", from: 0, end: 1 },
  green: { swatch: "bg-primary-green-400", to: "var(--primary-green-500)", from: 0, end: 1 },
  yellow: { swatch: "bg-primary-yellow-400", to: "var(--primary-yellow-500)", from: 0, end: 1 },
}

const sampleAssetOverviewSeries: AssetOverviewSeries[] = [
  { key: "funds", label: "Mutual Funds", color: "blue" },
  { key: "stocks", label: "Stocks", color: "orange" },
]

const cents = (n: number) => Math.round(n * 100) / 100
const DAY = 86_400_000
const shortDate = (time: number) => formatTime(time, { month: "short", day: "numeric" })

// The Figma week (Monday 19 to Saturday 24 October 2026): 39 equal slots under six day labels. The amounts are the drawn
// heights, scaled so that the blue bars add up to Figma's $12,350; each orange cap counts the 1px gap under it.
const FIGMA_WEEK: [number, number][] = [
  [372.93, 95.4], [503.02, 312.22], [424.96, 312.22], [572.4, 95.4], [702.5, 208.15], [936.67, 95.4], [450.98, 346.91], [416.29, 199.47],
  [624.44, 95.4], [234.16, 95.4], [104.07, 95.4], [260.18, 95.4], [424.96, 95.4], [242.84, 95.4], [398.95, 95.4], [728.52, 95.4],
  [581.07, 95.4], [242.84, 95.4], [104.07, 95.4], [130.09, 95.4], [286.2, 95.4], [407.62, 95.4], [95.4, 234.16], [173.46, 95.4],
  [320.89, 95.4], [121.42, 95.4], [320.89, 95.4], [121.42, 95.4], [477, 95.4], [121.42, 95.4], [34.69, 95.4], [199.47, 95.4],
  [104.07, 95.4], [95.4, 95.4], [242.84, 95.4], [338.24, 95.4], [121.42, 95.4], [234.16, 95.4], [78.05, 95.4],
]

/** The last four weeks by day (27 September to 24 October 2026): contributions pick up in the second half. */
function sampleMonth(): AssetOverviewBar[] {
  const random = seededRandom(19)
  const start = Date.UTC(2026, 8, 27)
  return Array.from({ length: 28 }, (_, i) => {
    const weekday = i % 7 // the weeks start on Sunday
    const weekend = weekday === 0 || weekday === 6
    const trend = 0.8 + (0.55 * i) / 27
    const funds = (weekend ? 620 : 1650) * trend * (0.55 + random() * 0.9)
    const stocks = (weekend ? 260 : 820) * (0.45 + random() * 1.1) * (random() < 0.12 ? 2.1 : 1)
    return { label: shortDate(start + i * DAY), values: { funds: cents(funds), stocks: cents(stocks) } }
  })
}

/** The last 52 weeks (26 October 2025 to 24 October 2026): stocks take a growing share from the spring. */
function sampleYear(): AssetOverviewBar[] {
  const random = seededRandom(61)
  const start = Date.UTC(2025, 9, 26)
  let swing = 0
  return Array.from({ length: 52 }, (_, i) => {
    swing = swing * 0.8 + (random() - 0.5) * 0.35
    const level = 9200 * Math.exp(swing) * (0.7 + random() * 0.6)
    const share = 0.22 + 0.3 * Math.max(0, Math.min(1, (i - 18) / 30))
    const from = start + i * 7 * DAY
    return {
      label: `${shortDate(from)} – ${shortDate(from + 6 * DAY)}`,
      values: { funds: cents(level * (1 - share)), stocks: cents(level * share * (0.6 + random() * 0.8)) },
    }
  })
}

const sampleAssetOverviewPeriods: AssetOverviewPeriod[] = [
  {
    value: "week",
    label: "Week",
    ticks: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    bars: FIGMA_WEEK.map(([funds, stocks]) => ({ values: { funds, stocks } })),
    insight: "High market activity driven by tech stocks.",
  },
  {
    value: "month",
    label: "Month",
    ticks: ["Week 1", "Week 2", "Week 3", "Week 4"],
    bars: sampleMonth(),
    insight: "Fund contributions picked up in the last two weeks.",
  },
  {
    value: "year",
    label: "Year",
    ticks: ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
    bars: sampleYear(),
    insight: "Stocks took a growing share since the spring.",
  },
]

const round = (n: number) => Math.round(n * 1000) / 1000
const outCubic = (t: number) => 1 - (1 - t) ** 3
const outExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))

/**
 * A bar's segments from its amounts (bottom series first) on a y scale: each stacks on the ones under it, leaving a 1px
 * gap when one sits below (taken from its own height, so the stack is as tall as its total). An empty segment sits where
 * it would start, so it can grow out of the stack.
 */
function stackSegments(values: number[], y: (value: number) => number) {
  let up = 0
  return values.map((value): Segment => {
    if (value > 0) {
      const from = up
      up += value
      const top = y(up)
      return { top, bottom: Math.max(top, y(from) - (from > 0 ? SEGMENT_GAP : 0)) }
    }
    const at = y(up)
    return { top: at, bottom: at }
  })
}

/**
 * Where the bars sit at a plot width: equal bars 2px apart across the plot, standing on its bottom edge, the tallest
 * stack of the shown series (all of them when none is shown) as tall as the plot.
 */
function layoutBars(bars: AssetOverviewBar[], series: AssetOverviewSeries[], hidden: string[], width: number) {
  const amounts = (bar: AssetOverviewBar, all = false) => series.map((s) => (all || !hidden.includes(s.key) ? Math.max(0, bar.values[s.key] ?? 0) : 0))
  const highest = (all: boolean) => Math.max(0, ...bars.map((bar) => amounts(bar, all).reduce((sum, a) => sum + a, 0)))
  let max = highest(false)
  if (!(max > 0)) max = highest(true)
  const y = (value: number) => (max > 0 ? PLOT_HEIGHT - (Math.min(value, max) / max) * PLOT_HEIGHT : PLOT_HEIGHT)
  const n = bars.length
  const barWidth = round(n ? Math.max(0, (width - BAR_GAP * (n - 1)) / n) : 0)
  const pitch = barWidth + BAR_GAP
  const stacks: Stack[] = bars.map((bar, i) => {
    const values = amounts(bar)
    return { x: round(i * pitch), w: barWidth, values, segments: stackSegments(values, y) }
  })
  return { y, barWidth, pitch, stacks }
}

/** Writes a bar's geometry to its segment rectangles. */
function drawBar(rects: SVGRectElement[], bar: Drawn) {
  bar.segments.forEach((segment, k) => {
    const rect = rects[k]
    if (!rect) return
    rect.setAttribute("x", String(round(bar.x)))
    rect.setAttribute("width", String(round(Math.max(0, bar.w))))
    rect.setAttribute("y", String(round(segment.top)))
    rect.setAttribute("height", String(round(Math.max(0, segment.bottom - segment.top))))
  })
}

const lerpBar = (from: Drawn, to: Drawn, t: number): Drawn => {
  const lerp = (a: number, b: number) => a + (b - a) * t
  return {
    x: lerp(from.x, to.x),
    w: lerp(from.w, to.w),
    segments: to.segments.map((segment, k) => ({
      top: lerp(from.segments[k]?.top ?? PLOT_HEIGHT, segment.top),
      bottom: lerp(from.segments[k]?.bottom ?? PLOT_HEIGHT, segment.bottom),
    })),
  }
}

type TooltipRowData = { key: string; label: string; color: AssetOverviewColor; value: number; hidden: boolean }

/** A tooltip row: a 4 × 20 swatch, the amount and the series' name, dimmed while its series is hidden. */
function TooltipRow({ row, money, counting }: { row: TooltipRowData; money: (value: number) => string; counting?: boolean }) {
  const valueRef = React.useRef<HTMLSpanElement>(null)
  useCountUp(valueRef, row.value, money, { enabled: !!counting, duration: 450 })
  return (
    <span className={cn("flex items-center gap-1.5 transition-opacity duration-300", row.hidden && "opacity-40")}>
      <ChartSwatch className={cn("h-5 w-1", colors[row.color].swatch)} />
      <span ref={valueRef} className="typo-label-03-medium hug-w text-fg-loud">
        {money(row.value)}
      </span>
      <span className="typo-label-02-regular hug-w text-fg-soft">{row.label}</span>
    </span>
  )
}

/** The tooltip's title and rows. Rendered twice: visible (its amounts count) and as an invisible copy that is measured. */
function TooltipContent({ title, rows, money, counting }: { title: string; rows: TooltipRowData[]; money: (value: number) => string; counting?: boolean }) {
  return (
    <>
      <span className="typo-label-02-medium hug-w text-fg-soft">{title}</span>
      {rows.map((row) => (
        <TooltipRow key={row.key} row={row} money={money} counting={counting} />
      ))}
    </>
  )
}

/** A stat: the series' swatch, name and total for the period; pressing it shows or hides the series. */
function Stat({ series, total, hidden, onToggle, format }: { series: AssetOverviewSeries; total: number; hidden: boolean; onToggle: () => void; format: (value: number) => string }) {
  const totalRef = React.useRef<HTMLSpanElement>(null)
  useCountUp(totalRef, total, format, { duration: 900 })
  return (
    <button
      type="button"
      aria-pressed={!hidden}
      data-slot="asset-overview-bar-chart-stat"
      onClick={onToggle}
      className={cn(
        "group/stat flex min-w-0 cursor-pointer flex-col items-start gap-2 rounded-lg text-left outline-none transition-opacity duration-300 focus-visible:ring-2",
        RING,
        hidden && "opacity-40",
      )}
    >
      <span className="flex max-w-full items-center gap-2">
        {/* Figma's swatch has no shadows: the shared 16 × 6 swatch without them */}
        <ChartSwatch data-slot="asset-overview-bar-chart-stat-swatch" className={cn("origin-left shadow-none", colors[series.color ?? "blue"].swatch)} />
        {/* the padding keeps the descenders out of truncate's clip (the text styles have a line height of 1) */}
        <span className="typo-label-02-medium -my-0.5 min-w-0 truncate py-0.5 text-fg-normal transition-colors duration-200 group-hover/stat:text-fg-loud">{series.label}</span>
      </span>
      <span ref={totalRef} data-slot="asset-overview-bar-chart-stat-total" className="typo-heading-03-semibold hug-w whitespace-nowrap text-fg-loud">
        {format(total)}
      </span>
    </button>
  )
}

/**
 * "Asset Overview Bar Chart" from the Keitoto library: a Week / Month / Year switch, the period's totals of two series
 * (Mutual Funds and Stocks) and a stacked bar per slot of the period (blue funds under an orange stocks cap), with the
 * days (weeks, months) named under them, an insight line and a "See insight" button. Hover, touch or the arrow keys
 * scrub the bars: the others dim, the tick under the active bar darkens and a tooltip gives its two amounts; each stat
 * shows or hides its series. Animated with anime.js: the swatches stretch in and the totals count up, the bars stack up
 * from the baseline left to right, then the insight slides in; a new period morphs the bars in a wave (resampled when
 * the slot count changes) while the totals count and the ticks and the insight come in again.
 */
function AssetOverviewBarChart({
  title = "Asset Overview",
  series = sampleAssetOverviewSeries,
  periods = sampleAssetOverviewPeriods,
  period: periodProp,
  defaultPeriod,
  onPeriodChange,
  hiddenSeries,
  defaultHiddenSeries,
  onHiddenSeriesChange,
  insightLabel = "Insights:",
  seeInsightLabel = "See insight",
  onSeeInsightClick,
  onMoreClick,
  locale = "en-US",
  currency = "USD",
  className,
  ...props
}: AssetOverviewBarChartProps) {
  const [periodValue, setPeriod] = useControllableState({ value: periodProp, defaultValue: defaultPeriod ?? periods[0]?.value ?? "", onChange: onPeriodChange })
  const [hidden, setHidden] = useControllableState<string[]>({ value: hiddenSeries, defaultValue: defaultHiddenSeries ?? [], onChange: onHiddenSeriesChange })
  const period = periods.find((option) => option.value === periodValue) ?? periods[0]
  const bars = React.useMemo(() => period?.bars ?? [], [period])
  const ticks = period?.ticks ?? []
  const n = bars.length
  const [plotRef, plot] = useChartSize<HTMLDivElement>({ width: PLOT_WIDTH, height: PLOT_HEIGHT })
  const width = plot.width || PLOT_WIDTH
  const { y, barWidth, pitch, stacks } = React.useMemo(() => layoutBars(bars, series, hidden, width), [bars, series, hidden, width])
  // Content key: parents may pass new arrays on every render, so changes are detected by value.
  const shapeKey = `${period?.value}|${stacks.map((stack) => `${stack.x},${stack.w}:${stack.segments.map((s) => `${round(s.top)},${round(s.bottom)}`).join(",")}`).join(";")}`

  const [hovered, setHovered] = React.useState<number | null>(null)
  // the tooltip keeps showing the last bar while it fades out
  const [tipIndex, setTipIndex] = React.useState<number | null>(null)
  const hover = (index: number | null) => {
    setHovered(index)
    if (index !== null) setTipIndex(index)
  }
  const active = hovered !== null && hovered < n ? hovered : null
  const shownTip = tipIndex !== null && tipIndex < n ? tipIndex : null

  const money = React.useCallback((value: number) => formatCurrency(value, { locale, currency }), [locale, currency])
  // the stats are whole amounts, as in Figma ("$12,350")
  const whole = React.useCallback((value: number) => formatCurrency(value, { locale, currency, maximumFractionDigits: 0 }), [locale, currency])
  const totals = series.map((s) => period?.totals?.[s.key] ?? bars.reduce((sum, bar) => sum + Math.max(0, bar.values[s.key] ?? 0), 0))

  // Ticks: equal cells laid out like the bars (2px apart), each centred under its part of the period. When they would
  // crowd, every second (third…) one is named.
  const m = ticks.length
  const longest = Math.max(0, ...ticks.map((tick) => tick.length))
  const cellPitch = m ? (width + BAR_GAP) / m : width
  const every = m > 1 ? Math.max(1, Math.ceil((longest * LABEL_CHAR + LABEL_GAP) / cellPitch)) : 1
  const tickOf = (i: number) => (m && n ? Math.min(m - 1, Math.floor(((i + 0.5) / n) * m)) : -1)
  const activeTick = active !== null ? tickOf(active) : -1
  const barName = (i: number) => bars[i]?.label ?? ticks[tickOf(i)] ?? ""

  const rowsOf = (i: number | null): TooltipRowData[] =>
    i !== null && bars[i] ? series.map((s) => ({ key: s.key, label: s.label, color: s.color ?? "blue", value: Math.max(0, bars[i].values[s.key] ?? 0), hidden: hidden.includes(s.key) })) : []
  const tipRows = rowsOf(shownTip)
  const tipTitle = shownTip !== null ? barName(shownTip) : ""

  // The tooltip sits 8px right of the active bar, or left of it when it would run past the plot, its top level with the
  // stack's (inside the plot). Its size is measured on an invisible copy that holds the final text.
  const [sizerRef, sizer] = useChartSize<HTMLSpanElement>({ width: 112, height: 62 })
  const tipWidth = sizer.width + TIP_PADDING_X
  const tipHeight = sizer.height + TIP_PADDING_Y
  const tipStack = shownTip !== null ? stacks[shownTip] : undefined
  const stackTop = tipStack ? Math.min(...tipStack.segments.map((s) => s.top), PLOT_HEIGHT) : 0
  const flipped = tipStack ? tipStack.x + barWidth + TIP_GAP + tipWidth > width : false
  const tipLeft = tipStack ? Math.round(flipped ? Math.max(0, tipStack.x - TIP_GAP - tipWidth) : tipStack.x + barWidth + TIP_GAP) : 0
  const tipTop = Math.round(Math.max(0, Math.min(stackTop, PLOT_HEIGHT - tipHeight)))
  const on = active !== null

  const reduced = useReducedMotion()
  const root = React.useRef<HTMLDivElement>(null)
  const tipRef = React.useRef<HTMLDivElement>(null)
  const insightRef = React.useRef<HTMLParagraphElement>(null)
  const ids = React.useId().replace(/[^\w-]/g, "")
  // what the entrance's callbacks need at play time (the card may be resized before it scrolls into view)
  const latest = React.useRef({ stacks, y, totals })
  useIsomorphicLayoutEffect(() => {
    latest.current = { stacks, y, totals }
  })
  const all = (selector: string) => Array.from(root.current?.querySelectorAll<HTMLElement>(selector) ?? [])
  const shapes = () =>
    Array.from(root.current?.querySelectorAll<SVGGElement>('[data-slot="asset-overview-bar-chart-bar"]') ?? []).map((bar) =>
      Array.from(bar.querySelectorAll<SVGRectElement>('[data-slot="asset-overview-bar-chart-segment"]')),
    )
  // How far the entrance has grown each bar (null without one), so a redraw before it is done (the card resized as its
  // font loads, new data) keeps the bars where the entrance has them.
  const growing = React.useRef<{ t: number }[] | null>(null)
  /** Draws bar i of the latest layout `t` of the way through its entrance: each segment grows after the one under it. */
  const growBar = (rects: SVGRectElement[], i: number, t: number) => {
    const { stacks, y } = latest.current
    const stack = stacks[i]
    if (!stack) return
    const window = 1 - STACK_DELAY * Math.max(0, stack.values.length - 1)
    const values = stack.values.map((value, k) => value * outCubic(Math.min(1, Math.max(0, (t - k * STACK_DELAY) / window))))
    drawBar(rects, { ...stack, segments: stackSegments(values, y) })
  }

  // Entrance, once the card is in view: the swatches stretch in and the totals count up, the ticks come in, every bar
  // stacks up from the baseline segment by segment (left to right), then the insight slides in with its sparkle popping
  // and the button rises.
  useChartEntrance(root, (timeline) => {
    const add = (targets: Element[], params: AnimationParams, at: number) => {
      if (targets.length) timeline.add(targets, params, at)
    }
    const rects = shapes()
    const statTotals = all('[data-slot="asset-overview-bar-chart-stat-total"]')
    const growth = rects.map(() => ({ t: 0 }))
    growing.current = growth
    const grow = (i: number) => growBar(rects[i] ?? [], i, growth[i].t)
    rects.forEach((_, i) => grow(i))
    const counter = { t: 0 }
    const count = () => statTotals.forEach((el, k) => (el.textContent = whole((latest.current.totals[k] ?? 0) * counter.t)))
    count()
    timeline.add(counter, { t: [0, 1], duration: 1400, ease: "outExpo", onUpdate: count }, 0)
    // every element is handed back to its classes when its tween ends
    const back = releaseStyles("opacity", "transform")
    add(all('[data-slot="asset-overview-bar-chart-stat-swatch"]'), { scaleX: { from: 0 }, duration: 700, ease: "outExpo", delay: stagger(90), onComplete: back }, 0)
    add(all('[data-slot="asset-overview-bar-chart-tick"] > span'), { opacity: { from: 0 }, translateY: { from: 4 }, duration: 600, ease: "outQuad", delay: stagger(50), onComplete: back }, 250)
    growth.forEach((state, i) => timeline.add(state, { t: [0, 1], duration: STACK, ease: "linear", onUpdate: () => grow(i) }, BARS_AT + i * BAR_STAGGER))
    const insightAt = BARS_AT + rects.length * BAR_STAGGER * 0.6
    add(all('[data-slot="asset-overview-bar-chart-insight"]'), { opacity: { from: 0 }, translateY: { from: 10 }, duration: 700, ease: "outExpo", onComplete: back }, insightAt)
    add(all('[data-slot="asset-overview-bar-chart-insight-icon"]'), { scale: { from: 0 }, rotate: { from: -90 }, duration: 800, ease: "outBack(2.2)", onComplete: back }, insightAt + 120)
    add(all('[data-slot="asset-overview-bar-chart-action"]'), { opacity: { from: 0 }, translateY: { from: 10 }, duration: 700, ease: "outExpo", onComplete: back }, insightAt + 150)
    return () => {
      if (growing.current === growth) growing.current = null
      latest.current.stacks.forEach((stack, i) => drawBar(rects[i] ?? [], stack))
      statTotals.forEach((el, k) => (el.textContent = whole(latest.current.totals[k] ?? 0)))
    }
  })

  // New data, another period, a hidden or shown series: every bar morphs from what is on screen to the new layout in a
  // wave from left to right. When the slot count changes each new bar starts from the old bar at the same place along
  // the period. A resize redraws at once, unless it comes during a morph. While the entrance runs, the bars are redrawn
  // as far as it has grown them (it carries on with the new layout).
  const shown = React.useRef<Drawn[]>(stacks)
  const lastShape = React.useRef({ key: shapeKey, width })
  const morph = React.useRef<JSAnimation | null>(null)
  useIsomorphicLayoutEffect(() => {
    const before = lastShape.current
    lastShape.current = { key: shapeKey, width }
    if (before.key === shapeKey) return
    const rects = shapes()
    const morphing = !!morph.current
    morph.current?.cancel()
    morph.current = null
    const entrance = growing.current
    if (entrance?.some((bar) => bar.t < 1)) {
      shown.current = stacks
      rects.forEach((bar, i) => growBar(bar, i, entrance[i]?.t ?? 1))
      return
    }
    const draw = (frame: Drawn[]) => {
      shown.current = frame
      frame.forEach((bar, i) => drawBar(rects[i] ?? [], bar))
    }
    if (reduced || (before.width !== width && !morphing)) {
      draw(stacks)
      return
    }
    const old = shown.current
    const from = stacks.map((stack, j): Drawn => {
      if (!old.length) return { ...stack, segments: stack.segments.map(() => ({ top: PLOT_HEIGHT, bottom: PLOT_HEIGHT })) }
      const at = old.length === stacks.length ? j : Math.min(old.length - 1, Math.max(0, Math.round(((j + 0.5) * old.length) / stacks.length - 0.5)))
      return old[at]
    })
    const state = { t: 0 }
    const total = MORPH + MORPH_STAGGER * stacks.length
    const frame = () =>
      draw(stacks.map((stack, i) => lerpBar(from[i], stack, outExpo(Math.min(1, Math.max(0, (state.t * total - i * MORPH_STAGGER) / MORPH))))))
    frame()
    morph.current = animate(state, {
      t: 1,
      duration: total,
      ease: "linear",
      onUpdate: frame,
      onComplete: () => {
        morph.current = null
        draw(stacks)
      },
    })
  }, [shapeKey, reduced])
  React.useEffect(
    () => () => {
      morph.current?.cancel()
    },
    [],
  )

  // Another period brings its ticks and its insight in again.
  const periodKey = `${period?.value}|${ticks.join(";")}|${period?.insight ?? ""}`
  const lastPeriod = React.useRef(periodKey)
  useIsomorphicLayoutEffect(() => {
    const before = lastPeriod.current
    lastPeriod.current = periodKey
    if (before === periodKey || reduced) return
    animate(all('[data-slot="asset-overview-bar-chart-tick"] > span'), { opacity: [0, 1], translateY: [4, 0], duration: 450, delay: stagger(35), ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
    if (insightRef.current) animate(insightRef.current, { opacity: [0, 1], translateX: [-6, 0], duration: 500, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [periodKey, reduced])

  // The tooltip glides from bar to bar (it pops in again when it changes sides).
  const lastTip = React.useRef({ tipLeft, tipTop, flipped, on })
  useIsomorphicLayoutEffect(() => {
    const before = lastTip.current
    lastTip.current = { tipLeft, tipTop, flipped, on }
    const tip = tipRef.current
    if (!tip || reduced || !on || !before.on) return
    if (before.flipped !== flipped) {
      animate(tip, { scale: [0.94, 1], duration: 250, ease: "outQuad", onComplete: releaseStyles("transform") })
      return
    }
    if (before.tipLeft === tipLeft && before.tipTop === tipTop) return
    animate(tip, {
      translateX: [before.tipLeft - tipLeft + utils.get(tip, "translateX", false), 0],
      translateY: [before.tipTop - tipTop + utils.get(tip, "translateY", false), 0],
      duration: 350,
      ease: "outExpo",
      onComplete: releaseStyles("transform"),
    })
  }, [tipLeft, tipTop, flipped, on, reduced])

  const toggle = (key: string) => setHidden(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key])

  // Pointer positions in the plot's own pixels (the live demo may scale the card with CSS zoom).
  const indexAt = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.currentTarget
    const box = target.getBoundingClientRect()
    const zoom = box.width / (target.offsetWidth || box.width || 1) || 1
    const x = (event.clientX - box.left) / zoom
    return Math.min(n - 1, Math.max(0, Math.floor((x + BAR_GAP / 2) / (pitch || 1))))
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!n) return
    if (event.key === "Escape") {
      setHovered(null)
      return
    }
    const at = active ?? n - 1
    const page = Math.max(1, Math.round(n / Math.max(1, m)))
    const next = { ArrowRight: at + 1, ArrowUp: at + 1, ArrowLeft: at - 1, ArrowDown: at - 1, PageUp: at + page, PageDown: at - page, Home: 0, End: n - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    hover(Math.min(n - 1, Math.max(0, next)))
  }
  const sliderValue = active ?? Math.max(0, n - 1)
  const valueText = (i: number) =>
    bars[i]
      ? `${barName(i)}: ${series
          .filter((s) => !hidden.includes(s.key))
          .map((s) => `${s.label} ${money(Math.max(0, bars[i].values[s.key] ?? 0))}`)
          .join(", ")}`
      : undefined

  return (
    <ChartCard ref={root} role="group" aria-label={title} className={cn("w-full", className)} {...props}>
      <div className="flex items-center justify-between gap-20">
        {/* the padding keeps the descenders out of truncate's clip (the text styles have a line height of 1) */}
        <p className="typo-heading-01-semibold -my-0.5 min-w-0 flex-1 truncate py-0.5 text-fg-loud">{title}</p>
        <ChartButton corner="rounded" size="icon" aria-label="More options" onClick={onMoreClick} className={RING}>
          <DotsHorizontalIcon />
        </ChartButton>
      </div>

      {periods.length > 1 && (
        <ChartSegmentedControl
          aria-label="Period"
          variant="rounded"
          items={periods.map((option) => ({ value: option.value, label: option.label }))}
          value={period?.value}
          onValueChange={(next) => {
            setHovered(null)
            setPeriod(next)
          }}
          className={SEGMENT_RING}
        />
      )}

      {/* Figma: two equal columns 24px apart */}
      <div role="group" aria-label="Series" className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] items-start gap-x-6 gap-y-4">
        {series.map((s, k) => (
          <Stat key={s.key} series={s} total={totals[k]} hidden={hidden.includes(s.key)} onToggle={() => toggle(s.key)} format={whole} />
        ))}
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div ref={plotRef} data-slot="asset-overview-bar-chart-plot" className="relative" style={{ height: PLOT_HEIGHT }}>
              <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
                <defs>
                  {/* each colour's segment gradient, white at the top (in the segment's own box) */}
                  {(Object.keys(colors) as AssetOverviewColor[]).map((color) => (
                    <linearGradient key={color} id={`${ids}-${color}`} x1="0" y1={colors[color].from} x2="0" y2={colors[color].end}>
                      <stop offset="0" style={{ stopColor: "var(--surface-white)" }} />
                      <stop offset="1" style={{ stopColor: colors[color].to }} />
                    </linearGradient>
                  ))}
                </defs>
                {stacks.map((stack, i) => (
                  <g
                    key={i}
                    data-slot="asset-overview-bar-chart-bar"
                    className={cn("transition-opacity duration-200 motion-reduce:transition-none", active !== null && i !== active && "opacity-35")}
                  >
                    {stack.segments.map((segment, k) => (
                      <rect
                        key={series[k]?.key ?? k}
                        data-slot="asset-overview-bar-chart-segment"
                        x={stack.x}
                        y={round(segment.top)}
                        width={stack.w}
                        height={round(Math.max(0, segment.bottom - segment.top))}
                        rx={BAR_RADIUS}
                        fill={`url(#${ids}-${series[k]?.color ?? "blue"})`}
                      />
                    ))}
                  </g>
                ))}
              </svg>

              <div
                role="slider"
                tabIndex={n ? 0 : -1}
                aria-label={`${title} by ${period?.label.toLowerCase() ?? "period"}`}
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={Math.max(0, n - 1)}
                aria-valuenow={sliderValue}
                aria-valuetext={valueText(sliderValue)}
                data-slot="asset-overview-bar-chart-scrubber"
                onPointerMove={(event) => hover(indexAt(event))}
                onPointerDown={(event) => hover(indexAt(event))}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse") setHovered(null)
                }}
                onFocus={(event) => {
                  if (event.currentTarget.matches(":focus-visible") && hovered === null) hover(sliderValue)
                }}
                onBlur={() => setHovered(null)}
                onKeyDown={onKeyDown}
                className={cn("absolute inset-0 cursor-pointer touch-pan-y rounded-lg outline-none focus-visible:ring-2", RING)}
              />

              {shownTip !== null && (
                <div
                  ref={tipRef}
                  aria-hidden
                  data-slot="asset-overview-bar-chart-tooltip"
                  className={cn(
                    "pointer-events-none absolute z-10 flex flex-col items-start gap-2 rounded-xl bg-surface-white px-3 py-2 whitespace-nowrap transition-opacity duration-200 motion-reduce:transition-none",
                    // Figma paints later effects on top; CSS paints the first shadow on top
                    "shadow-[0_0_0_1px_#ececec,0_2px_4px_rgb(0_0_0/0.06),0_4px_16px_rgb(0_0_0/0.08)]",
                    !on && "opacity-0",
                  )}
                  style={{ left: tipLeft, top: tipTop }}
                >
                  <TooltipContent title={tipTitle} rows={tipRows} money={money} counting />
                </div>
              )}
              {/* the same content with its final text, measured to place the tooltip (the visible amounts change width while they count) */}
              {shownTip !== null && (
                <span ref={sizerRef} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex flex-col items-start gap-2 whitespace-nowrap">
                  <TooltipContent title={tipTitle} rows={tipRows} money={money} />
                </span>
              )}
            </div>

            {/* Figma "X-Labels": equal cells 2px apart like the bars, each label centred in its cell */}
            <div aria-hidden className="flex gap-[2px]">
              {ticks.map((tick, k) => (
                <span key={`${k}-${tick}`} data-slot="asset-overview-bar-chart-tick" className="flex min-w-0 flex-1 justify-center px-1 py-2">
                  <span
                    className={cn(
                      "typo-label-02-regular hug-w block whitespace-nowrap transition-colors duration-200",
                      k === activeTick ? "text-fg-loud" : "text-fg-soft",
                      k % every !== 0 && "invisible",
                    )}
                  >
                    {tick}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {period?.insight && (
            // Figma "Header Cell": #ff8459 at 4% inside a 1px #ff8459 ring at 40% (raw colours)
            <div
              data-slot="asset-overview-bar-chart-insight"
              className="flex items-center gap-1.5 rounded-xl border border-[#ff8459]/40 bg-[#ff8459]/4 p-[11px]"
            >
              <span className="flex shrink-0 items-center gap-1.5">
                <span data-slot="asset-overview-bar-chart-insight-icon" className="flex size-3.5 shrink-0 text-primary-orange-500">
                  <InsightIcon />
                </span>
                <span className="typo-label-01-semibold hug-w whitespace-nowrap text-fg-loud">{insightLabel}</span>
              </span>
              {/* a 14px line box: one line sits exactly where Figma's 12px box does (the row is the icon's 14px), and a long
                  insight that wraps gets some air between its lines */}
              <p ref={insightRef} aria-live="polite" className="typo-label-01-medium min-w-0 flex-1 leading-[14px] text-fg-normal">
                {period.insight}
              </p>
            </div>
          )}
        </div>

        {seeInsightLabel && (
          <ChartButton data-slot="asset-overview-bar-chart-action" onClick={onSeeInsightClick} className={cn("w-full text-fg-normal", RING)}>
            {seeInsightLabel}
            <ArrowUpRightIcon />
          </ChartButton>
        )}
      </div>
    </ChartCard>
  )
}

export {
  AssetOverviewBarChart,
  sampleAssetOverviewPeriods,
  sampleAssetOverviewSeries,
  type AssetOverviewBar,
  type AssetOverviewBarChartProps,
  type AssetOverviewColor,
  type AssetOverviewPeriod,
  type AssetOverviewSeries,
}
