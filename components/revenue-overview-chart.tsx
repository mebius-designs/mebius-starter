"use client"

import { animate, utils, type JSAnimation } from "animejs"
import * as React from "react"

import { ChartButton } from "@/components/ui/chart-button"
import { ChartCard } from "@/components/ui/chart-card"
import { ArrowCircleDownIcon, ArrowCircleUpIcon, ArrowUpRightIcon, DotsHorizontalIcon, InsightIcon, WalletIcon } from "@/components/ui/chart-icons"
import { ChartTooltipLines } from "@/components/ui/chart-tooltip-lines"
import { releaseStyles, useChartEntrance, useCountUp, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-chart-motion"
import { useChartSize } from "@/hooks/use-chart-size"
import { formatCurrency, formatDay, formatPercent } from "@/lib/chart-format"
import { cn } from "@/lib/utils"

type RevenueOverviewPoint = {
  /** The day, as an ISO date ("2026-10-08"). */
  date: string
  /** The month's revenue up to and including that day. */
  value: number
}

type RevenueOverviewChartProps = Omit<React.ComponentProps<"div">, "children"> & {
  title?: string
  /** The soft line under the title. */
  description?: string
  /** The pill over the amount. */
  label?: string
  /** The month's revenue so far, oldest day first: a point on the gauge each, the last one is today (its amount is the card's). */
  data?: RevenueOverviewPoint[]
  /** The monthly revenue target: the gauge is full at this amount. */
  target?: number
  /** Last month's revenue at the same point: the change under the amount compares with it. */
  previous?: number
  /** The soft text after the change. */
  changeLabel?: string
  /** The box under the gauge; by default it says whether the month is on pace for the target. */
  insightTitle?: string
  insightDescription?: string
  /** The link in the box; hidden when empty. */
  detailsLabel?: string
  onDetailsClick?: () => void
  /** Text for a point's day in the tooltip ("Thu, Oct 8"). */
  formatDate?: (date: string) => string
  /** Called by the ⋯ button. */
  onMoreClick?: () => void
  locale?: string
  currency?: string
}

// Figma geometry ("Revenue Overview Chart" 1473:80634). The gauge is the top half of a 720px circle in a 720 × 362 box,
// scaled with the card's width. Angles are in degrees, clockwise from 3 o'clock (y points down): 180° is the gauge's
// start on the left, 270° its top, 360° its end on the right.
const GAUGE_WIDTH = 720
const GAUGE_HEIGHT = 362
const CX = 360
const CY = 360
const RING_OUTER = 360 // the thin ring along the edge, 3.6px wide
const RING_INNER = 356.4
const BAND_OUTER = 340 // the wide band, 108.8px
const BAND_INNER = 231.2
const CORNER = 8 // the band's corners
// The line runs along the band on a circle 1px lower than the gauge's (as drawn), 11.84px wide with a round end.
const LINE_CY = 361
const LINE_OUTER = 296
const LINE_INNER = 284.16
const LINE_RADIUS = (LINE_OUTER + LINE_INNER) / 2
const LINE_START = 180.131 // it starts level with the band's foot
const DOT = 10 // a point: 20px with a 2px ring inside
const DOT_RING = 2
const END_DOT = 12 // today's point: 24px, white with a 4px purple-500 ring inside
const END_RING = 4
// Where the marks end, past today's point: the band 4.52°, the thin arc along the edge 3.48° (it trails 93.22° behind),
// the line's rounded tip 1.63° (under today's point).
const FILL_PAST = 4.5195
const ARC_PAST = 3.4795
const ARC_SPAN = 93.2246
const LINE_PAST = 1.6274
// Figma's state, which the gradients below are drawn for: today's point at 284.56°.
const FIGMA_TODAY = 284.5628
const TIP_GAP = 10 // the tooltip sits 10px over a point (under it when there is no room)
const TIP_PADDING_X = 24 // its 8px left and 16px right padding
const TIP_PADDING_Y = 16 // and 8px top and bottom
const SWEEP = 1500 // the entrance's sweep along the gauge
const SWEEP_AT = 200
const MORPH = 750
const RING = "focus-visible:ring-primary-green-500/40" // the insight's link rings green

// Figma's gradients in the gauge's box, for its state: the band blue-50 to blue-400 toward its end, the thin arc
// fading in from nothing to blue-400 at the top, the line blue-400 at its start through white to purple-500 at its end.
const BAND_FADE = { x1: 73.9067, y1: 360, x2: 449.907, y2: 96 }
const ARC_FADE = { x1: 20.0283, y1: 243.5, x2: 360.028, y2: 0 }
const LINE_FADE = { x1: 111.0116, y1: 361, x2: 438.3528, y2: 131.1647 }

// The Figma card: October 2026 so far, $874.92 of a $1,506 target on 17 October, up 8.34% on September's $807.57 at the
// same point. Each day's revenue puts its point where Figma draws it on the line (within 0.8px: Figma's points sit
// between 290.0 and 290.9px from the centre, the line's middle is 290.08px), and the target puts today's point at
// Figma's 284.56°.
const sampleRevenueOverviewData: RevenueOverviewPoint[] = [
  { date: "2026-10-01", value: 52.86 },
  { date: "2026-10-02", value: 127.05 },
  { date: "2026-10-08", value: 532.22 },
  { date: "2026-10-10", value: 610.76 },
  { date: "2026-10-13", value: 685.21 },
  { date: "2026-10-15", value: 757.96 },
  { date: "2026-10-17", value: 874.92 },
]
const SAMPLE_TARGET = 1506
const SAMPLE_PREVIOUS = 807.57

const round = (n: number) => Math.round(n * 1000) / 1000
const rad = (deg: number) => (deg * Math.PI) / 180
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)
const at = (cx: number, cy: number, r: number, deg: number) => `${round(cx + r * Math.cos(rad(deg)))} ${round(cy + r * Math.sin(rad(deg)))}`

/** The angle of a share (0–1) of the target on the gauge. */
const angleOf = (share: number) => 180 + 180 * clamp(share, 0, 1)

/**
 * A ring segment from one angle to another (clockwise) between two radii, its four corners rounded by `corner` (less
 * when the segment is too short for it), as Figma draws a "Donut Segment" with a corner radius.
 */
function segmentPath(cx: number, cy: number, inner: number, outer: number, from: number, to: number, corner = 0) {
  if (!(to - from > 0.001)) return ""
  // the corner radius that fits the segment's length on its inner edge and half its width
  const fit = Math.min(corner, (outer - inner) / 2 - 0.01, rad(to - from) * inner * 0.45)
  const c = Math.max(0, fit)
  const large = (span: number) => (span > 180 ? 1 : 0)
  if (c < 0.01) {
    return `M ${at(cx, cy, outer, from)} A ${outer} ${outer} 0 ${large(to - from)} 1 ${at(cx, cy, outer, to)} L ${at(cx, cy, inner, to)} A ${inner} ${inner} 0 ${large(to - from)} 0 ${at(cx, cy, inner, from)} Z`
  }
  // each fillet touches the radial edge and the circle: the outer ones inside it, the inner ones outside it
  const dOut = (Math.asin(c / (outer - c)) * 180) / Math.PI
  const dIn = (Math.asin(c / (inner + c)) * 180) / Math.PI
  const edgeOut = Math.sqrt((outer - c) ** 2 - c * c)
  const edgeIn = Math.sqrt((inner + c) ** 2 - c * c)
  return [
    `M ${at(cx, cy, edgeIn, from)}`,
    `L ${at(cx, cy, edgeOut, from)}`,
    `A ${c} ${c} 0 0 1 ${at(cx, cy, outer, from + dOut)}`,
    `A ${outer} ${outer} 0 ${large(to - from - 2 * dOut)} 1 ${at(cx, cy, outer, to - dOut)}`,
    `A ${c} ${c} 0 0 1 ${at(cx, cy, edgeOut, to)}`,
    `L ${at(cx, cy, edgeIn, to)}`,
    `A ${c} ${c} 0 0 1 ${at(cx, cy, inner, to - dIn)}`,
    `A ${inner} ${inner} 0 ${large(to - from - 2 * dIn)} 0 ${at(cx, cy, inner, from + dIn)}`,
    `A ${c} ${c} 0 0 1 ${at(cx, cy, edgeIn, from)}`,
    "Z",
  ].join(" ")
}

/** The line from its start to `to`: a band 11.84px wide, cut level at the start, its end rounded off up to `to`. */
function linePath(to: number) {
  if (!(to - LINE_START > 0.001)) return ""
  const cap = (LINE_OUTER - LINE_INNER) / 2
  // the half circle at the end is taken off the band's length, so its tip is at `to`
  const end = Math.max(LINE_START, to - ((cap / LINE_RADIUS) * 180) / Math.PI)
  const large = end - LINE_START > 180 ? 1 : 0
  return `M ${at(CX, LINE_CY, LINE_OUTER, LINE_START)} A ${LINE_OUTER} ${LINE_OUTER} 0 ${large} 1 ${at(CX, LINE_CY, LINE_OUTER, end)} A ${cap} ${cap} 0 0 1 ${at(CX, LINE_CY, LINE_INNER, end)} A ${LINE_INNER} ${LINE_INNER} 0 ${large} 0 ${at(CX, LINE_CY, LINE_INNER, LINE_START)} Z`
}

/**
 * The line's gradient turned and stretched with its end: it keeps Figma's place relative to the line's start and end, so
 * the line is blue at its start and purple at its end however long it is.
 */
function lineFade(to: number) {
  const sx = CX + LINE_RADIUS * Math.cos(rad(LINE_START))
  const sy = LINE_CY + LINE_RADIUS * Math.sin(rad(LINE_START))
  const end = (deg: number) => [CX + LINE_RADIUS * Math.cos(rad(deg)) - sx, LINE_CY + LINE_RADIUS * Math.sin(rad(deg)) - sy]
  const [fx, fy] = end(FIGMA_TODAY + LINE_PAST)
  const [nx, ny] = end(to)
  const scale = Math.hypot(nx, ny) / (Math.hypot(fx, fy) || 1)
  const turn = ((Math.atan2(ny, nx) - Math.atan2(fy, fx)) * 180) / Math.PI
  return `translate(${round(sx)} ${round(sy)}) rotate(${round(turn)}) scale(${round(scale)}) translate(${round(-sx)} ${round(-sy)})`
}

/** The marks for today's point at `today`, `sweep` (0–1) of the way from the gauge's start (the entrance). */
function marksAt(today: number, sweep = 1) {
  const along = (deg: number) => 180 + (Math.min(deg, 360) - 180) * sweep
  return { fill: along(today + FILL_PAST), arc: along(today + ARC_PAST), line: along(today + LINE_PAST) }
}
type Marks = ReturnType<typeof marksAt>

/** How far into its month a day is (17 October: 17 of 31 days), or null when it isn't a date. */
function monthElapsed(date: string | undefined) {
  const match = date && /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return null
  const days = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate()
  return Number(match[3]) / days
}

/**
 * "Revenue Overview Chart" from the Keitoto library: the month's revenue on a half-circle gauge toward the monthly
 * target, the blue band filled up to today and a line along it with a point for each day with sales (blue on the first
 * half of the line, purple on the second, today white in a purple ring). In the middle the amount with its change from
 * last month at the same point, and under the gauge a box that says whether the month is on pace for the target.
 * Hover, touch or the arrow keys scrub the points, each with a tooltip of its day and the revenue so far. Animated with
 * anime.js: the track fades in and the band sweeps round to today with the line drawing along it, the points popping up
 * as it passes them, while the amount counts up; then today's point lands and keeps a soft pulse, and the box rises in.
 * New data sweeps the gauge to the new amount while the numbers count.
 */
function RevenueOverviewChart({
  title = "Revenue Overview",
  description = "Track your Revenue pattern and stay in control",
  label = "Revenue",
  data = sampleRevenueOverviewData,
  target = SAMPLE_TARGET,
  previous = SAMPLE_PREVIOUS,
  changeLabel = "vs last month",
  insightTitle,
  insightDescription,
  detailsLabel = "View details",
  onDetailsClick,
  formatDate,
  onMoreClick,
  locale = "en-US",
  currency = "USD",
  className,
  ...props
}: RevenueOverviewChartProps) {
  const n = data.length
  const today = data[n - 1]
  const value = today?.value ?? 0
  const share = (point: RevenueOverviewPoint | undefined) => (target > 0 && point ? point.value / target : 0)
  const todayAngle = angleOf(share(today))
  const angles = data.map((point) => angleOf(share(point)))
  // without data the gauge is empty
  const marks = marksAt(todayAngle, n ? 1 : 0)
  const change = previous > 0 ? ((value - previous) / previous) * 100 : undefined
  const down = change !== undefined && change < 0
  // on pace when the month's share of the target is at least the share of the month gone (17 of 31 days: 54.8%)
  const elapsed = monthElapsed(today?.date)
  const onPace = elapsed === null || share(today) >= elapsed
  const insight = {
    title: insightTitle ?? (onPace ? "Great Progress!" : "Behind pace"),
    description: insightDescription ?? (onPace ? "You’re on track to exceed your monthly revenue target" : "At this pace you’ll fall short of your monthly revenue target"),
  }

  const [gaugeRef, gauge] = useChartSize<HTMLDivElement>({ width: GAUGE_WIDTH, height: GAUGE_HEIGHT })
  const width = gauge.width || GAUGE_WIDTH
  const scale = width / GAUGE_WIDTH

  const money = React.useCallback((n: number) => formatCurrency(n, { locale, currency }), [locale, currency])
  const percent = React.useCallback((n: number) => formatPercent(Math.abs(n), { locale, minimumFractionDigits: 2, maximumFractionDigits: 2 }), [locale])
  const dayText = (date: string) => (formatDate ? formatDate(date) : formatDay(date, { weekday: "short", month: "short", day: "numeric" }, locale))

  // The scrubbed point (hover, touch or keys) and its tooltip, which keeps the last point while it fades out (today's
  // before the first one, so its amount counts from point to point).
  const [active, setActive] = React.useState<number | null>(null)
  const shownActive = active !== null && active < n ? active : null
  const [tipIndex, setTipIndex] = React.useState<number | null>(n ? n - 1 : null)
  if (shownActive !== null && shownActive !== tipIndex) setTipIndex(shownActive)
  const tipAt = tipIndex !== null && tipIndex < n ? tipIndex : null
  const [sizerRef, sizer] = useChartSize<HTMLSpanElement>({ width: 70, height: 38 })
  const tipWidth = sizer.width + TIP_PADDING_X
  const tipHeight = sizer.height + TIP_PADDING_Y
  const tipPoint = tipAt !== null ? angles[tipAt] : null
  const tipRadius = (tipAt === n - 1 ? END_DOT : DOT) * scale
  const tipX = tipPoint !== null ? (CX + LINE_RADIUS * Math.cos(rad(tipPoint))) * scale : 0
  const tipY = tipPoint !== null ? (LINE_CY + LINE_RADIUS * Math.sin(rad(tipPoint))) * scale : 0
  const tipBelow = tipY - tipRadius - TIP_GAP - tipHeight < 0
  const tipLeft = Math.round(clamp(tipX - tipWidth / 2, 0, Math.max(0, width - tipWidth)))
  const tipTop = Math.round(tipBelow ? tipY + tipRadius + TIP_GAP : tipY - tipRadius - TIP_GAP - tipHeight)
  const tip = tipAt !== null && data[tipAt] ? { date: dayText(data[tipAt].date), value: money(data[tipAt].value) } : undefined

  const reduced = useReducedMotion()
  const root = React.useRef<HTMLDivElement>(null)
  const bandRef = React.useRef<SVGPathElement>(null)
  const lineRef = React.useRef<SVGPathElement>(null)
  const bandFadeRef = React.useRef<SVGLinearGradientElement>(null)
  const arcFadeRef = React.useRef<SVGLinearGradientElement>(null)
  const lineFadeRef = React.useRef<SVGLinearGradientElement>(null)
  const haloRef = React.useRef<SVGCircleElement>(null)
  const valueRef = React.useRef<HTMLParagraphElement>(null)
  const changeRef = React.useRef<HTMLSpanElement>(null)
  const tipRef = React.useRef<HTMLDivElement>(null)
  const tipValueRef = React.useRef<HTMLSpanElement>(null)
  const ids = React.useId().replace(/[^\w-]/g, "")
  const all = (selector: string) => Array.from(root.current?.querySelectorAll<HTMLElement>(selector) ?? [])
  const valueText = money(value)
  const changeText = percent(change ?? 0)

  // What the entrance's frames need at play time (new data may come before it is done).
  const latest = React.useRef({ todayAngle, value, valueText, angles })
  useIsomorphicLayoutEffect(() => {
    latest.current = { todayAngle, value, valueText, angles }
  })

  /** Draws the band, the thin arc and the line ending at `m`; their gradients turn (and the line's stretches) with them. */
  const drawn = React.useRef<Marks>(marks)
  const draw = (m: Marks) => {
    drawn.current = m
    bandRef.current?.setAttribute("d", segmentPath(CX, CY, BAND_INNER, BAND_OUTER, 180, m.fill, CORNER))
    const arc = segmentPath(CX, CY, RING_INNER, RING_OUTER, Math.max(180, m.arc - ARC_SPAN), m.arc)
    root.current?.querySelectorAll('[data-slot="revenue-overview-chart-arc"]').forEach((path) => path.setAttribute("d", arc))
    lineRef.current?.setAttribute("d", linePath(m.line))
    bandFadeRef.current?.setAttribute("gradientTransform", `rotate(${round(m.fill - FIGMA_TODAY - FILL_PAST)} ${CX} ${CY})`)
    arcFadeRef.current?.setAttribute("gradientTransform", `rotate(${round(m.arc - FIGMA_TODAY - ARC_PAST)} ${CX} ${CY})`)
    lineFadeRef.current?.setAttribute("gradientTransform", lineFade(m.line))
  }
  /** Moves each point to its angle (`at`), a point past the line's end hidden. */
  const placePoints = (pointAngles: number[], lineEnd: number) =>
    all('[data-slot="revenue-overview-chart-point"]').forEach((el, i) => {
      const deg = pointAngles[i]
      if (deg === undefined) return
      el.setAttribute("transform", `translate(${at(CX, LINE_CY, LINE_RADIUS, deg)})`)
      el.setAttribute("visibility", deg <= lineEnd + 0.01 || i === pointAngles.length - 1 ? "visible" : "hidden")
    })

  // New values count from the previous ones.
  useCountUp(valueRef, value, money, { duration: MORPH })
  useCountUp(changeRef, change ?? 0, percent, { duration: MORPH })
  useCountUp(tipValueRef, tipAt !== null ? (data[tipAt]?.value ?? 0) : 0, money, { duration: 400 })

  // Today's point pulses softly once the card has come in (never with reduced motion).
  const pulse = React.useRef<JSAnimation | null>(null)
  const startPulse = () => {
    const halo = haloRef.current
    if (!halo || pulse.current) return
    pulse.current = animate(halo, { scale: [1, 1.9], opacity: [0.35, 0], duration: 1800, ease: "outQuad", loop: true, loopDelay: 1400 })
  }
  React.useEffect(
    () => () => {
      pulse.current?.cancel()
      pulse.current = null
    },
    [],
  )
  // without motion the point is still: the pulse stops and its halo goes back to hidden
  useIsomorphicLayoutEffect(() => {
    if (!reduced) return
    pulse.current?.revert()
    pulse.current = null
  }, [reduced])

  // Entrance, once the card is in view: the grey track fades in, then the band sweeps round from the gauge's start to
  // today with the thin arc and the line drawing along, each point popping up as the line reaches it, while the amount
  // counts up; the pill pops first, the change comes in, today's point lands with its ring and starts to pulse, and the
  // box under the gauge rises in with its sparkle.
  // the entrance's time (t) and how far round it has swept (eased), null without one
  const sweep = React.useRef<{ t: number; eased: number } | null>(null)
  const sweepFrame = (t: number) => {
    const { todayAngle, value, angles } = latest.current
    const m = marksAt(todayAngle, t)
    draw(m)
    placePoints(angles, m.line)
    if (valueRef.current) valueRef.current.textContent = money(value * t)
  }
  useChartEntrance(root, (timeline) => {
    const state = { t: 0, eased: 0 }
    sweep.current = state
    // inOutCubic, inverted below to time each point's pop to the moment the line reaches it
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
    sweepFrame(0)
    timeline
      .add(all('[data-slot="revenue-overview-chart-track"]'), { opacity: { from: 0 }, duration: 700, ease: "outQuad" }, 0)
      .add(all('[data-slot="revenue-overview-chart-pill"]'), { opacity: { from: 0 }, scale: { from: 0.8 }, duration: 600, ease: "outBack(1.8)" }, 100)
      .add(
        state,
        {
          t: [0, 1],
          duration: SWEEP,
          ease: "linear",
          onUpdate: () => {
            state.eased = ease(state.t)
            sweepFrame(state.eased)
          },
        },
        SWEEP_AT,
      )
    const points = all('[data-slot="revenue-overview-chart-dot"]')
    const { todayAngle: todayNow, angles: anglesNow } = latest.current
    const lineEnd = todayNow + LINE_PAST
    points.forEach((dot, i) => {
      const last = i === points.length - 1
      // when the sweep's eased progress reaches the point
      const goal = ((anglesNow[i] ?? 180) - 180) / Math.max(0.001, lineEnd - 180)
      let lo = 0
      let hi = 1
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2
        if (ease(mid) < goal) lo = mid
        else hi = mid
      }
      const when = SWEEP_AT + (last ? SWEEP - 150 : hi * SWEEP)
      timeline.add(dot, { scale: { from: 0 }, opacity: { from: 0 }, duration: last ? 700 : 500, ease: last ? "outBack(2.4)" : "outBack(2)" }, when)
    })
    timeline
      .add(all('[data-slot="revenue-overview-chart-change"]'), { opacity: { from: 0 }, translateY: { from: 4 }, duration: 600, ease: "outQuad" }, SWEEP_AT + SWEEP - 500)
      .add(all('[data-slot="revenue-overview-chart-insight"]'), { opacity: { from: 0 }, translateY: { from: 10 }, duration: 700, ease: "outExpo" }, SWEEP_AT + SWEEP - 350)
      .add(all('[data-slot="revenue-overview-chart-insight-icon"]'), { scale: { from: 0 }, rotate: { from: -90 }, duration: 800, ease: "outBack(2.2)" }, SWEEP_AT + SWEEP - 200)
      .call(startPulse, SWEEP_AT + SWEEP + 400)
    return () => {
      if (sweep.current === state) sweep.current = null
      const { todayAngle, valueText, angles } = latest.current
      const m = marksAt(todayAngle)
      draw(m)
      placePoints(angles, m.line)
      if (valueRef.current) valueRef.current.textContent = valueText
    }
  })

  // New data sweeps the marks round from where they are to the new today, the points gliding along the line. While the
  // entrance runs, it redraws at the entrance's progress.
  const anglesKey = angles.map(round).join(";")
  const lastGeometry = React.useRef({ todayAngle, anglesKey, angles })
  const morph = React.useRef<JSAnimation | null>(null)
  useIsomorphicLayoutEffect(() => {
    const before = lastGeometry.current
    lastGeometry.current = { todayAngle, anglesKey, angles }
    if (before.todayAngle === todayAngle && before.anglesKey === anglesKey) return
    const entrance = sweep.current
    if (entrance && entrance.t < 1) {
      sweepFrame(entrance.eased)
      return
    }
    morph.current?.cancel()
    morph.current = null
    if (reduced) {
      draw(marks)
      placePoints(angles, marks.line)
      return
    }
    const from = drawn.current
    const fromAngles = angles.map((deg, i) => before.angles[i] ?? deg)
    const state = { t: 0 }
    const frame = () => {
      const t = state.t
      const m = { fill: from.fill + (marks.fill - from.fill) * t, arc: from.arc + (marks.arc - from.arc) * t, line: from.line + (marks.line - from.line) * t }
      draw(m)
      placePoints(
        angles.map((deg, i) => fromAngles[i] + (deg - fromAngles[i]) * t),
        m.line,
      )
    }
    frame()
    morph.current = animate(state, {
      t: 1,
      duration: MORPH,
      ease: "outExpo",
      onUpdate: frame,
      onComplete: () => {
        morph.current = null
        draw(marks)
        placePoints(angles, marks.line)
      },
    })
  }, [todayAngle, anglesKey, reduced])
  React.useEffect(
    () => () => {
      morph.current?.cancel()
    },
    [],
  )

  // The tooltip pops in over its point and glides from point to point while its amount counts.
  const lastTip = React.useRef({ tipLeft, tipTop, shown: shownActive !== null })
  const tipFade = React.useRef<JSAnimation | null>(null)
  useIsomorphicLayoutEffect(() => {
    const before = lastTip.current
    const shown = shownActive !== null
    lastTip.current = { tipLeft, tipTop, shown }
    const el = tipRef.current
    if (!el || reduced) return
    if (before.shown !== shown) {
      tipFade.current?.cancel()
      const opacity = el.style.opacity === "" ? (shown ? 0 : 1) : Number(el.style.opacity)
      tipFade.current = shown
        ? animate(el, { opacity: [opacity, 1], scale: [0.94, 1], translateY: [tipBelow ? -4 : 4, 0], duration: 260, ease: "outBack(1.6)", onComplete: releaseStyles("opacity", "transform") })
        : animate(el, { opacity: [opacity, 0], duration: 160, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
      return
    }
    if (!shown || (before.tipLeft === tipLeft && before.tipTop === tipTop)) return
    animate(el, {
      translateX: [before.tipLeft - tipLeft + utils.get(el, "translateX", false), 0],
      translateY: [before.tipTop - tipTop + utils.get(el, "translateY", false), 0],
      duration: 400,
      ease: "outExpo",
      onComplete: releaseStyles("transform"),
    })
  }, [tipLeft, tipTop, shownActive, reduced])

  // A scrubbed point grows and its halo comes up; the one it leaves settles back.
  const lastActive = React.useRef(shownActive)
  useIsomorphicLayoutEffect(() => {
    const before = lastActive.current
    lastActive.current = shownActive
    if (reduced || before === shownActive) return
    const dots = all('[data-slot="revenue-overview-chart-dot"]')
    const halos = all('[data-slot="revenue-overview-chart-focus"]')
    if (before !== null && dots[before]) {
      animate(dots[before], { scale: [utils.get(dots[before], "scale", false) || 1.3, 1], duration: 300, ease: "outQuad", onComplete: releaseStyles("transform") })
      if (halos[before]) animate(halos[before], { opacity: [Number(utils.get(halos[before], "opacity", false)) || 0, 0], duration: 250, ease: "outQuad", onComplete: releaseStyles("opacity") })
    }
    if (shownActive !== null && dots[shownActive]) {
      animate(dots[shownActive], { scale: [1, 1.3], duration: 400, ease: "outBack(2.4)" })
      if (halos[shownActive]) animate(halos[shownActive], { opacity: [0, 1], duration: 300, ease: "outQuad" })
    }
  }, [shownActive, reduced])

  // Pointer positions in the gauge's own units (the live demo may scale the card with CSS zoom, the gauge scales with the
  // card): the nearest point by its angle round the centre.
  const pointAt = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.currentTarget
    const box = target.getBoundingClientRect()
    const zoom = box.width / (target.offsetWidth || box.width || 1) || 1
    const x = (event.clientX - box.left) / zoom / scale
    const y = (event.clientY - box.top) / zoom / scale
    let deg = (Math.atan2(y - LINE_CY, x - CX) * 180) / Math.PI
    if (deg < 0) deg += 360
    // below the gauge's foot: the nearer end
    if (deg < 180) deg = deg < 90 ? 360 : 180
    let best = 0
    for (let i = 1; i < n; i++) if (Math.abs(angles[i] - deg) < Math.abs(angles[best] - deg)) best = i
    return n ? best : null
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!n) return
    if (event.key === "Escape") {
      setActive(null)
      return
    }
    const from = shownActive ?? n - 1
    const next = { ArrowRight: from + 1, ArrowUp: from + 1, ArrowLeft: from - 1, ArrowDown: from - 1, Home: 0, End: n - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    setActive(clamp(next, 0, n - 1))
  }
  const sliderValue = shownActive ?? n - 1
  const pointText = (i: number) => (data[i] ? `${dayText(data[i].date)}: ${money(data[i].value)}, ${formatPercent(share(data[i]) * 100, { locale, maximumFractionDigits: 0 })} of the target` : undefined)

  return (
    <ChartCard ref={root} role="group" aria-label={title} className={cn("w-full", className)} {...props}>
      <div className="flex items-center justify-between gap-20">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* the padding keeps the descenders out of truncate's clip (the text styles have a line height of 1) */}
          <p className="typo-heading-01-semibold -my-0.5 truncate py-0.5 text-fg-loud">{title}</p>
          {description && <p className="typo-label-02-medium -my-0.5 truncate py-0.5 text-fg-soft">{description}</p>}
        </div>
        <ChartButton size="icon" corner="rounded" aria-label="More options" onClick={onMoreClick}>
          <DotsHorizontalIcon />
        </ChartButton>
      </div>

      <div ref={gaugeRef} data-slot="revenue-overview-chart-gauge" className="relative" style={{ height: GAUGE_HEIGHT * scale }}>
        <svg aria-hidden viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`} className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient
              ref={bandFadeRef}
              id={`${ids}-band`}
              gradientUnits="userSpaceOnUse"
              x1={BAND_FADE.x1}
              y1={BAND_FADE.y1}
              x2={BAND_FADE.x2}
              y2={BAND_FADE.y2}
              gradientTransform={`rotate(${round(marks.fill - FIGMA_TODAY - FILL_PAST)} ${CX} ${CY})`}
            >
              <stop offset="0" style={{ stopColor: "var(--primary-blue-50)" }} />
              <stop offset="0.228391" style={{ stopColor: "var(--primary-blue-50)" }} />
              <stop offset="1" style={{ stopColor: "var(--primary-blue-400)" }} />
            </linearGradient>
            <linearGradient
              ref={arcFadeRef}
              id={`${ids}-arc`}
              gradientUnits="userSpaceOnUse"
              x1={ARC_FADE.x1}
              y1={ARC_FADE.y1}
              x2={ARC_FADE.x2}
              y2={ARC_FADE.y2}
              gradientTransform={`rotate(${round(marks.arc - FIGMA_TODAY - ARC_PAST)} ${CX} ${CY})`}
            >
              <stop offset="0" style={{ stopColor: "var(--primary-blue-50)", stopOpacity: 0 }} />
              <stop offset="0.358169" style={{ stopColor: "var(--primary-blue-50)" }} />
              <stop offset="1" style={{ stopColor: "var(--primary-blue-400)" }} />
            </linearGradient>
            <linearGradient
              ref={lineFadeRef}
              id={`${ids}-line`}
              gradientUnits="userSpaceOnUse"
              x1={LINE_FADE.x1}
              y1={LINE_FADE.y1}
              x2={LINE_FADE.x2}
              y2={LINE_FADE.y2}
              gradientTransform={lineFade(marks.line)}
            >
              <stop offset="0.00935918" style={{ stopColor: "var(--primary-blue-400)" }} />
              <stop offset="0.236927" style={{ stopColor: "var(--primary-blue-50)" }} />
              <stop offset="0.459042" style={{ stopColor: "var(--primary-blue-50)" }} />
              <stop offset="0.616252" style={{ stopColor: "var(--primary-purple-100)", stopOpacity: 0.24 }} />
              <stop offset="1" style={{ stopColor: "var(--primary-purple-500)" }} />
            </linearGradient>
            {/* Figma's drop shadow on the thin arc: blue-400 at 40%, 2px down, blur 8, only outside the arc. It is cast by an
                opaque copy of the arc, so it follows the arc's shape (its fill fades out at the start, the shadow doesn't)
                and fills in at its anti-aliased edges as Figma's does. */}
            <filter id={`${ids}-glow`} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
              <feOffset in="SourceAlpha" dy="2" />
              <feGaussianBlur stdDeviation="3.6" />
              <feComposite in2="SourceAlpha" operator="out" result="shadow" />
              <feFlood style={{ floodColor: "var(--primary-blue-400)", floodOpacity: 0.4 }} />
              <feComposite in2="shadow" operator="in" />
            </filter>
          </defs>

          {/* Figma "Donut Segment"s: the thin ring and the wide band in Background/Disable, half a circle each */}
          <g data-slot="revenue-overview-chart-track" className="fill-surface-disable">
            <path d={segmentPath(CX, CY, RING_INNER, RING_OUTER, 180, 360)} />
          </g>
          <path data-slot="revenue-overview-chart-arc" d={segmentPath(CX, CY, RING_INNER, RING_OUTER, Math.max(180, marks.arc - ARC_SPAN), marks.arc)} filter={`url(#${ids}-glow)`} />
          <path data-slot="revenue-overview-chart-arc" d={segmentPath(CX, CY, RING_INNER, RING_OUTER, Math.max(180, marks.arc - ARC_SPAN), marks.arc)} fill={`url(#${ids}-arc)`} />
          <g data-slot="revenue-overview-chart-track" className="fill-surface-disable">
            <path d={segmentPath(CX, CY, BAND_INNER, BAND_OUTER, 180, 360, CORNER)} />
          </g>
          <path ref={bandRef} d={segmentPath(CX, CY, BAND_INNER, BAND_OUTER, 180, marks.fill, CORNER)} fill={`url(#${ids}-band)`} />
          <path ref={lineRef} d={linePath(marks.line)} fill={`url(#${ids}-line)`} />

          {/* the points: blue on the first half of the line, purple on the second (2px ring of the 400 step inside), today
              white in a 4px purple-500 ring */}
          {data.map((point, i) => {
            const last = i === n - 1
            const half = share(today) > 0 ? share(point) / share(today) : 0
            const tone = half < 0.5 ? "blue" : "purple"
            const r = last ? END_DOT : DOT
            return (
              <g key={`${i}-${point.date}`} data-slot="revenue-overview-chart-point" transform={`translate(${at(CX, LINE_CY, LINE_RADIUS, angles[i])})`}>
                {/* the scrubbed point's halo */}
                <circle
                  data-slot="revenue-overview-chart-focus"
                  r={r + 6}
                  className={cn("opacity-0", last || tone === "purple" ? "fill-primary-purple-500/20" : "fill-primary-blue-500/20")}
                />
                {last && <circle ref={haloRef} r={r} className="origin-center fill-primary-purple-500 opacity-0 [transform-box:fill-box]" />}
                <g data-slot="revenue-overview-chart-dot" className="origin-center [transform-box:fill-box]">
                  {last ? (
                    <>
                      <circle r={r} className="fill-primary-purple-500" />
                      <circle r={r - END_RING} className="fill-surface-white" />
                    </>
                  ) : (
                    <>
                      <circle r={r} className={tone === "blue" ? "fill-primary-blue-400" : "fill-primary-purple-400"} />
                      <circle r={r - DOT_RING} className={tone === "blue" ? "fill-primary-blue-500" : "fill-primary-purple-500"} />
                    </>
                  )}
                </g>
              </g>
            )
          })}
        </svg>

        {/* the scrubber over the gauge */}
        <div
          role="slider"
          tabIndex={n ? 0 : -1}
          aria-label={`${title} by day`}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, n - 1)}
          aria-valuenow={sliderValue}
          aria-valuetext={pointText(sliderValue)}
          data-slot="revenue-overview-chart-scrubber"
          onPointerMove={(event) => setActive(pointAt(event))}
          onPointerDown={(event) => setActive(pointAt(event))}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setActive(null)
          }}
          onFocus={(event) => {
            if (event.currentTarget.matches(":focus-visible") && active === null) setActive(n - 1)
          }}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          className="absolute inset-0 cursor-pointer touch-pan-y rounded-t-[360px] outline-none focus-visible:ring-2 focus-visible:ring-primary-blue-500/40"
        />

        {/* Figma: the pill, the amount and the change centred under the gauge's top, 24 and 20px apart, 48px over its foot */}
        <div
          className="pointer-events-none absolute inset-x-0 flex flex-col items-center"
          style={{ bottom: 48 * scale, transform: scale < 1 ? `scale(${round(scale)})` : undefined, transformOrigin: "50% 100%" }}
        >
          <span
            data-slot="revenue-overview-chart-pill"
            className="flex items-center gap-1 rounded-full bg-primary-green-50 p-2.5 text-primary-green-500 shadow-[0_0_0_1px_var(--primary-green-100)]"
          >
            <WalletIcon className="shrink-0" />
            <span className="typo-label-03-medium hug-w px-0.5 whitespace-nowrap">{label}</span>
          </span>
          <p ref={valueRef} data-slot="revenue-overview-chart-value" className="typo-heading-06-semibold hug-w mt-6 whitespace-nowrap text-fg-loud">
            {valueText}
          </p>
          {change !== undefined && (
            <p data-slot="revenue-overview-chart-change" className="mt-5 flex h-3.5 items-center gap-1.5 whitespace-nowrap">
              <span className={cn("flex items-center gap-1 transition-colors duration-300", down ? "text-error-500" : "text-primary-green-500")}>
                {down ? <ArrowCircleDownIcon className="shrink-0" /> : <ArrowCircleUpIcon className="shrink-0" />}
                <span className="sr-only">{down ? "Down" : "Up"}</span>
                <span ref={changeRef} className="typo-label-01-medium hug-w">
                  {changeText}
                </span>
              </span>
              <span className="typo-label-02-medium hug-w text-fg-soft">{changeLabel}</span>
            </p>
          )}
        </div>

        {tip && (
          <div
            ref={tipRef}
            aria-hidden
            data-slot="revenue-overview-chart-tooltip"
            className={cn(
              "pointer-events-none absolute z-10 flex flex-col items-start gap-2 overflow-hidden rounded-[10px] bg-surface-loud py-2 pr-4 pl-2 whitespace-nowrap",
              // Figma paints later effects on top; CSS paints the first shadow on top
              "shadow-[inset_0_2px_8px_rgb(255_255_255/0.24),0_0_0_1px_var(--surface-muted),0_2px_4px_rgb(0_0_0/0.06),0_4px_16px_rgb(0_0_0/0.08)]",
              shownActive === null && "opacity-0",
            )}
            style={{ left: tipLeft, top: tipTop }}
          >
            <ChartTooltipLines label={tip.date} value={tip.value} valueRef={tipValueRef} />
          </div>
        )}
        {/* the same lines with their final text, measured to place the tooltip (the visible ones change width while they count) */}
        {tip && (
          <span ref={sizerRef} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex flex-col items-start gap-2 whitespace-nowrap">
            <ChartTooltipLines label={tip.date} value={tip.value} />
          </span>
        )}
      </div>

      {/* Figma "Header Cell": green-50 inside a 1px green-200 ring, 12px corners (orange when the month is behind pace) */}
      <div
        data-slot="revenue-overview-chart-insight"
        className={cn(
          "flex items-center gap-1.5 rounded-xl border p-[11px] transition-colors duration-300",
          onPace ? "border-primary-green-200 bg-primary-green-50" : "border-primary-orange-200 bg-primary-orange-50",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex items-center gap-1.5">
            <span data-slot="revenue-overview-chart-insight-icon" className={cn("flex size-3.5 shrink-0", onPace ? "text-primary-green-500" : "text-primary-orange-500")}>
              <InsightIcon />
            </span>
            <span className="typo-label-02-semibold -my-0.5 min-w-0 truncate py-0.5 text-fg-loud">{insight.title}</span>
          </p>
          <p className="typo-label-01-medium text-fg-normal">{insight.description}</p>
        </div>
        {detailsLabel && (
          <button
            type="button"
            onClick={onDetailsClick}
            className={cn(
              "group/details flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md outline-none transition-colors duration-200 focus-visible:ring-2",
              onPace ? "text-primary-green-500 hover:text-primary-green-700" : "text-primary-orange-500 hover:text-primary-orange-700",
              RING,
            )}
          >
            <span className="typo-label-02-medium hug-w whitespace-nowrap">{detailsLabel}</span>
            <ArrowUpRightIcon className="shrink-0 transition-transform duration-200 group-hover/details:translate-x-0.5 group-hover/details:-translate-y-0.5" />
          </button>
        )}
      </div>
    </ChartCard>
  )
}

export { RevenueOverviewChart, sampleRevenueOverviewData, type RevenueOverviewChartProps, type RevenueOverviewPoint }
