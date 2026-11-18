"use client"

import { animate, stagger, svg, utils } from "animejs"
import { CheckIcon, ChevronDownIcon, LoaderCircleIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react"
import { Select as SelectPrimitive, Switch as SwitchPrimitive } from "radix-ui"
import * as React from "react"

import { useControllableState } from "@/hooks/use-controllable-state"
import { prefersReducedMotion, releaseStyles, shake, useFormEntrance, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-form-motion"
import { useFormSubmit } from "@/hooks/use-form-submit"
import { cn } from "@/lib/utils"

/** One option of the currency picker. */
type NewProductCurrency = {
  /** The ISO code the picker shows ("USD"). */
  value: string
  /** The sign before the amount ("$"). */
  symbol: string
  /** Decimal places of an amount: 2 by default, 0 for currencies without cents (IDR, JPY). */
  decimals?: number
  /** The lowest price; 1 by default. */
  min?: number
  /** The highest price; 100,000 by default. */
  max?: number
}

/** One license tier the "Sell license tiers" switch adds. */
type NewProductTier = {
  value: string
  label: string
  /** The tier's price as a multiple of the product price (Team at 3 costs three Personals) until it's edited. */
  multiplier: number
}

type NewProductFormValues = {
  /** The cover image (required to publish, not to save a draft). */
  cover: File | null
  name: string
  /** The price in the currency's main unit (49 for $49.00); `null` while the field is empty or not a number. */
  price: number | null
  /** The selected currency's `value`. */
  currency: string
  /** How many licenses are for sale. */
  licenses: number
  tags: string[]
  /** Sell the license tiers. */
  tiers: boolean
  /** Each tier's price by tier `value` (empty while `tiers` is off). As a default value: prices set by hand. */
  tierPrices: Record<string, number>
}

type NewProductFormProps = Omit<React.ComponentProps<"form">, "onSubmit" | "children" | "autoFocus"> & {
  title?: string
  description?: string
  /**
   * Starting values. Without it the name and price open empty (their placeholders show) with no cover or tags, on
   * Figma's USD and 250 licenses; `sampleNewProductValues` is the filled Figma sample (Fleet UI kit, dark at $49.00).
   */
  defaultValues?: Partial<NewProductFormValues>
  currencies?: NewProductCurrency[]
  /** Controlled currency (pair with `onCurrencyChange`). */
  currency?: string
  onCurrencyChange?: (currency: string) => void
  /** Your share of each sale, shown as "You keep 95%". */
  payoutShare?: number
  /** The cover's accepted MIME types; the hint names them ("PNG"). */
  coverTypes?: string[]
  /** The cover's recommended size, in the hint ("1600 × 1200"); smaller images get a warning. */
  coverSize?: { width: number; height: number }
  /** The largest cover file, in bytes. */
  coverMaxBytes?: number
  /** The most licenses one product can have. */
  maxLicenses?: number
  maxTags?: number
  /** The tiers the switch adds. An empty list hides the panel. */
  tiers?: NewProductTier[]
  /** The tiers need a plan upgrade: the switch calls `onUpgrade` instead of turning on. */
  tiersLocked?: boolean
  onUpgrade?: () => void
  /** When the draft was last saved (`null`: never). Default: two minutes before the form mounted, the Figma sample. */
  draftSavedAt?: Date | number | null
  /** Called by "Save draft" with the values as they are (nothing is validated). */
  onSaveDraft?: (values: NewProductFormValues) => void | Promise<void>
  /** Where published products live, for the confirmation: `${storeUrl}/${slug of the name}`. */
  storeUrl?: string
  onSubmit?: (values: NewProductFormValues) => void | Promise<void>
  /** Called by the close button and by Done after publishing. Without it, the close button puts the default values back. */
  onClose?: () => void
  /** Focuses the name field on mount, as a dialog would. */
  autoFocus?: boolean
}

const sampleNewProductCurrencies: NewProductCurrency[] = [
  { value: "USD", symbol: "$" },
  { value: "EUR", symbol: "€" },
  { value: "GBP", symbol: "£" },
  { value: "IDR", symbol: "Rp", decimals: 0, min: 15_000, max: 1_500_000_000 },
  { value: "JPY", symbol: "¥", decimals: 0, min: 150, max: 15_000_000 },
]

const sampleNewProductTiers: NewProductTier[] = [
  { value: "personal", label: "Personal", multiplier: 1 },
  { value: "team", label: "Team", multiplier: 3 },
  { value: "extended", label: "Extended", multiplier: 10 },
]

const sampleNewProductValues: NewProductFormValues = {
  cover: null,
  name: "Fleet UI kit, dark",
  price: 49,
  currency: "USD",
  licenses: 250,
  tags: ["Dashboard", "Dark", "Figma"],
  tiers: false,
  tierPrices: {},
}

// What the form opens with: the name and price empty (their placeholders show), no tags, Figma's currency, 250
// licenses and the tiers off.
const defaultNewProductValues: NewProductFormValues = { ...sampleNewProductValues, name: "", price: null, tags: [] }

const MAX_NAME = 80
const MAX_TAG = 20
const MINUTE = 60_000

// The colours the dialog adds to the forms theme, light and dark (Figma "Stage / 03 New product" light 2713:11048, dark
// 1891:83397) as light-dark(light, dark), so the form follows your app's dark class (it sets its own color-scheme from
// it). Override them through `style` to re-skin.
const palette = {
  // the Pro badge's label (its lock keeps form-pro)
  "--product-pro-ink": "light-dark(#3911d0, #c4b5fd)",
  // the dialog's and the currency menu's shadows (the menu's isn't drawn in Figma)
  "--product-shadow": "light-dark(rgb(15 18 26 / 0.08), rgb(0 0 0 / 0.32))",
  "--product-menu-shadow": "light-dark(rgb(15 18 26 / 0.12), rgb(0 0 0 / 0.6))",
} as React.CSSProperties

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-form-accent"
const text13 = "text-[13px] leading-4 tracking-[-0.13px]"
const text12 = "text-xs leading-4 tracking-[-0.12px]"
const text11 = "text-[11px] leading-4 tracking-[-0.11px]"
// Figma rounds a hugging text box up to whole pixels, so buttons, chips and badges are as wide as drawn.
const hug = "hug-w"
const mono13 = "font-form-geist-mono text-[13px] leading-4"
const menuContent =
  "z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-[10px] border border-form-border-strong bg-form-surface font-form-geist text-form-text antialiased shadow-[0_16px_40px_-12px_var(--product-menu-shadow)] scheme-light dark:scheme-dark"
const menuItem =
  "relative flex h-8 cursor-pointer items-center gap-2 rounded-[7px] pr-8 pl-2 text-[13px] leading-4 tracking-[-0.13px] text-form-text-2 outline-none select-none data-highlighted:bg-form-surface-3 data-highlighted:text-form-text data-[state=checked]:text-form-text"

const decimalsOf = (currency: NewProductCurrency | undefined) => currency?.decimals ?? 2

/** "49" → "49.00" (for the field: no grouping, the currency's decimals). */
function formatAmount(value: number, decimals: number) {
  return value.toFixed(decimals)
}

/** "$1,470.00" / "Rp49,000" for messages. */
function formatMoney(value: number, currency: NewProductCurrency | undefined) {
  const decimals = decimalsOf(currency)
  return `${currency?.symbol ?? ""}${value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

/** A typed amount: "49", "49.5", "1,299.00" and "49,90" read as numbers; anything else is NaN. */
function parseAmount(text: string) {
  let clean = text.replace(/[\s_]/g, "")
  if (/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(clean)) clean = clean.replace(/,/g, "")
  else clean = clean.replace(",", ".")
  return /^\d+(\.\d*)?$|^\.\d+$/.test(clean) ? Number(clean) : Number.NaN
}

function priceProblem(text: string, currency: NewProductCurrency | undefined, label = "a price") {
  if (!text.trim()) return `Set ${label}.`
  const value = parseAmount(text)
  if (Number.isNaN(value)) return `Enter a number, like ${formatAmount(49, decimalsOf(currency))}.`
  const min = currency?.min ?? 1
  const max = currency?.max ?? 100_000
  if (value < min) return `The lowest price is ${formatMoney(min, currency)}.`
  if (value > max) return `The highest price is ${formatMoney(max, currency)}.`
  return null
}

function nameProblem(name: string) {
  if (!name.trim()) return "Name the product."
  if (name.trim().length > MAX_NAME) return `Use ${MAX_NAME} characters or fewer.`
  return null
}

function slugify(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** ["image/png"] → "PNG"; ["image/png", "image/jpeg"] → "PNG or JPEG". */
function typesLabel(types: string[]) {
  const names = types.map((type) => {
    const sub = type.split("/")[1] ?? type
    return sub === "webp" ? "WebP" : sub === "svg+xml" ? "SVG" : sub.toUpperCase()
  })
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`
}

/** "1600 × 1200", kept on one line. */
function dimensions(width: number, height: number) {
  return `${width}\u00a0×\u00a0${height}`
}

function formatBytes(bytes: number) {
  return bytes >= 1_000_000 ? `${Math.round(bytes / 100_000) / 10} MB` : `${Math.round(bytes / 1000)} KB`
}

function listLabels(labels: string[]) {
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
}

/** "Draft saved 2 min ago" from when it was saved. */
function savedLabel(savedAt: number, now: number) {
  const minutes = Math.floor(Math.max(0, now - savedAt) / MINUTE)
  if (minutes < 1) return "Draft saved just now"
  if (minutes < 60) return `Draft saved ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Draft saved ${hours} h ago`
  return `Draft saved ${new Date(savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
}

/** The clock for the draft's "2 min ago" (outside render: a lazy initial state or an event reads it). */
const clock = () => Date.now()

const icon = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24" } as const

/** Figma's "Icon / image-plus". */
function ImagePlusIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg {...icon} strokeWidth={1.875} {...props}>
      <path d="M12.5 3H7.8C6.12 3 5.28 3 4.64 3.33C4.07 3.61 3.61 4.07 3.33 4.64C3 5.28 3 6.12 3 7.8V16.2C3 17.88 3 18.72 3.33 19.36C3.61 19.93 4.07 20.39 4.64 20.67C5.28 21 6.12 21 7.8 21H17C17.93 21 18.4 21 18.78 20.9C19.29 20.76 19.75 20.49 20.12 20.12C20.49 19.75 20.76 19.29 20.9 18.78C21 18.4 21 17.93 21 17M19 8V2M16 5H22M10.5 8.5C10.5 9.6 9.6 10.5 8.5 10.5C7.4 10.5 6.5 9.6 6.5 8.5C6.5 7.4 7.4 6.5 8.5 6.5C9.6 6.5 10.5 7.4 10.5 8.5ZM14.99 11.92L6.53 19.61C6.06 20.04 5.82 20.26 5.8 20.44C5.79 20.52 5.8 20.61 5.83 20.68C5.86 20.76 5.9 20.82 5.96 20.88C6.1 21 6.43 21 7.07 21H16.46C17.9 21 18.61 21 19.18 20.76C19.89 20.45 20.45 19.89 20.76 19.18C21 18.61 21 17.9 21 16.46C21 15.97 21 15.73 20.95 15.5C20.88 15.22 20.75 14.96 20.57 14.73C20.43 14.54 20.24 14.39 19.86 14.09L17.07 11.85C16.69 11.55 16.5 11.4 16.29 11.35C16.11 11.3 15.91 11.3 15.73 11.36C15.53 11.43 15.35 11.59 14.99 11.92Z" />
    </svg>
  )
}

/** Figma's "Icon / tag01". */
function TagIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg {...icon} strokeWidth={1.875} {...props}>
      <path d="M8 8H8.01M2 5.2V9.67C2 10.16 2 10.41 2.06 10.64C2.1 10.84 2.19 11.04 2.29 11.22C2.42 11.42 2.59 11.59 2.94 11.94L10.61 19.61C11.79 20.79 12.39 21.39 13.07 21.61C13.68 21.81 14.32 21.81 14.93 21.61C15.61 21.39 16.21 20.79 17.39 19.61L19.61 17.39C20.79 16.21 21.39 15.61 21.61 14.93C21.81 14.32 21.81 13.68 21.61 13.07C21.39 12.39 20.79 11.79 19.61 10.61L11.94 2.94C11.59 2.59 11.42 2.42 11.22 2.29C11.04 2.19 10.84 2.1 10.64 2.06C10.41 2 10.16 2 9.67 2H5.2C4.08 2 3.52 2 3.09 2.22C2.72 2.41 2.41 2.72 2.22 3.09C2 3.52 2 4.08 2 5.2ZM8.5 8C8.5 8.28 8.28 8.5 8 8.5C7.72 8.5 7.5 8.28 7.5 8C7.5 7.72 7.72 7.5 8 7.5C8.28 7.5 8.5 7.72 8.5 8Z" />
    </svg>
  )
}

/** Figma's "Icon / lock01" (11px at Figma's 1px stroke). */
function LockIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg {...icon} strokeWidth={24 / 11} {...props}>
      <path d="M17 10V8A5 5 0 0 0 7 8v2m5 4.5v2M8.8 21h6.4c1.68 0 2.52 0 3.16-.33a3 3 0 0 0 1.31-1.31c.33-.64.33-1.48.33-3.16v-1.4c0-1.68 0-2.52-.33-3.16a3 3 0 0 0-1.31-1.31C17.72 10 16.88 10 15.2 10H8.8c-1.68 0-2.52 0-3.16.33a3 3 0 0 0-1.31 1.31C4 12.28 4 13.12 4 14.8v1.4c0 1.68 0 2.52.33 3.16a3 3 0 0 0 1.31 1.31c.64.33 1.48.33 3.16.33Z" />
    </svg>
  )
}

/**
 * The centre line of Figma's dashed 1px inside stroke on a w × h box with corner radius r, as dash pieces. Measured
 * from Figma's renders: each straight side is dashed on its own, symmetric about its middle, with the first and last
 * dash centred 0.6 r from the corners and the period stretched to fit; each corner arc gets whole periods (counted on
 * its outer edge) with half a gap at each end. A CSS dashed border does neither.
 */
function dashedOutline(w: number, h: number, r: number, dash: number, gap: number) {
  const period = dash + gap
  const c = r - 0.5 // the stroke's centre line runs half a pixel inside the box
  const f = (n: number) => Math.round(n * 100) / 100
  let d = ""
  // a straight side from (x, y) along (dx, dy), `length` long
  const side = (x: number, y: number, dx: number, dy: number, length: number) => {
    if (length <= 0) return
    const margin = 0.6 * r
    const count = length - 2 * margin < 0 ? 1 : Math.max(1, Math.round((length - 2 * margin) / period) + 1)
    const step = count > 1 ? (length - 2 * margin) / (count - 1) : 0
    const piece = Math.min(length, count > 1 ? dash * (step / period) : dash)
    for (let i = 0; i < count; i++) {
      const centre = count > 1 ? margin + i * step : length / 2
      const from = Math.max(0, centre - piece / 2)
      const to = Math.min(length, centre + piece / 2)
      d += `M${f(x + dx * from)} ${f(y + dy * from)}L${f(x + dx * to)} ${f(y + dy * to)}`
    }
  }
  // a quarter arc around (cx, cy) starting at angle `start` (radians, clockwise on screen); its periods are counted on
  // the outer edge and laid out by angle, so the dashes sit at the same angles on the centre line
  const corner = (cx: number, cy: number, start: number) => {
    if (c <= 0) return
    const count = Math.max(1, Math.round(((Math.PI / 2) * r) / period))
    const step = Math.PI / 2 / count
    const piece = (dash / period) * step
    for (let i = 0; i < count; i++) {
      const a0 = start + (i + 0.5) * step - piece / 2
      const a1 = start + (i + 0.5) * step + piece / 2
      d += `M${f(cx + c * Math.cos(a0))} ${f(cy + c * Math.sin(a0))}A${f(c)} ${f(c)} 0 0 1 ${f(cx + c * Math.cos(a1))} ${f(cy + c * Math.sin(a1))}`
    }
  }
  const [x0, y0, x1, y1] = [0.5, 0.5, w - 0.5, h - 0.5]
  side(r, y0, 1, 0, w - 2 * r)
  corner(w - r, r, -Math.PI / 2)
  side(x1, r, 0, 1, h - 2 * r)
  corner(w - r, h - r, 0)
  side(w - r, y1, -1, 0, w - 2 * r)
  corner(r, h - r, Math.PI / 2)
  side(x0, h - r, 0, -1, h - 2 * r)
  corner(r, r, Math.PI)
  return d
}

/** Figma's dashed inside stroke (1px), measured from the box; `solid` draws it unbroken (dragging, an error). */
function DashedOutline({ radius, dash, gap, solid = false, className }: { radius: number; dash: number; gap: number; solid?: boolean; className?: string }) {
  const ref = React.useRef<SVGPathElement>(null)
  useIsomorphicLayoutEffect(() => {
    const path = ref.current
    const box = path?.ownerSVGElement?.parentElement
    if (!path || !box) return
    const draw = () => {
      const w = box.offsetWidth
      const h = box.offsetHeight
      const c = radius - 0.5
      path.setAttribute(
        "d",
        solid
          ? `M${radius} 0.5H${w - radius}A${c} ${c} 0 0 1 ${w - 0.5} ${radius}V${h - radius}A${c} ${c} 0 0 1 ${w - radius} ${h - 0.5}H${radius}A${c} ${c} 0 0 1 0.5 ${h - radius}V${radius}A${c} ${c} 0 0 1 ${radius} 0.5Z`
          : dashedOutline(w, h, radius, dash, gap),
      )
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(box)
    return () => observer.disconnect()
  }, [radius, dash, gap, solid])
  return (
    <svg aria-hidden className={cn("pointer-events-none absolute inset-0 size-full overflow-visible", className)}>
      <path ref={ref} fill="none" stroke="currentColor" />
    </svg>
  )
}

/** An error line under a field, in the form's red; it drops in when it appears or changes. */
function FieldError({ id, className, children }: { id?: string; className?: string; children: string }) {
  const ref = React.useRef<HTMLParagraphElement>(null)
  useIsomorphicLayoutEffect(() => {
    if (!ref.current || prefersReducedMotion()) return
    animate(ref.current, { opacity: [0, 1], y: [-4, 0], duration: 300, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [children])
  return (
    <p ref={ref} id={id} className={cn(text12, "text-form-danger", className)}>
      {children}
    </p>
  )
}

/**
 * "New product" from the Keitoto library: a cover image you drop or pick (type, size and recommended dimensions
 * checked, previewed in place), a name, a price with a currency picker and "You keep 95%", a licenses stepper, tags you
 * add and remove, a "Sell license tiers" switch that opens Personal / Team / Extended prices read from the price until
 * edited, "Save draft" with a "Draft saved 2 min ago" clock, and Publish. Animated with anime.js: the dialog rises in
 * with its fields staggered, the cover fades in, the license count rolls, tags pop in and out, the switch's thumb
 * springs and the tiers unfold, a blocked publish shakes, and publishing ends on the product's link.
 */
function NewProductForm({
  title = "New product",
  description = "Add it to your store. You can publish later.",
  defaultValues,
  currencies = sampleNewProductCurrencies,
  currency: currencyProp,
  onCurrencyChange,
  payoutShare = 0.95,
  coverTypes = ["image/png"],
  coverSize = { width: 1600, height: 1200 },
  coverMaxBytes = 10_000_000,
  maxLicenses = 9_999,
  maxTags = 5,
  tiers = sampleNewProductTiers,
  tiersLocked = false,
  onUpgrade,
  draftSavedAt,
  onSaveDraft,
  storeUrl = "mebius.design/p",
  onSubmit,
  onClose,
  autoFocus = false,
  className,
  style,
  ref,
  ...props
}: NewProductFormProps) {
  const initial = { ...defaultNewProductValues, ...defaultValues }
  const initialCurrency = currencies.find((c) => c.value === initial.currency)?.value ?? currencies[0]?.value ?? ""
  const initialDecimals = decimalsOf(currencies.find((c) => c.value === initialCurrency))
  const clampLicenses = (n: number) => Math.min(maxLicenses, Math.max(1, Math.round(n)))
  const initialTierText = () => Object.fromEntries(Object.entries(initial.tierPrices).map(([key, value]) => [key, formatAmount(value, initialDecimals)]))

  const [cover, setCover] = React.useState<File | null>(initial.cover)
  const [coverMeta, setCoverMeta] = React.useState<{ file: File; width: number; height: number } | null>(null)
  const [coverError, setCoverError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [name, setName] = React.useState(initial.name)
  const [currency, setCurrency] = useControllableState({ value: currencyProp, defaultValue: initialCurrency, onChange: onCurrencyChange })
  const [priceText, setPriceText] = React.useState(initial.price === null ? "" : formatAmount(initial.price, initialDecimals))
  const [licensesText, setLicensesText] = React.useState(String(clampLicenses(initial.licenses)))
  const [tags, setTags] = React.useState(initial.tags)
  const [tagDraft, setTagDraft] = React.useState<string | null>(null)
  const [tagError, setTagError] = React.useState<string | null>(null)
  const [tiersOn, setTiersOn] = React.useState(initial.tiers && tiers.length > 0)
  // the tier prices stay mounted while they fold away after the switch turns off
  const [tierListShown, setTierListShown] = React.useState(tiersOn)
  const [tierText, setTierText] = React.useState<Record<string, string>>(initialTierText)
  const [attempted, setAttempted] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [clockState, setClockState] = React.useState(() => {
    const now = clock()
    const savedAt = draftSavedAt === undefined ? now - 2 * MINUTE : draftSavedAt === null ? null : new Date(draftSavedAt).getTime()
    return { now, savedAt }
  })
  const [draft, setDraft] = React.useState<"idle" | "saving" | "failed">("idle")
  const [published, setPublished] = React.useState<NewProductFormValues | null>(null)
  const { status, submit, reset } = useFormSubmit(onSubmit)

  const currentCurrency = currencies.find((c) => c.value === currency) ?? currencies[0]
  const decimals = decimalsOf(currentCurrency)
  const price = parseAmount(priceText)
  const licenses = Number.parseInt(licensesText, 10)
  const tierAuto = (tier: NewProductTier) => (Number.isNaN(price) ? "" : formatAmount(price * tier.multiplier, decimals))
  const tierValue = (tier: NewProductTier) => tierText[tier.value] || tierAuto(tier)
  const coverSmall = coverMeta && coverMeta.file === cover && (coverMeta.width < coverSize.width || coverMeta.height < coverSize.height) ? coverMeta : null

  const errors = {
    cover: coverError ?? (attempted && !cover ? "Add a cover image to publish." : null),
    name: attempted ? nameProblem(name) : null,
    price: attempted ? priceProblem(priceText, currentCurrency) : null,
    licenses: attempted && (Number.isNaN(licenses) || licenses < 1 || licenses > maxLicenses) ? `Sell between 1 and ${maxLicenses.toLocaleString("en-US")} licenses.` : null,
    tiers: attempted && tiersOn ? (tiers.map((tier) => priceProblem(tierValue(tier), currentCurrency, `a ${tier.label} price`)).find(Boolean) ?? null) : null,
  }

  const titleId = React.useId()
  const descriptionId = React.useId()
  const coverId = React.useId()
  const coverLabelId = React.useId()
  const coverHintId = React.useId()
  const coverErrorId = React.useId()
  const nameId = React.useId()
  const nameErrorId = React.useId()
  const priceId = React.useId()
  const keepId = React.useId()
  const priceErrorId = React.useId()
  const licensesId = React.useId()
  const licensesErrorId = React.useId()
  const tagsLabelId = React.useId()
  const tagErrorId = React.useId()
  const tiersSwitchId = React.useId()
  const tiersDescriptionId = React.useId()
  const tiersErrorId = React.useId()
  const tierIdPrefix = React.useId()

  const rootRef = React.useRef<HTMLFormElement>(null)
  const coverInputRef = React.useRef<HTMLInputElement>(null)
  const coverImageRef = React.useRef<HTMLImageElement>(null)
  const nameRef = React.useRef<HTMLInputElement>(null)
  const priceRef = React.useRef<HTMLInputElement>(null)
  const symbolRef = React.useRef<HTMLSpanElement>(null)
  const licensesRef = React.useRef<HTMLInputElement>(null)
  const tagsRef = React.useRef<HTMLDivElement>(null)
  const tagInputRef = React.useRef<HTMLInputElement>(null)
  const addTagRef = React.useRef<HTMLButtonElement>(null)
  const thumbRef = React.useRef<HTMLSpanElement>(null)
  const tierListRef = React.useRef<HTMLDivElement>(null)
  const draftTextRef = React.useRef<HTMLParagraphElement>(null)
  const spinnerRef = React.useRef<SVGSVGElement>(null)
  const successRef = React.useRef<HTMLDivElement>(null)
  React.useImperativeHandle(ref, () => rootRef.current as HTMLFormElement)

  const reduced = useReducedMotion()

  React.useEffect(() => {
    if (autoFocus) nameRef.current?.focus({ preventScroll: true })
    // only on mount, like the autoFocus attribute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Draft saved 2 min ago" keeps counting.
  React.useEffect(() => {
    const timer = window.setInterval(() => setClockState((state) => ({ ...state, now: clock() })), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  // The picked cover: an object URL on the image (revoked when it changes), and its size once it has loaded.
  React.useEffect(() => {
    const img = coverImageRef.current
    if (!cover || !img) return
    const url = URL.createObjectURL(cover)
    img.onload = () => setCoverMeta({ file: cover, width: img.naturalWidth, height: img.naturalHeight })
    img.src = url
    return () => {
      img.onload = null
      URL.revokeObjectURL(url)
    }
  }, [cover])

  // ---- values ------------------------------------------------------------------------------------------------------

  const collect = (): NewProductFormValues => ({
    cover,
    name: name.trim(),
    price: Number.isNaN(price) ? null : Number(price.toFixed(decimals)),
    currency,
    licenses: Number.isNaN(licenses) ? 1 : clampLicenses(licenses),
    tags,
    tiers: tiersOn,
    tierPrices: tiersOn
      ? Object.fromEntries(tiers.map((tier) => [tier.value, parseAmount(tierValue(tier))]).filter(([, value]) => !Number.isNaN(value as number)))
      : {},
  })

  const edited = () => {
    setFailed(false)
    if (draft === "failed") setDraft("idle")
  }

  // ---- cover -------------------------------------------------------------------------------------------------------

  const pickCover = (file: File) => {
    edited()
    if (coverTypes.length && !coverTypes.includes(file.type)) return setCoverError(`Use a ${typesLabel(coverTypes)} image.`)
    if (file.size > coverMaxBytes) return setCoverError(`Use an image under ${formatBytes(coverMaxBytes)}.`)
    setCoverError(null)
    setCover(file)
  }

  const removeCover = () => {
    setCover(null)
    setCoverError(null)
    edited()
    requestAnimationFrame(() => coverInputRef.current?.focus())
  }

  const takesFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files")

  // ---- price, licenses ---------------------------------------------------------------------------------------------

  const changeCurrency = (next: string) => {
    const nextDecimals = decimalsOf(currencies.find((c) => c.value === next))
    // keep the amount, at the new currency's decimals
    if (!Number.isNaN(price)) setPriceText(formatAmount(price, nextDecimals))
    setTierText((current) => Object.fromEntries(Object.entries(current).map(([key, text]) => [key, Number.isNaN(parseAmount(text)) ? text : formatAmount(parseAmount(text), nextDecimals)])))
    setCurrency(next)
    edited()
  }

  const tidyAmount = (text: string) => {
    const value = parseAmount(text)
    return Number.isNaN(value) ? text : formatAmount(value, decimals)
  }

  const stepLicenses = (delta: number) => {
    const base = Number.isNaN(licenses) ? 1 : licenses
    setLicensesText(String(clampLicenses(base + delta)))
    edited()
  }

  const onLicensesKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const steps: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }
    if (event.key in steps) {
      event.preventDefault()
      stepLicenses(steps[event.key])
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      setLicensesText(String(event.key === "Home" ? 1 : maxLicenses))
      edited()
    }
  }

  // ---- tags --------------------------------------------------------------------------------------------------------

  // FLIP: where every tag is right before the list changes, so the layout effect can slide them from there.
  const tagOrigins = React.useRef<Map<string, { x: number; y: number }> | null>(null)
  const leavingTags = React.useRef(new Set<string>())
  const tagElements = () => Array.from(tagsRef.current?.querySelectorAll<HTMLElement>("[data-tag]") ?? [])
  const captureTags = () => {
    if (prefersReducedMotion()) return
    tagOrigins.current = new Map(
      tagElements().map((el) => [
        el.dataset.tag ?? "",
        { x: el.offsetLeft + Number(utils.get(el, "translateX", false) || 0), y: el.offsetTop + Number(utils.get(el, "translateY", false) || 0) },
      ]),
    )
  }

  /** Adds a typed tag: "added", "kept" (empty, or already there: that chip pulses), or "rejected" (too long, or full). */
  const addTag = (raw: string): "added" | "kept" | "rejected" => {
    const tag = raw.replace(/\s+/g, " ").trim()
    if (!tag) return "kept"
    if (tag.length > MAX_TAG) {
      setTagError(`Keep tags under ${MAX_TAG + 1} characters.`)
      return "rejected"
    }
    const existing = tags.find((other) => other.toLowerCase() === tag.toLowerCase())
    if (existing) {
      const el = tagElements().find((chip) => chip.dataset.tag === existing.toLowerCase())
      if (el && !prefersReducedMotion()) animate(el, { scale: [1, 1.1, 1], duration: 380, ease: "outQuad", onComplete: releaseStyles("transform") })
      setTagError(null)
      return "kept"
    }
    if (tags.length >= maxTags) return "rejected"
    captureTags()
    setTags([...tags, tag])
    setTagError(null)
    edited()
    return "added"
  }

  const removeTag = (tag: string, focusAfter: "input" | "add") => {
    const key = tag.toLowerCase()
    if (leavingTags.current.has(key)) return
    const commit = () => {
      leavingTags.current.delete(key)
      captureTags()
      setTags((list) => list.filter((other) => other.toLowerCase() !== key))
      edited()
      requestAnimationFrame(() => (focusAfter === "input" ? tagInputRef.current : addTagRef.current)?.focus())
    }
    const el = tagElements().find((chip) => chip.dataset.tag === key)
    if (!el || prefersReducedMotion()) return commit()
    leavingTags.current.add(key)
    animate(el, { opacity: 0, scale: 0.6, duration: 160, ease: "inQuad", onComplete: commit })
  }

  const openTagInput = () => {
    setTagDraft("")
    setTagError(null)
    requestAnimationFrame(() => tagInputRef.current?.focus())
  }

  const onTagKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const text = tagDraft ?? ""
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      const result = addTag(text)
      if (result === "rejected") return
      // full now: the field closes (and "Add" with it)
      if (result === "added" && tags.length + 1 >= maxTags) setTagDraft(null)
      else setTagDraft("")
    } else if (event.key === "Escape") {
      event.preventDefault()
      setTagDraft(null)
      setTagError(null)
      requestAnimationFrame(() => addTagRef.current?.focus())
    } else if (event.key === "Backspace" && !text && tags.length) {
      event.preventDefault()
      removeTag(tags[tags.length - 1], "input")
    }
  }

  // ---- tiers -------------------------------------------------------------------------------------------------------

  // FLIP: where the thumb is (on screen) right before the switch flips.
  const thumbOrigin = React.useRef<number | null>(null)
  const tiersWanted = React.useRef(tiersOn)
  const tierFold = React.useRef<ReturnType<typeof animate> | null>(null)
  const toggleTiers = (on: boolean) => {
    if (tiersLocked) return onUpgrade?.()
    thumbOrigin.current = thumbRef.current && !prefersReducedMotion() ? thumbRef.current.getBoundingClientRect().left : null
    tiersWanted.current = on
    tierFold.current?.cancel()
    tierFold.current = null
    setTiersOn(on)
    edited()
    const list = tierListRef.current
    if (on) {
      if (list) for (const property of ["height", "opacity", "overflow"]) list.style.removeProperty(property)
      return setTierListShown(true)
    }
    if (!list || prefersReducedMotion()) return setTierListShown(false)
    // fold the prices away, then unmount them (unless the switch went back on meanwhile)
    list.style.overflow = "hidden"
    tierFold.current = animate(list, {
      height: [list.offsetHeight, 0],
      opacity: [1, 0],
      duration: 260,
      ease: "inOutQuad",
      onComplete: () => {
        if (!tiersWanted.current) setTierListShown(false)
      },
    })
  }

  // ---- draft, publish ----------------------------------------------------------------------------------------------

  const saveDraft = async () => {
    if (draft === "saving" || status !== "idle") return
    setDraft("saving")
    try {
      await onSaveDraft?.(collect())
      const now = clock()
      setClockState({ now, savedAt: now })
      setDraft("idle")
    } catch {
      setDraft("failed")
    }
  }

  const fill = (values: NewProductFormValues, savedAt: number | null) => {
    const nextCurrency = currencies.find((c) => c.value === values.currency)?.value ?? currencies[0]?.value ?? ""
    const nextDecimals = decimalsOf(currencies.find((c) => c.value === nextCurrency))
    captureTags()
    setCover(values.cover)
    setCoverError(null)
    setName(values.name)
    setCurrency(nextCurrency)
    setPriceText(values.price === null ? "" : formatAmount(values.price, nextDecimals))
    setLicensesText(String(clampLicenses(values.licenses)))
    setTags(values.tags)
    setTagDraft(null)
    setTagError(null)
    setTiersOn(values.tiers && tiers.length > 0)
    setTierListShown(values.tiers && tiers.length > 0)
    tiersWanted.current = values.tiers && tiers.length > 0
    setTierText(Object.fromEntries(Object.entries(values.tierPrices).map(([key, value]) => [key, formatAmount(value, nextDecimals)])))
    setAttempted(false)
    setFailed(false)
    setDraft("idle")
    setClockState({ now: clock(), savedAt })
    setPublished(null)
    reset()
  }
  const restore = () => fill(initial, draftSavedAt === undefined ? clock() - 2 * MINUTE : draftSavedAt === null ? null : new Date(draftSavedAt).getTime())
  const addAnother = () => {
    fill({ ...initial, cover: null, name: "", price: null, tags: [], tiers: false, tierPrices: {} }, null)
    requestAnimationFrame(() => coverInputRef.current?.focus())
  }

  const onFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status !== "idle") return
    if (tagDraft?.trim()) {
      // a tag still being typed is added (or flagged) first
      if (addTag(tagDraft) === "rejected") return
      setTagDraft(null)
    }
    setAttempted(true)
    setFailed(false)
    const problems: [string | null, HTMLElement | null | undefined][] = [
      [coverError ?? (cover ? null : "missing"), coverInputRef.current],
      [nameProblem(name), nameRef.current],
      [priceProblem(priceText, currentCurrency), priceRef.current],
      [Number.isNaN(licenses) || licenses < 1 || licenses > maxLicenses ? "licenses" : null, licensesRef.current],
      ...tiers.map((tier, i): [string | null, HTMLElement | null] => [
        tiersOn ? priceProblem(tierValue(tier), currentCurrency) : null,
        document.getElementById(`${tierIdPrefix}-${i}`),
      ]),
    ]
    const first = problems.find(([problem]) => problem)
    if (first) {
      first[1]?.focus()
      shake(rootRef.current)
      return
    }
    const values = collect()
    setPublished(values)
    try {
      await submit(values)
    } catch {
      setFailed(true)
    }
  }

  // ---- motion ------------------------------------------------------------------------------------------------------

  // Entrance, once the dialog is in view: it rises in, the cover and the fields follow, the tags pop.
  useFormEntrance(rootRef, (timeline) => {
    const form = rootRef.current
    if (!form) return
    const all = (selector: string) => Array.from(form.querySelectorAll<HTMLElement>(selector))
    const sections = all("[data-entrance]")
    const chips = all("[data-tag], [data-slot='new-product-form-add-tag']")
    const coverMark = all("[data-slot='new-product-form-cover-mark']")
    timeline.add(form, { opacity: { from: 0 }, y: { from: 16 }, scale: { from: 0.98 }, duration: 700, ease: "outExpo" })
    if (sections.length) timeline.add(sections, { opacity: { from: 0 }, y: { from: 10 }, duration: 600, ease: "outExpo", delay: stagger(60) }, 100)
    if (coverMark.length) timeline.add(coverMark, { opacity: { from: 0 }, y: { from: 6 }, scale: { from: 0.8 }, duration: 600, ease: "outBack(1.8)" }, 300)
    if (chips.length) timeline.add(chips, { opacity: { from: 0 }, scale: { from: 0.7 }, duration: 520, ease: "outBack(1.7)", delay: stagger(60) }, 420)
  })

  // Tags: new ones pop in, the others slide from where they were (FLIP).
  useIsomorphicLayoutEffect(() => {
    const origins = tagOrigins.current
    tagOrigins.current = null
    if (!origins || reduced) return
    for (const el of tagElements()) {
      const from = origins.get(el.dataset.tag ?? "")
      if (!from) {
        animate(el, { opacity: [0, 1], scale: [0.6, 1], duration: 380, ease: "outBack(2)", onComplete: releaseStyles("opacity", "transform") })
        continue
      }
      const dx = from.x - el.offsetLeft
      const dy = from.y - el.offsetTop
      if (dx || dy) animate(el, { x: [dx, 0], y: [dy, 0], duration: 450, ease: "outExpo", onComplete: releaseStyles("transform") })
    }
  }, [tags, reduced])

  // The cover fades in when it's picked.
  useIsomorphicLayoutEffect(() => {
    const img = coverImageRef.current
    if (reduced || !cover || !img) return
    animate(img, { opacity: [0, 1], scale: [1.06, 1], duration: 600, ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
  }, [cover, reduced])

  // The currency sign slides in when it changes; the license count rolls.
  const lastSymbol = React.useRef(currentCurrency?.symbol)
  useIsomorphicLayoutEffect(() => {
    const previous = lastSymbol.current
    lastSymbol.current = currentCurrency?.symbol
    if (reduced || previous === currentCurrency?.symbol || !symbolRef.current) return
    animate(symbolRef.current, { opacity: [0, 1], y: [6, 0], duration: 320, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [currentCurrency?.symbol, reduced])

  const lastLicenses = React.useRef(licensesText)
  useIsomorphicLayoutEffect(() => {
    const previous = Number.parseInt(lastLicenses.current, 10)
    lastLicenses.current = licensesText
    const el = licensesRef.current
    if (reduced || !el || Number.isNaN(previous) || Number.isNaN(licenses) || previous === licenses || document.activeElement === el) return
    animate(el, { y: [licenses > previous ? 6 : -6, 0], opacity: [0.2, 1], duration: 260, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [licensesText, reduced])

  // The switch: the thumb springs across from where it was (FLIP over its class), the tier prices unfold.
  useIsomorphicLayoutEffect(() => {
    const from = thumbOrigin.current
    thumbOrigin.current = null
    const thumb = thumbRef.current
    if (reduced || from === null || !thumb) return
    thumb.style.removeProperty("transform")
    const box = thumb.getBoundingClientRect()
    // on-screen pixels to the thumb's own (the form may sit under a CSS zoom or scale)
    const dx = (from - box.left) / (box.width / thumb.offsetWidth || 1)
    if (dx) animate(thumb, { x: [dx, 0], scaleX: [1.3, 1], duration: 440, ease: "outBack(1.6)", onComplete: releaseStyles("transform") })
    const list = tierListRef.current
    if (tiersOn && list) {
      list.style.overflow = "hidden"
      animate(list, { height: [0, list.offsetHeight], opacity: [0, 1], duration: 360, ease: "outQuad", onComplete: releaseStyles("height", "opacity", "overflow") })
      const fields = Array.from(list.querySelectorAll<HTMLElement>("[data-tier]"))
      if (fields.length) animate(fields, { opacity: [0, 1], y: [6, 0], duration: 420, delay: stagger(60, { start: 80 }), ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
    }
  }, [tiersOn, reduced])

  // The footer's draft line crossfades when it changes.
  const draftText =
    status === "success"
      ? "Published just now"
      : draft === "saving"
        ? "Saving draft…"
        : draft === "failed"
          ? "Couldn't save the draft. Try again."
          : clockState.savedAt === null
            ? "Not saved yet"
            : savedLabel(clockState.savedAt, clockState.now)
  const lastDraftText = React.useRef(draftText)
  useIsomorphicLayoutEffect(() => {
    const previous = lastDraftText.current
    lastDraftText.current = draftText
    if (reduced || previous === draftText || !draftTextRef.current) return
    animate(draftTextRef.current, { opacity: [0, 1], y: [4, 0], duration: 300, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [draftText, reduced])

  // Publishing spins the loader; success brings the confirmation in and draws its check.
  useIsomorphicLayoutEffect(() => {
    if (reduced) return
    if (status === "submitting" && spinnerRef.current) {
      const spin = animate(spinnerRef.current, { rotate: [0, 360], duration: 800, ease: "linear", loop: true })
      return () => {
        spin.revert()
      }
    }
    const panel = successRef.current
    if (status === "success" && panel) {
      animate(panel.querySelector("[data-success-icon]") ?? panel, { scale: [0.5, 1], opacity: [0, 1], duration: 520, ease: "outBack(1.8)", onComplete: releaseStyles("opacity", "transform") })
      const check = panel.querySelector("[data-success-icon] path")
      if (check) animate(svg.createDrawable(check), { draw: ["0 0", "0 1"], duration: 450, delay: 180, ease: "outQuad" })
      const parts = Array.from(panel.querySelectorAll<HTMLElement>("[data-success-part]"))
      if (parts.length) animate(parts, { opacity: [0, 1], y: [8, 0], duration: 500, delay: stagger(80, { start: 120 }), ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
    }
  }, [status, reduced])

  // ---- render ------------------------------------------------------------------------------------------------------

  const publishing = status === "submitting"
  const success = status === "success"
  const keepPercent = Math.round(payoutShare * 100)
  const statusText = publishing ? "Publishing…" : success && published ? `${published.name} is published.` : draft === "saving" ? "Saving draft…" : ""
  const publishedCurrency = currencies.find((c) => c.value === published?.currency)
  const describedBy = (...ids: (string | false | null | undefined)[]) => ids.filter(Boolean).join(" ") || undefined

  return (
    <form
      ref={rootRef}
      noValidate
      data-slot="new-product-form"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={publishing || undefined}
      onSubmit={onFormSubmit}
      className={cn(
        "@container/product flex w-full max-w-[540px] flex-col overflow-hidden rounded-2xl border border-form-border bg-form-surface font-form-geist text-form-text antialiased shadow-[0_24px_54px_-12px_var(--product-shadow)] scheme-light dark:scheme-dark",
        className,
      )}
      style={{ ...palette, ...style }}
      {...props}
    >
      <div data-slot="new-product-form-header" data-entrance className="flex items-start gap-3 pt-[22px] pr-5 pb-1 pl-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={titleId} className="text-base leading-6 font-semibold tracking-[-0.16px]">
            {title}
          </h2>
          <p id={descriptionId} className={cn(text13, "max-w-[340px] text-form-text-2")}>
            {description}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => (onClose ?? restore)()}
          className={cn("relative size-[18px] shrink-0 rounded-[5px] text-form-text-3 transition-colors duration-200 before:absolute before:-inset-1.5 hover:text-form-text-2", focusRing)}
        >
          <XIcon aria-hidden className="size-[18px]" strokeWidth={1.875} />
        </button>
      </div>

      <div className="relative">
        <div inert={status !== "idle"} className={cn("flex flex-col", success && "invisible")}>
          <div data-slot="new-product-form-body" className="flex gap-5 px-6 pt-5 pb-6 @max-[500px]/product:flex-col">
            <div data-slot="new-product-form-cover-field" data-entrance className="flex w-[168px] shrink-0 flex-col gap-2 @max-[500px]/product:w-full">
              <span id={coverLabelId} className={cn(text13, "font-medium")}>
                Cover
              </span>
              <div className="relative">
                <input
                  ref={coverInputRef}
                  id={coverId}
                  type="file"
                  accept={coverTypes.join(",")}
                  className="peer sr-only"
                  aria-labelledby={coverLabelId}
                  aria-describedby={describedBy(coverHintId, errors.cover && coverErrorId)}
                  aria-invalid={errors.cover ? true : undefined}
                  onChange={(event) => {
                    const picked = event.target.files?.[0]
                    event.target.value = "" // picking the same file again still counts
                    if (picked) pickCover(picked)
                  }}
                />
                <label
                  htmlFor={coverId}
                  data-slot="new-product-form-cover"
                  data-dragging={dragging || undefined}
                  data-invalid={errors.cover ? true : undefined}
                  onDragEnter={(event) => {
                    if (!takesFiles(event)) return
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragOver={(event) => {
                    if (!takesFiles(event)) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = "copy"
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    const dropped = event.dataTransfer.files[0]
                    if (dropped) pickCover(dropped)
                  }}
                  className="group/cover relative flex h-[168px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl bg-form-surface-2 text-form-text-2 transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-form-accent hover:bg-form-surface-3 data-dragging:bg-form-accent-soft"
                >
                  {cover ? (
                    // the object URL is set by an effect; it stays decorative (the field's name says what it is)
                    <img ref={coverImageRef} alt="" className="absolute inset-0 size-full rounded-xl object-cover" />
                  ) : (
                    <span data-slot="new-product-form-cover-mark" className="flex flex-col items-center gap-2">
                      <ImagePlusIcon aria-hidden className="size-[22px] transition-transform duration-200 group-data-dragging/cover:-translate-y-0.5" />
                      <span className={cn(text13, "font-medium")}>{dragging ? "Drop it here" : "Drop image"}</span>
                    </span>
                  )}
                  {!cover && (
                    <span id={coverHintId} className={cn(text11, "text-form-text-3")}>
                      {typesLabel(coverTypes)}, {coverSize.width} × {coverSize.height}
                    </span>
                  )}
                  <DashedOutline
                    radius={12}
                    dash={5}
                    gap={4}
                    solid={dragging || Boolean(errors.cover)}
                    className={cn(
                      "transition-colors duration-200",
                      errors.cover ? "text-form-danger" : dragging ? "text-form-accent" : cover ? "text-transparent" : "text-form-border-strong",
                    )}
                  />
                </label>
                {cover && (
                  <button
                    type="button"
                    aria-label="Remove cover"
                    onClick={removeCover}
                    className={cn(
                      "absolute top-2 right-2 flex size-6 items-center justify-center rounded-[7px] bg-form-surface/85 text-form-text-2 backdrop-blur-sm transition-colors duration-200 hover:text-form-text",
                      focusRing,
                    )}
                  >
                    <XIcon aria-hidden className="size-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
              {cover && (
                <p id={coverHintId} className={cn(text11, "flex min-w-0 gap-1 text-form-text-3")}>
                  <span className="truncate">{cover.name}</span>
                  {coverMeta?.file === cover && (
                    <span className="shrink-0">· {dimensions(coverMeta.width, coverMeta.height)}</span>
                  )}
                </p>
              )}
              {errors.cover ? (
                <FieldError id={coverErrorId}>{errors.cover}</FieldError>
              ) : (
                coverSmall && (
                  <p className={cn(text12, "text-form-warning")}>
                    {dimensions(coverSmall.width, coverSmall.height)} is small: {dimensions(coverSize.width, coverSize.height)} looks sharp.
                  </p>
                )
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div data-slot="new-product-form-name" data-entrance className="flex flex-col gap-2">
                <label htmlFor={nameId} className={cn(text13, "self-start font-medium")}>
                  Name
                </label>
                <input
                  ref={nameRef}
                  id={nameId}
                  type="text"
                  autoComplete="off"
                  placeholder="What are you selling?"
                  value={name}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={describedBy(errors.name && nameErrorId)}
                  onChange={(event) => {
                    setName(event.target.value)
                    edited()
                  }}
                  className={cn(
                    text13,
                    "h-10 w-full rounded-[10px] border border-form-border-strong bg-form-surface-2 px-3 text-form-text outline-none transition-colors duration-200 placeholder:text-form-text-3 focus:border-form-accent aria-invalid:border-form-danger",
                  )}
                />
                {errors.name && (
                  <FieldError id={nameErrorId}>{errors.name}</FieldError>
                )}
              </div>

              <div data-slot="new-product-form-price-field" data-entrance className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={priceId} className={cn(text13, "font-medium")}>
                    Price
                  </label>
                  <span id={keepId} className={cn(text12, hug, "text-form-text-3")}>
                    You keep {keepPercent}%
                    {!Number.isNaN(price) && <span className="sr-only">, {formatMoney(price * payoutShare, currentCurrency)} a sale</span>}
                  </span>
                </div>
                <div
                  data-slot="new-product-form-price"
                  data-invalid={errors.price ? true : undefined}
                  className="flex h-10 overflow-hidden rounded-[10px] border border-form-border-strong transition-colors duration-200 focus-within:border-form-accent has-[[data-state=open]]:border-form-accent data-invalid:border-form-danger"
                >
                  <span aria-hidden className={cn(text13, "flex shrink-0 items-center bg-form-surface-3 px-3 text-form-text-2")}>
                    <span ref={symbolRef} className={hug}>
                      {currentCurrency?.symbol}
                    </span>
                  </span>
                  <input
                    ref={priceRef}
                    id={priceId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={formatAmount(0, decimals)}
                    value={priceText}
                    aria-invalid={errors.price ? true : undefined}
                    aria-describedby={describedBy(keepId, errors.price && priceErrorId)}
                    onChange={(event) => {
                      setPriceText(event.target.value.replace(/[^\d.,]/g, ""))
                      edited()
                    }}
                    onBlur={() => setPriceText(tidyAmount(priceText))}
                    className={cn(mono13, "min-w-0 flex-1 bg-form-surface-2 px-3 text-form-text outline-none placeholder:text-form-text-3")}
                  />
                  <SelectPrimitive.Root value={currency} onValueChange={changeCurrency}>
                    <SelectPrimitive.Trigger
                      aria-label={`Currency: ${currency}`}
                      className={cn(
                        text12,
                        "flex shrink-0 cursor-pointer items-center gap-1 bg-form-surface-2 px-2.5 text-form-text-2 outline-none transition-colors duration-200 hover:text-form-text focus-visible:bg-form-surface-3 focus-visible:text-form-text data-[state=open]:text-form-text",
                      )}
                    >
                      <SelectPrimitive.Value>{currency}</SelectPrimitive.Value>
                      <ChevronDownIcon aria-hidden className="size-3.5 text-form-text-3" strokeWidth={1.875} />
                    </SelectPrimitive.Trigger>
                    <SelectPrimitive.Portal>
                      <SelectPrimitive.Content position="popper" align="end" sideOffset={7} alignOffset={-1} className={cn(menuContent, "min-w-36")} style={palette}>
                        <SelectPrimitive.Viewport className="p-1">
                          {currencies.map((option) => (
                            <SelectPrimitive.Item key={option.value} value={option.value} className={menuItem}>
                              <span className="w-5 shrink-0 text-form-text-3">{option.symbol}</span>
                              <SelectPrimitive.ItemText>{option.value}</SelectPrimitive.ItemText>
                              <SelectPrimitive.ItemIndicator className="absolute right-2 flex">
                                <CheckIcon aria-hidden className="size-3.5 text-form-accent" strokeWidth={2.25} />
                              </SelectPrimitive.ItemIndicator>
                            </SelectPrimitive.Item>
                          ))}
                        </SelectPrimitive.Viewport>
                      </SelectPrimitive.Content>
                    </SelectPrimitive.Portal>
                  </SelectPrimitive.Root>
                </div>
                {errors.price && (
                  <FieldError id={priceErrorId}>{errors.price}</FieldError>
                )}
              </div>

              <div data-slot="new-product-form-licenses" data-entrance className="flex flex-col gap-2">
                <label htmlFor={licensesId} className={cn(text13, "self-start font-medium")}>
                  Licenses available
                </label>
                <div
                  data-invalid={errors.licenses ? true : undefined}
                  className="flex h-10 w-[140px] overflow-hidden rounded-[10px] border border-form-border-strong transition-colors duration-200 has-[input:focus]:border-form-accent data-invalid:border-form-danger"
                >
                  <button
                    type="button"
                    aria-label="Fewer licenses"
                    aria-controls={licensesId}
                    disabled={!Number.isNaN(licenses) && licenses <= 1}
                    onClick={() => stepLicenses(-1)}
                    className="flex w-10 shrink-0 cursor-pointer items-center justify-center bg-form-surface-2 text-form-text-2 outline-none transition-colors duration-200 hover:bg-form-surface-3 hover:text-form-text focus-visible:ring-2 focus-visible:ring-form-accent focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-form-surface-2"
                  >
                    <MinusIcon aria-hidden className="size-3.5" strokeWidth={1.875} />
                  </button>
                  <input
                    ref={licensesRef}
                    id={licensesId}
                    type="text"
                    role="spinbutton"
                    inputMode="numeric"
                    autoComplete="off"
                    value={licensesText}
                    aria-valuemin={1}
                    aria-valuemax={maxLicenses}
                    aria-valuenow={Number.isNaN(licenses) ? undefined : licenses}
                    aria-invalid={errors.licenses ? true : undefined}
                    aria-describedby={describedBy(errors.licenses && licensesErrorId)}
                    onChange={(event) => {
                      setLicensesText(event.target.value.replace(/\D/g, "").slice(0, String(maxLicenses).length))
                      edited()
                    }}
                    onBlur={() => !Number.isNaN(licenses) && setLicensesText(String(clampLicenses(licenses)))}
                    onKeyDown={onLicensesKeyDown}
                    className={cn(mono13, "w-full min-w-0 flex-1 bg-form-surface text-center font-medium text-form-text outline-none")}
                  />
                  <button
                    type="button"
                    aria-label="More licenses"
                    aria-controls={licensesId}
                    disabled={!Number.isNaN(licenses) && licenses >= maxLicenses}
                    onClick={() => stepLicenses(1)}
                    className="flex w-10 shrink-0 cursor-pointer items-center justify-center bg-form-surface-2 text-form-text-2 outline-none transition-colors duration-200 hover:bg-form-surface-3 hover:text-form-text focus-visible:ring-2 focus-visible:ring-form-accent focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-form-surface-2"
                  >
                    <PlusIcon aria-hidden className="size-3.5" strokeWidth={1.875} />
                  </button>
                </div>
                {errors.licenses && (
                  <FieldError id={licensesErrorId}>{errors.licenses}</FieldError>
                )}
              </div>

              <div data-slot="new-product-form-tags" data-entrance className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span id={tagsLabelId} className={cn(text13, "font-medium")}>
                    Tags
                  </span>
                  {tags.length >= maxTags && <span className={cn(text12, hug, "text-form-text-3")}>Up to {maxTags}</span>}
                </div>
                <div ref={tagsRef} role="group" aria-labelledby={tagsLabelId} className="flex flex-wrap items-start gap-1.5">
                  <ul role="list" aria-label="Tags" className="contents">
                    {tags.map((tag) => (
                      <li
                        key={tag.toLowerCase()}
                        data-tag={tag.toLowerCase()}
                        className={cn(text12, "group/tag relative flex h-6 max-w-full min-w-0 items-center rounded-[6px] bg-form-surface-3 px-2 text-form-text")}
                      >
                        <span className={cn("truncate", hug)}>{tag}</span>
                        {/* over the chip's end, so chips keep Figma's width until hovered or focused */}
                        <button
                          type="button"
                          aria-label={`Remove ${tag}`}
                          onClick={() => removeTag(tag, "add")}
                          className="absolute inset-y-0 right-0 flex cursor-pointer items-center rounded-r-[6px] bg-linear-to-l from-form-surface-3 from-55% to-transparent pr-1.5 pl-4 text-form-text-2 opacity-0 outline-none transition-opacity duration-150 group-hover/tag:opacity-100 hover:text-form-text focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-form-accent"
                        >
                          <XIcon aria-hidden className="size-3" strokeWidth={2} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {tagDraft !== null ? (
                    <input
                      ref={tagInputRef}
                      type="text"
                      aria-label="New tag"
                      aria-invalid={tagError ? true : undefined}
                      aria-describedby={describedBy(tagError && tagErrorId)}
                      enterKeyHint="enter"
                      autoComplete="off"
                      value={tagDraft}
                      placeholder="Tag"
                      onChange={(event) => {
                        setTagDraft(event.target.value)
                        setTagError(null)
                      }}
                      onKeyDown={onTagKeyDown}
                      onBlur={() => {
                        if (tagDraft.trim() && addTag(tagDraft) === "rejected") return
                        setTagDraft(null)
                      }}
                      className={cn(
                        text12,
                        "h-[26px] max-w-40 min-w-16 rounded-[6px] border border-form-accent bg-form-surface-2 px-2 text-form-text outline-none [field-sizing:content] placeholder:text-form-text-3 aria-invalid:border-form-danger",
                      )}
                    />
                  ) : (
                    tags.length < maxTags && (
                      <button
                        ref={addTagRef}
                        type="button"
                        data-slot="new-product-form-add-tag"
                        onClick={openTagInput}
                        className={cn(
                          text12,
                          "relative flex h-[26px] cursor-pointer items-center gap-1 rounded-[6px] px-[9px] text-form-text-3 transition-colors duration-200 hover:text-form-text-2",
                          focusRing,
                        )}
                      >
                        <DashedOutline radius={6} dash={3} gap={3} className="text-form-border-strong" />
                        <PlusIcon aria-hidden className="size-3" strokeWidth={2} />
                        <span className={hug}>Add</span>
                      </button>
                    )
                  )}
                </div>
                {tagError && (
                  <FieldError id={tagErrorId}>{tagError}</FieldError>
                )}
              </div>
            </div>
          </div>

          {tiers.length > 0 && (
            <div data-slot="new-product-form-tiers-field" data-entrance className="px-6 pb-5">
              <div data-slot="new-product-form-tiers" className="flex flex-col rounded-xl bg-form-pro-soft">
                <div className="flex items-center gap-3 px-3.5 py-3">
                  <TagIcon aria-hidden className="size-4 shrink-0 text-form-pro" />
                  <div className="flex min-w-0 flex-1 flex-col gap-px">
                    <label htmlFor={tiersSwitchId} className={cn(text13, "cursor-pointer self-start font-medium")}>
                      Sell license tiers
                    </label>
                    <p id={tiersDescriptionId} className={cn(text12, "text-form-text-2")}>
                      {listLabels(tiers.map((tier) => tier.label))} prices on one product.
                    </p>
                  </div>
                  <span className={cn(text11, "flex shrink-0 items-center gap-1 rounded-[5px] bg-form-surface px-1.5 py-0.5 font-medium text-(--product-pro-ink)")}>
                    <LockIcon aria-hidden className="size-[11px] text-form-pro" />
                    <span className={hug}>Pro</span>
                  </span>
                  <SwitchPrimitive.Root
                    id={tiersSwitchId}
                    checked={tiersOn}
                    onCheckedChange={toggleTiers}
                    aria-describedby={tiersDescriptionId}
                    className={cn(
                      "inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-form-border-strong bg-form-surface-3 transition-colors duration-200 data-[state=checked]:border-form-accent data-[state=checked]:bg-form-accent",
                      focusRing,
                    )}
                  >
                    <SwitchPrimitive.Thumb
                      ref={thumbRef}
                      className="block size-3.5 translate-x-px rounded-full bg-form-text-3 transition-colors duration-200 data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-form-on-accent"
                    />
                  </SwitchPrimitive.Root>
                </div>
                {tierListShown && (
                  <div ref={tierListRef} data-slot="new-product-form-tier-list" inert={!tiersOn} className="flex flex-col">
                    <div className="grid grid-cols-3 gap-2 border-t border-form-pro/15 px-3.5 pt-3 pb-3.5 @max-[440px]/product:grid-cols-1">
                      {tiers.map((tier, i) => (
                        <div key={tier.value} data-tier className="flex min-w-0 flex-col gap-1.5">
                          <label htmlFor={`${tierIdPrefix}-${i}`} className={cn(text12, "flex items-baseline justify-between gap-2 text-form-text-2")}>
                            <span className="truncate">{tier.label}</span>
                            {tierText[tier.value] === undefined && tier.multiplier !== 1 && <span className="shrink-0 text-form-text-3">×{tier.multiplier}</span>}
                          </label>
                          <div className="flex h-8 overflow-hidden rounded-[8px] border border-form-border-strong bg-form-surface-2 transition-colors duration-200 focus-within:border-form-accent">
                            <span aria-hidden className={cn(text12, "flex shrink-0 items-center pl-2.5 text-form-text-3")}>
                              {currentCurrency?.symbol}
                            </span>
                            <input
                              id={`${tierIdPrefix}-${i}`}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              value={tierText[tier.value] ?? tierAuto(tier)}
                              placeholder={tierAuto(tier)}
                              aria-describedby={describedBy(errors.tiers && tiersErrorId)}
                              onChange={(event) => {
                                setTierText({ ...tierText, [tier.value]: event.target.value.replace(/[^\d.,]/g, "") })
                                edited()
                              }}
                              onBlur={() => {
                                const text = tierText[tier.value]
                                if (text === undefined) return
                                // emptied: back to following the price
                                const { [tier.value]: _, ...rest } = tierText
                                setTierText(text.trim() ? { ...tierText, [tier.value]: tidyAmount(text) } : rest)
                              }}
                              className={cn("min-w-0 flex-1 bg-transparent pr-2.5 pl-1 font-form-geist-mono text-xs leading-4 text-form-text outline-none")}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {errors.tiers && (
                      <FieldError id={tiersErrorId} className="-mt-1.5 px-3.5 pb-3">
                        {errors.tiers}
                      </FieldError>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {failed && (
            <p role="alert" className={cn(text12, "-mt-2 px-6 pb-4 text-form-danger")}>
              Couldn&apos;t publish the product. Try again.
            </p>
          )}
        </div>

        {success && published && (
          <div ref={successRef} data-slot="new-product-form-success" className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <span data-success-icon className="flex size-10 items-center justify-center rounded-full bg-form-success-soft text-form-success">
              <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="size-5">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <div className="flex flex-col items-center gap-1">
              <p data-success-part className="text-base leading-6 font-semibold tracking-[-0.16px] text-balance">
                {published.name} is live
              </p>
              <p data-success-part className={cn(text13, "max-w-[380px] text-balance text-form-text-2")}>
                {formatMoney(published.price ?? 0, publishedCurrency)}
                {published.tiers ? ` and up, in ${tiers.length} tiers,` : ""} with {published.licenses.toLocaleString("en-US")} license
                {published.licenses === 1 ? "" : "s"}. You keep {formatMoney((published.price ?? 0) * payoutShare, publishedCurrency)} a sale.
              </p>
            </div>
            <span data-success-part className={cn("max-w-full truncate rounded-[10px] border border-form-border-strong bg-form-surface-2 px-2.5 py-1.5 font-form-geist-mono text-xs leading-4 text-form-text")}>
              {storeUrl}/{slugify(published.name) || "product"}
            </span>
          </div>
        )}
      </div>

      <div
        data-slot="new-product-form-footer"
        data-entrance
        className="flex flex-wrap items-center gap-2 border-t border-form-border py-3.5 pr-5 pl-6 @max-[440px]/product:gap-y-3"
      >
        <p ref={draftTextRef} className={cn(text12, "min-w-0 flex-1 @max-[440px]/product:basis-full", draft === "failed" ? "text-form-danger" : "text-form-text-3")}>
          {draftText}
        </p>
        {success ? (
          <>
            {onClose && (
              <button key="success-1"
                type="button"
                onClick={onClose}
                className={cn(text13, "inline-flex h-9 items-center justify-center rounded-[10px] px-3.5 font-medium text-form-text-2 transition-colors duration-200 hover:bg-form-surface-2 hover:text-form-text @max-[440px]/product:ml-auto", focusRing)}
              >
                Done
              </button>
            )}
            <button key="success-2"
              type="button"
              onClick={addAnother}
              className={cn(
                text13,
                "inline-flex h-9 items-center justify-center rounded-[10px] bg-form-inverse px-3.5 font-medium text-form-on-inverse transition-colors duration-200 hover:bg-form-inverse/90",
                !onClose && "@max-[440px]/product:ml-auto",
                focusRing,
              )}
            >
              Add another
            </button>
          </>
        ) : (
          <>
            <button key="idle-1"
              type="button"
              data-slot="new-product-form-save-draft"
              disabled={publishing || draft === "saving"}
              onClick={saveDraft}
              className={cn(
                text13,
                "inline-flex h-9 items-center justify-center rounded-[10px] px-3.5 font-medium text-form-text-2 transition-colors duration-200 hover:bg-form-surface-2 hover:text-form-text disabled:pointer-events-none disabled:opacity-50 @max-[440px]/product:ml-auto",
                focusRing,
              )}
            >
              <span className={hug}>Save draft</span>
            </button>
            <button key="idle-2"
              type="submit"
              data-slot="new-product-form-submit"
              disabled={publishing}
              className={cn(
                text13,
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-form-inverse px-3.5 font-medium text-form-on-inverse transition-colors duration-200 hover:bg-form-inverse/90 disabled:cursor-wait",
                focusRing,
              )}
            >
              {publishing ? (
                <>
                  <LoaderCircleIcon ref={spinnerRef} aria-hidden className="size-3.5" strokeWidth={2.25} />
                  Publishing…
                </>
              ) : (
                <>
                  <span className={hug}>Publish</span>
                  <kbd
                    aria-hidden
                    className="hug-w rounded-[4px] border border-form-on-inverse/18 bg-form-on-inverse/10 px-[5px] py-px font-form-geist-mono text-[10px] leading-[13px] font-medium text-form-on-inverse/70"
                  >
                    Enter
                  </kbd>
                </>
              )}
            </button>
          </>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {statusText}
      </p>
    </form>
  )
}

export {
  NewProductForm,
  sampleNewProductCurrencies,
  sampleNewProductTiers,
  sampleNewProductValues,
  type NewProductCurrency,
  type NewProductFormProps,
  type NewProductFormValues,
  type NewProductTier,
}
