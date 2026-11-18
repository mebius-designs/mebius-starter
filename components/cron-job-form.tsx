"use client"

import { animate, createTimeline, stagger, svg, utils } from "animejs"
import { CheckIcon, ChevronDownIcon, ClockIcon, XIcon } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive, Select as SelectPrimitive } from "radix-ui"
import * as React from "react"

import { useControllableState } from "@/hooks/use-controllable-state"
import { releaseStyles, shake, useFormEntrance, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-form-motion"
import { useFormSubmit } from "@/hooks/use-form-submit"
import { cn } from "@/lib/utils"

/** The Schedule control's segments: three presets, or Custom to write the five fields yourself. */
type CronJobSchedule = "hourly" | "daily" | "weekdays" | "custom"

type CronJobFormValues = {
  /** The job's name ("Weekly digest"). */
  name: string
  /** The HTTP method the endpoint is called with ("POST"). */
  method: string
  /** What the job calls: a path on your app ("/api/cron/digest") or a full https:// URL. */
  path: string
  /** The selected Schedule segment. */
  schedule: CronJobSchedule
  /** The five-field cron expression: minute hour day month weekday ("0 9 * * 1-5"). */
  expression: string
  /** The IANA time zone the expression runs in ("Asia/Jakarta"). */
  timezone: string
}

/** What the empty fields say; `expression` is five fields, one per cron box ("0 3 * * *"). */
type CronJobFormPlaceholders = { name: string; path: string; expression: string }

type CronJobFormProps = Omit<React.ComponentProps<"form">, "onSubmit" | "children"> & {
  /** The header title. */
  title?: string
  /** The tag next to the title; `null` hides it. */
  badge?: string | null
  /**
   * Starting values, also what Cancel and "Create another" go back to: the name, path and cron fields empty on Figma's
   * POST, Custom and Asia/Jakarta by default (`sampleCronJobValues` is the filled Figma sample).
   */
  defaultValues?: Partial<CronJobFormValues>
  /** What the empty name, path and cron fields say ("Nightly cleanup", "/api/cron/cleanup", "0 3 * * *"). */
  placeholders?: Partial<CronJobFormPlaceholders>
  /** The cron expression, controlled (pair with `onExpressionChange`). */
  expression?: string
  onExpressionChange?: (expression: string) => void
  /** The methods the endpoint's method menu offers. */
  methods?: string[]
  /** IANA time zones the Timezone menu offers; their UTC offsets come from the browser's time zone data. */
  timezones?: string[]
  /** The moment "Next runs" count from. Without it, the current time (refreshed every 30 seconds). */
  now?: Date | number
  /** How many upcoming runs "Next runs" lists. */
  runs?: number
  /** Formats the run dates ("Wed, Oct 28"). */
  locale?: string
  /** Called by "Create job" with every value once the form is valid; may return a promise. */
  onSubmit?: (values: CronJobFormValues) => void | Promise<void>
  /** The footer's Cancel. Without it, Cancel puts the default values back. */
  onCancel?: () => void
  /** The header's close button and Done after creating. Without them, both reset the form. */
  onClose?: () => void
}

const sampleCronJobValues: CronJobFormValues = {
  name: "Weekly digest",
  method: "POST",
  path: "/api/cron/digest",
  schedule: "custom",
  expression: "0 9 * * 1-5",
  timezone: "Asia/Jakarta",
}

// What the form opens with: the name, path and five cron fields empty (their placeholders show), Figma's method,
// schedule and time zone.
const defaultCronJobValues: CronJobFormValues = { ...sampleCronJobValues, name: "", path: "", expression: "" }

const defaultPlaceholders: CronJobFormPlaceholders = { name: "Nightly cleanup", path: "/api/cron/cleanup", expression: "0 3 * * *" }

const sampleCronJobMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"]

const sampleCronJobTimezones = [
  "UTC",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
]

/** The moment Figma's "Next runs" are counted from: Tuesday 27 October 2026, 15:00 in Jakarta. */
const sampleCronJobNow = new Date("2026-10-27T08:00:00Z")

// The Figma frame's raw colours by role, light and dark ("Stage / 13 Cron job" light 2713:12966, dark 1891:85609) as
// light-dark(light, dark), so the form follows your app's dark class (it sets its own color-scheme from it). Named like
// the free New Project form's. Override any of them on the form (style or a CSS rule on [data-slot="cron-job-form"]) to
// re-skin it.
const palette = {
  "--cron-surface": "light-dark(#ffffff, #0a0a0a)", // the modal and its footer
  "--cron-sunken": "light-dark(#f5f5f5, #000000)", // fields, the schedule control
  "--cron-raised": "light-dark(#f8f8f8, #111111)", // the schedule summary
  "--cron-selected": "light-dark(#ededed, #1c1c1c)", // the picked schedule segment, the beta tag
  "--cron-line": "light-dark(#e4e4e4, #2a2a2a)", // field borders, the runs list, Cancel
  "--cron-divider": "light-dark(#ededed, #1f1f1f)", // the modal border, header and footer rules, the summary's border, run separators
  "--cron-text": "light-dark(#1a1a1a, #ededed)",
  "--cron-text-2": "light-dark(#5e5e5e, #a1a1a1)", // the header icon, run dates, the beta tag
  "--cron-text-3": "light-dark(#808080, #6b6b6b)", // hints, unpicked segments, the method
  "--cron-focus": "light-dark(#949494, #6b6b6b)", // the border of the field you're typing in, an open menu's field
  "--cron-accent": "light-dark(#1c1c1c, #ededed)", // the primary button
  "--cron-on-accent": "light-dark(#f5f5f5, #0a0a0a)",
  "--cron-field-ring": "light-dark(rgb(15 18 26 / 0.08), rgb(255 255 255 / 0.08))", // the focused field's 3px ring
  "--cron-ring": "light-dark(rgb(28 28 28 / 0.4), rgb(237 237 237 / 0.4))", // focus rings on buttons and segments (Figma draws none)
  "--cron-danger": "light-dark(#dc2626, #ff6166)",
  "--cron-success": "#3dd68c", // the summary's clock: a schedule that runs
  "--cron-warning": "light-dark(#a0660d, #f5b451)", // a schedule that never runs
  "--cron-shadow": "light-dark(rgb(15 18 26 / 0.08), rgb(0 0 0 / 0.6))", // the modal's
  "--cron-menu-shadow": "light-dark(rgb(15 18 26 / 0.12), rgb(0 0 0 / 0.7))", // the open menus' (not drawn in Figma)
} as React.CSSProperties

// Figma's text styles: Geist with -0.5% tracking, Geist Mono without.
const text14 = "text-[14px] leading-5 tracking-[-0.005em]"
const text13 = "text-[13px] leading-[19px] tracking-[-0.005em]"
const text12 = "text-[12px] leading-[17px] tracking-[-0.005em]"
const mono10 = "font-form-geist-mono text-[10px] leading-[14px]"
const mono11 = "font-form-geist-mono text-[11px] leading-[15px]"
const mono12 = "font-form-geist-mono text-[12px] leading-[17px]"
const mono13 = "font-form-geist-mono text-[13px] leading-[19px]"
const mono15 = "font-form-geist-mono text-[15px] leading-[21px]"
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-(--cron-ring)"
const ICON_STROKE = 1.875 // Figma's 1.25px at 16px (1.09375px at 14px) in Lucide's 24-unit grid

const NAME_MAX = 64
const MINUTE = 60_000
const DAY = 86_400_000

const SCHEDULES: { value: CronJobSchedule; label: string }[] = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "custom", label: "Custom" },
]

// ── cron ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

type CronPartKey = "minute" | "hour" | "day" | "month" | "weekday"
type CronPartSpec = { key: CronPartKey; label: string; min: number; max: number; names?: string[] }

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const short = (names: string[]) => names.map((name) => name.slice(0, 3).toUpperCase())

const CRON_PARTS: CronPartSpec[] = [
  { key: "minute", label: "minute", min: 0, max: 59 },
  { key: "hour", label: "hour", min: 0, max: 23 },
  { key: "day", label: "day", min: 1, max: 31 },
  { key: "month", label: "month", min: 1, max: 12, names: short(MONTH_NAMES) },
  // 0 and 7 are both Sunday
  { key: "weekday", label: "weekday", min: 0, max: 7, names: short(WEEKDAY_NAMES) },
]

/** One parsed field: the values it matches, and whether it starts with "*" (cron's rule for days, below). */
type CronSet = { values: number[]; has: Set<number>; star: boolean; all: boolean }
type CronProblem = "empty" | "syntax" | "range" | "order"
type ParsedCron = Record<CronPartKey, CronSet>

function cronToken(token: string, spec: CronPartSpec) {
  if (/^\d+$/.test(token)) return Number(token)
  const index = spec.names?.indexOf(token) ?? -1
  if (index < 0) return null
  return spec.key === "month" ? index + 1 : index
}

/** Reads one field: numbers, names (JAN, MON), "*", ranges (1-5), lists (1,15) and steps (*\/15, 0-30/10, 5/15). */
function parseCronPart(source: string, spec: CronPartSpec): CronSet | CronProblem {
  const text = source.trim().toUpperCase()
  if (!text) return "empty"
  const top = spec.key === "weekday" ? 6 : spec.max
  const found = new Set<number>()
  for (const item of text.split(",")) {
    const match = /^(\*|[A-Z0-9]+)(?:-([A-Z0-9]+))?(?:\/(\d+))?$/.exec(item)
    if (!match) return "syntax"
    const [, first, last, stepText] = match
    const step = stepText === undefined ? 1 : Number(stepText)
    if (step < 1) return "syntax"
    let from = spec.min
    let to = top
    if (first === "*") {
      if (last !== undefined) return "syntax"
    } else {
      const start = cronToken(first, spec)
      // "5/15" runs from 5 to the end of the range
      const end = last !== undefined ? cronToken(last, spec) : stepText !== undefined ? spec.max : start
      if (start === null || end === null) return "syntax"
      if (start < spec.min || start > spec.max || end < spec.min || end > spec.max) return "range"
      if (start > end) return "order"
      from = start
      to = end
    }
    for (let value = from; value <= to; value += step) found.add(spec.key === "weekday" && value === 7 ? 0 : value)
  }
  const values = [...found].sort((a, b) => a - b)
  return { values, has: found, star: text.startsWith("*"), all: values.length === top - spec.min + 1 }
}

function parseCron(fields: string[]): { cron: ParsedCron | null; problems: Partial<Record<CronPartKey, CronProblem>> } {
  const problems: Partial<Record<CronPartKey, CronProblem>> = {}
  const cron = {} as ParsedCron
  CRON_PARTS.forEach((spec, i) => {
    const part = parseCronPart(fields[i] ?? "", spec)
    if (typeof part === "string") problems[spec.key] = part
    else cron[spec.key] = part
  })
  return { cron: Object.keys(problems).length ? null : cron, problems }
}

function problemMessage(spec: CronPartSpec, problem: CronProblem) {
  const label = spec.label[0].toUpperCase() + spec.label.slice(1)
  if (problem === "empty") return `Enter ${spec.key === "hour" ? "an" : "a"} ${spec.label}, or * for every ${spec.label}.`
  if (problem === "range") {
    const names = spec.names ? `, or ${spec.names[0]}–${spec.names[spec.names.length - 1]}` : ""
    return `${label} must be between ${spec.min} and ${spec.max}${names}.`
  }
  if (problem === "order") return `Write the ${spec.label} range low to high, like 1-5.`
  return `${label}: use a number, *, a range (1-5), a list (1,15) or a step (*/15).`
}

/** Cron's day rule: when both day and weekday are restricted, a day matching either runs. */
function dayMatches(cron: ParsedCron, day: number, weekday: number) {
  const date = cron.day.has.has(day)
  const week = cron.weekday.has.has(weekday)
  return cron.day.star || cron.weekday.star ? date && week : date || week
}

// ── time zones ──────────────────────────────────────────────────────────────────────────────────────────────────────

const zoneFormats = new Map<string, Intl.DateTimeFormat>()

/** The time zone as given, or UTC when the browser doesn't know it. */
function safeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return timeZone
  } catch {
    return "UTC"
  }
}

/** The wall clock in `timeZone` at the instant `at`. */
function zonedParts(timeZone: string, at: number) {
  let format = zoneFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
    zoneFormats.set(timeZone, format)
  }
  const parts: Record<string, number> = {}
  for (const part of format.formatToParts(at)) if (part.type !== "literal") parts[part.type] = Number(part.value)
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute, second: parts.second }
}

/** Minutes `timeZone` is ahead of UTC at the instant `at`. */
function zoneOffset(timeZone: string, at: number) {
  const p = zonedParts(timeZone, at)
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000) / MINUTE)
}

/** The instant a wall-clock time happens in `timeZone`; null when it doesn't (skipped by a daylight saving change). */
function zonedTime(timeZone: string, year: number, month: number, day: number, hour: number, minute: number) {
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  let at = wall - zoneOffset(timeZone, wall) * MINUTE
  at = wall - zoneOffset(timeZone, at) * MINUTE
  const check = zonedParts(timeZone, at)
  return check.day === day && check.hour === hour && check.minute === minute ? at : null
}

/** "Asia/Jakarta (UTC+7)", the offset at `at`. */
function zoneLabel(timeZone: string, at: number | null) {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return "UTC"
  if (at === null) return timeZone
  const offset = zoneOffset(safeZone(timeZone), at)
  const hours = Math.floor(Math.abs(offset) / 60)
  const minutes = Math.abs(offset) % 60
  return `${timeZone} (UTC${offset < 0 ? "-" : "+"}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""})`
}

/** The next `count` instants after `from` that the cron matches in `timeZone` (looking up to eight years ahead). */
function cronRuns(cron: ParsedCron, timeZone: string, from: number, count: number) {
  const runs: number[] = []
  if (count < 1) return runs
  const start = zonedParts(timeZone, from)
  let cursor = Date.UTC(start.year, start.month - 1, start.day)
  for (let i = 0; i < 366 * 8; i++, cursor += DAY) {
    const date = new Date(cursor)
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() + 1
    const day = date.getUTCDate()
    if (!cron.month.has.has(month) || !dayMatches(cron, day, date.getUTCDay())) continue
    for (const hour of cron.hour.values) {
      if (i === 0 && hour < start.hour) continue
      for (const minute of cron.minute.values) {
        if (i === 0 && hour === start.hour && minute < start.minute) continue
        const at = zonedTime(timeZone, year, month, day, hour, minute)
        if (at === null || at <= from) continue
        runs.push(at)
        if (runs.length === count) return runs
      }
    }
  }
  return runs
}

/** "in 18h", "in 2d": minutes under an hour, hours under a day, then days. */
function relativeTime(ms: number) {
  const minutes = Math.max(1, Math.round(ms / MINUTE))
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.round(minutes / 1440)}d`
}

// ── describing a schedule ────────────────────────────────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, "0")
const clockTime = (hour: number, minute: number) => `${pad2(hour)}:${pad2(minute)}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

function listWords(words: string[]) {
  return words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}

/** [a, b] when the values are one unbroken run of at least `min` values. */
function runOf(values: number[], min = 3): [number, number] | null {
  if (values.length < min) return null
  for (let i = 1; i < values.length; i++) if (values[i] !== values[i - 1] + 1) return null
  return [values[0], values[values.length - 1]]
}

const stepOf = (field: string) => Number(/^\*\/(\d+)$/.exec(field.trim())?.[1] ?? 0)

function describeTime(cron: ParsedCron, fields: string[]) {
  const minutes = cron.minute.values
  const hours = cron.hour.values
  const minuteStep = stepOf(fields[0])
  const hourStep = stepOf(fields[1])
  const hourRun = runOf(hours)
  const one = minutes.length === 1 ? minutes[0] : null
  if (cron.minute.all && cron.hour.all) return "Every minute"
  if (minuteStep && cron.hour.all) return `Every ${plural(minuteStep, "minute")}`
  if (one !== null && cron.hour.all) return one === 0 ? "Every hour" : `At ${plural(one, "minute")} past every hour`
  if (one !== null && hourStep) return one === 0 ? `Every ${plural(hourStep, "hour")}` : `At ${plural(one, "minute")} past every ${plural(hourStep, "hour")}`
  if (one !== null && hours.length <= 4) return `At ${listWords(hours.map((hour) => clockTime(hour, one)))}`
  if (one !== null && hourRun) return `Every hour from ${clockTime(hourRun[0], one)} to ${clockTime(hourRun[1], one)}`
  if (minutes.length <= 4 && cron.hour.all) return `At ${listWords(minutes.map(String))} minutes past every hour`
  if (minutes.length <= 4 && hours.length === 1) return `At ${listWords(minutes.map((minute) => clockTime(hours[0], minute)))}`
  const span = hours.length === 1 ? ([hours[0], hours[0]] as const) : hourRun
  if (span && (minuteStep || cron.minute.all))
    return `Every ${minuteStep ? plural(minuteStep, "minute") : "minute"} from ${clockTime(span[0], 0)} to ${clockTime(span[1], 59)}`
  return `At minute ${fields[0].trim()} past hour ${fields[1].trim()}`
}

function describeWeekdays(values: number[]) {
  // Monday first, so Monday–Friday and Friday–Sunday read as runs
  const ordered = [...values].map((day) => (day === 0 ? 7 : day)).sort((a, b) => a - b)
  const run = runOf(ordered)
  const name = (day: number) => WEEKDAY_NAMES[day % 7]
  return run ? `${name(run[0])} through ${name(run[1])}` : `only on ${listWords(ordered.map(name))}`
}

function describeDays(values: number[]) {
  const run = runOf(values)
  if (values.length === 1) return `on day ${values[0]} of the month`
  if (run) return `on days ${run[0]} through ${run[1]} of the month`
  return values.length <= 6 ? `on days ${listWords(values.map(String))} of the month` : `on ${values.length} days of the month`
}

function describeMonths(values: number[]) {
  const run = runOf(values)
  const name = (month: number) => MONTH_NAMES[month - 1]
  return run ? `${name(run[0])} through ${name(run[1])}` : `only in ${listWords(values.map(name))}`
}

/** "At 09:00, Monday through Friday": the schedule in words. */
function describeCron(cron: ParsedCron, fields: string[]) {
  const time = describeTime(cron, fields)
  const days = !cron.day.all ? describeDays(cron.day.values) : ""
  const weekdays = !cron.weekday.all ? describeWeekdays(cron.weekday.values) : ""
  const dayPart = days && weekdays ? (cron.day.star || cron.weekday.star ? `${days}, ${weekdays}` : `${days} or ${weekdays.replace(/^only on/, "on")}`) : days || weekdays
  const monthPart = !cron.month.all ? describeMonths(cron.month.values) : ""
  const everyDay = !dayPart && !monthPart && time.startsWith("At ") && !cron.hour.all ? "every day" : ""
  return [time, dayPart, monthPart, everyDay].filter(Boolean).join(", ")
}

// ── expressions and presets ─────────────────────────────────────────────────────────────────────────────────────────

/** Five fields from an expression; keeps an empty field ("0  * * 1-5") the form itself wrote. */
function splitExpression(expression: string) {
  const exact = expression.split(" ")
  const parts = exact.length === 5 ? exact : expression.trim().split(/\s+/)
  return Array.from({ length: 5 }, (_, i) => parts[i] ?? "")
}

const joinFields = (fields: string[]) => fields.join(" ")
const isNumber = (field: string) => /^\d+$/.test(field.trim())

/** The fields a preset sets; it keeps a plain minute and hour you already chose. */
function presetFields(schedule: CronJobSchedule, fields: string[]) {
  const minute = isNumber(fields[0]) ? String(Number(fields[0])) : "0"
  const hour = isNumber(fields[1]) ? String(Number(fields[1])) : "9"
  if (schedule === "hourly") return [minute, "*", "*", "*", "*"]
  if (schedule === "daily") return [minute, hour, "*", "*", "*"]
  if (schedule === "weekdays") return [minute, hour, "*", "*", "1-5"]
  return fields
}

/** Whether the fields are still the preset's shape (an edit that leaves it switches to Custom). */
function fitsSchedule(schedule: CronJobSchedule, fields: string[]) {
  const [minute, hour, day, month, weekday] = fields.map((field) => field.trim().toUpperCase())
  if (schedule === "hourly") return isNumber(minute) && hour === "*" && day === "*" && month === "*" && weekday === "*"
  if (schedule === "daily") return isNumber(minute) && isNumber(hour) && day === "*" && month === "*" && weekday === "*"
  if (schedule === "weekdays") return isNumber(minute) && isNumber(hour) && day === "*" && month === "*" && (weekday === "1-5" || weekday === "MON-FRI")
  return true
}

/** Up / Down on a field: a number steps (and wraps) within the field's range, "*" starts at either end. */
function stepField(field: string, spec: CronPartSpec, delta: number) {
  const top = spec.key === "weekday" ? 6 : spec.max
  const size = top - spec.min + 1
  if (field.trim() === "*") return String(delta > 0 ? spec.min : top)
  if (!isNumber(field)) return null
  const value = Math.min(Number(field), top)
  return String(((value - spec.min + delta + size * 10) % size) + spec.min)
}

// ── form state ──────────────────────────────────────────────────────────────────────────────────────────────────────

type FormState = Omit<CronJobFormValues, "expression">
type Errors = Record<string, string>

function validate(state: FormState, fields: string[], now: number): Errors {
  const errors: Errors = {}
  const name = state.name.trim()
  if (!name) errors.name = "Give the job a name."
  else if (name.length > NAME_MAX) errors.name = `Keep the name under ${NAME_MAX} characters.`
  const path = state.path.trim()
  if (!path) errors.path = "Enter the path or URL to call."
  else if (/\s/.test(path)) errors.path = "Paths can't contain spaces."
  else if (!path.startsWith("/") && !/^https?:\/\/[^/]+/i.test(path)) errors.path = "Start with / for a path on your app, or https:// for a URL."
  const { cron, problems } = parseCron(fields)
  for (const spec of CRON_PARTS) {
    const problem = problems[spec.key]
    if (problem) errors[spec.key] = problemMessage(spec, problem)
  }
  if (cron && !cronRuns(cron, safeZone(state.timezone), now, 1).length) errors.never = "This schedule never runs: no month has that day."
  return errors
}

// ── clock ───────────────────────────────────────────────────────────────────────────────────────────────────────────

// The current time in 30-second steps (a stable snapshot between ticks); null while server rendering.
const CLOCK_TICK = 30_000
const timeNow = () => Date.now()
const readClock = () => Math.floor(timeNow() / CLOCK_TICK) * CLOCK_TICK
const readServerClock = () => null
function subscribeClock(onChange: () => void) {
  const timer = setInterval(onChange, CLOCK_TICK / 6)
  return () => clearInterval(timer)
}
const subscribeNothing = () => () => {}

function setRef<T>(ref: React.Ref<T> | undefined, value: T) {
  if (typeof ref === "function") ref(value)
  else if (ref) (ref as React.RefObject<T>).current = value
}

/** Clicking the box around an input (the padding, the method) focuses the input. */
function focusInputInside(event: React.MouseEvent<HTMLElement>) {
  const target = event.target as HTMLElement
  if (target.closest("input, button")) return
  event.preventDefault()
  event.currentTarget.querySelector("input")?.focus()
}

// ── parts ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Figma's "Icon / Clock" (Lucide's clock), inline so its hands can turn when the schedule changes. */
function ClockFace({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <circle cx="12" cy="12" r="10" />
      <path data-slot="cron-job-form-clock-hands" d="M12 6v6l4 2" style={{ transformOrigin: "12px 12px" }} />
    </svg>
  )
}

/** Figma's "Icon / Globe02" (Untitled UI: two parallels, not Lucide's globe), on Lucide's 24-unit grid. */
function GlobeIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M2.5 9h19M2.5 15h19M12 2c2.501 2.738 3.923 6.292 4 10-.077 3.708-1.499 7.262-4 10m0-20c-2.501 2.738-3.923 6.292-4 10 .077 3.708 1.499 7.262 4 10m0-20C6.477 2 2 6.477 2 12s4.477 10 10 10m0-20c5.523 0 10 4.477 10 10s-4.477 10-10 10" />
    </svg>
  )
}

/** The submit button's spinner: a quarter arc on a faint ring, turned by anime.js while the job is created. */
function Spinner() {
  return (
    <svg data-slot="cron-job-form-spinner" viewBox="0 0 16 16" fill="none" aria-hidden className="size-3.5">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** One section: the label row (an optional note on the right), the control and its error. */
function Field({
  label,
  htmlFor,
  labelId,
  error,
  errorId,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  labelId?: string
  error?: string
  errorId?: string
  className?: string
  children: React.ReactNode
}) {
  const Label = htmlFor ? "label" : "p"
  return (
    <div data-slot="cron-job-form-section" className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-h-[19px] items-center justify-between gap-3">
        <Label id={labelId} htmlFor={htmlFor} className={cn(text13, "font-medium text-(--cron-text)")}>
          {label}
        </Label>
      </div>
      {children}
      {error && (
        <p id={errorId} data-slot="cron-job-form-error" data-error={errorId} className={cn(text12, "text-(--cron-danger)")}>
          {error}
        </p>
      )}
    </div>
  )
}

/** The bordered box every field is drawn in (Figma: 40px, radius 8, a 1px line; #6b6b6b and a 3px ring while focused). */
function fieldBox(invalid: boolean, className?: string) {
  return cn(
    "flex h-10 w-full min-w-0 items-center gap-2 rounded-[8px] border bg-(--cron-sunken) px-3 text-left transition-[border-color,box-shadow] duration-150",
    invalid
      ? "border-(--cron-danger) focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--cron-danger)_16%,transparent)]"
      : "border-(--cron-line) hover:not-focus-within:border-(--cron-focus)/60 focus-within:border-(--cron-focus) focus-within:shadow-[0_0_0_3px_var(--cron-field-ring)]",
    className,
  )
}

const inputClass = "h-full min-w-0 flex-1 bg-transparent text-(--cron-text) outline-none placeholder:text-(--cron-text-3) disabled:cursor-not-allowed"

// The menus portal to <body>: they read the form's palette (as overridden on the form) and fade in.
const menuContent =
  "z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-[8px] border border-(--cron-line) bg-(--cron-surface) font-form-geist text-(--cron-text) antialiased shadow-[0_16px_32px_-12px_var(--cron-menu-shadow)]"
const menuItem = "flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2.5 outline-none select-none data-highlighted:bg-(--cron-selected)"

/**
 * "New cron job" from the Keitoto library ("Stage / 13 Cron job"): a scheduled job in one modal. Name it, pick the
 * endpoint's method and path, choose a schedule (Hourly, Daily, Weekdays, or Custom to write the five cron fields,
 * which also take ranges, lists, steps and names), and a time zone. The schedule is read back in words ("At 09:00,
 * Monday through Friday") and as the next runs in that time zone, both computed as you type, with the expression in
 * the footer. "Create job" validates (each cron field, a schedule that never runs, the name and endpoint) and sends
 * the values to `onSubmit`. Animated with anime.js: the modal rises in with its sections staggered, the schedule
 * highlight glides, fields a preset changes pop, the summary's clock turns and the runs slide in when the schedule
 * changes, an invalid submit shakes and the success check draws itself.
 */
function CronJobForm({
  title = "New cron job",
  badge = "beta",
  defaultValues,
  placeholders: placeholdersProp,
  expression: expressionProp,
  onExpressionChange,
  methods = sampleCronJobMethods,
  timezones = sampleCronJobTimezones,
  now: nowProp,
  runs: runCount = 3,
  locale = "en-US",
  onSubmit,
  onCancel,
  onClose,
  className,
  style,
  ref,
  ...props
}: CronJobFormProps) {
  const id = React.useId()
  const ids = {
    title: `${id}-title`,
    name: `${id}-name`,
    path: `${id}-path`,
    schedule: `${id}-schedule`,
    fields: `${id}-fields`,
    summary: `${id}-summary`,
    timezone: `${id}-timezone`,
    runs: `${id}-runs`,
    field: (key: string) => `${id}-${key}`,
    error: (key: string) => `${id}-${key}-error`,
  }

  const placeholders = { ...defaultPlaceholders, ...placeholdersProp }
  const placeholderFields = splitExpression(placeholders.expression.trim().replace(/\s+/g, " "))
  const start = { ...defaultCronJobValues, ...defaultValues }
  const [state, setState] = React.useState<FormState>(() => ({
    name: start.name,
    method: start.method,
    path: start.path,
    schedule: start.schedule,
    timezone: start.timezone,
  }))
  const [expression, setExpression] = useControllableState({
    value: expressionProp,
    defaultValue: joinFields(splitExpression(start.expression.trim().replace(/\s+/g, " "))),
    onChange: onExpressionChange,
  })
  const fields = splitExpression(expression)
  const [errors, setErrors] = React.useState<Errors>({})
  const { status, submit, reset: resetStatus } = useFormSubmit(onSubmit)
  const done = status === "success"
  const submitting = status === "submitting"

  const clock = React.useSyncExternalStore(nowProp === undefined ? subscribeClock : subscribeNothing, readClock, readServerClock)
  const now = nowProp !== undefined ? +nowProp : clock

  // An edit that leaves a preset's shape shows Custom, whatever the state says.
  const schedule = state.schedule !== "custom" && !fitsSchedule(state.schedule, fields) ? "custom" : state.schedule
  const zone = safeZone(state.timezone)
  const parsed = React.useMemo(() => parseCron(splitExpression(expression)), [expression])
  const upcoming = React.useMemo(
    () => (parsed.cron && now !== null ? cronRuns(parsed.cron, zone, now, Math.max(1, runCount)).slice(0, runCount) : []),
    [parsed, zone, now, runCount],
  )
  const never = !!parsed.cron && now !== null && upcoming.length === 0 && runCount > 0
  const summary = parsed.cron ? describeCron(parsed.cron, fields) : null
  // nothing written yet (the form opens so): the summary asks for a schedule instead of saying it can't read one
  const blank = fields.every((field) => !field.trim())
  const zones = React.useMemo(() => [...new Set([...timezones, state.timezone])], [timezones, state.timezone])

  const dateFormat = React.useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "short", month: "short", day: "numeric" }), [locale, zone])
  const timeFormat = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }),
    [locale, zone],
  )
  const runRows = upcoming.map((at) => ({
    at,
    date: `${dateFormat.format(at)}  ${timeFormat.format(at)}`,
    relative: now === null ? "" : relativeTime(at - now),
  }))

  const root = React.useRef<HTMLFormElement>(null)
  const pane = React.useRef<HTMLDivElement>(null)
  const summaryRef = React.useRef<HTMLParagraphElement>(null)
  const defaults = React.useRef(defaultValues)
  const focusInvalid = React.useRef(false)
  const reduced = useReducedMotion()

  const latest = React.useRef({ state, fields, errors, now })
  useIsomorphicLayoutEffect(() => {
    defaults.current = defaultValues
    latest.current = { state, fields, errors, now }
  })

  const setRoot = React.useCallback(
    (node: HTMLFormElement | null) => {
      root.current = node
      setRef(ref, node)
    },
    [ref],
  )

  const all = (selector: string, scope?: Element | null) => Array.from((scope ?? root.current)?.querySelectorAll<HTMLElement>(selector) ?? [])

  // FLIP: where the schedule highlight is right before a change can move it (mid-glide included).
  const segmentFrom = React.useRef<number | null>(null)
  const captureSegment = () => {
    const indicator = root.current?.querySelector<HTMLElement>('[data-slot="cron-job-form-segment-indicator"]')
    segmentFrom.current = indicator?.parentElement ? indicator.parentElement.offsetLeft + Number(utils.get(indicator, "translateX", false) || 0) : null
  }

  /** Errors that the change fixed go away; new ones wait for "Create job". */
  const revalidate = (nextState: FormState, nextFields: string[]) => {
    if (!Object.keys(latest.current.errors).length) return
    const fresh = validate(nextState, nextFields, latest.current.now ?? timeNow())
    setErrors((current) => {
      const kept: Errors = {}
      for (const key of Object.keys(current)) if (fresh[key]) kept[key] = fresh[key]
      return kept
    })
  }

  const update = (patch: Partial<FormState>) => {
    const next = { ...latest.current.state, ...patch }
    latest.current = { ...latest.current, state: next }
    setState(next)
    revalidate(next, latest.current.fields)
  }

  // Fields a preset (or a pasted expression) changed pop once React has rendered them.
  const popFields = React.useRef<number[]>([])
  const setFields = (next: string[], pop = false) => {
    const current = latest.current
    if (pop) popFields.current = next.flatMap((field, i) => (field !== current.fields[i] ? [i] : []))
    // typing past a preset's shape switches to Custom for good
    const leaves = current.state.schedule !== "custom" && !fitsSchedule(current.state.schedule, next)
    const nextState: FormState = leaves ? { ...current.state, schedule: "custom" } : current.state
    if (leaves) captureSegment()
    latest.current = { ...current, state: nextState, fields: next }
    if (leaves) setState(nextState)
    setExpression(joinFields(next))
    revalidate(nextState, next)
  }

  const setField = (index: number, value: string, pop = false) => setFields(latest.current.fields.map((field, i) => (i === index ? value : field)), pop)

  const chooseSchedule = (value: string) => {
    const next = value as CronJobSchedule
    const current = latest.current
    captureSegment()
    const nextState = { ...current.state, schedule: next }
    latest.current = { ...current, state: nextState }
    setState(nextState)
    if (next !== "custom") setFields(presetFields(next, current.fields), true)
  }

  const resetForm = () => {
    const base = { ...defaultCronJobValues, ...defaults.current }
    captureSegment()
    setState({ name: base.name, method: base.method, path: base.path, schedule: base.schedule, timezone: base.timezone })
    setExpression(joinFields(splitExpression(base.expression.trim().replace(/\s+/g, " "))))
    setErrors({})
    resetStatus()
  }

  const values = (): CronJobFormValues => ({
    name: state.name.trim(),
    method: state.method,
    path: state.path.trim(),
    schedule,
    expression: joinFields(fields.map((field) => field.trim())),
    timezone: state.timezone,
  })

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status !== "idle") return
    const found = validate(state, fields, now ?? timeNow())
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
      setErrors({ form: "Couldn't create the job. Try again." })
    }
  }

  const onFieldKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const inputs = all('[data-slot="cron-job-form-field-input"]') as HTMLInputElement[]
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const stepped = stepField(input.value, CRON_PARTS[index], event.key === "ArrowUp" ? 1 : -1)
      if (stepped === null) return
      event.preventDefault()
      setField(index, stepped)
    } else if (event.key === " ") {
      // typing an expression: a space moves on to the next field
      event.preventDefault()
      inputs[index + 1]?.focus()
      inputs[index + 1]?.select()
    } else if (event.key === "Backspace" && !input.value && index > 0) {
      event.preventDefault()
      inputs[index - 1]?.focus()
    }
  }

  // Pasting a whole expression into any field fills all five.
  const onFieldPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const parts = event.clipboardData.getData("text").trim().split(/\s+/)
    if (parts.length !== 5) return
    event.preventDefault()
    setFields(parts, true)
  }

  // ── motion ──────────────────────────────────────────────────────────────────────────────────────────────────────

  // Entrance, once the form is in view: the modal rises, the sections follow one by one, the cron fields and the
  // runs come in after them and the summary's clock turns once.
  useFormEntrance(root, (timeline) => {
    const form = root.current
    if (!form) return
    timeline
      .add(form, { opacity: { from: 0 }, y: { from: 18 }, scale: { from: 0.985 }, duration: 700, ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
      .add(all('[data-slot="cron-job-form-section"]'), { opacity: { from: 0 }, y: { from: 10 }, duration: 550, ease: "outQuad", delay: stagger(55), onComplete: releaseStyles("opacity", "transform") }, 150)
      .add(all('[data-slot="cron-job-form-field"]'), { opacity: { from: 0 }, y: { from: 6 }, duration: 450, ease: "outQuad", delay: stagger(45), onComplete: releaseStyles("opacity", "transform") }, 330)
      .add(all('[data-slot="cron-job-form-run"]'), { opacity: { from: 0 }, x: { from: -6 }, duration: 450, ease: "outQuad", delay: stagger(70), onComplete: releaseStyles("opacity", "transform") }, 520)
      .add(all('[data-slot="cron-job-form-clock-hands"]'), { rotate: { from: -360 }, duration: 900, ease: "outExpo", onComplete: releaseStyles("transform") }, 450)
      .add(all('[data-slot="cron-job-form-footer"] > *'), { opacity: { from: 0 }, duration: 500, ease: "outQuad", delay: stagger(80), onComplete: releaseStyles("opacity") }, 350)
  })

  // The schedule highlight glides from the segment it left.
  useIsomorphicLayoutEffect(() => {
    const from = segmentFrom.current
    segmentFrom.current = null
    if (from === null || reduced) return
    const indicator = root.current?.querySelector<HTMLElement>('[data-slot="cron-job-form-segment-indicator"]')
    const item = indicator?.parentElement
    if (indicator && item && Math.abs(from - item.offsetLeft) > 0.5)
      animate(indicator, { x: [from - item.offsetLeft, 0], duration: 420, ease: "outExpo", onComplete: releaseStyles("transform") })
  }, [schedule, reduced])

  // Fields a preset changed pop one after another.
  useIsomorphicLayoutEffect(() => {
    const indices = popFields.current
    popFields.current = []
    if (!indices.length || reduced) return
    const boxes = all('[data-slot="cron-job-form-field-box"]')
    const targets = indices.map((i) => boxes[i]).filter(Boolean)
    if (targets.length) animate(targets, { scale: [0.86, 1], duration: 420, ease: "outBack(2.2)", delay: stagger(45), onComplete: releaseStyles("transform") })
  }, [expression, reduced])

  // A new reading of the schedule slides in and the clock's hands turn (on from wherever they are).
  const turns = React.useRef(0)
  const lastSummary = React.useRef(summary)
  useIsomorphicLayoutEffect(() => {
    const previous = lastSummary.current
    lastSummary.current = summary
    if (previous === summary || reduced) return
    if (summaryRef.current) animate(summaryRef.current, { opacity: [0, 1], x: [-4, 0], duration: 280, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
    const hands = root.current?.querySelector('[data-slot="cron-job-form-clock-hands"]')
    if (hands && summary) {
      turns.current += 1
      animate(hands, { rotate: turns.current * 360, duration: 800, ease: "outExpo" })
    }
  }, [summary, reduced])

  // New runs (another schedule or time zone) slide in one after another.
  const runsKey = `${zone}|${upcoming.join("|")}`
  const lastRuns = React.useRef(runsKey)
  useIsomorphicLayoutEffect(() => {
    const previous = lastRuns.current
    lastRuns.current = runsKey
    if (previous === runsKey || reduced) return
    const rows = all('[data-slot="cron-job-form-run"]')
    if (rows.length) animate(rows, { opacity: [0, 1], y: [-4, 0], duration: 320, ease: "outQuad", delay: stagger(50), onComplete: releaseStyles("opacity", "transform") })
  }, [runsKey, reduced])

  // The pane's last laid-out height (also mid-tween), where it starts when the success panel replaces the form.
  const paneHeight = React.useRef<number | null>(null)
  React.useEffect(() => {
    const element = pane.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => (paneHeight.current = element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Form ↔ success: the pane eases to its new height and the new content slides in.
  const view = done ? "success" : "form"
  const lastView = React.useRef(view)
  const heightTween = React.useRef<ReturnType<typeof animate> | null>(null)
  useIsomorphicLayoutEffect(() => {
    const previous = lastView.current
    lastView.current = view
    const element = pane.current
    if (!element || previous === view || reduced) return
    heightTween.current?.cancel()
    element.style.removeProperty("height")
    const to = element.offsetHeight
    const from = paneHeight.current
    if (from !== null && Math.abs(from - to) > 1)
      heightTween.current = animate(element, { height: [from, to], duration: 520, ease: "outExpo", onComplete: releaseStyles("height") })
    animate(all('[data-slot="cron-job-form-section"]', element), {
      opacity: [0, 1],
      x: [view === "success" ? 18 : -18, 0],
      duration: 480,
      ease: "outQuart",
      delay: stagger(45),
      onComplete: releaseStyles("opacity", "transform"),
    })
  }, [view, reduced])

  // New error messages drop in; the first invalid field takes focus after a failed submit.
  const errorKeys = Object.keys(errors)
  const lastErrors = React.useRef<string[]>([])
  useIsomorphicLayoutEffect(() => {
    const previous = lastErrors.current
    lastErrors.current = errorKeys
    if (focusInvalid.current) {
      focusInvalid.current = false
      root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }
    if (reduced) return
    const fresh = errorKeys.filter((key) => !previous.includes(key)).map((key) => ids.error(key))
    const messages = all('[data-slot="cron-job-form-error"]').filter((el) => fresh.includes(el.dataset.error ?? ""))
    if (messages.length) animate(messages, { opacity: [0, 1], y: [-4, 0], duration: 320, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [errorKeys.join("|"), reduced])

  // While submitting, the spinner turns.
  useIsomorphicLayoutEffect(() => {
    if (!submitting || reduced) return
    const spinner = root.current?.querySelector('[data-slot="cron-job-form-spinner"]')
    if (!spinner) return
    const spin = animate(spinner, { rotate: 360, duration: 750, ease: "linear", loop: true })
    return () => {
      spin.revert()
    }
  }, [submitting, reduced])

  // Success: the badge pops and its check draws itself.
  useIsomorphicLayoutEffect(() => {
    if (!done || reduced) return
    const badgeEl = root.current?.querySelector('[data-slot="cron-job-form-success-badge"]')
    const check = badgeEl?.querySelector("path")
    if (!badgeEl || !check) return
    const timeline = createTimeline()
      .add(badgeEl, { scale: [0.6, 1], opacity: [0, 1], duration: 500, ease: "outBack(1.8)", onComplete: releaseStyles("transform", "opacity") })
      .add(svg.createDrawable(check), { draw: ["0 0", "0 1"], duration: 420, ease: "outQuad" }, 180)
    return () => {
      timeline.revert()
    }
  }, [done, reduced])

  // The menus portal to <body>: they get the form's palette (as overridden on the form) and fade in.
  const setMenuRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !root.current) return
      const computed = getComputedStyle(root.current)
      for (const name of Object.keys(palette)) node.style.setProperty(name, computed.getPropertyValue(name))
      // and the form's light or dark, which its light-dark() colours resolve against
      node.style.setProperty("color-scheme", computed.colorScheme)
      if (!reduced) animate(node, { opacity: [0, 1], y: [-4, 0], duration: 180, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
    },
    [reduced],
  )

  // ── content ─────────────────────────────────────────────────────────────────────────────────────────────────────

  const described = (key: string, ...others: (string | false | undefined)[]) => [errors[key] && ids.error(key), ...others].filter(Boolean).join(" ") || undefined
  const fieldInvalid = (key: CronPartKey) => !!errors[key] || (!!errors.never && (key === "day" || key === "month"))
  const fieldErrors = [...CRON_PARTS.map((spec) => spec.key), "never"].filter((key) => errors[key])

  const nextRuns = (
    <div data-slot="cron-job-form-section" className="flex flex-col gap-2">
      <div className="flex min-h-[19px] items-center justify-between gap-3">
        <p id={ids.runs} className={cn(text13, "font-medium text-(--cron-text)")}>
          Next runs
        </p>
      </div>
      <ol aria-labelledby={ids.runs} className="flex flex-col overflow-hidden rounded-[8px] border border-(--cron-line)">
        {runRows.length ? (
          runRows.map((run) => (
            <li key={run.at} data-slot="cron-job-form-run" className="flex items-start justify-between gap-3 px-3 py-2 not-first:border-t not-first:border-(--cron-divider)">
              <time dateTime={new Date(run.at).toISOString()} className={cn(mono12, "min-w-0 overflow-hidden text-ellipsis whitespace-pre text-(--cron-text-2)")}>
                {run.date}
              </time>
              <span className={cn(mono12, "shrink-0 text-(--cron-text-3)")}>{run.relative}</span>
            </li>
          ))
        ) : (
          <li data-slot="cron-job-form-run" className={cn(mono12, "px-3 py-2 text-(--cron-text-3)")}>
            {now === null ? "…" : never ? "No upcoming runs" : "Runs appear once the schedule is valid."}
          </li>
        )}
      </ol>
    </div>
  )

  const formView = (
    <>
      <Field label="Name" htmlFor={ids.name} error={errors.name} errorId={ids.error("name")}>
        <div className={fieldBox(!!errors.name, "cursor-text")} onMouseDown={focusInputInside}>
          <input
            id={ids.name}
            name="name"
            value={state.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder={placeholders.name}
            autoComplete="off"
            aria-invalid={!!errors.name || undefined}
            aria-describedby={described("name")}
            className={cn(inputClass, text14)}
          />
        </div>
      </Field>

      <Field label="Endpoint" htmlFor={ids.path} error={errors.path} errorId={ids.error("path")}>
        <div className={fieldBox(!!errors.path, "cursor-text")} onMouseDown={focusInputInside}>
          <SelectPrimitive.Root name="method" value={state.method} onValueChange={(method) => update({ method })}>
            <SelectPrimitive.Trigger
              aria-label="Method"
              className={cn(
                mono13,
                focusRing,
                "-mx-1 shrink-0 cursor-pointer rounded-[4px] px-1 text-(--cron-text-3) transition-colors hover:bg-(--cron-selected) hover:text-(--cron-text-2) data-[state=open]:bg-(--cron-selected) data-[state=open]:text-(--cron-text)",
              )}
            >
              <SelectPrimitive.Value />
            </SelectPrimitive.Trigger>
            <SelectPrimitive.Portal>
              <SelectPrimitive.Content position="popper" align="start" sideOffset={16} alignOffset={-9} ref={setMenuRef} className={menuContent}>
                <SelectPrimitive.Viewport className="p-1">
                  {methods.map((method) => (
                    <SelectPrimitive.Item key={method} value={method} className={cn(mono13, menuItem, "min-w-24")}>
                      <SelectPrimitive.ItemText>{method}</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator className="ml-auto flex">
                        <CheckIcon className="size-3.5" strokeWidth={ICON_STROKE} />
                      </SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                  ))}
                </SelectPrimitive.Viewport>
              </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
          </SelectPrimitive.Root>
          <input
            id={ids.path}
            name="path"
            value={state.path}
            onChange={(event) => update({ path: event.target.value })}
            placeholder={placeholders.path}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!errors.path || undefined}
            aria-describedby={described("path")}
            className={cn(inputClass, mono13)}
          />
        </div>
      </Field>

      <div data-slot="cron-job-form-section" className="flex flex-col gap-2">
        <div className="flex min-h-[19px] items-center justify-between gap-3">
          <p id={ids.schedule} className={cn(text13, "font-medium text-(--cron-text)")}>
            Schedule
          </p>
        </div>
        <RadioGroupPrimitive.Root
          data-slot="cron-job-form-schedule"
          value={schedule}
          onValueChange={chooseSchedule}
          orientation="horizontal"
          loop
          aria-labelledby={ids.schedule}
          className="flex gap-0.5 rounded-[8px] border border-(--cron-line) bg-(--cron-sunken) p-0.5"
        >
          {SCHEDULES.map((option) => (
            <RadioGroupPrimitive.Item
              key={option.value}
              value={option.value}
              className={cn(
                text13,
                "relative flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[6px] px-1.5 py-[7px] text-(--cron-text-3) transition-colors duration-200 outline-none hover:text-(--cron-text-2) data-[state=checked]:font-medium data-[state=checked]:text-(--cron-text)",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--cron-ring) focus-visible:outline-solid",
              )}
            >
              {/* not RadioGroup.Indicator: it mounts a render late (Presence), after the FLIP has measured */}
              {option.value === schedule && (
                <span aria-hidden data-slot="cron-job-form-segment-indicator" className="absolute inset-0 rounded-[6px] bg-(--cron-selected)" />
              )}
              <span className="relative truncate">{option.label}</span>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>

        <div role="group" id={ids.fields} aria-label="Cron expression" aria-describedby={ids.summary} className="flex gap-1.5">
          {CRON_PARTS.map((spec, i) => {
            const invalid = fieldInvalid(spec.key)
            const messageKey = errors[spec.key] ? spec.key : invalid ? "never" : null
            return (
              <div key={spec.key} data-slot="cron-job-form-field" className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div data-slot="cron-job-form-field-box" className={fieldBox(invalid, "justify-center px-1")}>
                  <input
                    id={ids.field(spec.key)}
                    name={spec.key}
                    data-slot="cron-job-form-field-input"
                    value={fields[i]}
                    onChange={(event) => setField(i, event.target.value.replace(/\s+/g, "").toUpperCase().slice(0, 24))}
                    onKeyDown={onFieldKeyDown(i)}
                    onPaste={onFieldPaste}
                    onFocus={(event) => event.currentTarget.select()}
                    placeholder={placeholderFields[i]}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={invalid || undefined}
                    aria-describedby={messageKey ? ids.error(messageKey) : undefined}
                    className={cn(inputClass, mono15, "w-full text-center font-medium")}
                  />
                </div>
                <label htmlFor={ids.field(spec.key)} className={cn(mono10, "text-(--cron-text-3)")}>
                  {spec.label}
                </label>
              </div>
            )
          })}
        </div>
        {fieldErrors.map((key) => (
          <p key={key} id={ids.error(key)} data-slot="cron-job-form-error" data-error={ids.error(key)} className={cn(text12, "text-(--cron-danger)")}>
            {errors[key]}
          </p>
        ))}

        <div data-slot="cron-job-form-summary" className="flex items-center gap-2 rounded-[8px] border border-(--cron-divider) bg-(--cron-raised) px-3 py-2.5">
          <ClockFace
            className={cn(
              "size-3.5 shrink-0 transition-colors",
              !summary ? "text-(--cron-text-3)" : never ? "text-(--cron-warning)" : "text-(--cron-success)",
            )}
          />
          <p ref={summaryRef} id={ids.summary} className={cn(text13, "min-w-0", summary ? "text-(--cron-text)" : "text-(--cron-text-2)")}>
            {!summary
              ? blank
                ? "Write the five fields, or pick a preset."
                : "Can't read this schedule yet."
              : never
                ? `${summary}: no such date, so it never runs.`
                : summary}
          </p>
        </div>
      </div>

      <Field label="Timezone" htmlFor={ids.timezone}>
        <SelectPrimitive.Root name="timezone" value={state.timezone} onValueChange={(timezone) => update({ timezone })}>
          <SelectPrimitive.Trigger id={ids.timezone} className={fieldBox(false, "cursor-pointer outline-none data-[state=open]:border-(--cron-focus)")}>
            <GlobeIcon className="size-3.5 shrink-0 text-(--cron-text-3)" />
            {/* Radix drops a className on Value, so the text style sits on a wrapper */}
            <span className={cn(text14, "min-w-0 flex-1 truncate text-(--cron-text)")}>
              <SelectPrimitive.Value />
            </span>
            <SelectPrimitive.Icon className="shrink-0 text-(--cron-text-3)">
              <ChevronDownIcon className="size-3.5" strokeWidth={ICON_STROKE} />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content position="popper" sideOffset={6} ref={setMenuRef} className={cn(menuContent, "w-(--radix-select-trigger-width)")}>
              <SelectPrimitive.Viewport className="p-1">
                {zones.map((timeZone) => (
                  <SelectPrimitive.Item key={timeZone} value={timeZone} className={cn(text13, menuItem)}>
                    <SelectPrimitive.ItemText>{zoneLabel(timeZone, now)}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator className="ml-auto flex">
                      <CheckIcon className="size-3.5" strokeWidth={ICON_STROKE} />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
      </Field>

      {nextRuns}
    </>
  )

  const jobName = state.name.trim()
  const successView = (
    <>
      <div data-slot="cron-job-form-section" className="flex flex-col items-start gap-4">
        <span
          data-slot="cron-job-form-success-badge"
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full border border-(--cron-line) bg-(--cron-raised) text-(--cron-success)"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-5">
            <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[18px] leading-6 font-semibold tracking-[-0.005em] text-(--cron-text)">Cron job created</h3>
          <p className={cn(text13, "text-(--cron-text-2)")}>
            {jobName} calls{" "}
            <span className={cn(mono12, "text-(--cron-text)")}>
              {state.method} {state.path.trim()}
            </span>{" "}
            {summary ? `${summary[0].toLowerCase()}${summary.slice(1)}` : ""}, in {zoneLabel(state.timezone, now)}.
          </p>
        </div>
      </div>
      {nextRuns}
    </>
  )

  const footerNote = errors.form ?? (done ? (runRows[0] ? `First run ${runRows[0].relative}` : "Scheduled") : joinFields(fields.map((field) => field.trim() || "?")))

  return (
    <form
      ref={setRoot}
      noValidate
      data-slot="cron-job-form"
      aria-labelledby={ids.title}
      onSubmit={handleSubmit}
      className={cn(
        "@container relative flex w-full max-w-[560px] flex-col rounded-[12px] border border-(--cron-divider) bg-(--cron-surface) font-form-geist text-(--cron-text) antialiased scheme-light dark:scheme-dark",
        // Figma: 0 24 48 -8 black at 60% (a Figma blur of 48 is a CSS blur of about 43)
        "shadow-[0_24px_43px_-8px_var(--cron-shadow)]",
        className,
      )}
      style={{ ...palette, ...style }}
      {...props}
    >
      <header data-slot="cron-job-form-header" className="flex items-center justify-between gap-3 border-b border-(--cron-divider) py-[14px] pr-4 pl-5">
        <div className="flex min-w-0 items-center gap-2">
          <ClockIcon aria-hidden className="size-4 shrink-0 text-(--cron-text-2)" strokeWidth={ICON_STROKE} />
          <h2 id={ids.title} className={cn(text14, "hug-w min-w-0 truncate font-medium text-(--cron-text)")}>
            {title}
          </h2>
          {badge && <span className={cn(mono11, "shrink-0 rounded-[4px] bg-(--cron-selected) px-1.5 py-0.5 text-(--cron-text-2)")}>{badge}</span>}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose ?? resetForm}
          className={cn(focusRing, "relative size-4 shrink-0 rounded-[4px] text-(--cron-text-3) transition-colors before:absolute before:-inset-2 hover:text-(--cron-text)")}
        >
          <XIcon className="size-4" strokeWidth={ICON_STROKE} />
        </button>
      </header>

      <fieldset disabled={submitting} className="m-0 flex min-w-0 flex-col border-0 p-0">
        <div ref={pane} data-slot="cron-job-form-pane" className="overflow-hidden">
          <div key={view} className="flex flex-col gap-[18px] p-5">
            {done ? successView : formView}
          </div>
        </div>
      </fieldset>

      <footer data-slot="cron-job-form-footer" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-(--cron-divider) py-[14px] pr-4 pl-5">
        <p className={cn(mono12, "min-w-0 truncate", errors.form ? "text-(--cron-danger)" : "text-(--cron-text-3)")}>{footerNote}</p>
        <p aria-live="polite" className="sr-only">
          {submitting ? `Creating ${jobName}.` : done ? `${jobName} was created.` : ""}
        </p>
        <div className="ml-auto flex shrink-0 gap-2">
          {done ? (
            <>
              <button
                key="success-1"
                type="button"
                onClick={resetForm}
                className={cn(
                  text14,
                  focusRing,
                  "inline-flex h-9 items-center justify-center rounded-[8px] border border-(--cron-line) px-4 font-medium whitespace-nowrap text-(--cron-text) transition-colors hover:bg-(--cron-selected)",
                )}
              >
                Create another
              </button>
              <button
                key="success-2"
                type="button"
                onClick={onClose ?? resetForm}
                className={cn(
                  text14,
                  focusRing,
                  "inline-flex h-9 items-center justify-center rounded-[8px] bg-(--cron-accent) px-4 font-medium whitespace-nowrap text-(--cron-on-accent) transition-[filter] hover:brightness-90 focus-visible:ring-offset-2 focus-visible:ring-offset-(--cron-surface)",
                )}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                key="idle-1"
                type="button"
                onClick={onCancel ?? resetForm}
                disabled={submitting}
                className={cn(
                  text14,
                  focusRing,
                  "inline-flex h-9 items-center justify-center rounded-[8px] border border-(--cron-line) px-4 font-medium whitespace-nowrap text-(--cron-text) transition-colors hover:bg-(--cron-selected) disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                <span className="hug-w">Cancel</span>
              </button>
              <button
                key="idle-2"
                type="submit"
                data-slot="cron-job-form-primary"
                aria-disabled={submitting || undefined}
                className={cn(
                  text14,
                  focusRing,
                  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-(--cron-accent) px-4 font-medium whitespace-nowrap text-(--cron-on-accent) transition-[filter] hover:brightness-90 focus-visible:ring-offset-2 focus-visible:ring-offset-(--cron-surface) aria-disabled:cursor-progress",
                )}
              >
                {submitting && <Spinner />}
                <span className="hug-w">{submitting ? "Creating…" : "Create job"}</span>
              </button>
            </>
          )}
        </div>
      </footer>
    </form>
  )
}

export {
  CronJobForm,
  sampleCronJobMethods,
  sampleCronJobNow,
  sampleCronJobTimezones,
  sampleCronJobValues,
  type CronJobFormPlaceholders,
  type CronJobFormProps,
  type CronJobFormValues,
  type CronJobSchedule,
}
