"use client"

import { animate, createTimeline, stagger, svg } from "animejs"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"
import { Switch as SwitchPrimitive } from "radix-ui"
import * as React from "react"

import { useControllableState } from "@/hooks/use-controllable-state"
import { releaseStyles, shake, useCountUp, useFormEntrance, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-form-motion"
import { useFormSubmit } from "@/hooks/use-form-submit"
import { cn } from "@/lib/utils"

/** One line of the invoice: quantity × rate is its amount. */
type InvoiceLine = { description: string; quantity: number; rate: number }

type InvoiceFormValues = {
  /** The invoice number, shown as "#INV-0427". */
  number: string
  clientName: string
  clientEmail: string
  /** Issue date, `YYYY-MM-DD`. */
  issued: string
  /** Due date, `YYYY-MM-DD`; "in 14 days" is read from the two dates. */
  due: string
  /** The lines; empty ones (no description, no rate) are left out. */
  lines: InvoiceLine[]
  /** Tax in percent of the subtotal (11 for "Tax 11%"). */
  taxRate: number
  /** Whether the invoice gets a pay-by-card button. */
  cardPayments: boolean
}

type InvoiceTotals = { subtotal: number; tax: number; total: number }

type InvoiceFormProps = Omit<React.ComponentProps<"form">, "onSubmit" | "children"> & {
  /** The header title. */
  title?: string
  /** Starting values (no client and one empty line by default), also what "New invoice" starts from. */
  defaultValues?: Partial<InvoiceFormValues>
  /** ISO 4217 code for every amount. */
  currency?: string
  /** Formats amounts and dates. */
  locale?: string
  /** Days before the due date the client is reminded ("Auto-reminder 3 days before due"); `null` for none. */
  reminderDays?: number | null
  /** The card payments switch, controlled. */
  cardPayments?: boolean
  onCardPaymentsChange?: (enabled: boolean) => void
  /** "Send invoice", once everything is valid; may return a promise. */
  onSubmit?: (values: InvoiceFormValues) => void | Promise<void>
  /** "Save draft": saves as is, without validation; may return a promise. */
  onSaveDraft?: (values: InvoiceFormValues) => void | Promise<void>
  /** The header's close button. Without it, it starts a new invoice. */
  onClose?: () => void
}

const sampleInvoiceValues: InvoiceFormValues = {
  number: "INV-0427",
  clientName: "Acme Studio",
  clientEmail: "billing@acme.co",
  issued: "2026-10-27",
  due: "2026-11-10",
  lines: [
    { description: "Fleet dashboard, 12 screens", quantity: 1, rate: 2400 },
    { description: "Design system audit", quantity: 8, rate: 120 },
    { description: "Icon set, 48 icons", quantity: 1, rate: 480 },
  ],
  taxRate: 11,
  cardPayments: false,
}

// What the form opens with: Figma's number, dates and tax, the client empty (placeholders show) and one empty line.
const defaultInvoiceValues: InvoiceFormValues = {
  ...sampleInvoiceValues,
  clientName: "",
  clientEmail: "",
  lines: [{ description: "", quantity: 1, rate: 0 }],
}

// The Figma frame's raw colours by role, named like New Project's, light and dark ("Stage / 06 Editable table" light
// 2713:8551, dark 1891:79735) as light-dark(light, dark), so the form follows your app's dark class (it sets its own
// color-scheme from it). Override any of them on the form (style or a CSS rule on [data-slot="invoice-form"]) to
// re-skin it.
const palette = {
  "--inv-surface": "light-dark(#ffffff, #0a0a0a)", // the modal
  "--inv-sunken": "light-dark(#f5f5f5, #000000)", // the footer, the Pro tag
  "--inv-raised": "light-dark(#f8f8f8, #111111)", // the table header, the cell being edited
  "--inv-selected": "light-dark(#ededed, #1c1c1c)", // the switch track when off
  "--inv-line": "light-dark(#e4e4e4, #2a2a2a)", // table and card borders
  "--inv-divider": "light-dark(#ededed, #1f1f1f)", // the modal border, section dividers, the total's rule
  "--inv-text": "light-dark(#1a1a1a, #ededed)",
  "--inv-text-2": "light-dark(#5e5e5e, #a1a1a1)",
  "--inv-text-3": "light-dark(#808080, #6b6b6b)",
  "--inv-accent": "light-dark(#1c1c1c, #ededed)", // the primary button, the edited cell's border, the switch when on
  "--inv-on-accent": "light-dark(#ffffff, #000000)",
  "--inv-ring": "light-dark(rgb(26 26 26 / 0.4), rgb(237 237 237 / 0.4))", // focus rings (Figma draws none): the text at 40%
  "--inv-danger": "light-dark(#dc2626, #ff6166)", // Figma draws no error: light is the forms theme's form-danger
  "--inv-success": "#3dd68c",
  "--inv-shadow": "light-dark(rgb(15 18 26 / 0.08), rgb(0 0 0 / 0.6))", // the modal's
} as React.CSSProperties

// Figma's text styles: Geist with -1% tracking, Geist Mono without.
const text14 = "text-[14px] leading-5 tracking-[-0.01em]"
const text13 = "text-[13px] leading-[19px] tracking-[-0.01em]"
const text12 = "text-[12px] leading-[17px] tracking-[-0.01em]"
const mono12 = "font-form-geist-mono text-[12px] leading-[17px]"
const mono13 = "font-form-geist-mono text-[13px] leading-[19px]"
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-(--inv-ring)"
const ICON_STROKE = 1.875 // Figma's 1.25px at 16px (1.09375px at 14px) in Lucide's 24-unit grid

// The table's columns (Figma: Item fills, Qty 60, Rate 90, Amount 96); under 520px a line wraps into two rows.
const lineGrid = "grid grid-cols-3 @min-[520px]:grid-cols-[minmax(0,1fr)_60px_90px_96px]"
// The cell being edited (Figma's Qty cell in row 2): raised and boxed in a 1px light border that, as in Figma, adds
// to the row (a 42px row for 40). A cell with a divider on its left turns the divider light and draws the other
// three sides, so the box covers the column like Figma's. The lines reserve those 2px under the last line while no
// cell is edited, so the table keeps its height and nothing below it moves.
const editingBox = "focus-within:bg-(--inv-raised) focus-within:py-px focus-within:shadow-[inset_0_0_0_1px_var(--inv-accent)]"
const editingColumn =
  "focus-within:border-(--inv-accent) focus-within:bg-(--inv-raised) focus-within:py-px focus-within:shadow-[inset_0_1px_0_var(--inv-accent),inset_-1px_0_0_var(--inv-accent),inset_0_-1px_0_var(--inv-accent)]"
const invalidBox = "shadow-[inset_0_0_0_1px_var(--inv-danger)] focus-within:py-px focus-within:shadow-[inset_0_0_0_1px_var(--inv-danger)]"
const invalidColumn =
  "border-(--inv-danger) shadow-[inset_0_1px_0_var(--inv-danger),inset_-1px_0_0_var(--inv-danger),inset_0_-1px_0_var(--inv-danger)] focus-within:border-(--inv-danger) focus-within:py-px focus-within:shadow-[inset_0_1px_0_var(--inv-danger),inset_-1px_0_0_var(--inv-danger),inset_0_-1px_0_var(--inv-danger)]"
// The client's name and email: text until focused, then the editing box around it (the text doesn't move).
const inlineInput =
  "-mx-1.5 -my-0.5 block w-[calc(100%+12px)] rounded-[4px] bg-transparent px-1.5 py-0.5 outline-none transition-colors placeholder:text-(--inv-text-3) enabled:hover:bg-(--inv-raised)/70 focus:bg-(--inv-raised) focus:shadow-[inset_0_0_0_1px_var(--inv-accent)]"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DAY = 86_400_000

type Line = InvoiceLine & { id: string }
type InvoiceState = Omit<InvoiceFormValues, "lines"> & { lines: Line[] }
type Errors = Record<string, string>

const lineError = (id: string, field: "description" | "quantity") => `line-${id}-${field}`
const isEmptyLine = (line: InvoiceLine) => !line.description.trim() && !line.rate
const round2 = (n: number) => Math.round(n * 100) / 100

/** Subtotal, tax and total of some lines, rounded to cents. */
function invoiceTotals(lines: InvoiceLine[], taxRate: number): InvoiceTotals {
  const subtotal = round2(lines.reduce((sum, line) => sum + round2(line.quantity * line.rate), 0))
  const tax = round2((subtotal * taxRate) / 100)
  return { subtotal, tax, total: round2(subtotal + tax) }
}

function toState(values: InvoiceFormValues): InvoiceState {
  return { ...values, lines: values.lines.map((line, i) => ({ ...line, id: `line-${i}` })) }
}

function toValues({ lines, ...state }: InvoiceState): InvoiceFormValues {
  return {
    ...state,
    clientName: state.clientName.trim(),
    clientEmail: state.clientEmail.trim(),
    lines: lines.filter((line) => !isEmptyLine(line)).map(({ description, quantity, rate }) => ({ description: description.trim(), quantity, rate })),
  }
}

function validate(state: InvoiceState): Errors {
  const errors: Errors = {}
  if (!state.clientName.trim()) errors.clientName = "Add who the invoice is for."
  const email = state.clientEmail.trim()
  if (!email) errors.clientEmail = "Add the client's email."
  else if (!EMAIL.test(email)) errors.clientEmail = "Enter a valid email address."
  if (!state.issued) errors.issued = "Pick the issue date."
  if (!state.due) errors.due = "Pick the due date."
  else if (state.issued && state.due < state.issued) errors.due = "Due before the issue date."
  const filled = state.lines.filter((line) => !isEmptyLine(line))
  if (!filled.length) errors.lines = "Add at least one line."
  for (const line of filled) {
    if (!line.description.trim()) errors[lineError(line.id, "description")] = "Describe this line."
    else if (!(line.quantity > 0)) errors[lineError(line.id, "quantity")] = "Set a quantity above 0."
  }
  return errors
}

/** "INV-0427" → "INV-0428" (the next invoice after one is sent), keeping the digits' width. */
function nextNumber(number: string) {
  return number.replace(/(\d+)(?!.*\d)/, (digits) => String(Number(digits) + 1).padStart(digits.length, "0"))
}

const dayValue = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const daysBetween = (from: string, to: string) => Math.round((dayValue(to) - dayValue(from)) / DAY)
const shiftDays = (iso: string, days: number) => new Date(dayValue(iso) + days * DAY).toISOString().slice(0, 10)

/** Reads a typed amount ("$2,400.50", "2400,5"): digits and one decimal point; null while it isn't a number yet. */
function parseAmount(text: string) {
  const cleaned = text.replace(/[^\d.,]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".")
  if (!cleaned || cleaned === ".") return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? round2(value) : null
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T) {
  if (typeof ref === "function") ref(value)
  else if (ref) (ref as React.RefObject<T>).current = value
}

/**
 * A quantity or rate cell: shows the formatted value, the plain number (selected) while you edit it, and commits
 * every keystroke that reads as a number (so the amount and totals follow live). ArrowUp / ArrowDown step by 1
 * (Shift: 10).
 */
function NumberInput({
  value,
  onValueChange,
  format,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "defaultValue"> & {
  value: number
  onValueChange: (value: number) => void
  format: (value: number) => string
}) {
  const [draft, setDraft] = React.useState<string | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  // Like a spreadsheet cell, the content is selected on focus so typing replaces it: right after the plain number
  // renders (keyboard and programmatic focus), and again on the pointer's release, since a click places its caret
  // after the focus.
  const selectOnRender = React.useRef(false)
  const selectOnRelease = React.useRef(false)
  useIsomorphicLayoutEffect(() => {
    if (!selectOnRender.current) return
    selectOnRender.current = false
    if (input.current && document.activeElement === input.current) input.current.select()
  }, [draft])
  return (
    <input
      {...props}
      ref={input}
      inputMode="decimal"
      autoComplete="off"
      value={draft ?? format(value)}
      onFocus={(event) => {
        props.onFocus?.(event)
        selectOnRender.current = true
        setDraft(String(value))
      }}
      onPointerDown={(event) => {
        props.onPointerDown?.(event)
        selectOnRelease.current = document.activeElement !== event.currentTarget
      }}
      onPointerUp={(event) => {
        props.onPointerUp?.(event)
        if (!selectOnRelease.current) return
        selectOnRelease.current = false
        event.currentTarget.select()
      }}
      onBlur={(event) => {
        props.onBlur?.(event)
        selectOnRelease.current = false
        setDraft(null)
      }}
      onChange={(event) => {
        const text = event.target.value.replace(/[^\d.,]/g, "")
        setDraft(text)
        const parsed = parseAmount(text)
        onValueChange(parsed ?? 0)
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event)
        if (event.defaultPrevented || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return
        event.preventDefault()
        const next = Math.max(0, round2(value + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1)))
        setDraft(String(next))
        onValueChange(next)
      }}
    />
  )
}

/**
 * A date drawn as Figma's text ("Oct 27, 2026") over the native date input, which keeps the keyboard, the screen
 * reader and the system picker (opened on click, Enter or Space).
 */
function DateInput({
  value,
  onValueChange,
  display,
  invalid,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string
  onValueChange: (value: string) => void
  display: string
  invalid?: boolean
}) {
  const open = (input: HTMLInputElement) => {
    try {
      input.showPicker()
    } catch {
      // no picker (an old browser, a cross-origin frame): the field still takes typed dates
    }
  }
  return (
    <span
      className={cn(
        "relative -mx-1.5 -my-0.5 block rounded-[4px] px-1.5 py-0.5 transition-colors has-enabled:hover:bg-(--inv-raised)/70 has-focus-visible:bg-(--inv-raised) has-focus-visible:shadow-[inset_0_0_0_1px_var(--inv-accent)]",
        invalid && "shadow-[inset_0_0_0_1px_var(--inv-danger)] has-focus-visible:shadow-[inset_0_0_0_1px_var(--inv-danger)]",
        className,
      )}
    >
      <span aria-hidden className={cn("block truncate", !value && "text-(--inv-text-3)")}>
        {value ? display : "Pick a date"}
      </span>
      <input
        {...props}
        type="date"
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(event) => onValueChange(event.target.value)}
        onClick={(event) => {
          props.onClick?.(event)
          open(event.currentTarget)
        }}
        onKeyDown={(event) => {
          props.onKeyDown?.(event)
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          open(event.currentTarget)
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
      />
    </span>
  )
}

/** The submit button's spinner: a quarter arc on a faint ring, turned by anime.js while sending. */
function Spinner() {
  return (
    <svg data-slot="invoice-form-spinner" viewBox="0 0 16 16" fill="none" aria-hidden className="size-3.5">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

type InvoiceRowProps = {
  line: Line
  index: number
  money: (value: number) => string
  quantityFormat: (value: number) => string
  errors: Errors
  errorId: (key: string) => string
  onChange: (id: string, patch: Partial<InvoiceLine>) => void
  onRemove: (id: string, row: HTMLElement | null) => void
  canRemove: boolean
}

/** One editable line: description, quantity, rate and the amount read from them (it counts to new values). */
function InvoiceRow({ line, index, money, quantityFormat, errors, errorId, onChange, onRemove, canRemove }: InvoiceRowProps) {
  const amountRef = React.useRef<HTMLSpanElement>(null)
  const amount = round2(line.quantity * line.rate)
  useCountUp(amountRef, amount, money, { duration: 450 })
  const descriptionError = errors[lineError(line.id, "description")]
  const quantityError = errors[lineError(line.id, "quantity")]
  const message = descriptionError ?? quantityError
  const messageId = errorId(lineError(line.id, descriptionError ? "description" : "quantity"))
  const label = line.description.trim() || `line ${index + 1}`

  return (
    <div role="group" aria-label={`Line ${index + 1}`} data-slot="invoice-form-line" data-line={line.id} className="group/row border-t border-(--inv-line)">
      <div className={cn(lineGrid, "relative")}>
        <div className={cn("relative col-span-3 min-w-0 border-b border-(--inv-line) @min-[520px]:col-span-1 @min-[520px]:border-b-0", descriptionError ? invalidBox : editingBox)}>
          <input
            name={`lines.${index}.description`}
            data-col="description"
            aria-label="Description"
            aria-invalid={!!descriptionError || undefined}
            aria-describedby={descriptionError ? messageId : undefined}
            value={line.description}
            onChange={(event) => onChange(line.id, { description: event.target.value })}
            placeholder="Item description"
            autoComplete="off"
            className={cn(text13, "block h-[39px] w-full bg-transparent py-2.5 pr-9 pl-3 text-(--inv-text) outline-none placeholder:text-(--inv-text-3)")}
          />
        </div>
        {/* under 520px Qty starts the line's second row, without a divider: it is boxed on all four sides */}
        <div
          className={cn(
            "relative border-(--inv-line) @min-[520px]:border-l",
            quantityError ? cn(invalidColumn, "@max-[519px]:shadow-[inset_0_0_0_1px_var(--inv-danger)]") : cn(editingColumn, "@max-[519px]:focus-within:shadow-[inset_0_0_0_1px_var(--inv-accent)]"),
          )}
        >
          <span aria-hidden className={cn(text12, "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--inv-text-3) @min-[520px]:hidden")}>
            Qty
          </span>
          <NumberInput
            name={`lines.${index}.quantity`}
            data-col="quantity"
            aria-label="Quantity"
            aria-invalid={!!quantityError || undefined}
            aria-describedby={quantityError ? messageId : undefined}
            value={line.quantity}
            onValueChange={(quantity) => onChange(line.id, { quantity })}
            format={quantityFormat}
            className={cn(mono13, "block h-[39px] w-full bg-transparent px-3 py-2.5 text-right text-(--inv-text) outline-none")}
          />
        </div>
        <div className={cn("relative border-l border-(--inv-line)", editingColumn)}>
          <span aria-hidden className={cn(text12, "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--inv-text-3) @min-[520px]:hidden")}>
            Rate
          </span>
          <NumberInput
            name={`lines.${index}.rate`}
            data-col="rate"
            aria-label="Rate"
            value={line.rate}
            onValueChange={(rate) => onChange(line.id, { rate })}
            format={money}
            className={cn(mono13, "block h-[39px] w-full bg-transparent px-3 py-2.5 text-right text-(--inv-text) outline-none")}
          />
        </div>
        <div className="flex items-start justify-end border-l border-(--inv-line) px-3 py-2.5">
          <span className="sr-only">Amount </span>
          <span ref={amountRef} data-slot="invoice-form-amount" className={cn(mono13, "truncate text-(--inv-text)")}>
            {money(amount)}
          </span>
        </div>
        {/* last in the tab order (description, quantity, rate, remove), drawn at the description's right end */}
        {canRemove && (
          <button
            type="button"
            data-slot="invoice-form-remove-line"
            aria-label={`Remove ${label}`}
            onClick={(event) => onRemove(line.id, event.currentTarget.closest<HTMLElement>("[data-line]"))}
            className={cn(
              focusRing,
              "absolute top-[7.5px] right-2 flex size-6 items-center justify-center rounded-[6px] text-(--inv-text-3) opacity-0 transition-[opacity,color,background-color] group-hover/row:opacity-100 hover:bg-(--inv-selected) hover:text-(--inv-text) focus-visible:opacity-100 disabled:hidden @min-[520px]:right-[254px] [@media(hover:none)]:opacity-100",
            )}
          >
            <XIcon className="size-3" strokeWidth={2.25} />
          </button>
        )}
      </div>
      {message && (
        <p id={messageId} data-slot="invoice-form-error" data-error={messageId} className={cn(text12, "px-3 pb-2.5 text-(--inv-danger)")}>
          {message}
        </p>
      )}
    </div>
  )
}

/**
 * "Invoice" from the Keitoto library ("Stage / 06 Editable table"): the invoice number, who it's billed to (name and
 * email, editable in place), issue and due dates (the system date picker under Figma's text, "in 14 days" read from
 * the two), an editable table of lines (description, quantity, rate; the amount is read from them) where you add and
 * remove lines, a card payments switch and the subtotal, tax and total, all computed as you type. "Save draft" saves
 * without validating; "Send invoice" validates and sends. Animated with anime.js: the modal rises in, the lines
 * stagger in and the totals count up, new lines unfold and removed ones fold away, amounts count to their new values,
 * the switch's knob slides, an invalid send shakes and the sent state pops in.
 */
function InvoiceForm({
  title = "Invoice",
  defaultValues,
  currency = "USD",
  locale = "en-US",
  reminderDays = 3,
  cardPayments: cardPaymentsProp,
  onCardPaymentsChange,
  onSubmit,
  onSaveDraft,
  onClose,
  className,
  style,
  onKeyDown,
  ref,
  ...props
}: InvoiceFormProps) {
  const id = React.useId()
  const ids = {
    title: `${id}-title`,
    clientName: `${id}-client`,
    issued: `${id}-issued`,
    due: `${id}-due`,
    dueNote: `${id}-due-note`,
    lines: `${id}-lines`,
    cardLabel: `${id}-card-label`,
    cardNote: `${id}-card-note`,
    cardSwitch: `${id}-card`,
    error: (key: string) => `${id}-${key}-error`,
  }

  const [state, setState] = React.useState(() => toState({ ...defaultInvoiceValues, ...defaultValues }))
  const [cardPayments, setCardPayments] = useControllableState({
    value: cardPaymentsProp,
    defaultValue: defaultValues?.cardPayments ?? defaultInvoiceValues.cardPayments,
    onChange: onCardPaymentsChange,
  })
  const [errors, setErrors] = React.useState<Errors>({})
  const [draft, setDraft] = React.useState<"idle" | "saving" | "saved">("idle")
  const { status, submit, reset: resetStatus } = useFormSubmit(onSubmit)
  const sent = status === "success"
  const sending = status === "submitting"

  const money = React.useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: Number.isInteger(round2(value)) ? 0 : 2, maximumFractionDigits: 2 }).format(value),
    [locale, currency],
  )
  const quantityFormat = React.useCallback((value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value), [locale])
  const dateFormat = React.useCallback(
    (iso: string, withYear = true) =>
      iso ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", ...(withYear && { year: "numeric" }), timeZone: "UTC" }).format(dayValue(iso)) : "",
    [locale],
  )

  const filled = state.lines.filter((line) => !isEmptyLine(line))
  const totals = invoiceTotals(filled, state.taxRate)
  const termDays = state.issued && state.due ? daysBetween(state.issued, state.due) : null
  const values = (): InvoiceFormValues => ({ ...toValues(state), cardPayments })

  const root = React.useRef<HTMLFormElement>(null)
  const subtotalRef = React.useRef<HTMLElement>(null)
  const taxRef = React.useRef<HTMLElement>(null)
  const totalRef = React.useRef<HTMLElement>(null)
  const termRef = React.useRef<HTMLSpanElement>(null)
  const defaults = React.useRef(defaultValues)
  const latest = React.useRef({ state, errors })
  const nextLineId = React.useRef(0)
  const focusLine = React.useRef<{ id: string; col: string } | null>(null)
  const focusInvalid = React.useRef(false)
  const draftTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reduced = useReducedMotion()

  useIsomorphicLayoutEffect(() => {
    defaults.current = defaultValues
    latest.current = { state, errors }
  })
  React.useEffect(() => () => clearTimeout(draftTimer.current), [])

  const setRoot = React.useCallback(
    (node: HTMLFormElement | null) => {
      root.current = node
      setRef(ref, node)
    },
    [ref],
  )

  const all = (selector: string) => Array.from(root.current?.querySelectorAll<HTMLElement>(selector) ?? [])

  /** Updates fields from the latest state (also after a tween); an error the change fixes goes away. */
  const update = (patch: Partial<InvoiceState> | ((current: InvoiceState) => Partial<InvoiceState>)) => {
    const current = latest.current.state
    const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) }
    latest.current = { ...latest.current, state: next }
    setState(next)
    if (draft === "saved") setDraft("idle")
    if (!Object.keys(latest.current.errors).length) return
    const fresh = validate(next)
    setErrors((errorsNow) => {
      const kept: Errors = {}
      for (const key of Object.keys(errorsNow)) if (fresh[key]) kept[key] = fresh[key]
      return kept
    })
  }

  const updateLine = (lineId: string, patch: Partial<InvoiceLine>) =>
    update((current) => ({ lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)) }))

  const addLine = (col = "description") => {
    const lineId = `line-new-${nextLineId.current++}`
    focusLine.current = { id: lineId, col }
    update((current) => ({ lines: [...current.lines, { id: lineId, description: "", quantity: 1, rate: 0 }] }))
  }

  const removeLine = (lineId: string, row: HTMLElement | null) => {
    const lines = latest.current.state.lines
    const index = lines.findIndex((line) => line.id === lineId)
    const neighbour = lines[index + 1] ?? lines[index - 1]
    const commit = () => {
      focusLine.current = neighbour ? { id: neighbour.id, col: "description" } : { id: "add", col: "" }
      update((current) => ({ lines: current.lines.filter((line) => line.id !== lineId) }))
    }
    if (!row || reduced) return commit()
    // the line folds away, then leaves the state
    row.style.overflow = "hidden"
    animate(row, { height: [row.offsetHeight, 0], opacity: [1, 0], duration: 220, ease: "inOutQuad", onComplete: commit })
  }

  const resetForm = (number?: string) => {
    const base = { ...defaultInvoiceValues, ...defaults.current }
    setState(toState({ ...base, number: number ?? base.number }))
    setErrors({})
    setDraft("idle")
    resetStatus()
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status !== "idle") return
    const found = validate(state)
    if (Object.keys(found).length) {
      setErrors(found)
      focusInvalid.current = true
      shake(root.current)
      return
    }
    setErrors({})
    try {
      await submit(values())
    } catch {
      setErrors({ form: "Couldn't send the invoice. Try again." })
    }
  }

  const saveDraft = async () => {
    if (draft === "saving" || sending) return
    clearTimeout(draftTimer.current)
    setDraft("saving")
    try {
      await onSaveDraft?.(values())
      setDraft("saved")
      draftTimer.current = setTimeout(() => setDraft("idle"), 1800)
    } catch {
      setDraft("idle")
      setErrors((current) => ({ ...current, form: "Couldn't save the draft. Try again." }))
    }
  }

  // Enter never sends from a field: in the table it moves down a line (adding one after the last), elsewhere it does
  // nothing. Only the Send button sends.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    onKeyDown?.(event)
    const target = event.target as HTMLElement
    if (event.defaultPrevented || event.key !== "Enter" || target.tagName !== "INPUT" || (target as HTMLInputElement).type === "date") return
    event.preventDefault()
    const col = target.dataset.col
    const lineId = target.closest<HTMLElement>("[data-line]")?.dataset.line
    if (!col || !lineId) return
    const lines = latest.current.state.lines
    const next = lines[lines.findIndex((line) => line.id === lineId) + 1]
    if (next) root.current?.querySelector<HTMLInputElement>(`[data-line="${next.id}"] [data-col="${col}"]`)?.focus()
    else addLine("description")
  }

  // ── motion ──────────────────────────────────────────────────────────────────────────────────────────────────────

  // Entrance, once the invoice is in view: the modal rises, the details and lines follow one after another, the
  // totals count up from zero.
  const totalsRef = React.useRef(totals)
  const moneyRef = React.useRef(money)
  useIsomorphicLayoutEffect(() => {
    totalsRef.current = totals
    moneyRef.current = money
  })
  useFormEntrance(root, (timeline) => {
    const form = root.current
    if (!form) return
    const progress = { t: 0 }
    const paint = () => {
      const { subtotal, tax, total } = totalsRef.current
      for (const [el, value] of [[subtotalRef.current, subtotal], [taxRef.current, tax], [totalRef.current, total]] as const)
        if (el) el.textContent = moneyRef.current(round2(value * progress.t))
    }
    paint()
    timeline
      .add(form, { opacity: { from: 0 }, y: { from: 18 }, scale: { from: 0.985 }, duration: 700, ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
      .add(all('[data-slot="invoice-form-meta"] > *'), { opacity: { from: 0 }, y: { from: 8 }, duration: 500, ease: "outQuad", delay: stagger(70), onComplete: releaseStyles("opacity", "transform") }, 150)
      .add(all('[data-slot="invoice-form-line"], [data-slot="invoice-form-add-line"]'), { opacity: { from: 0 }, y: { from: 8 }, duration: 500, ease: "outQuad", delay: stagger(60), onComplete: releaseStyles("opacity", "transform") }, 260)
      .add(all('[data-slot="invoice-form-card-payments"], [data-slot="invoice-form-totals"] > *'), { opacity: { from: 0 }, y: { from: 6 }, duration: 500, ease: "outQuad", delay: stagger(70), onComplete: releaseStyles("opacity", "transform") }, 420)
      .add(progress, { t: [0, 1], duration: 1200, ease: "outExpo", onUpdate: paint }, 450)
      .add(all('[data-slot="invoice-form-footer"] > *'), { opacity: { from: 0 }, duration: 500, ease: "outQuad", delay: stagger(70), onComplete: releaseStyles("opacity") }, 380)
    // a reverted entrance leaves the counters' text behind: put React's back
    return () => {
      progress.t = 1
      paint()
    }
  })

  // Totals and the due date's distance count to their new values.
  useCountUp(subtotalRef, totals.subtotal, money, { duration: 500 })
  useCountUp(taxRef, totals.tax, money, { duration: 500 })
  useCountUp(totalRef, totals.total, money, { duration: 650 })
  useCountUp(termRef, termDays ?? 0, (n) => String(Math.round(n)), { duration: 400, enabled: termDays !== null && termDays > 0 })

  // A new line unfolds and takes focus; after a removal the next line (or "Add line") takes it.
  const lineIds = state.lines.map((line) => line.id).join("|")
  useIsomorphicLayoutEffect(() => {
    const target = focusLine.current
    if (!target) return
    focusLine.current = null
    if (target.id === "add") return root.current?.querySelector<HTMLElement>('[data-slot="invoice-form-add-line"]')?.focus()
    const row = root.current?.querySelector<HTMLElement>(`[data-line="${target.id}"]`)
    row?.querySelector<HTMLInputElement>(`[data-col="${target.col}"]`)?.focus()
    if (row && !reduced && target.id.startsWith("line-new-")) {
      row.style.overflow = "hidden"
      animate(row, { height: [0, row.offsetHeight], opacity: [0, 1], duration: 300, ease: "outQuad", onComplete: releaseStyles("height", "opacity", "overflow") })
    }
  }, [lineIds, reduced])

  // The switch's knob slides with a little stretch.
  const lastCard = React.useRef(cardPayments)
  useIsomorphicLayoutEffect(() => {
    if (lastCard.current === cardPayments) return
    lastCard.current = cardPayments
    const thumb = root.current?.querySelector('[data-slot="invoice-form-switch-thumb"]')
    if (!thumb || reduced) return
    animate(thumb, { x: cardPayments ? [0, 14] : [14, 0], scaleX: [1, 1.25, 1], duration: 320, ease: "outQuad", onComplete: releaseStyles("transform") })
  }, [cardPayments, reduced])

  // New error messages drop in; the first invalid field takes focus after a failed send.
  const errorKeys = Object.keys(errors)
  const lastErrors = React.useRef<string[]>([])
  useIsomorphicLayoutEffect(() => {
    const previous = lastErrors.current
    lastErrors.current = errorKeys
    if (focusInvalid.current) {
      focusInvalid.current = false
      const target = root.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? (errors.lines ? root.current?.querySelector<HTMLElement>('[data-slot="invoice-form-add-line"]') : null)
      target?.focus()
    }
    if (reduced) return
    const fresh = errorKeys.filter((key) => !previous.includes(key)).map((key) => ids.error(key))
    const messages = all('[data-slot="invoice-form-error"]').filter((el) => fresh.includes(el.dataset.error ?? ""))
    if (messages.length) animate(messages, { opacity: [0, 1], y: [-4, 0], duration: 320, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [errorKeys.join("|"), reduced])

  // While sending, the spinner turns.
  useIsomorphicLayoutEffect(() => {
    if (!sending || reduced) return
    const spinner = root.current?.querySelector('[data-slot="invoice-form-spinner"]')
    if (!spinner) return
    const spin = animate(spinner, { rotate: 360, duration: 750, ease: "linear", loop: true })
    return () => {
      spin.revert()
    }
  }, [sending, reduced])

  // Sent: the status tag pops in, the footer note slides up and its check draws itself.
  useIsomorphicLayoutEffect(() => {
    if (!sent || reduced) return
    const tag = root.current?.querySelector('[data-slot="invoice-form-sent"]')
    const note = root.current?.querySelector('[data-slot="invoice-form-sent-note"]')
    const check = note?.querySelector("path")
    const timeline = createTimeline()
    if (tag) timeline.add(tag, { scale: [0.6, 1], opacity: [0, 1], duration: 450, ease: "outBack(2)", onComplete: releaseStyles("transform", "opacity") })
    if (note) timeline.add(note, { opacity: [0, 1], y: [6, 0], duration: 380, ease: "outQuad", onComplete: releaseStyles("transform", "opacity") }, 80)
    if (check) timeline.add(svg.createDrawable(check), { draw: ["0 0", "0 1"], duration: 380, ease: "outQuad" }, 220)
    return () => {
      timeline.revert()
    }
  }, [sent, reduced])

  // "Saved": the draft button's check pops.
  useIsomorphicLayoutEffect(() => {
    if (draft !== "saved" || reduced) return
    const icon = root.current?.querySelector('[data-slot="invoice-form-saved-icon"]')
    if (icon) animate(icon, { scale: [0.3, 1], rotate: [-25, 0], duration: 420, ease: "outBack(2.4)", onComplete: releaseStyles("transform") })
  }, [draft, reduced])

  // ── content ─────────────────────────────────────────────────────────────────────────────────────────────────────

  const described = (key: string) => (errors[key] ? ids.error(key) : undefined)
  const reminderDate = reminderDays && state.due ? dateFormat(shiftDays(state.due, -reminderDays), false) : ""
  const footerNote = errors.form
    ? errors.form
    : reminderDays
      ? `Auto-reminder ${reminderDays} ${reminderDays === 1 ? "day" : "days"} before due`
      : "No auto-reminder"

  return (
    <form
      ref={setRoot}
      noValidate
      data-slot="invoice-form"
      aria-labelledby={ids.title}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className={cn(
        "@container relative flex w-full max-w-[600px] flex-col rounded-[12px] border border-(--inv-divider) bg-(--inv-surface) font-form-geist text-(--inv-text) antialiased",
        // Figma: 0 30 60 -20, black at 60% (light: #0f121a at 8%; a Figma blur of 60 is a CSS blur of about 54)
        "shadow-[0_30px_54px_-20px_var(--inv-shadow)] scheme-light dark:scheme-dark",
        className,
      )}
      style={{ ...palette, ...style }}
      {...props}
    >
      <header data-slot="invoice-form-header" className="flex items-center gap-3 border-b border-(--inv-divider) px-5 py-[18px]">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-2">
          <h2 id={ids.title} className="text-[20px] leading-[26px] font-bold tracking-[-0.01em] text-(--inv-text)">
            {title}
          </h2>
          <p className={cn(mono13, "text-(--inv-text-3)")}>#{state.number}</p>
          {sent && (
            <span
              data-slot="invoice-form-sent"
              className={cn(mono12, "mb-px self-end rounded-[4px] border border-(--inv-success)/40 bg-(--inv-success)/10 px-1.5 text-(--inv-success)")}
            >
              Sent
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose ?? (() => resetForm())}
          className={cn(focusRing, "relative size-4 shrink-0 rounded-[4px] text-(--inv-text-3) transition-colors before:absolute before:-inset-2 hover:text-(--inv-text)")}
        >
          <XIcon className="size-4" strokeWidth={ICON_STROKE} />
        </button>
      </header>

      <fieldset disabled={sending || sent} className="m-0 flex min-w-0 flex-col border-0 p-0">
        <div data-slot="invoice-form-meta" className="grid grid-cols-2 border-b border-(--inv-divider) @min-[520px]:flex">
          <div className="col-span-2 flex min-w-0 flex-col gap-1 border-b border-(--inv-divider) px-5 py-[14px] @min-[520px]:flex-1 @min-[520px]:border-r @min-[520px]:border-b-0">
            <label htmlFor={ids.clientName} className={cn(text12, "text-(--inv-text-3)")}>
              Bill to
            </label>
            <input
              id={ids.clientName}
              name="clientName"
              value={state.clientName}
              onChange={(event) => update({ clientName: event.target.value })}
              placeholder="Client name"
              autoComplete="organization"
              aria-invalid={!!errors.clientName || undefined}
              aria-describedby={described("clientName")}
              className={cn(text14, inlineInput, "h-6 font-medium text-(--inv-text)", errors.clientName && "shadow-[inset_0_0_0_1px_var(--inv-danger)] focus:shadow-[inset_0_0_0_1px_var(--inv-danger)]")}
            />
            <input
              name="clientEmail"
              type="email"
              aria-label="Client email"
              value={state.clientEmail}
              onChange={(event) => update({ clientEmail: event.target.value })}
              placeholder="billing@client.com"
              autoComplete="email"
              spellCheck={false}
              aria-invalid={!!errors.clientEmail || undefined}
              aria-describedby={described("clientEmail")}
              className={cn(text12, inlineInput, "h-[21px] text-(--inv-text-3)", errors.clientEmail && "shadow-[inset_0_0_0_1px_var(--inv-danger)] focus:shadow-[inset_0_0_0_1px_var(--inv-danger)]")}
            />
            {errors.clientName && (
              <p id={ids.error("clientName")} data-slot="invoice-form-error" data-error={ids.error("clientName")} className={cn(text12, "text-(--inv-danger)")}>
                {errors.clientName}
              </p>
            )}
            {errors.clientEmail && (
              <p id={ids.error("clientEmail")} data-slot="invoice-form-error" data-error={ids.error("clientEmail")} className={cn(text12, "text-(--inv-danger)")}>
                {errors.clientEmail}
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1 border-r border-(--inv-divider) px-5 py-[14px] @min-[520px]:flex-1">
            <label htmlFor={ids.issued} className={cn(text12, "text-(--inv-text-3)")}>
              Issued
            </label>
            <DateInput
              id={ids.issued}
              name="issued"
              value={state.issued}
              display={dateFormat(state.issued)}
              onValueChange={(issued) => update({ issued })}
              invalid={!!errors.issued}
              aria-describedby={described("issued")}
              className={cn(text14, "font-medium text-(--inv-text)")}
            />
            {errors.issued && (
              <p id={ids.error("issued")} data-slot="invoice-form-error" data-error={ids.error("issued")} className={cn(text12, "text-(--inv-danger)")}>
                {errors.issued}
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1 px-5 py-[14px] @min-[520px]:flex-1">
            <label htmlFor={ids.due} className={cn(text12, "text-(--inv-text-3)")}>
              Due
            </label>
            <DateInput
              id={ids.due}
              name="due"
              value={state.due}
              display={dateFormat(state.due)}
              onValueChange={(due) => update({ due })}
              min={state.issued || undefined}
              invalid={!!errors.due}
              aria-describedby={errors.due ? ids.error("due") : ids.dueNote}
              className={cn(text14, "font-medium text-(--inv-text)")}
            />
            {errors.due ? (
              <p id={ids.error("due")} data-slot="invoice-form-error" data-error={ids.error("due")} className={cn(text12, "text-(--inv-danger)")}>
                {errors.due}
              </p>
            ) : (
              termDays !== null && (
                // the payment term, read from the two dates
                <p id={ids.dueNote} className={cn(text12, termDays < 0 ? "text-(--inv-danger)" : "text-(--inv-text-3)")}>
                  {termDays < 0 ? (
                    "before the issue date"
                  ) : termDays === 0 ? (
                    "on the issue date"
                  ) : (
                    <>
                      in <span ref={termRef}>{termDays}</span> {termDays === 1 ? "day" : "days"}
                    </>
                  )}
                </p>
              )
            )}
          </div>
        </div>

        <div className="px-5 pt-4">
          <div role="group" aria-labelledby={ids.lines} data-slot="invoice-form-lines" className="overflow-hidden rounded-[8px] border border-(--inv-line)">
            <span id={ids.lines} className="sr-only">
              Invoice lines
            </span>
            {/* column names for the eye; every input carries its own label */}
            <div aria-hidden className={cn(lineGrid, "hidden bg-(--inv-raised) @min-[520px]:grid")}>
              <span className={cn(text12, "px-3 py-2.5 text-(--inv-text-3)")}>Item</span>
              {["Qty", "Rate", "Amount"].map((name) => (
                <span key={name} className={cn(text12, "border-l border-(--inv-line) px-3 py-2.5 text-right text-(--inv-text-3)")}>
                  {name}
                </span>
              ))}
            </div>
            <div className="pb-0.5 has-[input:focus]:pb-0 [&>[data-line]:first-child]:border-t-0 @min-[520px]:[&>[data-line]:first-child]:border-t">
              {state.lines.map((line, index) => (
                <InvoiceRow
                  key={line.id}
                  line={line}
                  index={index}
                  money={money}
                  quantityFormat={quantityFormat}
                  errors={errors}
                  errorId={ids.error}
                  onChange={updateLine}
                  onRemove={removeLine}
                  canRemove={state.lines.length > 1}
                />
              ))}
            </div>
            <button
              type="button"
              data-slot="invoice-form-add-line"
              onClick={() => addLine()}
              aria-describedby={errors.lines ? ids.error("lines") : undefined}
              className={cn(
                text13,
                "relative flex w-full items-center gap-1.5 px-3 pt-[11px] pb-2.5 text-left text-(--inv-text-2) outline-none transition-colors hover:bg-(--inv-raised)/70 hover:text-(--inv-text) focus-visible:bg-(--inv-raised) focus-visible:text-(--inv-text) disabled:pointer-events-none disabled:opacity-40",
                // Figma's dashed top border (1px, in the row's height): 3px dashes, 3px gaps, starting with half a dash
                "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[repeating-linear-gradient(to_right,var(--inv-line)_0_3px,transparent_3px_6px)] before:bg-position-[-1.5px_0]",
              )}
            >
              <PlusIcon className="size-3.5" strokeWidth={ICON_STROKE} />
              Add line
            </button>
            {errors.lines && (
              <p id={ids.error("lines")} data-slot="invoice-form-error" data-error={ids.error("lines")} className={cn(text12, "px-3 pb-2.5 text-(--inv-danger)")}>
                {errors.lines}
              </p>
            )}
          </div>
        </div>

        {/* Figma's totals frame is 10px tall and its rows run into the section's 20px bottom padding: the card keeps
            the 20px under it and the totals end 1px above the footer, as drawn */}
        <div className="flex flex-col gap-4 px-5 pt-4 pb-5 @min-[520px]:flex-row @min-[520px]:items-start @min-[520px]:gap-5 @min-[520px]:pb-px">
          <div data-slot="invoice-form-card-payments" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] border border-(--inv-line) p-3 @min-[520px]:mb-[19px]">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <label id={ids.cardLabel} htmlFor={ids.cardSwitch} className={cn(text13, "font-medium text-(--inv-text)")}>
                  Card payments
                </label>
                <span className={cn(mono12, "rounded-[4px] border border-(--inv-line) bg-(--inv-sunken) px-1.5 py-px text-(--inv-text)")}>Pro</span>
              </div>
              <p id={ids.cardNote} className={cn(text12, "text-(--inv-text-3)")}>
                Paid 3x faster with a pay button.
              </p>
            </div>
            <SwitchPrimitive.Root
              id={ids.cardSwitch}
              checked={cardPayments}
              onCheckedChange={setCardPayments}
              aria-describedby={ids.cardNote}
              className={cn(
                focusRing,
                "relative h-[18px] w-8 shrink-0 cursor-pointer rounded-full border border-(--inv-line) bg-(--inv-selected) opacity-50 transition-[opacity,background-color,border-color] duration-200 enabled:hover:opacity-75 disabled:cursor-default data-[state=checked]:border-(--inv-accent) data-[state=checked]:bg-(--inv-accent) data-[state=checked]:opacity-100",
              )}
            >
              <SwitchPrimitive.Thumb
                data-slot="invoice-form-switch-thumb"
                className="absolute top-px left-px block size-3.5 rounded-full bg-(--inv-text-3) data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-(--inv-on-accent)"
              />
            </SwitchPrimitive.Root>
          </div>
          <dl data-slot="invoice-form-totals" className="flex w-full flex-col gap-1.5 @min-[520px]:w-[200px] @min-[520px]:shrink-0">
            <div className="flex items-start justify-between gap-3">
              <dt className={cn(text13, "text-(--inv-text-3)")}>Subtotal</dt>
              <dd ref={subtotalRef} className={cn(mono13, "text-(--inv-text-2)")}>
                {money(totals.subtotal)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className={cn(text13, "text-(--inv-text-3)")}>Tax {quantityFormat(state.taxRate)}%</dt>
              <dd ref={taxRef} className={cn(mono13, "text-(--inv-text-2)")}>
                {money(totals.tax)}
              </dd>
            </div>
            <div className="flex items-end justify-between gap-3 border-t border-(--inv-divider) pt-1.5">
              <dt className={cn(text14, "font-medium text-(--inv-text)")}>Total</dt>
              <dd ref={totalRef} className="text-[22px] leading-7 font-bold tracking-[-0.01em] text-(--inv-text)">
                {money(totals.total)}
              </dd>
            </div>
          </dl>
        </div>
      </fieldset>

      <footer
        data-slot="invoice-form-footer"
        className="flex flex-wrap items-center gap-2 rounded-b-[11px] border-t border-(--inv-divider) bg-(--inv-sunken) px-5 py-3 @min-[520px]:h-14 @min-[520px]:flex-nowrap @min-[520px]:py-0"
      >
        <p aria-live="polite" className={cn(text12, "min-w-0 basis-full @min-[520px]:flex-1 @min-[520px]:basis-auto", errors.form ? "text-(--inv-danger)" : "text-(--inv-text-3)")}>
          {sent ? (
            <span data-slot="invoice-form-sent-note" className="flex items-center gap-1.5 text-(--inv-text-2)">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-3.5 shrink-0 text-(--inv-success)">
                <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="min-w-0 truncate">
                Sent to {state.clientEmail.trim()}
                {reminderDate && ` · reminder ${reminderDate}`}
              </span>
            </span>
          ) : (
            footerNote
          )}
          <span className="sr-only">
            {sending ? ` Sending invoice ${state.number}.` : ""}
            {draft === "saved" ? " Draft saved." : ""}
          </span>
        </p>
        <button
          type="button"
          onClick={sent ? resetStatus : saveDraft}
          disabled={sending}
          aria-disabled={draft === "saving" || undefined}
          className={cn(
            text14,
            focusRing,
            "ml-auto inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[8px] px-4 font-medium whitespace-nowrap text-(--inv-text-2) transition-colors hover:bg-(--inv-raised) hover:text-(--inv-text) disabled:pointer-events-none disabled:opacity-50 @min-[520px]:ml-0",
          )}
        >
          {sent ? (
            "Edit invoice"
          ) : draft === "saved" ? (
            <>
              <CheckIcon data-slot="invoice-form-saved-icon" className="size-3.5 text-(--inv-success)" strokeWidth={2.5} />
              Saved
            </>
          ) : draft === "saving" ? (
            "Saving…"
          ) : (
            "Save draft"
          )}
        </button>
        <button
          type={sent ? "button" : "submit"}
          data-slot="invoice-form-primary"
          onClick={
            sent
              ? (event) => {
                  // the reset turns this button back into the submit button before the click's default action
                  // runs: cancel it, or the new invoice would be sent straight away
                  event.preventDefault()
                  resetForm(nextNumber(state.number))
                }
              : undefined
          }
          aria-disabled={sending || undefined}
          className={cn(
            text14,
            focusRing,
            "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[8px] bg-(--inv-accent) px-4 font-medium whitespace-nowrap text-(--inv-on-accent) transition-[filter] hover:brightness-90 focus-visible:ring-offset-2 focus-visible:ring-offset-(--inv-sunken) aria-disabled:cursor-progress",
          )}
        >
          {sending && <Spinner />}
          {sent ? "New invoice" : sending ? "Sending…" : "Send invoice"}
        </button>
      </footer>
    </form>
  )
}

export { InvoiceForm, invoiceTotals, sampleInvoiceValues, type InvoiceFormProps, type InvoiceFormValues, type InvoiceLine, type InvoiceTotals }
