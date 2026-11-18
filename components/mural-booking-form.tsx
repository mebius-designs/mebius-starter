"use client"

import { animate, stagger } from "animejs"
import { Checkbox as CheckboxPrimitive, Popover as PopoverPrimitive, RadioGroup as RadioGroupPrimitive, ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
import * as React from "react"

import { useControllableState } from "@/hooks/use-controllable-state"
import { releaseStyles, shake, useCountUp, useFormEntrance, useInView, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-form-motion"
import { useFormSubmit } from "@/hooks/use-form-submit"
import { cn } from "@/lib/utils"

/** A wall of the open call. */
type MuralBookingWall = {
  id: string
  /** "Wall C". */
  name: string
  /** Where it is ("Side of Toko Merah"). */
  place: string
  /** In metres. */
  width: number
  height: number
  /** The thumbnail's two colours, left to right: vivid on the picked wall, muted on the others. */
  colors: [string, string]
  /** Already booked: counted in the season's walls but not offered. */
  taken?: boolean
}

/** One "Paint and tools" chip. */
type MuralBookingTool = { value: string; label: string }

/** The sketch sent with the application. */
type MuralBookingSketch = {
  name: string
  /** In bytes. */
  size: number
  /** Shown after the size ("color study + scale grid"); a picked file shows its type. */
  note?: string
  /** The picked file. Absent for a sketch the form was given by name. */
  file?: File
}

type MuralBookingFormValues = {
  /** The artist's or the crew's name. */
  artist: string
  /** Instagram handle, without the "@". */
  instagram: string
  /** The picked wall's `id`. */
  wallId: string
  /** First day on site, "YYYY-MM-DD". */
  start: string
  /** Days on site. */
  days: number
  /** People on the crew. */
  crew: number
  /** The `value`s of the chosen paint and tools. */
  tools: string[]
  sketch: MuralBookingSketch | null
  /** The crew has public liability insurance (required). */
  insured: boolean
}

/** Every label and fixed word on the form, for renaming or translating it. */
type MuralBookingFormLabels = {
  /** The four steps, in order. */
  steps: [string, string, string, string]
  artist: string
  instagram: string
  wall: string
  start: string
  days: string
  /** [one, many] after the days ("day", "days"). */
  dayUnit: [string, string]
  crew: string
  /** [one, many] after the crew ("person", "people"). */
  crewUnit: [string, string]
  tools: string
  sketch: string
  replace: string
  insured: string
  back: string
  /** The primary button before the last step, given the next step's name. */
  continueTo: (step: string) => string
}

/** What the empty artist, Instagram, days and crew fields say. */
type MuralBookingFormPlaceholders = { artist: string; instagram: string; days: string; crew: string }

type MuralBookingFormProps = Omit<React.ComponentProps<"form">, "onSubmit" | "children" | "title"> & {
  /**
   * Starting values. Without them the form opens on Figma's wall and start day with the artist, Instagram, days and
   * crew empty (NaN is an empty count), no tools or sketch and the insurance unticked; `sampleMuralBookingValues` is
   * the filled Figma sample (Kolektif Sablon on Wall C).
   */
  defaultValues?: Partial<MuralBookingFormValues>
  /** Called with the trimmed values once every step is valid. Return a promise to show the sending state. */
  onSubmit?: (values: MuralBookingFormValues) => void | Promise<void>
  /** Called by the × in the corner; without it there is no ×. */
  onClose?: () => void
  /** Called by Back on the first step; without it Back is disabled there. */
  onCancel?: () => void
  /** The season's walls, taken ones included (they're counted, not offered). */
  walls?: MuralBookingWall[]
  tools?: MuralBookingTool[]
  /** Controlled step (0 to 3), with `onStepChange`. */
  step?: number
  onStepChange?: (step: number) => void
  /** The step it opens on: the first (0) by default. */
  defaultStep?: number
  /** The day the calendar counts from: a Date or "YYYY-MM-DD". Today by default. */
  today?: Date | string
  /** The first and last day a crew can be on site, "YYYY-MM-DD": from tomorrow to six months on by default. */
  minDate?: string
  maxDate?: string
  /** Longest stay on site, in days. */
  maxDays?: number
  /** Largest crew. */
  maxCrew?: number
  /** In bytes: 20 MB by default. */
  maxSketchSize?: number
  /** Locale for the dates ("Mon, 9 Nov"). */
  locale?: string
  title?: React.ReactNode
  /** The line under the title, given how many walls the season has. */
  description?: (walls: number) => React.ReactNode
  /** The note above the walls, given how many are still open (besides the picked one) and how many there are. */
  stillOpen?: (open: number, total: number) => React.ReactNode
  submitLabel?: string
  labels?: Partial<MuralBookingFormLabels>
  /** What the empty fields say ("Your name or crew", "yourhandle"…). */
  placeholders?: Partial<MuralBookingFormPlaceholders>
}

type FieldName = "artist" | "instagram" | "wallId" | "start" | "days" | "crew" | "sketch" | "insured"
type FieldErrors = Partial<Record<FieldName, string>>

/** The fields each step checks, in the order they appear. */
const STEP_FIELDS: FieldName[][] = [["artist", "instagram"], ["wallId"], ["start", "days", "crew"], ["sketch", "insured"]]
const HANDLE = /^[A-Za-z0-9._]{1,30}$/
const MB = 1024 * 1024
const SKETCH_TYPES = ["image/png", "image/jpeg", "application/pdf"]

const sampleMuralBookingWalls: MuralBookingWall[] = [
  { id: "wall-a", name: "Wall A", place: "Pasar Baru shutters", width: 10, height: 3, colors: ["#ffb347", "#f9f871"], taken: true },
  { id: "wall-b", name: "Wall B", place: "School stairwell", width: 6, height: 4, colors: ["#9b7bff", "#ff5f6d"], taken: true },
  { id: "wall-c", name: "Wall C", place: "Side of Toko Merah", width: 8, height: 4, colors: ["#ff5f6d", "#ffb347"] },
  { id: "wall-d", name: "Wall D", place: "Water tower base", width: 7, height: 3.5, colors: ["#5be7a9", "#f9f871"], taken: true },
  { id: "wall-e", name: "Wall E", place: "Parking ramp", width: 12, height: 3, colors: ["#4fc3f7", "#9b7bff"] },
  { id: "wall-f", name: "Wall F", place: "Bus stop back", width: 5, height: 2.5, colors: ["#5be7a9", "#4fc3f7"] },
]

const sampleMuralBookingTools: MuralBookingTool[] = [
  { value: "spray", label: "Spray cans" },
  { value: "acrylic", label: "Exterior acrylic" },
  { value: "rollers", label: "Rollers" },
  { value: "brushes", label: "Brushes" },
  { value: "scaffolding", label: "Need scaffolding" },
]

const sampleMuralBookingValues: MuralBookingFormValues = {
  artist: "Kolektif Sablon",
  instagram: "kolektif.sablon",
  wallId: "wall-c",
  start: "2026-11-09",
  days: 5,
  crew: 3,
  tools: ["spray", "acrylic", "scaffolding"],
  sketch: { name: "wall-c_sketch_v3.png", size: Math.round(4.8 * MB), note: "color study + scale grid" },
  insured: true,
}

// What the form opens with: Figma's wall and start day, the typed fields empty (NaN counts), no tools or sketch, the
// insurance unticked.
const defaultMuralBookingValues: MuralBookingFormValues = {
  ...sampleMuralBookingValues,
  artist: "",
  instagram: "",
  days: Number.NaN,
  crew: Number.NaN,
  tools: [],
  sketch: null,
  insured: false,
}

const defaultPlaceholders: MuralBookingFormPlaceholders = { artist: "Your name or crew", instagram: "yourhandle", days: "5", crew: "3" }

const defaultLabels: MuralBookingFormLabels = {
  steps: ["Artist", "Wall", "Dates", "Sketch"],
  artist: "Artist or crew",
  instagram: "Instagram",
  wall: "Pick a wall",
  start: "Start",
  days: "Days on site",
  dayUnit: ["day", "days"],
  crew: "Crew",
  crewUnit: ["person", "people"],
  tools: "Paint and tools",
  sketch: "Sketch",
  replace: "Replace",
  insured: "Our crew has public liability insurance",
  back: "Back",
  continueTo: (step) => `Continue to ${step.toLowerCase()}`,
}

const defaultDescription = (walls: number) => `Open call · Braga Art Street · ${walls} walls this season`

const defaultStillOpen = (open: number, total: number) => (
  <>
    <OpenCount value={open} /> of {total} still open
  </>
)

// The form's colours, light and dark (Figma light 2713:23759, dark 1891:96402) as light-dark(light, dark), so the form
// follows your app's dark class (it sets its own color-scheme from it, and the calendar takes it). Set once on the root
// (and on the calendar, which opens outside it): override any of them through `style` to re-skin the form. The walls'
// thumbnail colours come with the walls.
const palette = {
  "--mural-panel": "light-dark(#ffffff, #100f16)",
  "--mural-on-fill": "light-dark(#eae9f0, #100f16)", // the step numbers and ticks on the rainbow and on ink
  "--mural-line": "light-dark(#dcdbe4, #2a2836)",
  "--mural-field": "light-dark(#f9f8fb, #0b0a10)",
  "--mural-chip": "light-dark(#f0eff4, #1c1a26)",
  "--mural-step": "light-dark(#eeedf2, #1e1c28)",
  "--mural-card": "light-dark(#f9f9fb, #14131c)",
  "--mural-ink": "light-dark(#130d26, #f5f3fb)",
  "--mural-ink-fill": "light-dark(#150e2a, #f5f3fb)", // a done step's dot
  "--mural-muted": "light-dark(#545168, #9a97ae)",
  "--mural-brick": "light-dark(rgb(0 0 0 / 0.055), rgb(0 0 0 / 0.18))",
  "--mural-red": "#ff5f6d",
  "--mural-orange": "#ffb347",
  "--mural-yellow": "#f9f871",
  "--mural-green": "#5be7a9",
  "--mural-blue": "#4fc3f7",
  "--mural-violet": "#9b7bff",
  "--mural-rainbow":
    "var(--mural-red) 0%, var(--mural-orange) 17%, var(--mural-yellow) 33%, var(--mural-green) 50%, var(--mural-blue) 67%, var(--mural-violet) 83%, var(--mural-red) 100%",
  // errors in light: the light frames' rule for an accent as text (Figma draws none)
  "--mural-danger": "light-dark(#d01122, #ff5f6d)",
  "--mural-success": "#5be7a9",
  // the hover tint, the modal's and the calendar's shadows, and the button's blue and red glows (at rest and hovered)
  "--mural-tint": "light-dark(#0a0a0a, #ffffff)",
  "--mural-shadow": "light-dark(rgb(15 18 26 / 0.08), rgb(0 0 0 / 0.55))",
  "--mural-menu-shadow": "light-dark(rgb(15 18 26 / 0.12), rgb(0 0 0 / 0.6))",
  "--mural-glow-blue": "light-dark(rgb(79 195 247 / 0.18), rgb(79 195 247 / 0.3))",
  "--mural-glow-red": "light-dark(rgb(255 95 109 / 0.18), rgb(255 95 109 / 0.3))",
  "--mural-glow-blue-hover": "light-dark(rgb(79 195 247 / 0.27), rgb(79 195 247 / 0.45))",
  "--mural-glow-red-hover": "light-dark(rgb(255 95 109 / 0.27), rgb(255 95 109 / 0.45))",
} as React.CSSProperties

// Figma rounds a hugging text box up to whole pixels (Chrome keeps the fraction), so boxes that hug text match its width.
const hug = "hug-w"
const focusRing = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-(--mural-violet)"
const labelText = "text-xs/[17px] font-medium text-(--mural-muted)"
const errorText = "text-[11px]/[16px] text-(--mural-danger)"
const fieldBox =
  "relative flex h-11 min-w-0 items-center gap-2 rounded-[14px] border border-(--mural-line) bg-(--mural-field) px-3.5 text-sm/5 text-(--mural-ink)"
// Figma's 1.5px focus stroke takes layout space: half a pixel more padding on each side
const fieldFocus = "focus-within:border-transparent focus-within:px-[14.5px]"
const fieldInvalid = "border-(--mural-danger) shadow-[inset_0_0_0_0.5px_var(--mural-danger)] focus-within:border-(--mural-danger) focus-within:px-3.5"

const pad2 = (n: number) => String(n).padStart(2, "0")

/** A calendar day as "YYYY-MM-DD", in local time. */
function toDay(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** "YYYY-MM-DD" → local midnight, or null for anything else (including days that don't exist). */
function fromDay(day: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "")
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return toDay(date) === day ? date : null
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

/** Months later, on the same day or the month's last (31 Jan + 1 month = 28 Feb). */
function addMonths(date: Date, months: number) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  return new Date(next.getFullYear(), next.getMonth(), Math.min(date.getDate(), last))
}

function formatDate(date: Date, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options).format(date)
}

/** "Mon, 9 Nov" (en-GB). */
function formatMuralBookingDay(date: Date, locale = "en-GB") {
  const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ""
  return `${part("weekday")}, ${part("day")} ${part("month")}`
}

/** "9–13 Nov", or "28 Nov – 2 Dec" across months. */
function formatMuralBookingRange(start: Date, end: Date, locale = "en-GB") {
  const day = (date: Date) => formatDate(date, locale, { day: "numeric" })
  const month = (date: Date) => formatDate(date, locale, { month: "short" })
  if (start.getTime() === end.getTime()) return `${day(start)} ${month(start)}`
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) return `${day(start)}–${day(end)} ${month(end)}`
  return `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`
}

/** "8 × 4 m", "5 × 2.5 m". */
const formatArea = (wall: MuralBookingWall) => `${wall.width} × ${wall.height} m`

/** "240 KB", "4.8 MB", "512 B". */
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`
}

const fileKind = (file: File) => (file.type === "application/pdf" ? "PDF" : file.type === "image/png" ? "PNG image" : "JPG image")

/** The whole number in a field, or NaN. */
const parseCount = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN)

/**
 * "Paint a wall" from the Keitoto library: an open call for street artists, in four steps. Name the artist or crew
 * and their Instagram, pick one of the walls still open (its thumbnail lights up and the count of open walls follows),
 * choose the start day on a calendar, the days on site and the crew, the paint and tools, upload the sketch and confirm
 * the insurance. "Continue" checks the step and moves on; the last step sends the application. Animated with anime.js:
 * the rainbow rule draws in and the steps pop, the rainbow ring slides between steps and walls, a picked wall gets
 * painted in, and sending lets the rainbow border flow before every step ticks off.
 */
function MuralBookingForm({
  defaultValues,
  onSubmit,
  onClose,
  onCancel,
  walls = sampleMuralBookingWalls,
  tools = sampleMuralBookingTools,
  step: stepProp,
  onStepChange,
  defaultStep,
  today,
  minDate,
  maxDate,
  maxDays = 30,
  maxCrew = 12,
  maxSketchSize = 20 * MB,
  locale = "en-GB",
  title = "Paint a wall",
  description = defaultDescription,
  stillOpen = defaultStillOpen,
  submitLabel = "Send application",
  labels: labelsProp,
  placeholders: placeholdersProp,
  className,
  style,
  ref,
  ...props
}: MuralBookingFormProps) {
  const labels = { ...defaultLabels, ...labelsProp }
  const placeholders = { ...defaultPlaceholders, ...placeholdersProp }
  const id = React.useId()
  const ids = {
    title: `${id}-title`,
    description: `${id}-description`,
    artist: `${id}-artist`,
    instagram: `${id}-instagram`,
    wall: `${id}-wall`,
    start: `${id}-start`,
    startValue: `${id}-start-value`,
    days: `${id}-days`,
    crew: `${id}-crew`,
    tools: `${id}-tools`,
    sketch: `${id}-sketch`,
    insured: `${id}-insured`,
    error: (field: FieldName) => `${id}-${field}-error`,
  }

  // The day the calendar counts from: fixed for the form's life unless `today` changes.
  const [now] = React.useState(() => toDay(new Date()))
  const todayKey = today instanceof Date ? toDay(today) : (today ?? now)
  const base = React.useMemo(() => fromDay(todayKey) ?? startOfDay(new Date()), [todayKey])
  const firstDay = fromDay(minDate) ?? addDays(base, 1)
  const lastDay = fromDay(maxDate) ?? addMonths(base, 6)

  const [initial] = React.useState(() => {
    const merged = { ...defaultMuralBookingValues, ...defaultValues }
    // NaN (or no number at all) is an empty field
    const text = (count: number) => (Number.isFinite(count) ? String(count) : "")
    return { ...merged, days: text(merged.days), crew: text(merged.crew) }
  })
  const [values, setValues] = React.useState(initial)
  const [step, setStep] = useControllableState({
    value: stepProp,
    defaultValue: Math.min(3, Math.max(0, defaultStep ?? 0)),
    onChange: onStepChange,
  })
  // Walls booked from this form ("Book another wall" keeps them out of the open ones).
  const [held, setHeld] = React.useState<string[]>([])
  const [calendarOpen, setCalendarOpen] = React.useState(false)
  const [errors, setErrors] = React.useState<FieldErrors>({})
  const [failed, setFailed] = React.useState(false)
  const [sent, setSent] = React.useState<{ wall: MuralBookingWall | undefined; start: Date; end: Date } | null>(null)
  const { status, submit, reset } = useFormSubmit(onSubmit)
  const locked = status !== "idle"
  const done = status === "success"
  const reduced = useReducedMotion()

  const openWalls = walls.filter((wall) => !wall.taken && !held.includes(wall.id))
  const wall = openWalls.find((w) => w.id === values.wallId)
  const stillOpenCount = openWalls.length - (wall ? 1 : 0)
  const start = fromDay(values.start)
  const days = parseCount(values.days)
  const crew = parseCount(values.crew)
  const end = start && days >= 1 ? addDays(start, days - 1) : null

  const rootRef = React.useRef<HTMLFormElement | null>(null)
  const artistRef = React.useRef<HTMLInputElement>(null)
  const instagramRef = React.useRef<HTMLInputElement>(null)
  const wallsRef = React.useRef<HTMLDivElement>(null)
  const startRef = React.useRef<HTMLButtonElement>(null)
  const daysRef = React.useRef<HTMLInputElement>(null)
  const crewRef = React.useRef<HTMLInputElement>(null)
  const sketchRef = React.useRef<HTMLButtonElement>(null)
  const insuredRef = React.useRef<HTMLButtonElement>(null)
  const stepsRef = React.useRef<HTMLOListElement>(null)
  const submitRef = React.useRef<HTMLButtonElement>(null)
  const submitLabelRef = React.useRef<HTMLSpanElement>(null)
  const flowRef = React.useRef<SVGLinearGradientElement>(null)
  const successRef = React.useRef<HTMLDivElement>(null)
  const ruleRef = React.useRef<HTMLDivElement>(null)
  const focusAfterStep = React.useRef(false)

  const setRoot = React.useCallback(
    (node: HTMLFormElement | null) => {
      rootRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  // The palette as CSS variables, also for the calendar, which opens in a portal outside the form.
  const cssVars = Object.fromEntries(Object.entries({ ...palette, ...style }).filter(([key]) => key.startsWith("--"))) as React.CSSProperties


  function fieldError(field: FieldName, v = values): string | undefined {
    const dayCount = parseCount(v.days)
    const startDay = fromDay(v.start)
    switch (field) {
      case "artist":
        return v.artist.trim() ? undefined : "Who's painting?"
      case "instagram":
        return !v.instagram.trim() || HANDLE.test(v.instagram.trim()) ? undefined : "Letters, numbers, dots and underscores only."
      case "wallId":
        return openWalls.some((w) => w.id === v.wallId) ? undefined : "Pick a wall."
      case "start":
        if (!startDay) return "Pick a start day."
        if (startDay < firstDay || startDay > lastDay)
          return `Pick a day from ${formatDate(firstDay, locale, { day: "numeric", month: "short" })} to ${formatDate(lastDay, locale, { day: "numeric", month: "short" })}.`
        return undefined
      case "days":
        if (!(dayCount >= 1 && dayCount <= maxDays)) return `Between 1 and ${maxDays} days.`
        if (startDay && addDays(startDay, dayCount - 1) > lastDay) return `Ends after ${formatDate(lastDay, locale, { day: "numeric", month: "short" })}.`
        return undefined
      case "crew": {
        const people = parseCount(v.crew)
        return people >= 1 && people <= maxCrew ? undefined : `Between 1 and ${maxCrew} people.`
      }
      case "sketch":
        return v.sketch ? undefined : "Add your sketch."
      case "insured":
        return v.insured ? undefined : "The crew needs public liability insurance."
    }
  }

  const stepValid = (index: number, v = values) => STEP_FIELDS[index].every((field) => !fieldError(field, v))

  const setField = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    const next = { ...values, [key]: value }
    setValues(next)
    // a shown error goes as soon as its field is fixed (days also re-checks against the start, and the other way round)
    const affected: FieldName[] = key === "start" ? ["start", "days"] : key === "days" ? ["days"] : [key as FieldName]
    setErrors((current) => {
      let changed = false
      const updated = { ...current }
      for (const field of affected) {
        if (!current[field]) continue
        updated[field] = fieldError(field, next)
        changed = changed || updated[field] !== current[field]
      }
      return changed ? updated : current
    })
  }

  const focusField = (field: FieldName) => {
    const refs = { artist: artistRef, instagram: instagramRef, start: startRef, days: daysRef, crew: crewRef, sketch: sketchRef, insured: insuredRef }
    const el =
      field === "wallId"
        ? (wallsRef.current?.querySelector<HTMLElement>('[data-state="checked"]') ?? wallsRef.current?.querySelector<HTMLElement>("button"))
        : refs[field].current
    el?.focus({ preventScroll: true })
    el?.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" })
  }

  /** Shows the errors of the given steps; returns the first step with one. */
  const check = (steps: number[]) => {
    const found: FieldErrors = {}
    for (const index of steps) for (const field of STEP_FIELDS[index]) found[field] = fieldError(field)
    setErrors(found)
    const firstStep = steps.find((index) => STEP_FIELDS[index].some((field) => found[field]))
    if (firstStep === undefined) return undefined
    const firstField = STEP_FIELDS[firstStep].find((field) => found[field])!
    if (firstStep !== step) setStep(firstStep)
    requestAnimationFrame(() => focusField(firstField))
    shake(rootRef.current)
    return firstStep
  }

  const goToStep = (target: number) => {
    if (locked || target === step) return
    if (target > step && check(Array.from({ length: target - step }, (_, i) => step + i)) !== undefined) return
    if (target < step) setErrors({})
    focusAfterStep.current = true
    setStep(target)
  }

  const onFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (locked) return
    setFailed(false)
    if (step < 3) {
      goToStep(step + 1)
      return
    }
    if (check([0, 1, 2, 3]) !== undefined) return
    setSent({ wall, start: start!, end: end! })
    try {
      await submit({
        ...values,
        artist: values.artist.trim(),
        instagram: values.instagram.trim().replace(/^@/, ""),
        days,
        crew,
      })
    } catch {
      setFailed(true)
    }
  }

  const back = () => {
    if (locked) return
    if (step === 0) onCancel?.()
    else goToStep(step - 1)
  }

  // "Book another wall": the booked wall is held, the artist, crew and dates stay, and the form goes back to the walls.
  const bookAnother = () => {
    if (sent?.wall) setHeld((current) => [...current, sent.wall!.id])
    reset()
    setSent(null)
    setValues((current) => ({ ...current, wallId: "", sketch: null }))
    setErrors({})
    setFailed(false)
    focusAfterStep.current = true
    setStep(1)
  }

  // After a step change, the new step's first field takes focus (and comes into view).
  React.useEffect(() => {
    if (!focusAfterStep.current || locked) return
    focusAfterStep.current = false
    focusField(STEP_FIELDS[step][0])
    // focusField reads refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, locked])

  const all = (selector: string) => Array.from(rootRef.current?.querySelectorAll<HTMLElement>(selector) ?? [])

  // Entrance, once the form is in view: the panel rises, the rainbow rule draws itself, the steps pop in turn, the rows
  // follow and the walls are painted in one after another.
  useFormEntrance(rootRef, (timeline) => {
    const root = rootRef.current
    if (!root) return
    timeline
      .add(root, { opacity: { from: 0 }, y: { from: 18 }, duration: 800, ease: "outExpo" }, 0)
      .add(all("[data-enter]"), { opacity: { from: 0 }, y: { from: 10 }, duration: 650, ease: "outQuart", delay: stagger(50) }, 90)
      .add(all('[data-slot="mural-booking-form-rule"]'), { scaleX: { from: 0 }, duration: 1100, ease: "inOutQuart" }, 120)
      .add(all('[data-slot="mural-booking-form-step"]'), { scale: { from: 0.9 }, opacity: { from: 0 }, duration: 600, ease: "outBack(2)", delay: stagger(70) }, 260)
      .add(all('[data-slot="mural-booking-form-wall"]'), { y: { from: 14 }, duration: 700, ease: "outExpo", delay: stagger(80) }, 420)
      .add(all('[data-slot="mural-booking-form-paint"]'), { clipPath: ["inset(0% 100% 0% 0%)", "inset(0% 0% 0% 0%)"], duration: 900, ease: "inOutQuart", delay: stagger(110) }, 520)
      .add(all('[data-slot="mural-booking-form-tool"]'), { scale: { from: 0.88 }, duration: 520, ease: "outBack(2)", delay: stagger(45) }, 640)
  })

  // Ambient: the rainbow rule's colours drift, only while the form is on screen.
  const inView = useInView(rootRef)
  React.useEffect(() => {
    const el = ruleRef.current
    if (!inView || reduced || !el) return
    const drift = animate(el, { backgroundPositionX: ["0px", `${el.offsetWidth}px`], duration: 12000, ease: "linear", loop: true })
    return () => {
      drift.revert()
    }
  }, [inView, reduced])

  // The rainbow ring slides from the previous step to the new one, the button's label follows and the step's
  // fields nudge into place.
  const lastStep = React.useRef(step)
  useIsomorphicLayoutEffect(() => {
    const previous = lastStep.current
    lastStep.current = step
    const pills = stepsRef.current
    if (!pills || previous === step || reduced) return
    flip(pills.querySelector(`[data-index="${previous}"]`), pills.querySelector(`[data-index="${step}"]`), '[data-slot="mural-booking-form-step-ring"]')
    if (submitLabelRef.current) animate(submitLabelRef.current, { opacity: [0, 1], y: [step > previous ? 8 : -8, 0], duration: 420, ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
    animate(all(`[data-step="${step}"]`), { opacity: [0.35, 1], y: [6, 0], duration: 520, delay: stagger(60), ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
  }, [step, reduced])

  // A newly picked wall: the ring slides over and its paint rolls on from the left.
  const lastWall = React.useRef(values.wallId)
  useIsomorphicLayoutEffect(() => {
    const previous = lastWall.current
    lastWall.current = values.wallId
    const cards = wallsRef.current
    if (!cards || previous === values.wallId || reduced) return
    const to = cards.querySelector<HTMLElement>(`[data-value="${CSS.escape(values.wallId)}"]`)
    flip(cards.querySelector(`[data-value="${CSS.escape(previous)}"]`), to, '[data-slot="mural-booking-form-wall-ring"]')
    const paint = to?.querySelector<HTMLElement>('[data-slot="mural-booking-form-paint"]')
    if (paint) animate(paint, { clipPath: ["inset(0% 100% 0% 0%)", "inset(0% 0% 0% 0%)"], duration: 700, ease: "inOutQuart", onComplete: releaseStyles("clip-path") })
  }, [values.wallId, reduced])

  // Errors drop in under their field.
  const lastErrors = React.useRef(errors)
  useIsomorphicLayoutEffect(() => {
    const previous = lastErrors.current
    lastErrors.current = errors
    if (reduced) return
    for (const field of Object.keys(errors) as FieldName[]) {
      if (!errors[field] || previous[field]) continue
      const el = rootRef.current?.querySelector(`#${CSS.escape(ids.error(field))}`)
      if (el) animate(el, { opacity: [0, 1], y: [-4, 0], duration: 360, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
    }
  }, [errors, reduced])

  // While sending, the rainbow border flows; once sent, every step ticks off in turn and the bar rises.
  useIsomorphicLayoutEffect(() => {
    const gradient = flowRef.current
    const width = submitRef.current?.offsetWidth ?? 0
    if (status !== "submitting" || !gradient || !width || reduced) return
    const shift = { x: 0 }
    const flow = animate(shift, {
      x: width,
      duration: 1600,
      ease: "linear",
      loop: true,
      onUpdate: () => gradient.setAttribute("gradientTransform", `translate(${shift.x} 0)`),
    })
    return () => {
      flow.cancel()
      gradient.removeAttribute("gradientTransform")
    }
  }, [status, reduced])

  const lastStatus = React.useRef(status)
  useIsomorphicLayoutEffect(() => {
    const previous = lastStatus.current
    lastStatus.current = status
    if (previous === status || reduced) return
    if (status === "success") {
      animate(all('[data-slot="mural-booking-form-step-mark"]'), { scale: [0.4, 1], duration: 560, delay: stagger(90), ease: "outBack(2.2)", onComplete: releaseStyles("transform") })
      if (successRef.current)
        animate(successRef.current, { opacity: [0, 1], y: [10, 0], scale: [0.97, 1], duration: 700, ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
      animate(all('[data-slot="mural-booking-form-sent-check"]'), { strokeDashoffset: [1, 0], duration: 520, delay: 260, ease: "outQuad" })
    }
    if (status === "idle" && previous === "success" && submitRef.current) {
      animate(submitRef.current, { opacity: [0, 1], y: [10, 0], duration: 600, ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
    }
  }, [status, reduced])

  const describedBy = (field: FieldName, ...more: (string | undefined)[]) =>
    [errors[field] ? ids.error(field) : undefined, ...more].filter(Boolean).join(" ") || undefined
  const message = (field: FieldName, className?: string) =>
    errors[field] ? (
      <p id={ids.error(field)} className={cn(errorText, className)}>
        {errors[field]}
      </p>
    ) : null

  const stepState = (index: number) => (done || (index < step && stepValid(index)) ? "done" : index === step ? "current" : "upcoming")

  return (
    <form
      noValidate
      aria-labelledby={ids.title}
      aria-describedby={ids.description}
      {...props}
      ref={setRoot}
      data-slot="mural-booking-form"
      className={cn(
        "@container/mural relative flex w-full max-w-[600px] flex-col gap-[18px] rounded-3xl border border-(--mural-line) bg-(--mural-panel) p-[26px] font-form-instrument-sans text-(--mural-ink) antialiased shadow-[0_30px_54px_-12px_var(--mural-shadow)] scheme-light dark:scheme-dark",
        className,
      )}
      style={{ ...palette, ...style }}
      onSubmit={onFormSubmit}
    >
      <div
        ref={ruleRef}
        aria-hidden
        data-slot="mural-booking-form-rule"
        className="h-1 shrink-0 origin-left rounded-[2px] bg-[linear-gradient(90deg,var(--mural-rainbow))]"
      />

      <div data-slot="mural-booking-form-header" className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <h2 data-enter id={ids.title} className="font-form-unbounded text-[32px]/[36px] font-bold tracking-[-0.64px] @max-[480px]/mural:text-[26px]/[32px]">
            {title}
          </h2>
          <p data-enter id={ids.description} className="text-[13px]/[19px] text-(--mural-muted)">
            {description(walls.length)}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn(
              "relative shrink-0 rounded-sm text-[20px]/[29px] text-(--mural-muted) transition-colors duration-200 before:absolute before:-inset-2 hover:text-(--mural-ink)",
              hug,
              focusRing,
            )}
          >
            ×
          </button>
        )}
      </div>

      <nav aria-label="Application steps" data-enter>
        <ol ref={stepsRef} className="flex items-start gap-1.5 @max-[480px]/mural:grid @max-[480px]/mural:grid-cols-2">
          {labels.steps.map((name, index) => {
            const state = stepState(index)
            return (
              <li key={index} className="flex min-w-0 flex-1">
                <button
                  type="button"
                  data-slot="mural-booking-form-step"
                  data-index={index}
                  data-state={state}
                  aria-current={state === "current" ? "step" : undefined}
                  aria-label={`Step ${index + 1} of 4: ${name}${state === "done" ? ", done" : ""}`}
                  disabled={locked}
                  onClick={() => goToStep(index)}
                  className={cn(
                    "group/step relative box-content flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full border border-(--mural-line) px-2.5 py-2 text-[13px]/[19px] font-medium whitespace-nowrap text-(--mural-muted) transition-colors duration-200 hover:text-(--mural-ink) disabled:cursor-default",
                    "data-[state=current]:border-transparent data-[state=current]:px-[10.5px] data-[state=current]:py-[8.5px] data-[state=current]:text-(--mural-ink) data-[state=done]:text-(--mural-ink)",
                    focusRing,
                  )}
                >
                  <span
                    data-slot="mural-booking-form-step-mark"
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full bg-(--mural-step) text-[11px]/[16px] font-semibold text-(--mural-muted) transition-colors duration-300 motion-reduce:transition-none",
                      "group-data-[state=current]/step:bg-[linear-gradient(90deg,var(--mural-rainbow))] group-data-[state=current]/step:text-(--mural-on-fill) group-data-[state=done]/step:bg-(--mural-ink-fill) group-data-[state=done]/step:text-(--mural-on-fill)",
                    )}
                  >
                    {state === "done" ? <TickGlyph key="tick" draw /> : index + 1}
                  </span>
                  <span className={cn(hug, "truncate")}>{name}</span>
                  <RainbowRing angular radius={20} data-slot="mural-booking-form-step-ring" className="-inset-px hidden group-data-[state=current]/step:block" />
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div data-enter data-step={0} className="flex gap-2.5 @max-[420px]/mural:flex-col">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={ids.artist} className={labelText}>
            {labels.artist}
          </label>
          <div className={cn("group/field", fieldBox, fieldFocus, errors.artist && fieldInvalid)}>
            <input
              ref={artistRef}
              id={ids.artist}
              name="artist"
              value={values.artist}
              onChange={(event) => setField("artist", event.target.value)}
              placeholder={placeholders.artist}
              aria-invalid={errors.artist ? true : undefined}
              aria-describedby={describedBy("artist")}
              disabled={locked}
              autoComplete="organization"
              className="min-w-0 flex-1 bg-transparent caret-(--mural-violet) outline-none placeholder:text-(--mural-muted) disabled:cursor-default"
            />
            {!errors.artist && <FocusRing />}
          </div>
          {message("artist")}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={ids.instagram} className={labelText}>
            {labels.instagram}
          </label>
          <div className={cn("group/field", fieldBox, fieldFocus, errors.instagram && fieldInvalid)}>
            <span aria-hidden className={cn(hug, "shrink-0 text-[13px]/[19px] text-(--mural-muted)")}>
              @
            </span>
            <input
              ref={instagramRef}
              id={ids.instagram}
              name="instagram"
              value={values.instagram}
              onChange={(event) => setField("instagram", event.target.value.replace(/^@+/, ""))}
              placeholder={placeholders.instagram}
              aria-invalid={errors.instagram ? true : undefined}
              aria-describedby={describedBy("instagram")}
              disabled={locked}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent caret-(--mural-violet) outline-none placeholder:text-(--mural-muted) disabled:cursor-default"
            />
            {!errors.instagram && <FocusRing />}
          </div>
          {message("instagram")}
        </div>
      </div>

      <div data-enter data-step={1} className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3 text-xs/[17px] text-(--mural-muted)">
          <span id={ids.wall} className="font-medium">
            {labels.wall}
          </span>
          <span>{stillOpen(stillOpenCount, walls.length)}</span>
        </div>
        <RadioGroupPrimitive.Root
          ref={wallsRef}
          aria-labelledby={ids.wall}
          aria-describedby={describedBy("wallId")}
          aria-invalid={errors.wallId ? true : undefined}
          name="wallId"
          orientation="horizontal"
          value={wall?.id ?? ""}
          onValueChange={(next) => setField("wallId", next)}
          disabled={locked}
          className="flex items-start gap-2.5 @max-[480px]/mural:flex-col @max-[480px]/mural:items-stretch"
        >
          {openWalls.map((w) => (
            <WallCard key={w.id} wall={w} />
          ))}
        </RadioGroupPrimitive.Root>
        {message("wallId")}
      </div>

      <div data-enter data-step={2} className="flex gap-2.5 @max-[480px]/mural:flex-wrap">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 @max-[480px]/mural:basis-full">
          <span id={ids.start} className={labelText}>
            {labels.start}
          </span>
          <PopoverPrimitive.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverPrimitive.Trigger {...{ asChild: true }}>
              <button
                ref={startRef}
                type="button"
                name="start"
                aria-labelledby={`${ids.start} ${ids.startValue}`}
                aria-invalid={errors.start ? true : undefined}
                aria-describedby={describedBy("start")}
                disabled={locked}
                className={cn(
                  "group/field cursor-pointer text-left disabled:cursor-default",
                  fieldBox,
                  "focus:border-transparent focus:px-[14.5px] data-[state=open]:border-transparent data-[state=open]:px-[14.5px]",
                  errors.start && "border-(--mural-danger) shadow-[inset_0_0_0_0.5px_var(--mural-danger)] focus:border-(--mural-danger) focus:px-3.5",
                  "outline-none",
                )}
              >
                <span id={ids.startValue} className={cn("min-w-0 flex-1 truncate", !start && "text-(--mural-muted)")}>
                  {start ? formatMuralBookingDay(start, locale) : "Pick a day"}
                </span>
                {!errors.start && (
                  <RainbowRing
                    angular
                    radius={14}
                    className="-inset-px opacity-0 transition-opacity duration-200 group-focus/field:opacity-100 group-data-[state=open]/field:opacity-100 motion-reduce:transition-none"
                  />
                )}
              </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                side="bottom"
                align="start"
                sideOffset={8}
                collisionPadding={8}
                aria-label={labels.start}
                onOpenAutoFocus={(event) => {
                  event.preventDefault()
                  const content = event.currentTarget as HTMLElement | null
                  content?.querySelector<HTMLElement>('[data-slot="mural-booking-form-day"][tabindex="0"]')?.focus()
                }}
                data-slot="mural-booking-form-calendar"
                className="z-50 rounded-2xl border border-(--mural-line) bg-(--mural-panel) p-3 font-form-instrument-sans text-(--mural-ink) antialiased shadow-[0_18px_40px_-8px_var(--mural-menu-shadow)] outline-none scheme-light dark:scheme-dark"
                style={cssVars}
              >
                <MuralCalendar
                  value={start}
                  days={days >= 1 ? days : 1}
                  min={firstDay}
                  max={lastDay}
                  today={base}
                  locale={locale}
                  onSelect={(date) => {
                    setField("start", toDay(date))
                    setCalendarOpen(false)
                  }}
                />
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
          {message("start")}
        </div>
        <CountField
          ref={daysRef}
          id={ids.days}
          name="days"
          label={labels.days}
          unit={days === 1 ? labels.dayUnit[0] : labels.dayUnit[1]}
          value={values.days}
          placeholder={placeholders.days}
          min={1}
          max={maxDays}
          onValueChange={(next) => setField("days", next)}
          error={errors.days}
          errorId={ids.error("days")}
          disabled={locked}
        />
        <CountField
          ref={crewRef}
          id={ids.crew}
          name="crew"
          label={labels.crew}
          unit={crew === 1 ? labels.crewUnit[0] : labels.crewUnit[1]}
          value={values.crew}
          placeholder={placeholders.crew}
          min={1}
          max={maxCrew}
          onValueChange={(next) => setField("crew", next)}
          error={errors.crew}
          errorId={ids.error("crew")}
          disabled={locked}
        />
      </div>

      <div data-enter data-step={3} className="flex flex-col gap-2">
        <span id={ids.tools} className={labelText}>
          {labels.tools}
        </span>
        <ToggleGroupPrimitive.Root
          type="multiple"
          aria-labelledby={ids.tools}
          value={values.tools}
          onValueChange={(next) => setField("tools", next)}
          disabled={locked}
          className="flex flex-wrap items-start gap-1.5"
        >
          {tools.map((tool) => (
            <ToggleGroupPrimitive.Item
              key={tool.value}
              value={tool.value}
              data-slot="mural-booking-form-tool"
              className={cn(
                "group/tool relative flex cursor-pointer rounded-full border border-(--mural-line) px-3 py-[7px] text-[13px]/[19px] font-medium whitespace-nowrap text-(--mural-muted) transition-colors duration-200 hover:text-(--mural-ink) disabled:cursor-default disabled:hover:text-(--mural-muted) motion-reduce:transition-none",
                // Figma's 1.2px selected stroke takes layout space: 0.2px more padding on each side
                "data-[state=on]:border-transparent data-[state=on]:bg-(--mural-chip) data-[state=on]:px-[12.2px] data-[state=on]:py-[7.2px] data-[state=on]:text-(--mural-ink)",
                focusRing,
              )}
            >
              <span className={hug}>{tool.label}</span>
              <RainbowRing radius={18} width={1.2} className="-inset-px hidden group-data-[state=on]/tool:block" />
            </ToggleGroupPrimitive.Item>
          ))}
        </ToggleGroupPrimitive.Root>
      </div>

      <div data-enter data-step={3} className="flex flex-col gap-1.5">
        <SketchPicker
          ref={sketchRef}
          id={ids.sketch}
          label={labels.sketch}
          replaceLabel={labels.replace}
          value={values.sketch}
          maxSize={maxSketchSize}
          error={errors.sketch}
          errorId={ids.error("sketch")}
          disabled={locked}
          onPick={(file) => {
            if (!SKETCH_TYPES.includes(file.type)) {
              setErrors((current) => ({ ...current, sketch: "Use a PNG, JPG or PDF." }))
              return
            }
            if (file.size > maxSketchSize) {
              setErrors((current) => ({ ...current, sketch: `${file.name} is over ${formatSize(maxSketchSize)}.` }))
              return
            }
            setField("sketch", { name: file.name, size: file.size, note: fileKind(file), file })
          }}
        />
        {message("sketch")}
      </div>

      <div data-enter data-step={3} className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2.5">
          <CheckboxPrimitive.Root
            ref={insuredRef}
            id={ids.insured}
            name="insured"
            checked={values.insured}
            onCheckedChange={(checked) => setField("insured", checked === true)}
            aria-invalid={errors.insured ? true : undefined}
            aria-describedby={describedBy("insured")}
            disabled={locked}
            className={cn(
              // the 18px box sits half a pixel down in its 19px row, as in Figma: a whole-pixel top plus the half as a translate
              "relative size-[18px] shrink-0 translate-y-[0.5px] cursor-pointer rounded-[5px] border border-(--mural-line) bg-(--mural-field) text-(--mural-on-fill) transition-colors duration-200 disabled:cursor-default aria-invalid:border-(--mural-danger) data-[state=checked]:border-0 data-[state=checked]:bg-[linear-gradient(90deg,var(--mural-rainbow))] motion-reduce:transition-none",
              focusRing,
            )}
          >
            <CheckboxPrimitive.Indicator className="absolute inset-0 flex items-center justify-center">
              <TickGlyph draw />
            </CheckboxPrimitive.Indicator>
          </CheckboxPrimitive.Root>
          <label htmlFor={ids.insured} className="cursor-pointer text-[13px]/[19px] text-(--mural-ink)">
            {labels.insured}
          </label>
        </div>
        {message("insured")}
      </div>

      <div data-enter className="flex flex-col gap-2">
        {done && sent ? (
          <div
            key="success"
            ref={successRef}
            data-slot="mural-booking-form-success"
            className="relative flex h-[50px] items-center gap-2.5 rounded-[15.5px] pr-1.5 pl-4 shadow-[6px_8px_21.6px_var(--mural-glow-blue),-6px_8px_21.6px_var(--mural-glow-red)]"
          >
            <RainbowFrame />
            <svg aria-hidden viewBox="0 0 20 20" className="relative size-5 shrink-0 text-(--mural-success)">
              <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.5} />
              <path
                data-slot="mural-booking-form-sent-check"
                d="M6 10.4 8.7 13 14 7.4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray="1"
              />
            </svg>
            <p className="relative min-w-0 flex-1 truncate text-sm/5">
              <span className="font-form-unbounded font-semibold tracking-[-0.28px]">Application sent</span>
              <span className="text-(--mural-muted)">
                {" · "}
                {sent.wall ? `${sent.wall.name}, ` : ""}
                {formatMuralBookingRange(sent.start, sent.end, locale)}
              </span>
            </p>
            <button
              key="success-again"
              type="button"
              onClick={bookAnother}
              className={cn(
                "relative shrink-0 rounded-[10px] px-3 py-1.5 text-[13px]/[19px] font-medium text-(--mural-muted) transition-colors duration-200 hover:bg-(--mural-tint)/5 hover:text-(--mural-ink)",
                focusRing,
              )}
            >
              Book another wall
            </button>
          </div>
        ) : (
          <div key="idle" className="flex items-start gap-2.5">
            <button
              key="idle-back"
              type="button"
              onClick={back}
              disabled={locked || (step === 0 && !onCancel)}
              className={cn(
                "shrink-0 cursor-pointer rounded-[14px] border border-(--mural-line) px-[22px] py-3.5 text-sm/5 font-medium text-(--mural-ink) transition-colors duration-200 hover:bg-(--mural-tint)/[0.03] disabled:cursor-default disabled:text-(--mural-muted) disabled:hover:bg-transparent",
                focusRing,
              )}
            >
              <span className={hug}>{labels.back}</span>
            </button>
            <button
              key="idle-submit"
              ref={submitRef}
              type="submit"
              data-slot="mural-booking-form-submit"
              aria-disabled={status === "submitting" || undefined}
              className={cn(
                "group/submit relative flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[15.5px] py-[14.5px] shadow-[6px_8px_21.6px_var(--mural-glow-blue),-6px_8px_21.6px_var(--mural-glow-red)] transition-shadow duration-300 hover:shadow-[6px_10px_28px_var(--mural-glow-blue-hover),-6px_10px_28px_var(--mural-glow-red-hover)] aria-disabled:cursor-progress",
                focusRing,
              )}
            >
              <RainbowFrame gradientRef={flowRef} />
              <span ref={submitLabelRef} className={cn(hug, "relative truncate font-form-unbounded text-sm/5 font-semibold tracking-[-0.28px]")}>
                {status === "submitting" ? "Sending…" : step < 3 ? labels.continueTo(labels.steps[step + 1]) : submitLabel}
              </span>
            </button>
          </div>
        )}
        {failed && (
          <p role="alert" className={errorText}>
            Couldn&apos;t send the application. Try again.
          </p>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {status === "submitting"
          ? "Sending your application…"
          : done && sent
            ? `Application sent: ${sent.wall?.name ?? "your wall"}, ${formatMuralBookingRange(sent.start, sent.end, locale)}.`
            : `Step ${step + 1} of 4: ${labels.steps[step]}`}
      </p>
    </form>
  )
}

/** The number of open walls, counting to a new one when a wall is picked or booked. */
function OpenCount({ value }: { value: number }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  useCountUp(ref, value, (n) => String(Math.round(n)), { duration: 500 })
  return (
    <span ref={ref} data-slot="mural-booking-form-open-count">
      {value}
    </span>
  )
}

/** Moves `ring` (found inside `to`) from where `from` is, as if it slid across: FLIP from the old box to the new one. */
function flip(from: Element | null, to: Element | null, ring: string) {
  if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement)) return
  const target = to.querySelector<HTMLElement>(ring)
  if (!target) return
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  if (!b.width || !b.height) return
  animate(target, {
    translateX: [a.left + a.width / 2 - (b.left + b.width / 2), 0],
    translateY: [a.top + a.height / 2 - (b.top + b.height / 2), 0],
    scaleX: [a.width / b.width, 1],
    scaleY: [a.height / b.height, 1],
    duration: 560,
    ease: "outExpo",
    onComplete: releaseStyles("transform"),
  })
}

/** A wall as a radio card: its painted thumbnail (vivid when picked) with Figma's brick pattern, name, place and size. */
function WallCard({ wall }: { wall: MuralBookingWall }) {
  const pattern = `${React.useId().replace(/[^\w-]/g, "")}-bricks`
  return (
    <RadioGroupPrimitive.Item
      value={wall.id}
      data-value={wall.id}
      data-slot="mural-booking-form-wall"
      aria-label={`${wall.name}, ${wall.place}, ${formatArea(wall)}`}
      className={cn(
        "group/wall relative box-content flex min-w-0 flex-1 cursor-pointer flex-col items-stretch gap-2.5 rounded-2xl border border-(--mural-line) bg-(--mural-field) p-2.5 text-left transition-colors duration-200 disabled:cursor-default data-[state=unchecked]:hover:border-(--mural-muted)/40",
        // Figma's 2px picked stroke takes layout space: a pixel more padding on each side
        "data-[state=checked]:border-transparent data-[state=checked]:p-[11px]",
        "@max-[480px]/mural:flex-none @max-[480px]/mural:flex-row @max-[480px]/mural:items-center",
        focusRing,
      )}
    >
      <span className="relative block h-16 shrink-0 overflow-hidden rounded-[10px] @max-[480px]/mural:w-28">
        <span
          data-slot="mural-booking-form-paint"
          className="absolute inset-0 opacity-35 transition-opacity duration-500 group-data-[state=checked]/wall:opacity-90 motion-reduce:transition-none"
          style={{ backgroundImage: `linear-gradient(90deg, ${wall.colors[0]}, ${wall.colors[1]})` }}
        />
        {/* Figma's bricks: 22 × 8 at 18% black (5.5% in light), 2px mortar, every other row shifted by half a brick */}
        <svg aria-hidden className="absolute inset-0 size-full">
          <defs>
            <pattern id={pattern} patternUnits="userSpaceOnUse" width="24" height="20">
              <rect width="22" height="8" className="fill-(--mural-brick)" />
              <rect x="12" y="10" width="22" height="8" className="fill-(--mural-brick)" />
              <rect x="-12" y="10" width="22" height="8" className="fill-(--mural-brick)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${pattern})`} />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="font-form-unbounded text-[13px]/[19px] font-semibold tracking-[-0.26px] text-(--mural-ink)">{wall.name}</span>
        <span className="max-w-full truncate text-xs/[17px] text-(--mural-muted)">{wall.place}</span>
        <span className="text-[11px]/[16px] text-(--mural-muted) group-data-[state=checked]/wall:text-(--mural-ink)">{formatArea(wall)}</span>
      </span>
      <RainbowRing angular radius={16} width={2} data-slot="mural-booking-form-wall-ring" className="-inset-px hidden group-data-[state=checked]/wall:block" />
    </RadioGroupPrimitive.Item>
  )
}

/** A whole-number field with its unit after it (days, people); the arrow keys step it within `min`…`max`. */
function CountField({
  id,
  label,
  unit,
  value,
  min,
  max,
  error,
  errorId,
  onValueChange,
  ref,
  ...props
}: Omit<React.ComponentProps<"input">, "onChange" | "value" | "min" | "max"> & {
  id: string
  label: string
  unit: string
  value: string
  min: number
  max: number
  error?: string
  errorId: string
  onValueChange: (value: string) => void
}) {
  const count = parseCount(value)
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <label htmlFor={id} className={labelText}>
        {label}
      </label>
      <div className={cn("group/field", fieldBox, fieldFocus, error && fieldInvalid)}>
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Number.isNaN(count) ? undefined : count}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={value}
          onChange={(event) => onValueChange(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
            event.preventDefault()
            const next = Number.isNaN(count) ? min : count + (event.key === "ArrowUp" ? 1 : -1)
            onValueChange(String(Math.min(max, Math.max(min, next))))
          }}
          className="min-w-0 flex-1 bg-transparent caret-(--mural-violet) outline-none placeholder:text-(--mural-muted) disabled:cursor-default"
          {...props}
        />
        <span aria-hidden className={cn(hug, "shrink-0 text-xs/[17px] text-(--mural-muted)")}>
          {unit}
        </span>
        {!error && <FocusRing />}
      </div>
      {error && (
        <p id={errorId} className={errorText}>
          {error}
        </p>
      )}
    </div>
  )
}

/** The sketch row: a dashed box with the file's preview, name and size, and "Replace" (or an empty box to add one). */
function SketchPicker({
  id,
  label,
  replaceLabel,
  value,
  maxSize,
  error,
  errorId,
  disabled,
  onPick,
  ref,
}: {
  id: string
  label: string
  replaceLabel: string
  value: MuralBookingSketch | null
  maxSize: number
  error?: string
  errorId: string
  disabled?: boolean
  onPick: (file: File) => void
  ref: React.Ref<HTMLButtonElement>
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const rowRef = React.useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [dragging, setDragging] = React.useState(false)

  // A picked image shows itself in the thumbnail (through an object URL that goes when the image does).
  const file = value?.file
  const isImage = !!file && file.type.startsWith("image/")
  const previewRef = React.useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !file) return
      const url = URL.createObjectURL(file)
      img.src = url
      return () => URL.revokeObjectURL(url)
    },
    [file],
  )

  // A new sketch slides in.
  const lastName = React.useRef(value?.name)
  useIsomorphicLayoutEffect(() => {
    const previous = lastName.current
    lastName.current = value?.name
    if (!value || previous === value.name || reduced || !rowRef.current) return
    animate(rowRef.current, { opacity: [0, 1], x: [-8, 0], duration: 460, ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
  }, [value?.name, reduced])

  const pick = () => inputRef.current?.click()

  return (
    <div
      data-slot="mural-booking-form-sketch"
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const dropped = event.dataTransfer.files[0]
        if (!disabled && dropped) onPick(dropped)
      }}
      className={cn("relative flex min-h-[66px] rounded-2xl transition-colors duration-200 motion-reduce:transition-none", dragging && "bg-(--mural-tint)/[0.03]")}
    >
      <DashedOutline radius={16} dash={5} gap={4} className={error ? "text-(--mural-danger)" : "text-(--mural-line)"} />
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
        tabIndex={-1}
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0]
          if (picked) onPick(picked)
          event.target.value = ""
        }}
      />
      {value ? (
        <div ref={rowRef} className="flex min-w-0 flex-1 items-center gap-3 p-[13px]">
          <span className="relative block h-10 w-14 shrink-0 overflow-hidden rounded-lg">
            {isImage ? (
              <img ref={previewRef} alt="" className="size-full object-cover" />
            ) : (
              <span className="absolute inset-0 bg-[linear-gradient(90deg,var(--mural-rainbow))] opacity-80" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px]/[19px] font-medium text-(--mural-ink)">{value.name}</span>
            <span className="truncate text-xs/[17px] text-(--mural-muted)">
              {formatSize(value.size)}
              {value.note ? ` · ${value.note}` : ""}
            </span>
          </span>
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            onClick={pick}
            aria-label={`${replaceLabel} ${label.toLowerCase()} ${value.name}`}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "shrink-0 cursor-pointer rounded-md text-[13px]/[19px] font-medium text-(--mural-ink) transition-opacity duration-200 hover:opacity-80 disabled:cursor-default disabled:opacity-40",
              hug,
              focusRing,
            )}
          >
            {replaceLabel}
          </button>
        </div>
      ) : (
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          onClick={pick}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl px-4 py-3 text-center disabled:cursor-default",
            focusRing,
          )}
        >
          <span className="text-[13px]/[19px] font-medium text-(--mural-ink)">＋ Add your {label.toLowerCase()}</span>
          <span className="text-xs/[17px] text-(--mural-muted)">PNG, JPG or PDF up to {formatSize(maxSize)}</span>
        </button>
      )}
    </div>
  )
}

/** The focus stroke of a field box: Figma's angular rainbow, shown while the box has focus. */
function FocusRing() {
  return <RainbowRing angular radius={14} className="-inset-px opacity-0 transition-opacity duration-200 group-focus-within/field:opacity-100 motion-reduce:transition-none" />
}

// Figma's rainbow, as SVG gradient stops (the colours come from the palette variables).
const RAINBOW_STOPS = [
  [0, "--mural-red"],
  [0.17, "--mural-orange"],
  [0.33, "--mural-yellow"],
  [0.5, "--mural-green"],
  [0.67, "--mural-blue"],
  [0.83, "--mural-violet"],
  [1, "--mural-red"],
] as const

/**
 * Figma's rainbow strokes, drawn in SVG: a stroke of `width` centred `width / 2` inside the box, so 1.2 and 1.5px strokes
 * anti-alias on Figma's fractional pixels where a CSS border or a padded mask would snap to whole ones. `angular` is
 * Figma's angular rainbow (from three o'clock), which Figma spreads over the box as if it were square: a conic gradient
 * in a 100 × 100 square stretched over the box, masked by the stroke. Otherwise it's the linear rainbow, left to right;
 * `gradientRef` gets its gradient, which repeats, so shifting it by the box's width loops seamlessly. `radius` is the
 * box's outer corner radius.
 */
function RainbowRing({
  radius,
  width = 1.5,
  angular = false,
  gradientRef,
  className,
  ...props
}: React.ComponentProps<"span"> & { radius: number; width?: number; angular?: boolean; gradientRef?: React.Ref<SVGLinearGradientElement> }) {
  const id = React.useId().replace(/[^\w-]/g, "")
  const inset = width / 2
  const ring = (stroke: string) => (
    <rect
      x={inset}
      y={inset}
      width={`calc(100% - ${width}px)`}
      height={`calc(100% - ${width}px)`}
      rx={Math.max(0, radius - inset)}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
    />
  )
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-0", className)} {...props}>
      <svg className="absolute inset-0 size-full overflow-visible">
        {angular ? (
          <>
            <mask id={`${id}-ring`}>{ring("#fff")}</mask>
            <g mask={`url(#${id}-ring)`}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
                <foreignObject width="100" height="100">
                  <div className="size-full [background:conic-gradient(from_90deg,var(--mural-rainbow))]" />
                </foreignObject>
              </svg>
            </g>
          </>
        ) : (
          <>
            <linearGradient ref={gradientRef} id={`${id}-rainbow`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100%" y2="0" spreadMethod="repeat">
              {RAINBOW_STOPS.map(([offset, color]) => (
                <stop key={offset} offset={offset} style={{ stopColor: `var(${color})` }} />
              ))}
            </linearGradient>
            {ring(`url(#${id}-rainbow)`)}
          </>
        )}
      </svg>
    </span>
  )
}

/**
 * The rainbow-bordered button face: the dark fill stops on the 1.5px stroke's centre line, so the outer edge
 * anti-aliases once, as in Figma (a fill under the stroke would darken it).
 */
function RainbowFrame({ gradientRef }: { gradientRef?: React.Ref<SVGLinearGradientElement> }) {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-[0.75px] rounded-[14.75px] bg-(--mural-card)" />
      <RainbowRing radius={15.5} gradientRef={gradientRef} />
    </>
  )
}

/**
 * Figma's "✓" (an Instrument Sans SemiBold 11 glyph the font doesn't have, so it's drawn) on the done steps and the
 * insurance box, 10 × 16 like its text box. `draw` draws it in when it appears.
 */
function TickGlyph({ draw = false }: { draw?: boolean }) {
  const ref = React.useRef<SVGPathElement>(null)
  const reduced = useReducedMotion()
  useIsomorphicLayoutEffect(() => {
    const path = ref.current
    if (!path || reduced || !draw) return
    const tween = animate(path, { strokeDashoffset: [1, 0], duration: 380, ease: "outQuad" })
    return () => {
      tween.revert()
    }
  }, [reduced, draw])
  return (
    <svg viewBox="0 0 10 16" fill="none" aria-hidden className="h-4 w-2.5 shrink-0">
      <path
        ref={ref}
        d="M0.8 9.3 2.2 11.7 7.6 4.5"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
      />
    </svg>
  )
}

/**
 * Figma's dashed inside stroke on a rounded box: every straight side and every corner gets its own run of whole
 * dashes, half a dash at each end (one dash array around the whole box would drift out of Figma's phase). Measured, so
 * it follows the box when it stretches.
 */
function DashedOutline({ radius, dash, gap, className }: { radius: number; dash: number; gap: number; className?: string }) {
  const ref = React.useRef<SVGSVGElement>(null)
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null)
  useIsomorphicLayoutEffect(() => {
    const svg = ref.current
    if (!svg) return
    const measure = () => {
      const next = { width: svg.clientWidth, height: svg.clientHeight }
      setSize((current) => (current && current.width === next.width && current.height === next.height ? current : next))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  const segments: { d: string; length: number }[] = []
  if (size && size.width > 0 && size.height > 0) {
    // the 1px stroke's centre line, half a pixel inside the box
    const r = Math.max(0, Math.min(radius, size.width / 2, size.height / 2) - 0.5)
    const [x0, y0, x1, y1] = [0.5, 0.5, size.width - 0.5, size.height - 0.5]
    const arc = (Math.PI / 2) * r
    const corner = (fromX: number, fromY: number, toX: number, toY: number) => ({ d: `M${fromX} ${fromY}A${r} ${r} 0 0 1 ${toX} ${toY}`, length: arc })
    const side = (fromX: number, fromY: number, toX: number, toY: number) => ({
      d: `M${fromX} ${fromY}L${toX} ${toY}`,
      length: Math.hypot(toX - fromX, toY - fromY),
    })
    segments.push(
      side(x0 + r, y0, x1 - r, y0),
      corner(x1 - r, y0, x1, y0 + r),
      side(x1, y0 + r, x1, y1 - r),
      corner(x1, y1 - r, x1 - r, y1),
      side(x1 - r, y1, x0 + r, y1),
      corner(x0 + r, y1, x0, y1 - r),
      side(x0, y1 - r, x0, y0 + r),
      corner(x0, y0 + r, x0 + r, y0),
    )
  }

  return (
    <svg ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full overflow-visible", className)}>
      {segments.map(({ d, length }, i) => {
        if (length <= 0) return null
        const periods = Math.max(1, Math.round(length / (dash + gap)))
        const on = (length / periods) * (dash / (dash + gap))
        const off = length / periods - on
        return <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray={`${on} ${off}`} strokeDashoffset={on / 2} />
      })}
    </svg>
  )
}

/**
 * The calendar behind "Start": a month of days from Monday, the stay on site marked from the picked day, the arrow
 * keys moving by day and week, Page Up / Down by month, Home / End to the week's ends, Enter or Space to pick. Days
 * outside `min`…`max` can't be picked.
 */
function MuralCalendar({
  value,
  days,
  min,
  max,
  today,
  locale,
  onSelect,
}: {
  value: Date | null
  /** Days on site, marked from the picked day. */
  days: number
  min: Date
  max: Date
  today: Date
  locale: string
  onSelect: (date: Date) => void
}) {
  const clamp = (date: Date) => (date < min ? min : date > max ? max : date)
  const [focused, setFocused] = React.useState(() => clamp(value ?? min))
  const [month, setMonth] = React.useState(() => startOfMonth(focused))
  const gridRef = React.useRef<HTMLDivElement>(null)
  const moveFocus = React.useRef(false)
  const reduced = useReducedMotion()
  const stayEnd = value ? addDays(value, days - 1) : null

  const lead = (month.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i)) // 1 Jan 2024 was a Monday

  const goTo = (date: Date, { focus = false } = {}) => {
    const next = clamp(date)
    setFocused(next)
    setMonth(startOfMonth(next))
    moveFocus.current = focus
  }

  useIsomorphicLayoutEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${toDay(focused)}"]`)?.focus()
  }, [focused])

  // A new month slides in from the side it comes from.
  const lastMonth = React.useRef(month)
  useIsomorphicLayoutEffect(() => {
    const previous = lastMonth.current
    lastMonth.current = month
    if (previous.getTime() === month.getTime() || reduced || !gridRef.current) return
    animate(gridRef.current, {
      opacity: [0.2, 1],
      x: [month > previous ? 14 : -14, 0],
      duration: 380,
      ease: "outExpo",
      onComplete: releaseStyles("opacity", "transform"),
    })
  }, [month, reduced])

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const weekday = (focused.getDay() + 6) % 7
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
      Home: () => addDays(focused, -weekday),
      End: () => addDays(focused, 6 - weekday),
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    goTo(move(), { focus: true })
  }

  const navButton = cn(
    "flex size-7 items-center justify-center rounded-lg text-[15px]/[22px] text-(--mural-muted) transition-colors duration-200 hover:bg-(--mural-tint)/5 hover:text-(--mural-ink) disabled:pointer-events-none disabled:opacity-30",
    focusRing,
  )

  return (
    <div className="flex w-[232px] flex-col gap-2">
      <div className="flex items-center justify-between gap-1">
        <button type="button" aria-label="Previous month" disabled={startOfMonth(min) >= month} onClick={() => goTo(addMonths(focused, -1))} className={navButton}>
          ‹
        </button>
        <p aria-live="polite" className="font-form-unbounded text-[13px]/[19px] font-semibold tracking-[-0.26px]">
          {formatDate(month, locale, { month: "long", year: "numeric" })}
        </p>
        <button type="button" aria-label="Next month" disabled={startOfMonth(max) <= month} onClick={() => goTo(addMonths(focused, 1))} className={navButton}>
          ›
        </button>
      </div>
      <div ref={gridRef} role="grid" aria-label={formatDate(month, locale, { month: "long", year: "numeric" })} className="flex flex-col">
        <div role="row" className="grid grid-cols-7">
          {weekdays.map((day) => (
            <span
              key={day.getDay()}
              role="columnheader"
              aria-label={formatDate(day, locale, { weekday: "long" })}
              className="flex h-6 items-center justify-center text-[11px]/[16px] text-(--mural-muted)"
            >
              {formatDate(day, locale, { weekday: "short" }).slice(0, 2)}
            </span>
          ))}
        </div>
        {weeks.map((week, i) => (
          <div key={i} role="row" className="grid grid-cols-7 gap-y-0.5">
            {week.map((day, j) => {
              if (!day) return <span key={j} role="gridcell" />
              const key = toDay(day)
              const selected = value !== null && key === toDay(value)
              const onSite = value !== null && stayEnd !== null && day > value && day <= stayEnd
              const outOfRange = day < min || day > max
              return (
                <span
                  key={key}
                  role="gridcell"
                  aria-selected={selected}
                  className={cn(
                    "flex justify-center",
                    // the stay on site, as a band from the picked day to the last one
                    onSite && "bg-(--mural-chip)",
                    selected && days > 1 && "bg-[linear-gradient(90deg,transparent_50%,var(--mural-chip)_50%)]",
                    day.getTime() === stayEnd?.getTime() && days > 1 && "rounded-r-full",
                  )}
                >
                  <button
                    type="button"
                    data-slot="mural-booking-form-day"
                    data-day={key}
                    tabIndex={key === toDay(focused) ? 0 : -1}
                    disabled={outOfRange}
                    aria-current={key === toDay(today) ? "date" : undefined}
                    aria-label={formatDate(day, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    onClick={() => onSelect(day)}
                    onKeyDown={onKeyDown}
                    onFocus={() => {
                      if (key !== toDay(focused)) setFocused(day)
                    }}
                    className={cn(
                      "relative flex size-8 items-center justify-center rounded-full text-[13px]/[19px] transition-colors duration-150 hover:bg-(--mural-tint)/5 disabled:pointer-events-none disabled:text-(--mural-muted)/40 motion-reduce:transition-none",
                      selected && "font-semibold",
                      focusRing,
                    )}
                  >
                    {day.getDate()}
                    {selected && <RainbowRing angular radius={16} />}
                    {key === toDay(today) && <span aria-hidden className="absolute bottom-1 size-[3px] rounded-full bg-(--mural-muted)" />}
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export {
  MuralBookingForm,
  formatMuralBookingDay,
  formatMuralBookingRange,
  sampleMuralBookingTools,
  sampleMuralBookingValues,
  sampleMuralBookingWalls,
  type MuralBookingFormLabels,
  type MuralBookingFormPlaceholders,
  type MuralBookingFormProps,
  type MuralBookingFormValues,
  type MuralBookingSketch,
  type MuralBookingTool,
  type MuralBookingWall,
}
