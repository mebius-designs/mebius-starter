"use client"

import { animate, stagger, steps, type AnimationParams } from "animejs"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import * as React from "react"

import { useControllableState } from "@/hooks/use-controllable-state"
import { releaseStyles, shake, useCountUp, useFormEntrance, useInView, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-form-motion"
import { useFormSubmit } from "@/hooks/use-form-submit"
import { cn } from "@/lib/utils"

/** One line of the order: a square swatch, the name and the price. */
type PixelCheckoutItem = {
  id: string
  name: string
  /** In the currency `formatPrice` writes (dollars by default). */
  price: number
  /** The swatch's CSS colour. */
  color: string
}

/** The optional extra under the card fields (Figma's PRO pass): a toggle that adds its price to the total. */
type PixelCheckoutAddOn = {
  label: string
  price: number
}

type PixelCheckoutFormValues = {
  /** The card number's digits, without spaces ("4242424242424242"). */
  cardNumber: string
  /** "MM/YY" */
  expiry: string
  cvc: string
  /** Whether the add-on is in the order. */
  addOn: boolean
  /** What the order costs: the items, plus the add-on when it's in. Read from the order, not taken from `defaultValues`. */
  total: number
}

type PixelCheckoutFormDefaults = Omit<PixelCheckoutFormValues, "total">

/** The field labels and the pay bar's words (Figma's, in capitals). */
type PixelCheckoutFormLabels = {
  cardNumber: string
  expiry: string
  cvc: string
  /** Before the amount: "PAY $80". */
  pay: string
  /** The pay bar once paid. */
  done: string
}

type PixelCheckoutFormProps = Omit<React.ComponentProps<"form">, "onSubmit" | "children" | "defaultValue" | "title"> & {
  title?: string
  /** The header's "2/3": this step and the number of steps. Paid, it shows the next step. */
  step?: number
  steps?: number
  /** The order's lines. The total is read from them. */
  items?: PixelCheckoutItem[]
  /** The extra the buyer can add; null leaves the row out. */
  addOn?: PixelCheckoutAddOn | null
  /**
   * Starting values, merged over an empty card (the number, expiry and CVC on their placeholders) with the add-on off;
   * `samplePixelCheckoutValues` is the filled Figma sample (the 4242 test card, 12/28).
   */
  defaultValues?: Partial<PixelCheckoutFormDefaults>
  /** Whether the add-on is in, to control it (pair with `onAddOnChange`). */
  addOnSelected?: boolean
  onAddOnChange?: (selected: boolean) => void
  /** Called with the card and the total once every field is valid. Return a promise to show the paying state; a rejection keeps the form and says the payment didn't go through. */
  onSubmit?: (values: PixelCheckoutFormValues) => void | Promise<void>
  /** Writes an amount ("$80"). */
  formatPrice?: (amount: number) => string
  labels?: Partial<PixelCheckoutFormLabels>
  /** The heading of the receipt shown once paid. */
  successTitle?: string
  /** The line under it; by default the amount and the card's last four digits. */
  successDescription?: (values: PixelCheckoutFormValues) => React.ReactNode
  /** Called by the pay bar's "DONE" once paid. Without it, DONE brings the checkout back. */
  onDone?: () => void
}

type FieldName = "cardNumber" | "expiry" | "cvc"
type FieldErrors = Partial<Record<FieldName, string>>

// The checkout's raw Figma colours by role, light and dark ("Stage / 08 Pixel checkout" light 2713:19891, dark
// 1891:92534): light-dark(light, dark), so the form follows your app's dark class (it sets its own color-scheme from it).
// Override any of them through `style` to re-skin.
const palette = {
  "--px-panel": "light-dark(#dfdef0, #15142a)",
  "--px-edge": "#3b3770", // the frame's, the fields' and the rule's strokes
  "--px-accent": "#6c63ff", // the header and the dither band
  "--px-on-accent": "#f1eee6", // the header's text and the band's scan while paying
  "--px-shadow": "light-dark(#1c1d21, #6c63ff)", // the hard 8px shadow
  "--px-field": "light-dark(#ebeaf6, #0e0d1f)",
  "--px-ink": "light-dark(#211d12, #f1eee6)",
  "--px-muted": "light-dark(#615c75, #8f8aa3)",
  "--px-gold": "#ffd166", // the add-on's edge and the pay bar
  "--px-gold-ink": "light-dark(#a0740d, #ffd166)", // gold as text: prices, the add-on's star and price, the focus outlines
  "--px-pass": "light-dark(#d0cee8, #1e1c3a)", // the add-on's row
  "--px-on-gold": "#15142a",
  // not in Figma: the paid receipt and errors (light: the green and red the series' light frames give these darks)
  "--px-success": "light-dark(#1d903a, #7be495)",
  "--px-danger": "light-dark(#d01111, #ff6b6b)",
} as React.CSSProperties

const samplePixelCheckoutItems: PixelCheckoutItem[] = [
  { id: "fleet-ui-kit", name: "Fleet UI kit", price: 49, color: "#ff6b9a" },
  { id: "loader-pack", name: "Loader pack", price: 19, color: "#7ce0ff" },
  { id: "8-bit-icon-set", name: "8-bit icon set", price: 12, color: "#ffd166" },
]

const samplePixelCheckoutAddOn: PixelCheckoutAddOn = { label: "Add PRO pass, all future kits", price: 29 }

// Stripe's test Visa, as drawn; any future expiry and any CVC pass with it.
const samplePixelCheckoutValues: PixelCheckoutFormDefaults = {
  cardNumber: "4242424242424242",
  expiry: "12/28",
  cvc: "424",
  addOn: false,
}

// What the checkout opens with: the card number, expiry and CVC empty (their placeholders show), Figma's add-on off.
const defaultPixelCheckoutValues: PixelCheckoutFormDefaults = { ...samplePixelCheckoutValues, cardNumber: "", expiry: "", cvc: "" }

const defaultLabels: PixelCheckoutFormLabels = { cardNumber: "CARD", expiry: "EXP", cvc: "CVC", pay: "PAY", done: "DONE" }

const FIELD_ORDER: FieldName[] = ["cardNumber", "expiry", "cvc"]

/** "$80", "$12.50" */
const defaultFormatPrice = (amount: number) => `$${Number.isInteger(Math.round(amount * 100) / 100) ? Math.round(amount) : amount.toFixed(2)}`

/** Groups of four: "4242 4242 4242 4242". */
const formatCardNumber = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, "$1 ")

/** "1228" → "12/28"; a first digit above 1 is a month on its own ("4" → "04"). */
function formatExpiry(text: string) {
  let digits = text.replace(/\D/g, "").slice(0, 4)
  if (digits.length === 1 && Number(digits) > 1) digits = `0${digits}`
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

/** The Luhn checksum every card number carries. */
function luhn(digits: string) {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

function validate(values: PixelCheckoutFormDefaults, today: Date): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.cardNumber) errors.cardNumber = "Enter your card number"
  else if (values.cardNumber.length < 13 || !luhn(values.cardNumber)) errors.cardNumber = "Check the card number"
  const [month, year] = values.expiry.split("/").map(Number)
  if (!values.expiry) errors.expiry = "Enter the expiry"
  else if (!/^\d{2}\/\d{2}$/.test(values.expiry) || month < 1 || month > 12) errors.expiry = "Use MM/YY"
  else if (2000 + year < today.getFullYear() || (2000 + year === today.getFullYear() && month < today.getMonth() + 1)) errors.expiry = "This card has expired"
  if (!values.cvc) errors.cvc = "Enter the CVC"
  else if (values.cvc.length < 3) errors.cvc = "3 or 4 digits"
  return errors
}

// Figma's "Dither band" (1891:92539): 454 squares of 4px (a few runs 12–440px wide) in rows, in a 436×70 clip.
// Each row is its y and the x of every square ("x+w" for a run).
const BAND_ROWS: [number, string][] = [
  [8, "24,40,56,72,232,248,264,424"],
  [16, "0,8,16,24,32,40,48,56,64,72,80,88,96,104,112,128,144,160,176,192,200,208,216,224,232,240,248,256,264,272,280,288,296,304,320,336,352,368,384,392,400,408,416,424,432"],
  [20, "36,52,68,228,244,260,420,436"],
  [24, "0:432"],
  [28, "12,28,44,60,76,92,188,204,220,236,252,268,284,300,396,412,428"],
  [32, "0:432"],
  [36, "4:436"],
  [40, "0:32,40+12,56+12,72:224,232+12,248+12,264:416,424+12"],
  [44, "4:436"],
  [48, "0+108,112+12,128+12,144+12,160+12,176+12,192+108,304+12,320+12,336+12,352+12,368+12,384+56"],
  [52, "4:36,44+12,60:228,236+12,252+12,268:420,428+12"],
  [56, "0+440"],
  [60, "4+12,20+12,36+12,52+12,68+12,84+12,100:188,196+12,212+12,228+12,244+12,260+12,276+12,292+12,308:380,388+12,404+12,420+12,436"],
  [64, "0+440"],
  [68, "0+440"],
]

/** The band as one path: "a:b" is a square every 8px from a to b, "x+w" a run w wide, "x" one square. */
const BAND_PATH = BAND_ROWS.map(([y, row]) =>
  row
    .split(",")
    .flatMap((part) => {
      if (part.includes(":")) {
        const [from, to] = part.split(":").map(Number)
        return Array.from({ length: (to - from) / 8 + 1 }, (_, i) => `M${from + i * 8} ${y}h4v4h-4z`)
      }
      const [x, w = 4] = part.split("+").map(Number)
      return [`M${x} ${y}h${w}v4h-${w}z`]
    })
    .join(""),
).join("")

// A check of 4px squares for the receipt (not in Figma).
const CHECK_ROWS = ["........#", ".......##", "#.....##.", "##...##..", ".##.##...", "..###....", "...#....."]
const CHECK_PATH = CHECK_ROWS.flatMap((row, y) => [...row].map((cell, x) => (cell === "#" ? `M${x * 4} ${y * 4}h4v4h-4z` : ""))).join("")

// Figma's text styles (Silkscreen, letter spacing −1%).
const text11 = "text-[11px] leading-4 tracking-[-0.11px]"
const text13 = "text-[13px] leading-[19px] tracking-[-0.13px]"
const focusRing = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dashed focus-visible:outline-(--px-gold-ink)"
const fieldBox = cn(
  "h-[46px] w-full min-w-0 border-2 border-(--px-edge) bg-(--px-field) px-3 py-2.5 font-form-vt323 text-[22px] leading-[22px] tracking-[-0.22px] text-(--px-ink) transition-colors duration-150 outline-none placeholder:text-(--px-muted)/60",
  "hover:border-(--px-muted)/60 focus:border-(--px-accent) hover:focus:border-(--px-accent) aria-invalid:border-(--px-danger) aria-invalid:focus:border-(--px-danger) disabled:opacity-60 selection:bg-(--px-accent)/40",
)

/** Flickers elements in, like an old screen redrawing them. */
function flicker(targets: Element[], delay = 0) {
  if (!targets.length) return
  animate(targets, { opacity: [0.1, 1, 0.45, 1], duration: 260, delay, ease: steps(4), onComplete: releaseStyles("opacity") })
}

/** The ★ beside the add-on, as Figma renders the glyph (Silkscreen has none, so Figma falls back to a symbol font). */
function StarGlyph({ className }: { className?: string }) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = (i * Math.PI) / 5 - Math.PI / 2
    const radius = i % 2 === 0 ? 6 : 2.5
    return `${(7.3 + radius * Math.cos(angle)).toFixed(2)},${(9.5 + radius * Math.sin(angle)).toFixed(2)}`
  }).join(" ")
  return (
    <svg aria-hidden data-slot="pixel-checkout-form-star" width="14" height="20" viewBox="0 0 14 20" className={cn("shrink-0 fill-current", className)}>
      <polygon points={points} />
    </svg>
  )
}

/** The pay bar's ▶, drawn in pixels (Figma's glyph falls back to an emoji). */
function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden width="16" height="23" viewBox="0 0 16 23" shapeRendering="crispEdges" className={cn("shrink-0 fill-current", className)}>
      <path d="M2 5h2v12h-2zM4 6h2v10h-2zM6 7h2v8h-2zM8 8h2v6h-2zM10 9h2v4h-2zM12 10h2v2h-2z" />
    </svg>
  )
}

/** Three squares that light in turn while paying. */
function Loader() {
  return (
    <span aria-hidden data-slot="pixel-checkout-form-loader" className="flex shrink-0 gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1 bg-current" />
      ))}
    </span>
  )
}

/**
 * "Pixel checkout" from the Keitoto library: an 8-bit checkout. A purple header with the step ("2/3") over Figma's
 * dither band, the order's lines with their swatches and prices, the card number (spaced in fours and checked with
 * Luhn), expiry and CVC, a toggle that adds the PRO pass, and a gold pay bar whose amount is read from the order.
 * Animated with anime.js: the checkout drops in while the band builds up from the bottom and the lines step in, the
 * star twinkles while it's on screen and spins when the pass is added, the amount counts to the new total, an invalid
 * payment shakes the checkout, paying scans the band, and the paid receipt draws its check square by square.
 */
function PixelCheckoutForm({
  title = "CHECKOUT",
  step = 2,
  steps: stepCount = 3,
  items = samplePixelCheckoutItems,
  addOn = samplePixelCheckoutAddOn,
  defaultValues,
  addOnSelected,
  onAddOnChange,
  onSubmit,
  formatPrice = defaultFormatPrice,
  labels: labelsProp,
  successTitle = "PAYMENT DONE",
  successDescription,
  onDone,
  className,
  style,
  ref,
  ...props
}: PixelCheckoutFormProps) {
  const labels = { ...defaultLabels, ...labelsProp }
  const initial = { ...defaultPixelCheckoutValues, ...defaultValues }
  const start = {
    cardNumber: initial.cardNumber.replace(/\D/g, "").slice(0, 19),
    expiry: formatExpiry(initial.expiry),
    cvc: initial.cvc.replace(/\D/g, "").slice(0, 4),
  }

  const [card, setCard] = React.useState(start)
  const [withAddOn, setWithAddOn] = useControllableState({ value: addOnSelected, defaultValue: initial.addOn, onChange: onAddOnChange })
  const [errors, setErrors] = React.useState<FieldErrors>({})
  const [declined, setDeclined] = React.useState(false)
  const [paid, setPaid] = React.useState<PixelCheckoutFormValues | null>(null)
  const { status, submit, reset } = useFormSubmit(onSubmit)
  const locked = status !== "idle"
  const success = status === "success"
  const paying = status === "submitting"

  const itemsTotal = items.reduce((sum, item) => sum + item.price, 0)
  const addOnIn = !!addOn && withAddOn
  const total = Math.round((itemsTotal + (addOnIn ? addOn.price : 0)) * 100) / 100

  const rootRef = React.useRef<HTMLFormElement | null>(null)
  const amountRef = React.useRef<HTMLSpanElement>(null)
  const caret = React.useRef<{ input: HTMLInputElement; digits: number } | null>(null)
  const reduced = useReducedMotion()
  const inView = useInView(rootRef)

  const setRoot = React.useCallback(
    (node: HTMLFormElement | null) => {
      rootRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  const uid = React.useId()
  const ids = {
    title: `${uid}-title`,
    cardNumber: `${uid}-card`,
    expiry: `${uid}-expiry`,
    cvc: `${uid}-cvc`,
    declined: `${uid}-declined`,
    error: (name: FieldName) => `${uid}-${name}-error`,
  }

  /** Applies a change; errors already shown are checked again, so they clear as fields are fixed. */
  const update = (next: typeof card) => {
    setCard(next)
    setDeclined(false)
    setErrors((current) => {
      const shown = FIELD_ORDER.filter((key) => current[key])
      if (!shown.length) return current
      const found = validate({ ...next, addOn: addOnIn }, new Date())
      const kept: FieldErrors = {}
      for (const key of shown) if (found[key]) kept[key] = found[key]
      return kept
    })
  }

  const changeCardNumber = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    // keep the caret after the same digit once the spaces move
    caret.current = { input, digits: input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, "").length }
    update({ ...card, cardNumber: input.value.replace(/\D/g, "").slice(0, 19) })
  }

  useIsomorphicLayoutEffect(() => {
    const pending = caret.current
    caret.current = null
    if (!pending || pending.input.ownerDocument.activeElement !== pending.input) return
    const text = pending.input.value
    let position = 0
    for (let seen = 0; position < text.length && seen < pending.digits; position++) if (/\d/.test(text[position])) seen++
    pending.input.setSelectionRange(position, position)
  }, [card.cardNumber])

  const restore = () => {
    setCard(start)
    setWithAddOn(initial.addOn)
    setErrors({})
    setDeclined(false)
    setPaid(null)
    reset()
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (locked) return
    const found = validate({ ...card, addOn: addOnIn }, new Date())
    setErrors(found)
    setDeclined(false)
    const first = FIELD_ORDER.find((key) => found[key])
    if (first) {
      shake(rootRef.current)
      rootRef.current?.ownerDocument.getElementById(ids[first])?.focus()
      return
    }
    const values: PixelCheckoutFormValues = { ...card, addOn: addOnIn, total }
    setPaid(values)
    try {
      await submit(values)
    } catch {
      setPaid(null)
      setDeclined(true)
      shake(rootRef.current)
    }
  }

  // ── motion ──

  // Entrance, once a quarter of the checkout is in view: it drops in, the band builds up from the bottom in 8px steps,
  // the lines and fields step in from the left and the pay bar slides up.
  useFormEntrance(rootRef, (timeline) => {
    const root = rootRef.current
    if (!root) return
    // each step only when its parts are there (no lines, no add-on)
    const add = (slot: string, params: AnimationParams, at: number) => {
      const targets = Array.from(root.querySelectorAll(`[data-slot="pixel-checkout-form-${slot}"]`))
      if (targets.length) timeline.add(targets, params, at)
    }
    timeline.add(root, { opacity: [0, 1], y: [-12, 0], duration: 420, ease: steps(6), onComplete: releaseStyles("opacity", "transform") }, 0)
    add("header-text", { opacity: [0, 1, 0.4, 1], duration: 300, ease: steps(4), delay: stagger(90), onComplete: releaseStyles("opacity") }, 160)
    add("band", { clipPath: ["inset(100% 0 0 0)", "inset(0% 0 0 0)"], duration: 480, ease: steps(9), onComplete: releaseStyles("clip-path") }, 200)
    add("line", { opacity: [0, 1], x: [-10, 0], duration: 320, ease: steps(5), delay: stagger(70), onComplete: releaseStyles("opacity", "transform") }, 320)
    add("swatch", { scale: [0, 1], duration: 260, ease: steps(4), delay: stagger(70), onComplete: releaseStyles("transform") }, 380)
    add("add-on", { opacity: [0, 1, 0.5, 1], duration: 300, ease: steps(4), onComplete: releaseStyles("opacity") }, 640)
    add("pay", { y: [12, 0], opacity: [0, 1], duration: 320, ease: steps(5), onComplete: releaseStyles("opacity", "transform") }, 720)
  })

  // The amount counts to the new total (in whole units while both ends are whole).
  const whole = Number.isInteger(total)
  useCountUp(amountRef, total, (amount) => formatPrice(whole ? Math.round(amount) : Math.round(amount * 100) / 100), { duration: 500 })

  // The star spins when the pass goes in, and twinkles now and then while the checkout is on screen.
  const lastAddOn = React.useRef(addOnIn)
  useIsomorphicLayoutEffect(() => {
    const previous = lastAddOn.current
    lastAddOn.current = addOnIn
    const star = rootRef.current?.querySelector('[data-slot="pixel-checkout-form-star"]')
    if (reduced || previous === addOnIn || !star) return
    animate(star, { rotate: addOnIn ? [0, 144] : [0, -72], scale: [1.5, 1], duration: 420, ease: steps(6), onComplete: releaseStyles("transform") })
  }, [addOnIn, reduced])

  React.useEffect(() => {
    const star = rootRef.current?.querySelector('[data-slot="pixel-checkout-form-star"]')
    if (reduced || !inView || !star || locked) return
    const twinkle = animate(star, { scale: [1, 1.3, 1], opacity: [1, 0.6, 1], duration: 360, delay: 2400, loop: true, loopDelay: 2400, ease: steps(3) })
    return () => {
      twinkle.revert()
    }
  }, [reduced, inView, locked])

  // Errors flicker in where they appear.
  const errorKey = `${FIELD_ORDER.map((key) => errors[key] ?? "").join("|")}|${declined}`
  useIsomorphicLayoutEffect(() => {
    if (reduced || !errorKey.replace(/\||false/g, "")) return
    flicker(Array.from(rootRef.current?.querySelectorAll('[data-slot="pixel-checkout-form-error"]') ?? []))
  }, [errorKey, reduced])

  // Paying scans the band and lights the loader's squares in turn; once paid the band flashes and the receipt draws
  // its check square by square while its lines step in.
  React.useEffect(() => {
    const root = rootRef.current
    if (reduced || !root) return
    if (status === "submitting") {
      const scan = root.querySelector('[data-slot="pixel-checkout-form-scan"]')
      const squares = Array.from(root.querySelectorAll('[data-slot="pixel-checkout-form-loader"] > span'))
      const running = [
        scan && animate(scan, { clipPath: ["inset(0 100% 0 -12%)", "inset(0 -12% 0 100%)"], duration: 900, ease: steps(18), loop: true }),
        squares.length && animate(squares, { opacity: [0.25, 1, 0.25], duration: 540, delay: stagger(180), loop: true, ease: steps(2) }),
      ]
      return () => {
        for (const animation of running) if (animation) animation.revert()
      }
    }
    if (status === "success") {
      flicker(Array.from(root.querySelectorAll('[data-slot="pixel-checkout-form-band"], [data-slot="pixel-checkout-form-header-text"]')))
      const check = root.querySelector('[data-slot="pixel-checkout-form-check"]')
      if (check) animate(check, { clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)"], duration: 420, ease: steps(9), onComplete: releaseStyles("clip-path") })
      const parts = Array.from(root.querySelectorAll('[data-slot="pixel-checkout-form-receipt-part"]'))
      if (parts.length) animate(parts, { opacity: [0, 1], x: [-8, 0], duration: 280, ease: steps(4), delay: stagger(80, { start: 200 }), onComplete: releaseStyles("opacity", "transform") })
    }
  }, [status, reduced])

  // Once paid, focus moves to DONE (the pay button it replaced is gone).
  React.useEffect(() => {
    if (!success) return
    const root = rootRef.current
    const active = root?.ownerDocument.activeElement
    if (!root || (active && active !== root.ownerDocument.body && !root.contains(active))) return
    root.querySelector<HTMLButtonElement>('[data-slot="pixel-checkout-form-done"]')?.focus({ preventScroll: true })
  }, [success])

  // ── render ──

  const describedBy = (key: FieldName) => [errors[key] && ids.error(key), declined && ids.declined].filter(Boolean).join(" ") || undefined
  const fieldError = (key: FieldName) =>
    errors[key] && (
      <p id={ids.error(key)} data-slot="pixel-checkout-form-error" className={cn(text11, "text-(--px-danger)")}>
        {errors[key]}
      </p>
    )
  const shownStep = success ? Math.min(step + 1, stepCount) : step
  const statusText = paying ? `Paying ${formatPrice(total)}…` : success ? `Paid ${formatPrice(paid?.total ?? total)}.` : declined ? "The payment didn't go through." : ""
  const receipt = paid ?? { ...card, addOn: addOnIn, total }

  return (
    <form
      ref={setRoot}
      noValidate
      data-slot="pixel-checkout-form"
      data-status={status}
      aria-labelledby={ids.title}
      aria-busy={paying || undefined}
      onSubmit={handleSubmit}
      className={cn(
        "relative flex w-full max-w-[440px] flex-col border-2 border-(--px-edge) bg-(--px-panel) font-form-silkscreen text-(--px-ink) antialiased shadow-[8px_8px_0_var(--px-shadow)] scheme-light dark:scheme-dark",
        className,
      )}
      style={{ ...palette, ...style }}
      {...props}
    >
      <div data-slot="pixel-checkout-form-header" className="flex items-center justify-between gap-3 bg-(--px-accent) px-4 py-3 text-(--px-on-accent)">
        <h2 id={ids.title} data-slot="pixel-checkout-form-header-text" className="text-base leading-[23px] font-bold tracking-[0.64px]">
          {title}
        </h2>
        <p data-slot="pixel-checkout-form-header-text" className="hug-w shrink-0 text-sm leading-5 tracking-[-0.14px]">
          <span className="sr-only">Step </span>
          {shownStep}
          <span aria-hidden>/</span>
          <span className="sr-only"> of </span>
          {stepCount}
        </p>
      </div>

      <div aria-hidden className="relative h-[70px] overflow-hidden">
        <svg data-slot="pixel-checkout-form-band" width="440" height="72" viewBox="0 0 440 72" shapeRendering="crispEdges" className="absolute top-0 left-0 fill-(--px-accent)">
          <path d={BAND_PATH} />
        </svg>
        {paying && (
          <svg data-slot="pixel-checkout-form-scan" width="440" height="72" viewBox="0 0 440 72" shapeRendering="crispEdges" className="absolute top-0 left-0 fill-(--px-on-accent) [clip-path:inset(0_100%_0_-12%)]">
            <path d={BAND_PATH} />
          </svg>
        )}
      </div>

      <div className="relative">
        <div data-slot="pixel-checkout-form-body" inert={locked} className={cn("flex flex-col gap-3.5 px-5 py-[18px]", success && "invisible")}>
          <ul aria-label="Order" className="flex flex-col gap-3.5">
            {items.map((item) => (
              <li key={item.id} data-slot="pixel-checkout-form-line" className="flex min-h-5 items-center gap-2.5">
                <span aria-hidden data-slot="pixel-checkout-form-swatch" className="size-5 shrink-0" style={{ backgroundColor: item.color }} />
                <span className={cn(text13, "min-w-0 flex-1")}>{item.name}</span>
                <span className={cn(text13, "hug-w shrink-0 text-(--px-gold-ink)")}>{formatPrice(item.price)}</span>
              </li>
            ))}
          </ul>

          {/* Figma's 2px dashed rule (4 on, 4 off, fitted with half a dash at each end), drawn over the 2px above it */}
          <div aria-hidden data-slot="pixel-checkout-form-line" className="relative h-0">
            <svg className="absolute -top-0.5 left-0 h-0.5 w-full overflow-visible">
              <line x1="0" y1="1" x2="100%" y2="1" pathLength={400} strokeWidth={2} strokeDasharray="4 4" strokeDashoffset={2} className="stroke-(--px-edge)" />
            </svg>
          </div>

          <div data-slot="pixel-checkout-form-line" className="flex flex-col gap-1.5">
            <label htmlFor={ids.cardNumber} className={cn(text11, "self-start text-(--px-muted)")}>
              {labels.cardNumber}
            </label>
            <input
              id={ids.cardNumber}
              data-slot="pixel-checkout-form-card-number"
              name="cardnumber"
              inputMode="numeric"
              autoComplete="cc-number"
              spellCheck={false}
              placeholder="1234 5678 9012 3456"
              value={formatCardNumber(card.cardNumber)}
              onChange={changeCardNumber}
              aria-invalid={!!errors.cardNumber || undefined}
              aria-describedby={describedBy("cardNumber")}
              className={fieldBox}
            />
            {fieldError("cardNumber")}
          </div>

          <div data-slot="pixel-checkout-form-line" className="flex gap-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor={ids.expiry} className={cn(text11, "self-start text-(--px-muted)")}>
                {labels.expiry}
              </label>
              <input
                id={ids.expiry}
                data-slot="pixel-checkout-form-expiry"
                name="exp-date"
                inputMode="numeric"
                autoComplete="cc-exp"
                spellCheck={false}
                placeholder="MM/YY"
                value={card.expiry}
                onChange={(event) => {
                  const text = event.target.value
                  const before = card.expiry.replace(/\D/g, "")
                  // backspacing over the slash takes the month's last digit with it, so it never gets stuck on the slash
                  const slashOnly = card.expiry.includes("/") && !text.includes("/") && text.replace(/\D/g, "") === before
                  update({ ...card, expiry: formatExpiry(slashOnly ? before.slice(0, 1) + before.slice(2) : text) })
                }}
                aria-invalid={!!errors.expiry || undefined}
                aria-describedby={describedBy("expiry")}
                className={fieldBox}
              />
              {fieldError("expiry")}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor={ids.cvc} className={cn(text11, "self-start text-(--px-muted)")}>
                {labels.cvc}
              </label>
              <input
                id={ids.cvc}
                data-slot="pixel-checkout-form-cvc"
                type="password"
                name="cvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                maxLength={4}
                placeholder="•••"
                value={card.cvc}
                onChange={(event) => update({ ...card, cvc: event.target.value.replace(/\D/g, "").slice(0, 4) })}
                aria-invalid={!!errors.cvc || undefined}
                aria-describedby={describedBy("cvc")}
                className={fieldBox}
              />
              {fieldError("cvc")}
            </div>
          </div>

          {addOn && (
            <CheckboxPrimitive.Root
              data-slot="pixel-checkout-form-add-on"
              checked={withAddOn}
              onCheckedChange={(checked) => setWithAddOn(checked === true)}
              className={cn(
                "group/add-on flex min-h-11 w-full items-center gap-2.5 border-2 border-(--px-gold) bg-(--px-pass) px-3 py-2.5 text-left text-(--px-ink) transition-colors duration-150 data-[state=unchecked]:hover:bg-(--px-gold)/12 data-[state=checked]:bg-(--px-gold) data-[state=checked]:text-(--px-on-gold)",
                focusRing,
              )}
            >
              <StarGlyph className="text-(--px-gold-ink) group-data-[state=checked]/add-on:text-(--px-on-gold)" />
              <span className={cn(text11, "min-w-0 flex-1")}>{addOn.label}</span>
              <span className="hug-w shrink-0 text-xs leading-[17px] tracking-[-0.12px] text-(--px-gold-ink) group-data-[state=checked]/add-on:text-(--px-on-gold)">
                +{formatPrice(addOn.price)}
              </span>
            </CheckboxPrimitive.Root>
          )}

          {declined && (
            <p id={ids.declined} role="alert" data-slot="pixel-checkout-form-error" className={cn(text11, "-mt-1 text-(--px-danger)")}>
              The payment didn&apos;t go through. Check the card and try again.
            </p>
          )}
        </div>

        {success && (
          <div data-slot="pixel-checkout-form-receipt" className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 px-5 py-[18px] text-center">
            <svg data-slot="pixel-checkout-form-check" aria-hidden width="36" height="28" viewBox="0 0 36 28" shapeRendering="crispEdges" className="shrink-0 fill-(--px-success)">
              <path d={CHECK_PATH} />
            </svg>
            <div data-slot="pixel-checkout-form-receipt-part" className="flex flex-col items-center gap-1">
              <p className="text-base leading-[23px] font-bold tracking-[0.64px]">{successTitle}</p>
              <p className={cn(text11, "text-(--px-muted)")}>
                {successDescription ? successDescription(receipt) : `${formatPrice(receipt.total)} paid with the card ending ${receipt.cardNumber.slice(-4)}`}
              </p>
            </div>
            <ul aria-label="Receipt" data-slot="pixel-checkout-form-receipt-part" className={cn(text11, "flex w-full max-w-[300px] flex-col gap-1.5 border-t-2 border-dashed border-(--px-edge) pt-3")}>
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-left">{item.name}</span>
                  <span className="shrink-0 text-(--px-gold-ink)">{formatPrice(item.price)}</span>
                </li>
              ))}
              {addOn && receipt.addOn && (
                <li className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-left">{addOn.label}</span>
                  <span className="shrink-0 text-(--px-gold-ink)">{formatPrice(addOn.price)}</span>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {success ? (
        <button
          key="success-1"
          type="button"
          data-slot="pixel-checkout-form-done"
          onClick={() => (onDone ?? restore)()}
          className={cn("flex w-full items-center justify-between gap-3 bg-(--px-gold) px-[18px] py-3.5 text-(--px-on-gold) transition-colors duration-150 hover:bg-(--px-gold)/90", focusRing)}
        >
          <span className="text-lg leading-[26px] font-bold tracking-[-0.18px]">{labels.done}</span>
          <PlayGlyph />
        </button>
      ) : (
        <button
          key="idle-1"
          type="submit"
          data-slot="pixel-checkout-form-pay"
          disabled={paying}
          className={cn("flex w-full items-center justify-between gap-3 bg-(--px-gold) px-[18px] py-3.5 text-(--px-on-gold) transition-colors duration-150 hover:bg-(--px-gold)/90 disabled:cursor-wait", focusRing)}
        >
          <span className="text-lg leading-[26px] font-bold tracking-[-0.18px] whitespace-nowrap">
            {paying ? "PAYING" : labels.pay}{" "}
            <span ref={amountRef} data-slot="pixel-checkout-form-total">
              {formatPrice(total)}
            </span>
          </span>
          {paying ? reduced ? <span aria-hidden>…</span> : <Loader /> : <PlayGlyph />}
        </button>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {statusText}
      </p>
    </form>
  )
}

export {
  PixelCheckoutForm,
  samplePixelCheckoutAddOn,
  samplePixelCheckoutItems,
  samplePixelCheckoutValues,
  type PixelCheckoutAddOn,
  type PixelCheckoutFormDefaults,
  type PixelCheckoutFormLabels,
  type PixelCheckoutFormProps,
  type PixelCheckoutFormValues,
  type PixelCheckoutItem,
}
