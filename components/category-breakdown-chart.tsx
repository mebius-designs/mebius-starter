"use client"

import { animate, stagger, utils, type JSAnimation } from "animejs"
import * as React from "react"

import { ChartButton } from "@/components/ui/chart-button"
import { ChartCard } from "@/components/ui/chart-card"
import { ChartChangeBadge } from "@/components/ui/chart-change-badge"
import { SettingsIcon } from "@/components/ui/chart-icons"
import { ChartTooltipLines } from "@/components/ui/chart-tooltip-lines"
import { releaseStyles, useChartEntrance, useCountUp, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-chart-motion"
import { useChartSize } from "@/hooks/use-chart-size"
import { useControllableState } from "@/hooks/use-controllable-state"
import { formatCurrency, formatPercent, wholePercents } from "@/lib/chart-format"
import { cn } from "@/lib/utils"

type CategoryBreakdownColor = "purple" | "blue" | "orange" | "green" | "yellow"

/** A part of a category ("Rent" in Rent & Utilities): its ticks have a shade of their own. */
type CategoryBreakdownItem = {
  /** The part's name in the tooltip. */
  label: string
  amount: number
}

/** A kind of spending: a run of ticks in the meter, its name and share over it. */
type CategoryBreakdownCategory = {
  /** Identifies the category (the pinned one, onCategoryChange). */
  key: string
  label: string
  /** What was spent on it; the sum of its items when left out. */
  amount?: number
  /** Its palette (purple, blue, orange, green and yellow in turn by default). */
  color?: CategoryBreakdownColor
  /**
   * Its parts, each in its own shade of the palette, lightest first (three parts: the 100, 300 and 500 steps). They
   * split the category's ticks by their amounts. A category without parts fades through those three shades in thirds.
   */
  items?: CategoryBreakdownItem[]
}

type CategoryBreakdownChartProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** The card's accessible name (the Figma card has no visible title). */
  title?: string
  /** The label over the revenue. */
  revenueLabel?: string
  revenue?: number
  /** The revenue the month before: its badge shows the change from it (no badge without it). */
  previousRevenue?: number
  /** The label over the expenses, the sum of the categories. */
  expensesLabel?: string
  /** The expenses the month before: their badge shows the change from them (no badge without them). */
  previousExpenses?: number
  /** The soft text after the badges. */
  changeLabel?: string
  /** The month's spending by category, in the meter's order. */
  categories?: CategoryBreakdownCategory[]
  /** The pinned category (its ticks stay lit while the others fade), or null. */
  category?: string | null
  defaultCategory?: string | null
  onCategoryChange?: (category: string | null) => void
  /** The label of the button beside the figures. */
  manageLabel?: string
  /** Called by that button. */
  onManageClick?: () => void
  locale?: string
  currency?: string
}

/** A tick of the meter: its left edge, its category and part, its shade and whether it starts its category. */
type Tick = { x: number; category: number; part: number; shade: string; marker: boolean }
/** A part of a category as laid out: its ticks [start, end) and what it stands for. */
type Part = { category: number; part: number; start: number; end: number; label: string; amount: number }

// Figma geometry ("Category Breakdown Chart" 1473:77602)
const METER_WIDTH = 940
const METER_HEIGHT = 124
const TICK_WIDTH = 3 // a tick is 3px of colour in a 1px ring of the same colour (5px in all), with fully round ends…
const PITCH = 937 / 108 // …109 of them over Figma's 940px, 8.68px apart; another width fits as many as keep that pitch
const MARKER = 124 // the first tick of a category runs the meter's height…
const TICK = 72 // …the others are 72px, standing on its bottom edge
const LIFT = 10 // the pointed-at part's ticks rise by this much
const CORE_LIGHT = 0.19 // Figma's inner shadow (white 24%, spread 1, blur 3–4) lights the 3px core by about this much
const LABEL_LEFT = 11 // a category's name starts 8px right of its marker
const LABEL_GAP = 8 // and stays this clear of the next one
const LABEL_MIN = 28 // a narrower name is hidden
const TIP_GAP = 8 // the tooltip ends 8px above the short ticks
const TIP_PADDING_X = 24 // its 12px side padding, twice
const TIP_PADDING_Y = 16 // and its 8px top and bottom padding
const TICKS_AT = 300
const TICK_STAGGER = 6
const RISE = 700
const DIM = "opacity-35" // the categories that aren't pointed at or pinned
const RING = "focus-visible:ring-primary-blue-500/40"

const PALETTE: CategoryBreakdownColor[] = ["purple", "blue", "orange", "green", "yellow"]
// Each palette's 100 to 500 steps (yellow has no 200: its 100 stands in)
const SHADES: Record<CategoryBreakdownColor, string[]> = {
  purple: ["fill-primary-purple-100", "fill-primary-purple-200", "fill-primary-purple-300", "fill-primary-purple-400", "fill-primary-purple-500"],
  blue: ["fill-primary-blue-100", "fill-primary-blue-200", "fill-primary-blue-300", "fill-primary-blue-400", "fill-primary-blue-500"],
  orange: ["fill-primary-orange-100", "fill-primary-orange-200", "fill-primary-orange-300", "fill-primary-orange-400", "fill-primary-orange-500"],
  green: ["fill-primary-green-100", "fill-primary-green-200", "fill-primary-green-300", "fill-primary-green-400", "fill-primary-green-500"],
  yellow: ["fill-primary-yellow-100", "fill-primary-yellow-100", "fill-primary-yellow-300", "fill-primary-yellow-400", "fill-primary-yellow-500"],
}

// The Figma month: $6,364.81 of expenses over four categories, whose amounts give the 35, 26, 22 and 26 ticks Figma
// draws (32%, 24%, 20% and 24%), and whose parts give each category's three shades as drawn (14, 10 and 11 ticks for
// Rent & Utilities, 10, 8 and 8 for Groceries, 8, 6 and 8 for Subscription, 8, 8 and 10 for Saving account).
const sampleCategoryBreakdownCategories: CategoryBreakdownCategory[] = [
  {
    key: "rent-utilities",
    label: "Rent & Utilities",
    color: "purple",
    items: [
      { label: "Rent", amount: 820 },
      { label: "Utilities", amount: 585.3 },
      { label: "Repairs", amount: 644.7 },
    ],
  },
  {
    key: "groceries",
    label: "Groceries",
    color: "blue",
    items: [
      { label: "Supermarket", amount: 582.1 },
      { label: "Fresh market", amount: 465.4 },
      { label: "Delivery", amount: 464.9 },
    ],
  },
  {
    key: "subscription",
    label: "Subscription",
    color: "orange",
    items: [
      { label: "Software", amount: 463.6 },
      { label: "Gym membership", amount: 348.1 },
      { label: "Online courses", amount: 463.2 },
    ],
  },
  {
    key: "saving-account",
    label: "Saving account",
    color: "green",
    items: [
      { label: "Emergency fund", amount: 470 },
      { label: "Holiday fund", amount: 470 },
      { label: "Retirement", amount: 587.51 },
    ],
  },
]

const r3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * `count` ticks split by `amounts`: where each amount's run starts, then the end (cumulative shares rounded, so the
 * runs keep their order and add up). A positive amount keeps at least one tick while there are enough.
 */
function splitTicks(amounts: number[], count: number) {
  const values = amounts.map((amount) => Math.max(0, amount))
  const total = values.reduce((sum, value) => sum + value, 0)
  const bounds = [0]
  let sum = 0
  for (const value of values) {
    sum += value
    bounds.push(total > 0 ? Math.round((sum / total) * count) : Math.round((bounds.length / values.length) * count))
  }
  bounds[bounds.length - 1] = count
  // a positive amount rounded down to no ticks borrows one from the run after it (or before it, at the end)
  if (values.filter((value) => value > 0).length <= count)
    for (let i = 0; i < values.length; i++) {
      if (!(values[i] > 0) || bounds[i + 1] > bounds[i]) continue
      if (bounds[i + 1] < count) for (let j = i + 1; j < bounds.length - 1 && bounds[j] <= bounds[j - 1]; j++) bounds[j] = bounds[j - 1] + 1
      else for (let j = i; j > 0 && bounds[j] >= bounds[j + 1]; j--) bounds[j] = bounds[j + 1] - 1
    }
  return bounds
}

/** The shades of a category's parts: three parts take the 100, 300 and 500 steps, fewer end on 500, more spread. */
function partShades(color: CategoryBreakdownColor, parts: number) {
  const steps = SHADES[color]
  if (parts <= 1) return [steps[4]]
  if (parts === 2) return [steps[2], steps[4]]
  return Array.from({ length: parts }, (_, j) => steps[Math.round((j * 4) / (parts - 1))])
}

/**
 * The meter at a width: as many ticks as keep Figma's pitch, split among the categories and, inside each, among its
 * parts (a category without parts is one part, its ticks shaded in thirds).
 */
function layoutMeter(categories: CategoryBreakdownCategory[], width: number) {
  const count = Math.max(2, Math.round((width - TICK_WIDTH) / PITCH) + 1)
  const pitch = (width - TICK_WIDTH) / (count - 1)
  const amounts = categories.map(categoryAmount)
  const bounds = splitTicks(amounts, count)
  const ticks: Tick[] = []
  const parts: Part[] = []
  categories.forEach((category, c) => {
    const start = bounds[c]
    const end = bounds[c + 1]
    const color = category.color ?? PALETTE[c % PALETTE.length]
    const items = category.items?.length ? category.items : null
    const runs = splitTicks(items ? items.map((item) => item.amount) : [1, 1, 1], end - start)
    const shades = partShades(color, items ? items.length : 3)
    if (!items) parts.push({ category: c, part: 0, start, end, label: category.label, amount: amounts[c] })
    runs.slice(0, -1).forEach((from, p) => {
      const to = runs[p + 1]
      if (items) parts.push({ category: c, part: p, start: start + from, end: start + to, label: items[p].label, amount: Math.max(0, items[p].amount) })
      for (let t = start + from; t < start + to; t++) ticks.push({ x: r3(t * pitch), category: c, part: items ? p : 0, shade: shades[p], marker: t === start })
    })
  })
  return { count, pitch, ticks, parts, bounds }
}

function categoryAmount(category: CategoryBreakdownCategory) {
  return Math.max(0, category.amount ?? (category.items ?? []).reduce((sum, item) => sum + Math.max(0, item.amount), 0))
}

/**
 * One figure of the row: its label, the amount (counting to a new one) and the change from last month in a green
 * badge with arrow-circle-up, or red with arrow-circle-down when it fell, before the soft change label.
 */
function Figure({
  label,
  value,
  change,
  changeLabel,
  money,
  whole,
  slot,
}: {
  label: string
  value: number
  change?: number
  changeLabel: string
  money: (value: number) => string
  whole: (value: number) => string
  slot: string
}) {
  const valueRef = React.useRef<HTMLParagraphElement>(null)
  const changeRef = React.useRef<HTMLSpanElement>(null)
  useCountUp(valueRef, value, money, { duration: 900 })
  useCountUp(changeRef, change ?? 0, whole, { duration: 700 })
  return (
    <div data-slot="category-breakdown-chart-figure" className="flex min-w-[200px] flex-1 flex-col gap-2.5">
      {/* the padding keeps the descenders out of truncate's clip (the text styles have a line height of 1) */}
      <p className="typo-label-03-medium -my-0.5 truncate py-0.5 text-fg-soft">{label}</p>
      <p ref={valueRef} data-slot={`category-breakdown-chart-${slot}`} className="typo-heading-04-semibold hug-w whitespace-nowrap text-fg-loud">
        {money(value)}
      </p>
      {change !== undefined && (
        <div className="flex h-6 items-center gap-2 whitespace-nowrap">
          <ChartChangeBadge value={change} format={whole} valueRef={changeRef} />
          <span data-slot="category-breakdown-chart-change-label" className="typo-label-02-medium hug-w text-fg-soft">
            {changeLabel}
          </span>
        </div>
      )}
    </div>
  )
}

/** A category's name and its share of the expenses over its ticks (the share counts to a new one). */
function CategoryLabel({ label, share, format, dim, hidden, left, maxWidth }: { label: string; share: number; format: (value: number) => string; dim: boolean; hidden: boolean; left: number; maxWidth: number }) {
  const shareRef = React.useRef<HTMLSpanElement>(null)
  useCountUp(shareRef, share, format, { duration: 700 })
  return (
    <span
      aria-hidden
      data-slot="category-breakdown-chart-label"
      className={cn("pointer-events-none absolute top-2 flex flex-col items-start gap-1 transition-opacity duration-300 motion-reduce:transition-none", hidden ? "opacity-0" : dim && DIM)}
      style={{ left, maxWidth }}
    >
      <span className="typo-label-01-medium -my-0.5 max-w-full truncate py-0.5 text-fg-soft">{label}</span>
      <span ref={shareRef} data-slot="category-breakdown-chart-share" className="typo-label-02-medium hug-w whitespace-nowrap text-fg-loud">
        {format(share)}
      </span>
    </span>
  )
}

/**
 * "Category Breakdown Chart" from the Keitoto library: the month's revenue and expenses side by side, each with its
 * change from last month in a badge, a "Manage balance" button, and the expenses as a meter of thin round ticks split
 * among the categories: each category starts with a tall tick, its name and share, and its ticks are shaded by its
 * parts (lightest first). Hover, drag or arrow along the meter: the pointed-at part's ticks rise, the other categories
 * fade and a dark tooltip gives the part's amount and share; a click or Enter pins the category. Animated with
 * anime.js: the figures count up and the badges pop, the divider draws in, the ticks rise from left to right with the
 * tall ones overshooting, and each category's name comes in as its tick rises while its share counts up; new amounts
 * move the tall ticks and the names to their new places while the ticks change colour and the numbers count.
 */
function CategoryBreakdownChart({
  title = "Category Breakdown",
  revenueLabel = "Total revenue",
  revenue = 18645.16,
  previousRevenue = 17008.43,
  expensesLabel = "Monthly expenses",
  previousExpenses = 6021.37,
  changeLabel = "This month",
  categories = sampleCategoryBreakdownCategories,
  category: categoryProp,
  defaultCategory = null,
  onCategoryChange,
  manageLabel = "Manage balance",
  onManageClick,
  locale = "en-US",
  currency = "USD",
  className,
  ...props
}: CategoryBreakdownChartProps) {
  const [meterRef, meter] = useChartSize<HTMLDivElement>({ width: METER_WIDTH, height: METER_HEIGHT })
  const width = meter.width || METER_WIDTH
  // Content keys: parents may pass new arrays on every render, so changes are detected by value.
  const categoriesKey = JSON.stringify(categories.map((c) => [c.key, c.label, c.amount, c.color, c.items?.map((item) => [item.label, item.amount])]))
  const { ticks, parts, bounds, pitch } = layoutMeter(categories, width)
  const amounts = categories.map(categoryAmount)
  const expenses = amounts.reduce((sum, amount) => sum + amount, 0)
  const shares = wholePercents(amounts)

  const [pinnedValue, setPinned] = useControllableState<string | null>({ value: categoryProp, defaultValue: defaultCategory, onChange: onCategoryChange })
  const pinned = categories.findIndex((c) => c.key === pinnedValue)

  // The part under the pointer (or picked with the keys). The last one is kept after the pointer leaves, so the
  // tooltip can fade out with its text.
  const [inspect, setInspect] = React.useState({ part: -1, on: false })
  const setInspected = (part: number | null) => setInspect((current) => (part === null ? { ...current, on: false } : { part, on: true }))
  const k = inspect.part >= 0 && inspect.part < parts.length ? inspect.part : null
  const inspected = inspect.on ? k : null
  const lit = inspected !== null ? parts[inspected].category : pinned >= 0 ? pinned : null

  const money = React.useCallback((value: number) => formatCurrency(value, { locale, currency }), [locale, currency])
  // the badges are whole dollars, as in Figma ("$163,747")
  const whole = React.useCallback((value: number) => formatCurrency(Math.abs(value), { locale, currency, maximumFractionDigits: 0 }), [locale, currency])
  const share = React.useCallback((value: number) => formatPercent(value, { locale, maximumFractionDigits: 0 }), [locale])
  const fine = React.useCallback((value: number) => formatPercent(value, { locale, maximumFractionDigits: 1 }), [locale])

  // The tooltip sits over the inspected part's middle, 8px above the short ticks (inside the meter's width).
  const tipPart = k !== null ? parts[k] : undefined
  const tipCategory = tipPart ? categories[tipPart.category] : undefined
  const tooltip =
    tipPart && tipCategory
      ? {
          date: tipCategory.items?.length ? `${tipCategory.label} · ${tipPart.label}` : tipCategory.label,
          value: money(tipPart.amount),
          share: `${fine(expenses > 0 ? (tipPart.amount / expenses) * 100 : 0)} of ${expensesLabel.toLowerCase()}`,
        }
      : undefined
  const [sizerRef, sizer] = useChartSize<HTMLSpanElement>({ width: 150, height: 60 })
  const tipWidth = sizer.width + TIP_PADDING_X
  const tipHeight = sizer.height + TIP_PADDING_Y
  const tipCenter = tipPart ? ((tipPart.start + tipPart.end - 1) / 2) * pitch + TICK_WIDTH / 2 : 0
  const tipLeft = Math.round(Math.min(Math.max(tipCenter - tipWidth / 2, 0), Math.max(0, width - tipWidth)))
  const tipTop = METER_HEIGHT - TICK - LIFT - TIP_GAP - tipHeight

  // each name starts 8px right of its category's tall tick and stops short of the next one
  const labels = categories.map((c, i) => {
    const left = Math.round(bounds[i] * pitch + LABEL_LEFT)
    const next = i < categories.length - 1 ? bounds[i + 1] * pitch : width + LABEL_GAP
    const maxWidth = Math.max(0, Math.floor(next - LABEL_GAP - left))
    return { left, maxWidth, hidden: bounds[i + 1] <= bounds[i] || maxWidth < LABEL_MIN }
  })

  const reduced = useReducedMotion()
  const root = React.useRef<HTMLDivElement>(null)
  const tipRef = React.useRef<HTMLDivElement>(null)
  const tipValueRef = React.useRef<HTMLSpanElement>(null)
  const all = (selector: string) => Array.from(root.current?.querySelectorAll<HTMLElement | SVGElement>(selector) ?? [])
  // what the entrance needs when it runs (new figures may come in before it is done)
  const latest = React.useRef({ revenue, expenses, shares })
  useIsomorphicLayoutEffect(() => {
    latest.current = { revenue, expenses, shares }
  })

  useCountUp(tipValueRef, tipPart?.amount ?? 0, money, { duration: 400 })

  // Entrance, once the card is in view: the figures count up from zero and the badges pop, the divider draws in from
  // the left, the ticks rise from the floor from left to right (each category's tall tick overshooting a little), and
  // each category's name comes in as its tick rises while its share counts up.
  useChartEntrance(root, (timeline) => {
    const counter = { t: 0 }
    const figures = all('[data-slot="category-breakdown-chart-revenue"], [data-slot="category-breakdown-chart-expenses"]')
    const shareEls = all('[data-slot="category-breakdown-chart-share"]')
    const count = () => {
      const { revenue, expenses, shares } = latest.current
      figures.forEach((el, i) => (el.textContent = money((i === 0 ? revenue : expenses) * counter.t)))
      shareEls.forEach((el, i) => (el.textContent = share((shares[i] ?? 0) * counter.t)))
    }
    count()
    const tickEls = all('[data-slot="category-breakdown-chart-tick"]')
    const markers = tickEls.filter((el) => el.hasAttribute("data-marker"))
    const shorts = tickEls.filter((el) => !el.hasAttribute("data-marker"))
    const at = (el: Element) => TICKS_AT + Number(el.getAttribute("data-index")) * TICK_STAGGER
    const labelEls = all('[data-slot="category-breakdown-chart-label"]')
    timeline
      .add(counter, { t: [0, 1], duration: 1600, ease: "outExpo", onUpdate: count }, 0)
      .add(all('[data-slot="chart-change-badge"]'), { opacity: { from: 0 }, scale: { from: 0.6 }, duration: 600, ease: "outBack(2)", delay: stagger(120) }, 250)
      .add(all('[data-slot="category-breakdown-chart-change-label"]'), { opacity: { from: 0 }, translateX: { from: -4 }, duration: 500, ease: "outQuad", delay: stagger(120) }, 350)
      .add(all('[data-slot="category-breakdown-chart-manage"]'), { opacity: { from: 0 }, translateY: { from: 4 }, duration: 500, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") }, 200)
      .add(all('[data-slot="category-breakdown-chart-divider"]'), { scaleX: { from: 0 }, duration: 900, ease: "outExpo" }, 150)
    shorts.forEach((el) => timeline.add(el, { scaleY: { from: 0 }, duration: RISE, ease: "outExpo" }, at(el)))
    markers.forEach((el) => {
      timeline.add(el, { scaleY: { from: 0 }, duration: RISE + 200, ease: "outBack(1.4)" }, at(el))
      const label = labelEls[Number(el.getAttribute("data-category"))]
      if (label) timeline.add(label, { opacity: { from: 0 }, translateX: { from: -6 }, duration: 500, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") }, at(el) + 120)
    })
    return () => {
      counter.t = 1
      count()
    }
  })

  // New amounts (or another width) move the tall ticks: a tick that now starts a category grows, one that no longer
  // does shrinks back (their colours change by CSS), and the names slide to their new places.
  const lastLayout = React.useRef({ key: categoriesKey, width, markers: ticks.map((t) => t.marker), lefts: labels.map((l) => l.left) })
  useIsomorphicLayoutEffect(() => {
    const before = lastLayout.current
    const markers = ticks.map((t) => t.marker)
    const lefts = labels.map((l) => l.left)
    lastLayout.current = { key: categoriesKey, width, markers, lefts }
    if (reduced || before.key === categoriesKey || before.width !== width || before.markers.length !== markers.length) return
    all('[data-slot="category-breakdown-chart-tick"]').forEach((el, i) => {
      if (before.markers[i] === markers[i]) return
      const from = before.markers[i] ? MARKER / TICK : TICK / MARKER
      const shape = el.querySelector('[data-slot="category-breakdown-chart-lift"]')
      if (!shape) return
      utils.set(shape, { scaleY: from })
      animate(shape, { scaleY: [from, 1], duration: 650, ease: markers[i] ? "outBack(1.6)" : "outExpo", onComplete: releaseStyles("transform") })
    })
    all('[data-slot="category-breakdown-chart-label"]').forEach((el, i) => {
      const dx = (before.lefts[i] ?? lefts[i]) - lefts[i]
      if (!dx) return
      animate(el, { translateX: [dx + Number(utils.get(el, "translateX", false)), 0], duration: 700, ease: "outExpo", onComplete: releaseStyles("transform") })
    })
  }, [categoriesKey, width, reduced])

  // The inspected part's short ticks rise by 10px in a quick wave from its middle, the ones it leaves settle back.
  const liftTweens = React.useRef<JSAnimation[]>([])
  const lastLift = React.useRef<{ start: number; end: number } | null>(null)
  const lift = inspected !== null ? { start: parts[inspected].start, end: parts[inspected].end } : null
  const liftKey = lift ? `${lift.start}-${lift.end}` : ""
  useIsomorphicLayoutEffect(() => {
    const before = lastLift.current
    lastLift.current = lift
    const lifters = all('[data-slot="category-breakdown-chart-lift"]')
    const ticksIn = (range: { start: number; end: number } | null) => (range ? lifters.slice(range.start, range.end).filter((_, i) => !ticks[range.start + i]?.marker) : [])
    const rising = ticksIn(lift)
    const settling = ticksIn(before).filter((el) => !rising.includes(el))
    for (const tween of liftTweens.current) tween.pause()
    liftTweens.current = []
    const up = (TICK + LIFT) / TICK
    if (reduced) {
      if (settling.length) utils.set(settling, { scaleY: 1 })
      if (rising.length) utils.set(rising, { scaleY: up })
      return
    }
    if (settling.length) liftTweens.current.push(animate(settling, { scaleY: 1, duration: 300, ease: "outQuad" }))
    if (rising.length) liftTweens.current.push(animate(rising, { scaleY: up, duration: 450, ease: "outBack(2)", delay: stagger(18, { from: "center" }) }))
  }, [liftKey, reduced])

  // The tooltip fades in over the inspected part and slides along when another part is inspected.
  const lastTip = React.useRef({ shown: inspected !== null, left: tipLeft, width })
  useIsomorphicLayoutEffect(() => {
    const before = lastTip.current
    const shown = inspected !== null
    lastTip.current = { shown, left: tipLeft, width }
    const tip = tipRef.current
    if (!tip || reduced) return
    if (before.shown !== shown) {
      const from = tip.style.opacity === "" ? (shown ? 0 : 1) : Number(tip.style.opacity)
      animate(tip, {
        opacity: [from, shown ? 1 : 0],
        scale: shown ? [0.94, 1] : [1, 0.97],
        translateY: shown ? [4, 0] : [0, 2],
        duration: shown ? 320 : 180,
        ease: shown ? "outBack(1.6)" : "outQuad",
        onComplete: releaseStyles("opacity", "transform"),
      })
      return
    }
    if (shown && before.left !== tipLeft && before.width === width)
      animate(tip, { translateX: [before.left - tipLeft + Number(utils.get(tip, "translateX", false)), 0], duration: 380, ease: "outExpo", onComplete: releaseStyles("transform") })
  }, [inspected, tipLeft, width, reduced])

  // The meter is a slider over the parts: the pointer or the arrow keys pick one, its tooltip says what it stands for,
  // and a click or Enter pins its category (again to unpin it).
  const partAt = (event: React.PointerEvent<HTMLElement>) => {
    const el = event.currentTarget
    const box = el.getBoundingClientRect()
    // CSS zoom (the live demo scales wide demos down) scales the box but not the layout
    const zoom = box.width / (el.offsetWidth || box.width || 1) || 1
    const x = (event.clientX - box.left) / zoom
    const tick = pitch > 0 ? Math.min(ticks.length - 1, Math.max(0, Math.round((x - TICK_WIDTH / 2) / pitch))) : 0
    return Math.max(0, parts.findIndex((p) => tick >= p.start && tick < p.end))
  }
  const resting = Math.max(
    0,
    parts.findIndex((p) => p.category === (pinned >= 0 ? pinned : 0)),
  )
  const togglePin = (part: number | null) => {
    if (part === null || !parts[part]) return
    const key = categories[parts[part].category]?.key ?? null
    setPinned(key === pinnedValue ? null : key)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = inspected ?? resting
    const next = { ArrowRight: at + 1, ArrowUp: at + 1, ArrowLeft: at - 1, ArrowDown: at - 1, Home: 0, End: parts.length - 1 }[event.key]
    if (event.key === "Escape") {
      setInspected(null)
      if (pinnedValue !== null) setPinned(null)
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      setInspected(at)
      togglePin(at)
      return
    }
    if (next === undefined || !parts.length) return
    event.preventDefault()
    setInspected(Math.min(parts.length - 1, Math.max(0, next)))
  }
  const describe = (i: number) => {
    const part = parts[i]
    const c = part ? categories[part.category] : undefined
    if (!part || !c) return ""
    const name = c.items?.length ? `${c.label}, ${part.label}` : c.label
    return `${name}: ${money(part.amount)}, ${fine(expenses > 0 ? (part.amount / expenses) * 100 : 0)} of ${expensesLabel.toLowerCase()}`
  }

  return (
    <ChartCard ref={root} role="group" aria-label={title} className={cn("w-full", className)} {...props}>
      {/* Figma "Total Revenue Row": the two figures share the row with the button (it wraps under them on a narrow card) */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <Figure label={revenueLabel} value={revenue} change={previousRevenue !== undefined ? revenue - previousRevenue : undefined} changeLabel={changeLabel} money={money} whole={whole} slot="revenue" />
        <Figure
          label={expensesLabel}
          value={expenses}
          change={previousExpenses !== undefined ? expenses - previousExpenses : undefined}
          changeLabel={changeLabel}
          money={money}
          whole={whole}
          slot="expenses"
        />
        <span data-slot="category-breakdown-chart-manage" className="flex shrink-0">
          <ChartButton corner="rounded" onClick={onManageClick} className="text-fg-normal">
            <SettingsIcon />
            {manageLabel}
          </ChartButton>
        </span>
      </div>

      {/* Figma "Divider": 1px of Border/Soft */}
      <div aria-hidden data-slot="category-breakdown-chart-divider" className="h-px origin-left bg-border-soft" />

      <div
        ref={meterRef}
        role="slider"
        tabIndex={0}
        aria-label={`${expensesLabel} by category`}
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={Math.max(1, parts.length)}
        aria-valuenow={(inspected ?? resting) + 1}
        aria-valuetext={describe(inspected ?? resting)}
        data-slot="category-breakdown-chart-meter"
        onPointerMove={(event) => setInspected(partAt(event))}
        onPointerLeave={() => setInspected(null)}
        onPointerDown={(event) => setInspected(partAt(event))}
        onPointerUp={(event) => {
          if (event.button === 0) togglePin(partAt(event))
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) setInspected(resting)
        }}
        onBlur={() => setInspected(null)}
        onKeyDown={onKeyDown}
        className={cn("relative shrink-0 cursor-pointer touch-pan-y rounded-md outline-none focus-visible:ring-2", RING)}
        style={{ height: METER_HEIGHT }}
      >
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
          {ticks.map((tick, i) => {
            const height = tick.marker ? MARKER : TICK
            const y = METER_HEIGHT - height
            return (
              <g
                key={i}
                data-slot="category-breakdown-chart-tick"
                data-index={i}
                data-category={tick.category}
                data-marker={tick.marker || undefined}
                className={cn("origin-bottom transition-opacity duration-300 motion-reduce:transition-none [transform-box:fill-box]", lit !== null && tick.category !== lit && DIM)}
              >
                <g data-slot="category-breakdown-chart-lift" className="origin-bottom [transform-box:fill-box]">
                  {/* Figma "Bar": a 3px pill of its colour in a 1px ring of the same colour (a drop shadow with a 1px
                      spread), its core lit by a white inner shadow */}
                  <rect
                    x={r3(tick.x - 1)}
                    y={y - 1}
                    width={TICK_WIDTH + 2}
                    height={height + 2}
                    rx={(TICK_WIDTH + 2) / 2}
                    className={cn("transition-[fill] duration-500 motion-reduce:transition-none", tick.shade)}
                  />
                  <rect x={tick.x} y={y} width={TICK_WIDTH} height={height} rx={TICK_WIDTH / 2} fill="#fff" fillOpacity={CORE_LIGHT} />
                </g>
              </g>
            )
          })}
        </svg>

        {categories.map((c, i) => (
          <CategoryLabel
            key={c.key}
            label={c.label}
            share={shares[i] ?? 0}
            format={share}
            dim={lit !== null && lit !== i}
            hidden={labels[i].hidden}
            left={labels[i].left}
            maxWidth={labels[i].maxWidth}
          />
        ))}

        {tooltip && (
          <div
            ref={tipRef}
            aria-hidden
            data-slot="category-breakdown-chart-tooltip"
            className={cn(
              "pointer-events-none absolute z-10 flex flex-col items-start gap-2 overflow-hidden rounded-[10px] bg-surface-loud px-3 py-2 whitespace-nowrap",
              // Figma paints later effects on top; CSS paints the first shadow on top
              "shadow-[inset_0_2px_8px_rgb(255_255_255/0.24),0_0_0_1px_var(--surface-muted),0_2px_4px_rgb(0_0_0/0.06),0_4px_16px_rgb(0_0_0/0.08)]",
              inspected !== null ? "opacity-100" : "opacity-0",
            )}
            style={{ left: tipLeft, top: tipTop }}
          >
            <ChartTooltipLines label={tooltip.date} value={tooltip.value} valueRef={tipValueRef} />
            <span className="typo-label-02-regular hug-w text-fg-disable">{tooltip.share}</span>
          </div>
        )}
        {/* the same lines, measured to place the tooltip */}
        {tooltip && (
          <span ref={sizerRef} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex flex-col items-start gap-2 whitespace-nowrap">
            <ChartTooltipLines label={tooltip.date} value={tooltip.value} />
            <span className="typo-label-02-regular hug-w text-fg-disable">{tooltip.share}</span>
          </span>
        )}
      </div>
    </ChartCard>
  )
}

export {
  CategoryBreakdownChart,
  sampleCategoryBreakdownCategories,
  type CategoryBreakdownCategory,
  type CategoryBreakdownChartProps,
  type CategoryBreakdownColor,
  type CategoryBreakdownItem,
}
