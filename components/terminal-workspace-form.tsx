"use client"

import { animate, stagger, steps } from "animejs"
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioGroupPrimitive, Select as SelectPrimitive } from "radix-ui"
import * as React from "react"

import { useControllableState } from "@/hooks/use-controllable-state"
import { blink, releaseStyles, shake, useFormEntrance, useInView, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-form-motion"
import { useFormSubmit } from "@/hooks/use-form-submit"
import { cn } from "@/lib/utils"

/** A region of the --region list: its code (what the field shows) and where it is. */
type TerminalWorkspaceRegion = { value: string; label: string }

/** A row of the --plan table. */
type TerminalWorkspacePlan = {
  value: string
  /** The first column ("pro"). */
  label: string
  /** The price a month, per `unit`; 0 reads "$0". */
  price: number
  /** What the price is per: "seat" (the default) multiplies it by --seats. */
  unit?: string
  /** The third column. Without it, a plan with `trialDays` reads "14-day trial". */
  note?: string
  /** Free days before the price applies. */
  trialDays?: number
  /** Whether the plan comes with priority support; the option is off on the other plans. */
  prioritySupport?: boolean
}

type TerminalWorkspaceFormValues = {
  /** The workspace's handle: 3–32 of a–z, 0–9 and single dashes. */
  name: string
  /** The owner's address. */
  email: string
  /** A region's `value`. */
  region: string
  /** 1 to `maxSeats`. */
  seats: number
  /** A plan's `value`. */
  plan: string
  /** "email me the changelog". */
  changelog: boolean
  /** Priority support: always false on a plan without it. */
  prioritySupport: boolean
}

/** The flags in front of the fields (shown as "--name"…), also used in the command the form prints once it's done. */
type TerminalWorkspaceFormLabels = { name: string; email: string; region: string; seats: string; plan: string }

type TerminalWorkspaceFormProps = Omit<React.ComponentProps<"form">, "onSubmit" | "children" | "title" | "defaultValue" | "autoFocus"> & {
  /**
   * Starting values, merged over empty --name, --email and --seats on Figma's region, plan and options (sin1, pro,
   * changelog on); `sampleTerminalWorkspaceValues` is the filled Figma sample (mebius-studio, 4 seats). 0 seats is an
   * empty --seats.
   */
  defaultValues?: Partial<TerminalWorkspaceFormValues>
  /** Called with the valid values; may return a promise (the button spins until it settles). */
  onSubmit?: (values: TerminalWorkspaceFormValues) => void | Promise<void>
  /** "esc cancel" and the Escape key. Without it they put the default values back. */
  onCancel?: () => void
  /** The title bar's [x] and "esc close" once the workspace exists. Falls back to `onCancel`. */
  onClose?: () => void
  /** The heading after the "> " prompt. */
  title?: string
  /** The comment under the heading, after "# ". */
  hint?: string
  /** The title bar's file name; also the command the form prints once it's done. */
  filename?: string
  regions?: TerminalWorkspaceRegion[]
  plans?: TerminalWorkspacePlan[]
  /** The plan, controlled (a plan's `value`), with `onPlanChange`. */
  plan?: string
  onPlanChange?: (plan: string) => void
  /** Most seats a workspace can start with. */
  maxSeats?: number
  /** ISO currency of the plan prices. */
  currency?: string
  labels?: Partial<TerminalWorkspaceFormLabels>
  submitLabel?: string
  changelogLabel?: string
  prioritySupportLabel?: string
  /** Focuses --name on mount, as a dialog would. */
  autoFocus?: boolean
}

const sampleTerminalWorkspaceRegions: TerminalWorkspaceRegion[] = [
  { value: "sin1", label: "Singapore" },
  { value: "hnd1", label: "Tokyo" },
  { value: "syd1", label: "Sydney" },
  { value: "bom1", label: "Mumbai" },
  { value: "fra1", label: "Frankfurt" },
  { value: "iad1", label: "Washington, D.C." },
  { value: "sfo1", label: "San Francisco" },
  { value: "gru1", label: "São Paulo" },
]

const sampleTerminalWorkspacePlans: TerminalWorkspacePlan[] = [
  { value: "free", label: "free", price: 0, note: "3 projects" },
  { value: "pro", label: "pro", price: 12, trialDays: 14, prioritySupport: true },
  { value: "team", label: "team", price: 29, note: "SSO, audit log" },
]

const sampleTerminalWorkspaceValues: TerminalWorkspaceFormValues = {
  name: "mebius-studio",
  email: "rina@mebius.design",
  region: "sin1",
  seats: 4,
  plan: "pro",
  changelog: true,
  prioritySupport: false,
}

// What the window opens with: --name, --email and --seats empty (their placeholders show), Figma's region, plan and
// options.
const defaultTerminalWorkspaceValues: TerminalWorkspaceFormValues = { ...sampleTerminalWorkspaceValues, name: "", email: "", seats: 0 }

const defaultLabels: TerminalWorkspaceFormLabels = { name: "name", email: "email", region: "region", seats: "seats", plan: "plan" }

// The Figma frame's raw colours by role, light and dark ("Stage / 03 Terminal", light 2713:26659, dark 1891:82312) as
// light-dark(light, dark), so the form follows your app's dark class (it sets its own color-scheme from it). Every tint
// (the window's border and glow, the title bar, the focused field, the picked plan, the footer) is the accent at Figma's
// opacity. Override any of them on the form (style or a CSS rule on [data-slot="terminal-workspace-form"]) to re-skin it.
const palette = {
  "--term-screen": "light-dark(#fcfdfc, #08100a)", // the window, the region list
  "--term-field": "light-dark(#ffffff, transparent)", // the fields and the plans at rest (light only)
  "--term-accent": "#7dffa0", // phosphor green: a focused field, the cursor, the button, every tint
  "--term-accent-ink": "light-dark(#0da035, #7dffa0)", // green text: the heading, options, the title bar
  "--term-on-accent": "#08100a", // text on the green: the button, the cursor's letter, a selection
  "--term-button-hover": "light-dark(#6ad988, #e9ffef)", // the green button under the pointer (Figma draws no hover)
  "--term-ink": "light-dark(#00330e, #e9ffef)", // typed values and the picked plan
  "--term-dim": "#3f6e4e", // comments, prompts, borders at rest, the other plans' details
  "--term-flag": "light-dark(#a0700d, #ffc857)", // the --flags and the picked plan's price
  "--term-danger": "light-dark(#dc2626, #ff6b6b)", // errors (Figma has no red)
  "--term-success": "light-dark(#0da035, #7dffa0)", // [ok] once the workspace exists
  // the window's and the list's green glow (Figma's 16%, 9.4% in light) and the scanlines (black at 20%, 6% in light)
  "--term-glow": "light-dark(color-mix(in srgb, var(--term-accent) 9.4%, transparent), color-mix(in srgb, var(--term-accent) 16%, transparent))",
  "--term-menu-glow": "light-dark(color-mix(in srgb, var(--term-accent) 8.2%, transparent), color-mix(in srgb, var(--term-accent) 14%, transparent))",
  "--term-scanline": "light-dark(rgb(0 0 0 / 0.06), rgb(0 0 0 / 0.2))",
} as React.CSSProperties

// JetBrains Mono at Figma's sizes, with the line boxes Figma gives them (its "auto" line height, rounded).
const text11 = "text-[11px] leading-[15px]"
const text12 = "text-xs leading-4"
const text13 = "text-[13px] leading-[17px]"
const focusRing = "outline-none focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-dashed focus-visible:outline-(--term-accent)"

const SPINNER = ["|", "/", "-", "\\"]
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const FIELDS = ["name", "email", "seats"] as const
type FieldKey = (typeof FIELDS)[number]
type Errors = Partial<Record<FieldKey, string>>
type Draft = Omit<TerminalWorkspaceFormValues, "seats" | "plan"> & { seats: string }
type Outcome = { values: TerminalWorkspaceFormValues; seconds: number; trialEnds?: Date }

function fieldError(key: FieldKey, draft: Draft, maxSeats: number, labels: TerminalWorkspaceFormLabels) {
  if (key === "name") {
    const name = draft.name.trim()
    if (!name) return `--${labels.name} is required`
    if (name.length < 3) return `--${labels.name} needs 3 or more characters`
    if (name.length > 32) return `--${labels.name} takes up to 32 characters`
    if (!NAME.test(name)) return "use a-z, 0-9 and single dashes"
    return undefined
  }
  if (key === "email") {
    const email = draft.email.trim()
    if (!email) return `--${labels.email} is required`
    if (!EMAIL.test(email)) return "that's not an email address"
    return undefined
  }
  const seats = Number(draft.seats)
  if (!draft.seats.trim()) return `--${labels.seats} is required`
  if (!Number.isInteger(seats) || seats < 1 || seats > maxSeats) return `--${labels.seats} takes 1–${maxSeats}`
  return undefined
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount)
}

const perSeat = (plan: TerminalWorkspacePlan) => (plan.unit ?? "seat") === "seat"
const priceLabel = (plan: TerminalWorkspacePlan, currency: string) => (plan.price === 0 ? money(0, currency) : `${money(plan.price, currency)}/${plan.unit ?? "seat"}`)
const noteLabel = (plan: TerminalWorkspacePlan) => plan.note ?? (plan.trialDays ? `${plan.trialDays}-day trial` : "")

/** The elements of one of the form's slots, for anime.js. */
const slots = (root: HTMLElement | null, slot: string) => Array.from(root?.querySelectorAll<HTMLElement>(`[data-slot="terminal-workspace-form-${slot}"]`) ?? [])

/** Flickers an element in, like a terminal line being redrawn. */
function flicker(target: Element | Element[] | null | undefined, delay = 0) {
  if (!target || (Array.isArray(target) && !target.length)) return
  animate(target, { opacity: [0.2, 1, 0.5, 1], duration: 240, delay, ease: steps(4), onComplete: releaseStyles("opacity") })
}

/** Types a single line in from the left, one character cell per step. */
function typeIn(target: HTMLElement, { delay = 0, speed = 18 }: { delay?: number; speed?: number } = {}) {
  const chars = Math.max(4, Math.min(64, target.textContent?.length ?? 20))
  target.style.clipPath = "inset(0 100% 0 0)"
  return animate(target, {
    clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)"],
    duration: Math.min(560, chars * speed),
    delay,
    ease: steps(chars),
    onComplete: releaseStyles("clip-path"),
  })
}

/**
 * Figma's ⏎ (U+23CE isn't in JetBrains Mono's web subsets, Figma drew a fallback glyph 9.72px wide), outlined at Figma's
 * position in its cell so it looks the same whatever fonts are installed.
 */
function ReturnGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 9.722 17" className="h-[17px] w-[9.722px] shrink-0 overflow-visible" fill="currentColor">
      <path
        transform="translate(0.663 3.51)"
        d="M3.185 9.76323L0 6.22723L3.185 2.69123V4.75823H5.473V1.01423H8.411V6.20123C8.411 6.7299 8.307 7.11123 8.099 7.34523C7.89967 7.57923 7.50534 7.69623 6.916 7.69623H3.185V9.76323ZM2.639 8.34623V7.15023H6.916C7.31467 7.15023 7.57034 7.0939 7.683 6.98123C7.80434 6.8599 7.865 6.5999 7.865 6.20123V1.56023H6.019V5.30423H2.639V4.10823L0.728002 6.22723L2.639 8.34623Z"
      />
    </svg>
  )
}

/** A terminal block cursor at the caret, the character under it drawn inside the block. */
function BlockCursor({ index, scroll, char, invalid, className }: { index: number; scroll: number; char?: string; invalid?: boolean; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()
  React.useEffect(() => {
    const el = ref.current
    if (!el || reduced) return
    // solid while you type, blinking once you stop
    const blinking = animate(el, { opacity: [1, 0], duration: 1060, delay: 530, ease: blink, loop: true })
    return () => {
      blinking.revert()
    }
  }, [index, reduced])
  return (
    <span
      ref={ref}
      aria-hidden
      data-slot="terminal-workspace-form-cursor"
      // Figma's 8×16 block sits half a pixel down in the 17px line: a whole-pixel top plus a translate keeps its
      // anti-aliased edges; the left is the text's width rounded up, like the hugging text box it follows in Figma.
      className={cn("pointer-events-none absolute top-0 h-4 w-2 translate-y-[0.5px] overflow-hidden", invalid ? "bg-(--term-danger)" : "bg-(--term-accent)")}
      style={{ left: `calc(round(up, calc(${index}ch - 0.01px), 1px) - ${scroll}px)` }}
    >
      {char !== undefined && <span className={cn("block -translate-y-[0.5px] leading-[17px] whitespace-pre text-(--term-on-accent)", className)}>{char}</span>}
    </span>
  )
}

type TerminalInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string
  onValueChange: (value: string) => void
  invalid?: boolean
  /** Digits only; the arrow keys step the value within min–max. */
  numeric?: { min: number; max: number }
}

/** A field's input with the block cursor in place of the browser's caret. */
function TerminalInput({ value, onValueChange, invalid, numeric, className, readOnly, disabled, onKeyDown, onFocus, onBlur, onSelect, onScroll, ref, ...props }: TerminalInputProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [caret, setCaret] = React.useState<{ index: number; scroll: number } | null>(null)

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  const sync = () => {
    const el = inputRef.current
    if (!el || el.ownerDocument.activeElement !== el || readOnly || disabled) return setCaret(null)
    const { selectionStart: start, selectionEnd: end } = el
    setCaret(start !== null && start === end ? { index: start, scroll: el.scrollLeft } : null)
  }

  const step = (direction: 1 | -1) => {
    if (!numeric) return
    const current = Number(value)
    const next = value.trim() && Number.isFinite(current) ? Math.round(current) + direction : numeric.min
    onValueChange(String(Math.min(numeric.max, Math.max(numeric.min, next))))
  }

  return (
    // the cursor's `ch` is the input's: same size
    <span className={cn(text13, "relative flex h-[17px] min-w-0 flex-1")}>
      <input
        ref={setRefs}
        value={value}
        readOnly={readOnly}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        inputMode={numeric ? "numeric" : undefined}
        className={cn(
          "h-[17px] w-full min-w-0 bg-transparent p-0 leading-[17px] text-(--term-ink) caret-transparent outline-none placeholder:text-(--term-dim) selection:bg-(--term-accent) selection:text-(--term-on-accent) focus:placeholder:text-transparent disabled:cursor-default",
          className,
        )}
        onChange={(event) => onValueChange(numeric ? event.target.value.replace(/\D/g, "") : event.target.value)}
        onFocus={(event) => {
          onFocus?.(event)
          sync()
        }}
        onBlur={(event) => {
          onBlur?.(event)
          setCaret(null)
        }}
        onSelect={(event) => {
          onSelect?.(event)
          sync()
        }}
        onScroll={(event) => {
          onScroll?.(event)
          sync()
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented || !numeric || readOnly || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return
          event.preventDefault()
          step(event.key === "ArrowUp" ? 1 : -1)
        }}
        {...props}
      />
      {caret && <BlockCursor index={caret.index} scroll={caret.scroll} char={value[caret.index]} invalid={invalid} className={className} />}
    </span>
  )
}

/** A flag (label row) over its box, with the error under it. */
function Field({
  label,
  htmlFor,
  labelId,
  aside,
  error,
  errorId,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  labelId?: string
  aside?: React.ReactNode
  error?: string
  errorId?: string
  className?: string
  children: React.ReactNode
}) {
  const flag = cn(text12, "min-w-0 truncate text-(--term-flag)")
  return (
    <div data-slot="terminal-workspace-form-row" className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-start justify-between gap-3">
        {htmlFor ? (
          <label id={labelId} htmlFor={htmlFor} className={flag}>
            --{label}
          </label>
        ) : (
          <span id={labelId} className={flag}>
            --{label}
          </span>
        )}
        {aside}
      </div>
      {children}
      {error && (
        <p id={errorId} data-slot="terminal-workspace-form-error" className={cn(text12, "text-(--term-danger)")}>
          error: {error}
        </p>
      )}
    </div>
  )
}

/** The bordered box of a field: bright with a green tint while it has focus, red when invalid. */
const fieldBox = (invalid: boolean, className?: string) =>
  cn(
    "relative flex h-[39px] w-full min-w-0 items-center border bg-(--term-field) px-3 transition-colors duration-150",
    invalid
      ? "border-(--term-danger) focus-within:bg-(--term-danger)/6"
      : "border-(--term-dim) hover:border-(--term-accent)/60 focus-within:border-(--term-accent) focus-within:bg-(--term-accent)/6 hover:focus-within:border-(--term-accent)",
    className,
  )

/** One line of options: "[x] label  # comment", bright while checked. */
function CheckLine({
  id,
  name,
  checked,
  onCheckedChange,
  disabled,
  label,
  comment,
  commentId,
}: {
  id: string
  name: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label: string
  comment?: string
  commentId?: string
}) {
  return (
    <div
      data-slot="terminal-workspace-form-option"
      data-disabled={disabled || undefined}
      className={cn(text13, "flex max-w-full items-start gap-[1ch] whitespace-pre-wrap transition-colors duration-150 data-disabled:opacity-50", checked ? "text-(--term-accent-ink)" : "text-(--term-dim)")}
    >
      <CheckboxPrimitive.Root
        id={id}
        name={name}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        aria-describedby={comment ? commentId : undefined}
        className={cn("shrink-0 cursor-pointer whitespace-pre hover:text-(--term-accent-ink) disabled:cursor-not-allowed disabled:hover:text-inherit", focusRing)}
      >
        <span aria-hidden data-slot="terminal-workspace-form-check">
          {checked ? "[x]" : "[ ]"}
        </span>
      </CheckboxPrimitive.Root>
      <span className="min-w-0">
        <label htmlFor={id} className={cn("cursor-pointer", disabled && "cursor-not-allowed")}>
          {label}
        </label>
        {comment && <span id={commentId}>{`  # ${comment}`}</span>}
      </span>
    </div>
  )
}

/**
 * "Create a workspace" from the Keitoto library: a terminal window ("create-workspace.sh") that sets up a workspace from
 * CLI-style flags. --name and --email with a block cursor, a --region list, a --seats count (arrow keys step it), a
 * --plan table read from your plans (prices, trials, what each includes) and two options, the second only on the plans
 * that include it. Validates on submit, spins while it creates, then prints the command and what it made (the monthly
 * price from plan × seats, the trial's end). Animated with anime.js: the screen powers on, the heading and comment type
 * themselves, the rows print in, the picked row blinks on like a terminal redraw, the cursor blinks and the output types line
 * by line.
 */
function TerminalWorkspaceForm({
  defaultValues,
  onSubmit,
  onCancel,
  onClose,
  title = "Create a workspace",
  hint = "all fields can be changed later",
  filename = "create-workspace.sh",
  regions = sampleTerminalWorkspaceRegions,
  plans = sampleTerminalWorkspacePlans,
  plan: planProp,
  onPlanChange,
  maxSeats = 500,
  currency = "USD",
  labels: labelsProp,
  submitLabel = "create workspace",
  changelogLabel = "email me the changelog",
  prioritySupportLabel = "priority support",
  autoFocus = false,
  className,
  style,
  onKeyDown,
  ref,
  ...props
}: TerminalWorkspaceFormProps) {
  const labels = { ...defaultLabels, ...labelsProp }
  const id = React.useId()
  const ids = {
    title: `${id}-title`,
    name: `${id}-name`,
    email: `${id}-email`,
    region: `${id}-region`,
    seats: `${id}-seats`,
    plan: `${id}-plan`,
    changelog: `${id}-changelog`,
    support: `${id}-support`,
    supportNote: `${id}-support-note`,
    error: (key: FieldKey) => `${id}-${key}-error`,
  }

  const [initial] = React.useState(() => {
    const merged = { ...defaultTerminalWorkspaceValues, ...defaultValues }
    if (!regions.some((region) => region.value === merged.region)) merged.region = regions[0]?.value ?? ""
    if (!plans.some((plan) => plan.value === merged.plan)) merged.plan = plans[0]?.value ?? ""
    return merged
  })
  const toDraft = (values: TerminalWorkspaceFormValues): Draft => ({
    name: values.name,
    email: values.email,
    region: values.region,
    seats: values.seats > 0 ? String(values.seats) : "",
    changelog: values.changelog,
    prioritySupport: values.prioritySupport,
  })
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(initial))
  const [plan, setPlan] = useControllableState({ value: planProp, defaultValue: initial.plan, onChange: onPlanChange })
  const [errors, setErrors] = React.useState<Errors>({})
  const [failed, setFailed] = React.useState(false)
  const [outcome, setOutcome] = React.useState<Outcome | null>(null)
  const reduced = useReducedMotion()

  // Times the request and works out the trial's end, so the output can say both.
  const run = React.useCallback(
    async (values: TerminalWorkspaceFormValues) => {
      const started = performance.now()
      await onSubmit?.(values)
      const picked = plans.find((p) => p.value === values.plan)
      const trialEnds = picked?.trialDays ? new Date(Date.now() + picked.trialDays * 86_400_000) : undefined
      setOutcome({ values, seconds: (performance.now() - started) / 1000, trialEnds })
    },
    [onSubmit, plans],
  )
  const { status, submit, reset } = useFormSubmit(run)
  const done = status === "success" && outcome !== null
  const submitting = status === "submitting" || (status === "success" && !done)
  const locked = status !== "idle"

  const currentPlan = plans.find((p) => p.value === plan)
  const supportPlans = plans.filter((p) => p.prioritySupport)
  const supportAvailable = Boolean(currentPlan?.prioritySupport)
  const supportComment = supportPlans.length && supportPlans.length < plans.length ? `${supportPlans.map((p) => p.label).join("/")} only` : undefined

  const rootRef = React.useRef<HTMLFormElement | null>(null)
  const nameRef = React.useRef<HTMLInputElement>(null)
  const emailRef = React.useRef<HTMLInputElement>(null)
  const seatsRef = React.useRef<HTMLInputElement>(null)
  const plansRef = React.useRef<HTMLDivElement>(null)
  const spinnerRef = React.useRef<HTMLSpanElement>(null)
  const bandRef = React.useRef<HTMLDivElement>(null)
  const againRef = React.useRef<HTMLButtonElement>(null)
  const focusAfterReset = React.useRef(false)

  const setRoot = React.useCallback(
    (node: HTMLFormElement | null) => {
      rootRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    const next = { ...draft, [key]: value }
    setDraft(next)
    if (key === "name" || key === "email" || key === "seats") {
      const field = key as FieldKey
      setErrors((current) => (current[field] ? { ...current, [field]: fieldError(field, next, maxSeats, labels) } : current))
    }
  }

  const restore = () => {
    setDraft(toDraft(initial))
    setPlan(initial.plan)
    setErrors({})
    setFailed(false)
  }
  const cancel = () => (onCancel ?? restore)()
  const close = () => (onClose ?? onCancel ?? restore)()

  const fieldRefs: Record<FieldKey, React.RefObject<HTMLInputElement | null>> = { name: nameRef, email: emailRef, seats: seatsRef }

  const onFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (locked) return
    const found: Errors = {}
    for (const key of FIELDS) {
      const message = fieldError(key, draft, maxSeats, labels)
      if (message) found[key] = message
    }
    setErrors(found)
    setFailed(false)
    const first = FIELDS.find((key) => found[key])
    if (first) {
      fieldRefs[first].current?.focus()
      shake(rootRef.current, { distance: 6, duration: 360 })
      return
    }
    const values: TerminalWorkspaceFormValues = {
      name: draft.name.trim(),
      email: draft.email.trim(),
      region: draft.region,
      seats: Number(draft.seats),
      plan,
      changelog: draft.changelog,
      prioritySupport: supportAvailable && draft.prioritySupport,
    }
    try {
      await submit(values)
    } catch {
      setFailed(true)
    }
  }

  // "new workspace": back to the form with the name cleared (the rest is likely the same), --name focused.
  const startNew = () => {
    setDraft((current) => ({ ...current, name: "" }))
    setErrors({})
    setOutcome(null)
    focusAfterReset.current = true
    reset()
  }

  React.useEffect(() => {
    if (autoFocus) nameRef.current?.focus({ preventScroll: true })
    // on mount only, like the autoFocus attribute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (status !== "idle" || !focusAfterReset.current) return
    focusAfterReset.current = false
    nameRef.current?.focus()
  }, [status])

  // Done: the focused submit button is gone, so focus moves to "new workspace".
  React.useEffect(() => {
    if (done) againRef.current?.focus({ preventScroll: true })
  }, [done])

  // ── motion ────────────────────────────────────────────────────────────────────────────────────────────────────────

  // Entrance, once the window is a quarter in view: the screen powers on from a bright line, the title bar's lights come
  // on one by one, the heading and the comment type themselves and the rows print in from the top.
  useFormEntrance(rootRef, (timeline) => {
    const root = rootRef.current
    if (!root) return
    timeline.add(root, { scaleY: [0.012, 1], opacity: [0, 1], filter: ["brightness(2.4)", "brightness(1)"], duration: 560, ease: "outExpo", onComplete: releaseStyles("transform", "opacity", "filter") }, 0)
    const lights = slots(root, "light")
    if (lights.length) timeline.add(lights, { opacity: [0, 1], duration: 90, ease: steps(1), delay: stagger(110), onComplete: releaseStyles("opacity") }, 260)
    for (const [slot, at] of [["heading", 300], ["hint", 540]] as const) {
      const el = slots(root, slot)[0]
      if (!el) continue
      const chars = Math.max(4, el.textContent?.length ?? 20)
      timeline.add(el, { clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)"], duration: chars * 16, ease: steps(chars), onComplete: releaseStyles("clip-path") }, at)
    }
    const rows = slots(root, "row")
    if (rows.length) timeline.add(rows, { opacity: [0, 1], translateY: [4, 0], duration: 240, ease: steps(3), delay: stagger(70), onComplete: releaseStyles("opacity", "transform") }, 560)
    const footer = slots(root, "footer")
    if (footer.length) timeline.add(footer, { opacity: [0, 1], duration: 200, ease: steps(2), onComplete: releaseStyles("opacity") }, 860)
  })

  // Ambient: a faint refresh band rolls down the screen while it's in view.
  const inView = useInView(rootRef)
  React.useEffect(() => {
    const band = bandRef.current
    const root = rootRef.current
    if (!band || !root || !inView || reduced) return
    const sweep = animate(band, { translateY: [-band.offsetHeight, root.offsetHeight], opacity: [1, 1], duration: 7200, ease: "linear", loop: true })
    return () => {
      sweep.revert()
    }
  }, [inView, reduced, done])

  // The picked plan's highlight jumps to its row at once and blinks there, like an old terminal redrawing the line, and
  // the new row's (*) redraws.
  const lastPlan = React.useRef(plan)
  useIsomorphicLayoutEffect(() => {
    const previous = lastPlan.current
    lastPlan.current = plan
    const group = plansRef.current
    if (!group || previous === plan || reduced) return
    const to = group.querySelector<HTMLElement>(`[data-value="${CSS.escape(plan)}"]`)
    const fill = to?.querySelector<HTMLElement>('[data-slot="terminal-workspace-form-plan-fill"]')
    if (!to || !fill) return
    // on, off, on, off, on: each held for 70ms
    animate(fill, { opacity: [1, 0, 1, 0, 1], duration: 280, ease: steps(1), onComplete: releaseStyles("opacity") })
    flicker(to.querySelector('[data-slot="terminal-workspace-form-plan-marker"]'), 60)
  }, [plan, reduced])

  // A toggled option redraws its [x].
  const optionsKey = `${draft.changelog}|${supportAvailable && draft.prioritySupport}|${supportAvailable}`
  const lastOptions = React.useRef(optionsKey)
  useIsomorphicLayoutEffect(() => {
    const previous = lastOptions.current.split("|")
    lastOptions.current = optionsKey
    if (reduced) return
    const next = optionsKey.split("|")
    const checks = slots(rootRef.current, "check")
    flicker(checks.filter((_, i) => previous[i] !== next[i] || (i === 1 && previous[2] !== next[2])))
  }, [optionsKey, reduced])

  // Errors flicker in where they appear.
  const errorKey = FIELDS.filter((key) => errors[key]).join()
  useIsomorphicLayoutEffect(() => {
    if (reduced || !errorKey) return
    flicker(slots(rootRef.current, "error"))
  }, [errorKey, reduced])

  // Creating: the spinner turns and the title bar's lights chase each other.
  React.useEffect(() => {
    const root = rootRef.current
    if (!submitting || reduced || !root) return
    const spinner = spinnerRef.current
    const frame = { i: 0 }
    const spin = spinner
      ? animate(frame, {
          i: SPINNER.length,
          duration: 480,
          loop: true,
          ease: "linear",
          onUpdate: () => {
            spinner.textContent = SPINNER[Math.floor(frame.i) % SPINNER.length]
          },
        })
      : null
    const chase = animate(slots(root, "light"), { opacity: [1, 0.2, 1], duration: 540, delay: stagger(140), loop: true, ease: "linear" })
    return () => {
      spin?.cancel()
      chase.revert()
    }
  }, [submitting, reduced])

  // Done: the screen flashes, the output types itself line by line and the prompt's cursor blinks; back to the form,
  // the rows print in again.
  const lastDone = React.useRef(done)
  useIsomorphicLayoutEffect(() => {
    const previous = lastDone.current
    lastDone.current = done
    const root = rootRef.current
    if (previous === done || reduced || !root) return
    if (done) {
      animate(root, { filter: ["brightness(1.8)", "brightness(1)"], duration: 360, ease: steps(4), onComplete: releaseStyles("filter") })
      // the command echoes word by word, then each result line types itself
      const tokens = slots(root, "token")
      for (const token of tokens) token.style.opacity = "0"
      if (tokens.length) animate(tokens, { opacity: [0, 1], duration: 40, ease: steps(1), delay: stagger(45, { start: 120 }), onComplete: releaseStyles("opacity") })
      const start = 200 + tokens.length * 45
      slots(root, "out").forEach((line, i) => typeIn(line, { delay: start + i * 170, speed: 9 }))
    } else {
      animate(slots(root, "row"), { opacity: [0, 1], duration: 200, ease: steps(3), delay: stagger(50), onComplete: releaseStyles("opacity") })
    }
    flicker(slots(root, "footer-button"))
  }, [done, reduced])

  React.useEffect(() => {
    const cursor = slots(rootRef.current, "prompt-cursor")[0]
    if (!done || !cursor || !inView || reduced) return
    const blinking = animate(cursor, { opacity: [1, 0], duration: 1060, ease: blink, loop: true })
    return () => {
      blinking.revert()
    }
  }, [done, inView, reduced])

  // The region list portals to <body>: it gets the form's palette (as overridden on the form) and prints in.
  const setListRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !rootRef.current) return
      const computed = getComputedStyle(rootRef.current)
      for (const key of Object.keys(palette)) node.style.setProperty(key, computed.getPropertyValue(key))
      // and the form's light or dark, which its light-dark() colours resolve against
      node.style.setProperty("color-scheme", computed.colorScheme)
      if (!reduced) animate(node, { opacity: [0, 1], duration: 160, ease: steps(3), onComplete: releaseStyles("opacity") })
    },
    [reduced],
  )

  // ── content ───────────────────────────────────────────────────────────────────────────────────────────────────────

  const describedBy = (key: FieldKey) => (errors[key] ? ids.error(key) : undefined)

  const result = outcome?.values
  const resultPlan = result ? plans.find((p) => p.value === result.plan) : undefined
  const resultRegion = result ? regions.find((r) => r.value === result.region) : undefined
  const monthly = result && resultPlan ? resultPlan.price * (perSeat(resultPlan) ? result.seats : 1) : 0
  const trialEnd = outcome?.trialEnds ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(outcome.trialEnds) : undefined
  // The command the form ran, as tokens: each one wraps to the next line whole (a "--flag" never splits at its dashes).
  const command: { text: string; tone: string }[] = result
    ? [
        { text: "$", tone: "text-(--term-dim)" },
        { text: filename, tone: "font-bold text-(--term-accent-ink)" },
        ...(
          [
            [labels.name, result.name],
            [labels.email, result.email],
            [labels.region, result.region],
            [labels.seats, String(result.seats)],
            [labels.plan, result.plan],
            ...(result.changelog ? [["changelog"]] : []),
            ...(result.prioritySupport ? [["priority-support"]] : []),
          ] as [string, string?][]
        ).flatMap(([flag, value]) => [
          { text: `--${flag}`, tone: "text-(--term-flag)" },
          ...(value === undefined ? [] : [{ text: value, tone: "text-(--term-ink)" }]),
        ]),
      ]
    : []
  const okLines = result
    ? [
        `workspace ${result.name} created in ${result.region}${resultRegion ? ` (${resultRegion.label})` : ""}`,
        `owner ${result.email}`,
        `${resultPlan?.label ?? result.plan}, ${result.seats} seat${result.seats === 1 ? "" : "s"}: ${money(monthly, currency)}/mo${trialEnd ? ` after the trial ends ${trialEnd}` : ""}`,
        ...(result.changelog ? ["changelog emails on"] : []),
        ...(result.prioritySupport ? ["priority support on"] : []),
        `done in ${outcome.seconds.toFixed(1)}s`,
      ]
    : []

  return (
    <form
      noValidate
      aria-labelledby={ids.title}
      {...props}
      ref={setRoot}
      data-slot="terminal-workspace-form"
      data-status={done ? "success" : status}
      className={cn(
        "@container/term relative isolate flex w-full max-w-[520px] flex-col overflow-hidden rounded-[4px] border border-(--term-accent)/35 bg-(--term-screen) font-form-jetbrains-mono text-(--term-ink) antialiased shadow-[0_0_36px_var(--term-glow)] scheme-light dark:scheme-dark",
        className,
      )}
      style={{ ...palette, ...style }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        // Escape inside the form (not in the region list, which portals out and closes itself)
        if (event.defaultPrevented || event.key !== "Escape" || submitting || !rootRef.current?.contains(event.target as Node)) return
        event.preventDefault()
        if (done) close()
        else cancel()
      }}
      onSubmit={onFormSubmit}
    >
      <div
        data-slot="terminal-workspace-form-titlebar"
        className="flex items-center gap-2 border-b border-(--term-accent)/25 bg-(--term-accent)/6 px-3.5 py-2.5"
      >
        {/* Figma centres the 8px lights on y 3.5 of the 15px line: a whole-pixel top plus a translate */}
        <span aria-hidden className="flex shrink-0 gap-2 self-start pt-[3px]">
          {[0, 1, 2].map((light) => (
            <span key={light} data-slot="terminal-workspace-form-light" className="size-2 translate-y-[0.5px] bg-(--term-accent)/50" />
          ))}
        </span>
        <p className={cn(text11, "min-w-0 flex-1 truncate text-center text-(--term-accent-ink)/60")}>{filename}</p>
        <button
          type="button"
          aria-label="Close"
          data-slot="terminal-workspace-form-close"
          onClick={close}
          disabled={submitting}
          className={cn(text11, "hug-w shrink-0 cursor-pointer whitespace-pre text-(--term-accent-ink)/60 transition-colors duration-150 hover:text-(--term-accent-ink) disabled:cursor-default", focusRing)}
        >
          [x]
        </button>
      </div>

      <div data-slot="terminal-workspace-form-body" className="flex flex-col items-start gap-4 px-6 py-[22px] @max-[440px]/term:px-4">
        <h2 id={ids.title} data-slot="terminal-workspace-form-heading" className="max-w-full text-[18px] leading-6 font-bold text-(--term-accent-ink)">
          <span aria-hidden>{"> "}</span>
          {title}
        </h2>
        <p data-slot="terminal-workspace-form-hint" className={cn(text12, "max-w-full text-(--term-dim)")}>
          # {hint}
        </p>

        {done && result ? (
          <div data-slot="terminal-workspace-form-output" className={cn(text13, "flex w-full flex-col gap-1.5")}>
            <p data-slot="terminal-workspace-form-command">
              {command.map((token, i) => (
                <React.Fragment key={i}>
                  {i > 0 && " "}
                  <span data-slot="terminal-workspace-form-token" className={cn("inline-block max-w-full [overflow-wrap:anywhere]", token.tone)}>
                    {token.text}
                  </span>
                </React.Fragment>
              ))}
            </p>
            {okLines.map((line) => (
              <p key={line} data-slot="terminal-workspace-form-out" className="[overflow-wrap:anywhere] text-(--term-ink)">
                <span className="text-(--term-success)">[ok]</span> {line}
              </p>
            ))}
            <p data-slot="terminal-workspace-form-out" aria-hidden className="flex items-start">
              <span className="text-(--term-dim)">$&nbsp;</span>
              <span data-slot="terminal-workspace-form-prompt-cursor" className="h-4 w-2 translate-y-[0.5px] bg-(--term-accent)" />
            </p>
          </div>
        ) : (
          <>
            <Field
              label={labels.name}
              htmlFor={ids.name}
              aside={<span className={cn(text11, "shrink-0", errors.name ? "text-(--term-danger)" : "text-(--term-dim)")}>required</span>}
              error={errors.name}
              errorId={ids.error("name")}
            >
              <div className={fieldBox(Boolean(errors.name), "cursor-text")} onPointerDown={(event) => focusInput(event, nameRef)}>
                <span aria-hidden className={cn(text13, "hug-w shrink-0", errors.name ? "text-(--term-danger)" : "text-(--term-dim)")}>
                  $
                </span>
                <TerminalInput
                  ref={nameRef}
                  id={ids.name}
                  name="name"
                  value={draft.name}
                  onValueChange={(value) => update("name", value.toLowerCase().replace(/\s/g, "-"))}
                  invalid={Boolean(errors.name)}
                  aria-required
                  aria-describedby={describedBy("name")}
                  placeholder="workspace-name"
                  maxLength={64}
                  disabled={locked}
                  className={cn(text13, "font-bold")}
                />
              </div>
            </Field>

            <Field label={labels.email} htmlFor={ids.email} error={errors.email} errorId={ids.error("email")}>
              <div className={fieldBox(Boolean(errors.email), "cursor-text")} onPointerDown={(event) => focusInput(event, emailRef)}>
                <span aria-hidden className={cn(text13, "hug-w shrink-0", errors.email ? "text-(--term-danger)" : "text-(--term-dim)")}>
                  $
                </span>
                <TerminalInput
                  ref={emailRef}
                  id={ids.email}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={draft.email}
                  onValueChange={(value) => update("email", value)}
                  invalid={Boolean(errors.email)}
                  aria-required
                  aria-describedby={describedBy("email")}
                  placeholder="you@company.com"
                  disabled={locked}
                  className={cn(text13, "font-bold")}
                />
              </div>
            </Field>

            <div data-slot="terminal-workspace-form-pair" className="flex w-full items-start gap-3 @max-[340px]/term:flex-col">
              <Field label={labels.region} htmlFor={ids.region} className="flex-1">
                <SelectPrimitive.Root name="region" value={draft.region} onValueChange={(value) => update("region", value)} disabled={locked}>
                  <SelectPrimitive.Trigger
                    id={ids.region}
                    data-slot="terminal-workspace-form-region"
                    className={fieldBox(
                      false,
                      cn(
                        text13,
                        "cursor-pointer text-left whitespace-pre text-(--term-ink) outline-none focus-visible:border-(--term-accent) focus-visible:bg-(--term-accent)/6 disabled:cursor-default data-[state=open]:border-(--term-accent) data-[state=open]:bg-(--term-accent)/6",
                      ),
                    )}
                  >
                    <span aria-hidden>$ </span>
                    <span className="min-w-0 truncate">
                      <SelectPrimitive.Value />
                    </span>
                  </SelectPrimitive.Trigger>
                  <SelectPrimitive.Portal>
                    <SelectPrimitive.Content
                      ref={setListRef}
                      position="popper"
                      sideOffset={4}
                      className="z-50 max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) min-w-[208px] overflow-hidden border border-(--term-accent)/35 bg-(--term-screen) font-form-jetbrains-mono antialiased shadow-[0_0_24px_var(--term-menu-glow)]"
                    >
                      <SelectPrimitive.Viewport className="py-1">
                        {regions.map((region) => {
                          const checked = region.value === draft.region
                          return (
                            <SelectPrimitive.Item
                              key={region.value}
                              value={region.value}
                              className={cn(
                                text13,
                                "flex cursor-pointer items-center gap-[1ch] px-3 py-1.5 whitespace-pre outline-none select-none data-highlighted:bg-(--term-accent)/12",
                                checked ? "font-bold text-(--term-ink)" : "text-(--term-accent-ink)",
                              )}
                            >
                              <span aria-hidden>{checked ? "(*)" : "( )"}</span>
                              <SelectPrimitive.ItemText>{region.value}</SelectPrimitive.ItemText>
                              <span className="min-w-0 truncate font-normal text-(--term-dim)">{region.label}</span>
                            </SelectPrimitive.Item>
                          )
                        })}
                      </SelectPrimitive.Viewport>
                    </SelectPrimitive.Content>
                  </SelectPrimitive.Portal>
                </SelectPrimitive.Root>
              </Field>
              <Field label={labels.seats} htmlFor={ids.seats} error={errors.seats} errorId={ids.error("seats")} className="flex-1">
                <div className={fieldBox(Boolean(errors.seats), "cursor-text")} onPointerDown={(event) => focusInput(event, seatsRef)}>
                  <span aria-hidden className={cn(text13, "shrink-0 whitespace-pre", errors.seats ? "text-(--term-danger)" : "text-(--term-ink)")}>
                    ${" "}
                  </span>
                  <TerminalInput
                    ref={seatsRef}
                    id={ids.seats}
                    name="seats"
                    role="spinbutton"
                    aria-valuemin={1}
                    aria-valuemax={maxSeats}
                    aria-valuenow={Number(draft.seats) || undefined}
                    numeric={{ min: 1, max: maxSeats }}
                    value={draft.seats}
                    onValueChange={(value) => update("seats", value)}
                    invalid={Boolean(errors.seats)}
                    aria-required
                    aria-describedby={describedBy("seats")}
                    maxLength={String(maxSeats).length}
                    placeholder="1"
                    disabled={locked}
                    className={text13}
                  />
                </div>
              </Field>
            </div>

            <Field label={labels.plan} labelId={ids.plan}>
              <RadioGroupPrimitive.Root
                ref={plansRef}
                aria-labelledby={ids.plan}
                name="plan"
                value={plan}
                onValueChange={setPlan}
                disabled={locked}
                className="flex w-full flex-col border border-(--term-dim)"
              >
                {plans.map((option, i) => {
                  const checked = option.value === plan
                  return (
                    <RadioGroupPrimitive.Item
                      key={option.value}
                      value={option.value}
                      data-value={option.value}
                      className={cn(
                        text13,
                        "group/plan relative flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left outline-none disabled:cursor-default",
                        "focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-dashed focus-visible:outline-(--term-accent)",
                        i > 0 && "border-t border-(--term-dim)",
                        !checked && "bg-(--term-field) hover:bg-(--term-accent)/6 disabled:hover:bg-(--term-field)",
                      )}
                    >
                      {checked && <span aria-hidden data-slot="terminal-workspace-form-plan-fill" className="absolute inset-0 bg-(--term-accent)/12" />}
                      <span className={cn("relative w-[110px] shrink-0 whitespace-pre @max-[440px]/term:w-[76px]", checked ? "font-bold text-(--term-ink)" : "text-(--term-accent-ink)")}>
                        <span aria-hidden data-slot="terminal-workspace-form-plan-marker">
                          {checked ? "(*)" : "( )"}{" "}
                        </span>
                        {option.label}
                      </span>
                      <span className={cn("relative w-[84px] shrink-0 @max-[440px]/term:w-[70px]", checked ? "text-(--term-flag)" : "text-(--term-dim)")}>
                        {priceLabel(option, currency)}
                      </span>
                      <span className={cn("relative min-w-0 flex-1", checked ? "text-(--term-accent-ink)" : "text-(--term-dim)")}>{noteLabel(option)}</span>
                    </RadioGroupPrimitive.Item>
                  )
                })}
              </RadioGroupPrimitive.Root>
            </Field>

            <div data-slot="terminal-workspace-form-row" className="flex w-full flex-col items-start gap-1.5">
              <CheckLine
                id={ids.changelog}
                name="changelog"
                checked={draft.changelog}
                onCheckedChange={(checked) => update("changelog", checked)}
                disabled={locked}
                label={changelogLabel}
              />
              {supportPlans.length > 0 && (
                <CheckLine
                  id={ids.support}
                  name="prioritySupport"
                  checked={supportAvailable && draft.prioritySupport}
                  onCheckedChange={(checked) => update("prioritySupport", checked)}
                  disabled={locked || !supportAvailable}
                  label={prioritySupportLabel}
                  comment={supportComment}
                  commentId={ids.supportNote}
                />
              )}
            </div>
          </>
        )}
      </div>

      <div
        data-slot="terminal-workspace-form-footer"
        className="flex flex-wrap items-center justify-end gap-2.5 border-t border-(--term-accent)/25 bg-(--term-accent)/5 px-6 py-3.5 @max-[440px]/term:px-4"
      >
        {failed && !locked && (
          <p role="alert" className={cn(text12, "mr-auto min-w-0 text-(--term-danger)")}>
            error: workspace not created, try again
          </p>
        )}
        {done ? (
          <>
            {(onClose || onCancel) && (
              <button key="success-1" type="button" data-slot="terminal-workspace-form-footer-button" onClick={close} className={cn(text13, secondaryButton, focusRing)}>
                <span className="hug-w">{"esc  close"}</span>
              </button>
            )}
            <button key="success-2" ref={againRef} type="button" data-slot="terminal-workspace-form-footer-button" onClick={startNew} className={cn(text13, primaryButton, focusRing)}>
              <span className="hug-w flex items-start">
                <ReturnGlyph />
                {"  new workspace"}
              </span>
            </button>
          </>
        ) : (
          <>
            <button
              key="idle-1"
              type="button"
              data-slot="terminal-workspace-form-footer-button"
              onClick={cancel}
              disabled={submitting}
              aria-keyshortcuts="Escape"
              className={cn(text13, secondaryButton, focusRing)}
            >
              <span className="hug-w">{"esc  cancel"}</span>
            </button>
            <button
              key="idle-2"
              type="submit"
              data-slot="terminal-workspace-form-footer-button"
              aria-disabled={submitting || undefined}
              className={cn(text13, primaryButton, "aria-disabled:cursor-progress aria-disabled:hover:bg-(--term-accent)", focusRing)}
            >
              <span className="hug-w flex items-start">
                {submitting ? (
                  <span ref={spinnerRef} aria-hidden className="w-[1ch] shrink-0 text-center">
                    {SPINNER[0]}
                  </span>
                ) : (
                  <ReturnGlyph />
                )}
                {submitting ? "  creating workspace" : `  ${submitLabel}`}
              </span>
            </button>
          </>
        )}
      </div>

      {/* Figma's scanlines: 1px of black at 20% (6% in light) every 4px from the window's top edge (the first one under the
          border) */}
      <div
        aria-hidden
        data-slot="terminal-workspace-form-scanlines"
        className="pointer-events-none absolute inset-0 z-10 bg-[repeating-linear-gradient(to_bottom,transparent_0_3px,var(--term-scanline)_3px_4px)]"
      />
      <div
        ref={bandRef}
        aria-hidden
        data-slot="terminal-workspace-form-band"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-linear-to-b from-transparent via-(--term-accent)/4 to-transparent opacity-0"
      />

      <p aria-live="polite" className="sr-only">
        {submitting ? "Creating the workspace…" : done && result ? `Workspace ${result.name} created in ${result.region}.` : ""}
      </p>
    </form>
  )
}

const secondaryButton =
  "flex shrink-0 cursor-pointer border border-(--term-dim) px-3.5 py-[9px] whitespace-pre text-(--term-accent-ink) transition-colors duration-150 hover:border-(--term-accent)/60 hover:bg-(--term-accent)/8 disabled:cursor-default disabled:opacity-50 disabled:hover:border-(--term-dim) disabled:hover:bg-transparent"
const primaryButton =
  "flex shrink-0 cursor-pointer bg-(--term-accent) px-3.5 py-[9px] font-bold whitespace-pre text-(--term-on-accent) transition-colors duration-150 hover:bg-(--term-button-hover)"

/** A press on a field's box (the prompt, the padding) focuses its input; one on the input itself places the caret. */
function focusInput(event: React.PointerEvent<HTMLElement>, ref: React.RefObject<HTMLInputElement | null>) {
  if (event.target === ref.current || ref.current?.disabled) return
  event.preventDefault()
  ref.current?.focus()
}

export {
  TerminalWorkspaceForm,
  sampleTerminalWorkspacePlans,
  sampleTerminalWorkspaceRegions,
  sampleTerminalWorkspaceValues,
  type TerminalWorkspaceFormLabels,
  type TerminalWorkspaceFormProps,
  type TerminalWorkspaceFormValues,
  type TerminalWorkspacePlan,
  type TerminalWorkspaceRegion,
}
