"use client"

import { animate, stagger, svg } from "animejs"
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, LoaderCircleIcon } from "lucide-react"
import { DropdownMenu as DropdownMenuPrimitive, RadioGroup as RadioGroupPrimitive } from "radix-ui"
import * as React from "react"

import { useControllableState } from "@/hooks/use-controllable-state"
import { releaseStyles, shake, useFormEntrance, useInView, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-form-motion"
import { useFormSubmit } from "@/hooks/use-form-submit"
import { cn } from "@/lib/utils"

/** One bookable start time on a day, in the host's time zone ("HH:MM", 24-hour). */
type SessionSlot = {
  time: string
  /** false draws the slot dashed and struck through (taken). */
  available: boolean
}

/** A time zone the guest can read the times in. `offset` is minutes from UTC (CET is 60). */
type SessionTimeZone = {
  value: string
  label: string
  offset: number
}

type SessionHost = {
  name: string
  role?: string
  /** Shown in the avatar when there is no `avatarSrc`. Defaults to the name's initials. */
  initials?: string
  /** A photo for the avatar (any URL). Without it the avatar shows the initials on the accent gradient. */
  avatarSrc?: string
}

type SessionSchedulingFormValues = {
  /** The day, "YYYY-MM-DD" (empty while no day of the shown week is open). */
  date: string
  /** The slot's start time in the host's time zone, "HH:MM" (empty until one is picked). */
  time: string
  /** The `value` of the time zone the guest reads the times in. */
  timeZone: string
}

type SessionSchedulingFormProps = Omit<React.ComponentProps<"form">, "onSubmit" | "children" | "defaultValue"> & {
  title?: string
  description?: string
  host?: SessionHost
  /** Length of the session in minutes: the summary's end time and "30 min". */
  duration?: number
  /** Where the session happens, under the duration. */
  location?: string
  /** The days and times on offer. Return [] for a closed day (weekends); all-taken slots mark the day fully booked. */
  getSlots?: (date: string) => SessionSlot[]
  /** Days before this one can't be booked. Defaults to the current date. */
  today?: Date | string
  /** The time zones "Change time zone" offers. The first entry is the host's: slot times are written in it. */
  timeZones?: SessionTimeZone[]
  /** Starting day, time and time zone. Without it the form opens on the Figma sample (Thu 5 Nov 2026, 10:30, CET). */
  defaultValues?: Partial<SessionSchedulingFormValues>
  /** Controlled values (pair with `onValuesChange`). */
  values?: SessionSchedulingFormValues
  onValuesChange?: (values: SessionSchedulingFormValues) => void
  /** Text under the confirmation once the booking went through. */
  successMessage?: string
  onSubmit?: (values: SessionSchedulingFormValues) => void | Promise<void>
  /** Called by Cancel. Without it, Cancel puts the default values back. */
  onCancel?: () => void
  /** Called by Done on the confirmation. Without it, Done starts a new booking. */
  onClose?: () => void
}

const sampleSessionTimeZones: SessionTimeZone[] = [
  { value: "CET", label: "Central European Time", offset: 60 },
  { value: "GMT", label: "Greenwich Mean Time", offset: 0 },
  { value: "EET", label: "Eastern European Time", offset: 120 },
  { value: "GST", label: "Gulf Standard Time", offset: 240 },
  { value: "WIB", label: "Western Indonesia Time", offset: 420 },
  { value: "EST", label: "Eastern Standard Time", offset: -300 },
  { value: "PST", label: "Pacific Standard Time", offset: -480 },
]

const sampleSessionHost: SessionHost = { name: "Dana Okafor", role: "Onboarding specialist", initials: "DO" }

const sampleSessionSchedulingValues: SessionSchedulingFormValues = { date: "2026-11-05", time: "10:30", timeZone: "CET" }

const SAMPLE_TIMES = ["09:00", "09:30", "10:00", "10:30", "13:00", "14:00", "15:30", "16:00"]
// The Figma week: Wed 4 is fully booked, Thu 5 has 09:30 and 13:00 taken. Other days take two slots each.
const SAMPLE_TAKEN: Record<string, string[]> = { "2026-11-04": SAMPLE_TIMES, "2026-11-05": ["09:30", "13:00"] }

/** The sample availability: weekdays at eight set times, weekends closed. */
function sampleSessionSlots(date: string): SessionSlot[] {
  const day = parseDate(date)
  if (!day || day.getDay() === 0 || day.getDay() === 6) return []
  const seed = day.getDate() + day.getMonth() * 31
  const taken = SAMPLE_TAKEN[date] ?? [SAMPLE_TIMES[seed % 4], SAMPLE_TIMES[4 + ((seed * 3) % 4)]]
  return SAMPLE_TIMES.map((time) => ({ time, available: !taken.includes(time) }))
}

// The "Dark SaaS Forms" library's colours (bg/*, border/*, text/*, accent/*, status/*), plus the Primary button's
// gradient, glow and inner edge, light and dark (light 2713:27641, dark 1891:99548) as light-dark(light, dark), so the
// form follows your app's dark class (it sets its own color-scheme from it). The light frame colours some parts apart
// from their library role (the roles after the library's); their dark side is the role they had. Override any of them on
// the form (style or className) to re-skin it.
const palette = {
  "--sched-canvas": "light-dark(#f0f0f0, #0b0b0c)",
  "--sched-surface": "light-dark(#ffffff, #141415)",
  "--sched-surface-2": "light-dark(#f6f7f9, #1c1c1e)", // the details panel, hovers
  "--sched-elevated": "light-dark(#e3e3e4, #242426)", // the week arrows
  "--sched-line": "light-dark(#e2e2e4, #2a2a2d)",
  "--sched-line-strong": "light-dark(#dee0e6, #3a3a3f)",
  "--sched-ink": "light-dark(#1a1a1a, #f5f5f5)",
  "--sched-ink-2": "light-dark(#55555e, #a1a1aa)",
  "--sched-muted": "light-dark(#73737d, #82828c)",
  "--sched-disabled": "#55555c",
  "--sched-on-accent": "#ffffff",
  "--sched-accent": "#7777ff",
  "--sched-danger": "#f04438",
  "--sched-warning": "#f4a340",
  "--sched-success": "#8bcf65",
  "--sched-cta-from": "#9500e5",
  "--sched-cta-to": "#c31ded",
  "--sched-cta-glow": "#9500e5",
  "--sched-cta-edge": "light-dark(rgb(242 217 255 / 0.6), #f2d9ff)",
  "--sched-cta-rim": "light-dark(#1c1c1c, #ffffff)", // the accent stroke's light at the bottom
  "--sched-pick": "#7705b4",
  "--sched-pick-line": "#ff6ae6",
  // Figma's four glow shadows (radius r drawn as a CSS blur of about 0.9r), fainter in the light frame
  "--sched-cta-shadow":
    "0 3.7px 4.4px light-dark(color-mix(in srgb, var(--sched-cta-glow) 9%, transparent), color-mix(in srgb, var(--sched-cta-glow) 15%, transparent)), 0 10.3px 12px light-dark(color-mix(in srgb, var(--sched-cta-glow) 13%, transparent), color-mix(in srgb, var(--sched-cta-glow) 22%, transparent)), 0 24.7px 29px light-dark(color-mix(in srgb, var(--sched-cta-glow) 11%, transparent), color-mix(in srgb, var(--sched-cta-glow) 19%, transparent)), 0 42px 96px light-dark(color-mix(in srgb, var(--sched-cta-glow) 20%, transparent), color-mix(in srgb, var(--sched-cta-glow) 34%, transparent))",
  "--sched-soft": "light-dark(#a1a1aa, var(--sched-ink-2))", // the week arrows' chevrons, open days' weekdays, Cancel
  "--sched-caption": "light-dark(#82828c, var(--sched-muted))", // the details' icons, the zone, the time groups, the summary's detail
  "--sched-avatar-ink": "light-dark(#f5f5f5, var(--sched-ink))", // the host's initials
  "--sched-day": "light-dark(#ebebec, var(--sched-surface-2))", // an open day
  "--sched-day-ink": "light-dark(#acacac, var(--sched-ink))", // … its date
  "--sched-slot": "light-dark(#f4f5f7, var(--sched-surface-2))", // an open time
  "--sched-slot-line": "light-dark(#e3e5ea, var(--sched-line))", // a time's edge
  "--sched-slot-off": "light-dark(#a4a8b1, var(--sched-disabled))", // a taken time's label
  "--sched-time-ink": "light-dark(#1b1d22, var(--sched-ink))", // an open time's label, the summary line
  "--sched-picked": "light-dark(transparent, var(--sched-surface-2))", // the picked time, under its purple wash
  "--sched-picked-edge": "light-dark(rgb(10 10 10 / 0.086), color-mix(in oklab, var(--sched-on-accent) 10%, transparent))", // … its edge's right end
  "--sched-summary": "light-dark(#f5f5f9, var(--sched-surface-2))",
  // the time zone menu (not drawn in Figma)
  "--sched-menu": "light-dark(#ffffff, var(--sched-elevated))",
  "--sched-menu-line": "light-dark(#e2e2e4, var(--sched-line-strong))",
  "--sched-menu-shadow": "light-dark(rgb(15 18 26 / 0.12), rgb(0 0 0 / 0.7))",
  // the details panel's stars (white added in dark, dark laid over in light) and its pink pill: the gradient's ends, the
  // middle and end of its stroke, its shadows
  "--sched-stars": "light-dark(rgb(10 10 10 / 0.18), rgb(255 255 255 / 0.2))",
  "--sched-pill-end": "light-dark(rgb(255 151 238 / 0.4), rgb(255 220 249 / 0.4))",
  "--sched-pill-rim": "light-dark(rgb(255 197 245 / 0.6), rgb(255 106 230 / 0.6))",
  "--sched-pill-rim-end": "light-dark(rgb(255 151 238 / 0.6), rgb(255 255 255 / 0.6))",
  "--sched-pill-shadow":
    "0 2.5px 4.6px light-dark(rgb(255 151 238 / 0.09), rgb(255 151 238 / 0.15)), 0 8.9px 8px light-dark(rgb(255 151 238 / 0.078), rgb(255 151 238 / 0.13)), 0 20.3px 11.4px light-dark(rgb(255 151 238 / 0.047), rgb(255 151 238 / 0.08))",
} as React.CSSProperties

// Figma tiles a 1024px grain image at 0.3 (307px) over the accent gradient, added at 40%: an SVG noise does the same.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='307' height='307'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.4 -.82'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DAY = 24 * 60

const pad2 = (n: number) => String(n).padStart(2, "0")

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}
const isoDate = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
/** The Monday of the week `date` is in. */
const weekStart = (date: Date) => addDays(date, -((date.getDay() + 6) % 7))
const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}
const clock = (minutes: number) => {
  const m = ((minutes % DAY) + DAY) % DAY
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
const utcLabel = (offset: number) => {
  if (offset === 0) return "UTC"
  const sign = offset > 0 ? "+" : "−"
  const abs = Math.abs(offset)
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${pad2(abs % 60)}` : ""}`
}
/** "Wed 4", "Wed 4 and Fri 6", "Mon 2, Wed 4 and Fri 6" */
const listDays = (days: Date[]) => {
  const names = days.map((d) => `${WEEKDAYS[d.getDay()]} ${d.getDate()}`)
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** When the session starts, as a Date (UTC instant), from the form's values and the host's time zone offset. */
function getSessionStart(values: Pick<SessionSchedulingFormValues, "date" | "time">, hostOffset = sampleSessionTimeZones[0].offset) {
  const day = parseDate(values.date)
  if (!day || !values.time) return null
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) + (toMinutes(values.time) - hostOffset) * 60_000)
}

const text12 = "text-xs leading-4"
const text13 = "text-[13px] leading-[18px]"
const text14 = "text-sm leading-5"
const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-(--sched-accent)"
const accentGlow = "shadow-(--sched-cta-shadow)"

const icon = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.16667,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 16 16",
} as const

/** "icon/clock" from the Dark SaaS library. */
function ClockIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg {...icon} {...props}>
      <circle cx="8" cy="8" r="6.667" />
      <path d="M8 4v4l2.667 1.333" />
    </svg>
  )
}

/** "icon/video". */
function VideoIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg {...icon} {...props}>
      <path d="m10.667 8.667 3.48 2.32a.33.33 0 0 0 .52-.28V5.247a.33.33 0 0 0-.5-.287l-3.5 2.04" />
      <rect x="1.333" y="4" width="9.333" height="8" rx="1.333" />
    </svg>
  )
}

/** "icon/globe". */
function GlobeIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg {...icon} {...props}>
      <circle cx="8" cy="8" r="6.667" />
      <path d="M5.333 8A9.7 9.7 0 0 1 8 1.334 9.7 9.7 0 0 1 10.667 8 9.7 9.7 0 0 1 8 14.667 9.7 9.7 0 0 1 5.333 8ZM1.333 8h13.333" />
    </svg>
  )
}

/** "icon/calendar". */
function CalendarIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg {...icon} {...props}>
      <rect x="2" y="2.666" width="12" height="12" rx="1.333" />
      <path d="M10.667 1.334V4M5.333 1.334V4M2 6.666h12" />
    </svg>
  )
}

/** The accent fill of the library's Primary button, Avatar and selected Date cell: the gradient and its grain. */
function AccentFill() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-linear-to-b from-(--sched-cta-from) to-(--sched-cta-to)"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-40 mix-blend-plus-lighter"
        style={{ backgroundImage: GRAIN, backgroundSize: "307.2px" }}
      />
    </>
  )
}

/**
 * The accent surface's inner glow and 1px stroke, drawn over its content like Figma's inner shadows: two #f2d9ff inner
 * shadows (spread 2) and a stroke of a purple gradient at 30% under a white glow rising from the bottom edge.
 */
function AccentEdge() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_16px_0_var(--sched-cta-edge),inset_0_1px_3.6px_0_var(--sched-cta-edge)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask:linear-gradient(#000_0_0)_padding-box_exclude,linear-gradient(#000_0_0)]"
        style={{
          // one-off raw colours: the library stroke's two paints
          background:
            "radial-gradient(64% 50% at 52.6% 100%, var(--sched-cta-rim), rgb(255 255 255 / 0)) border-box, linear-gradient(rgb(119 5 180 / 0.3), rgb(169 59 228 / 0.3)) border-box",
        }}
      />
    </>
  )
}

/** The left panel's light: two blurred beams rising from the bottom, a glass pill and a scatter of stars. */
function PanelGlow({ inView, reduced }: { inView: boolean; reduced: boolean }) {
  const id = React.useId().replace(/:/g, "")
  const starsRef = React.useRef<SVGSVGElement>(null)

  // The stars twinkle while the form is on screen.
  React.useEffect(() => {
    if (reduced || !inView || !starsRef.current) return
    const groups = Array.from(starsRef.current.querySelectorAll("g"))
    const loops = groups.map((group, i) =>
      animate(group, { opacity: [1, 0.25, 1], duration: 2400 + i * 900, delay: i * 500, ease: "inOutSine", loop: true }),
    )
    return () => loops.forEach((loop) => loop.revert())
  }, [inView, reduced])

  return (
    <div
      aria-hidden
      data-slot="session-scheduling-form-glow"
      className="pointer-events-none absolute bottom-0 left-1/2 h-[540px] w-[272px] -translate-x-1/2"
    >
      {/* "Group 2147237446": the beams (layer blur 30.86 and 74.06, about σ 0.45r), at 30%; the light frame has them at 0 */}
      <svg data-glow viewBox="0 0 272 540" className="absolute inset-0 hidden size-full overflow-visible opacity-30 dark:block">
        <defs>
          <filter id={`${id}-a`} x="-27.6" y="48.8" width="326.7" height="640.3" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="13.9" />
          </filter>
          <filter id={`${id}-b`} x="-276" y="-28" width="823.5" height="760.4" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="33.3" />
          </filter>
          <linearGradient id={`${id}-ga`} x1="143.764" y1="658.238" x2="143.764" y2="108.879" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--sched-pick-line)" />
            <stop offset="1" stopColor="var(--sched-pick-line)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-gb`} x1="146.721" y1="658.236" x2="146.721" y2="76.948" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--sched-pick)" />
            <stop offset="1" stopColor="var(--sched-pick)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g opacity="0.5" filter={`url(#${id}-a)`} style={{ mixBlendMode: "plus-lighter" }}>
          <path
            d="M180.023 621.238c-3.888 21.424-22.544 37-44.318 37s-40.43-15.575-44.317-36.999L4.066 140c-5.705-31.438 18.45-60.37 50.4-60.37h162.472c31.952 0 56.106 28.932 50.401 60.37z"
            fill={`url(#${id}-ga)`}
          />
        </g>
        <g filter={`url(#${id}-b)`} style={{ mixBlendMode: "plus-lighter" }}>
          <path d="M187.024 658.236H84.434L-202 46h675.43z" fill={`url(#${id}-gb)`} fillOpacity="0.8" />
        </g>
      </svg>
      {/* "stars": white at 20%, added to the panel (light: #0a0a0a at 18%, laid over) */}
      <svg
        ref={starsRef}
        viewBox="0 0 272 289"
        className="absolute bottom-0 left-0 h-[289px] w-[272px] fill-(--sched-stars) dark:mix-blend-plus-lighter"
      >
        <g>
          <ellipse cx="94.951" cy="191.819" rx="1.621" ry="1.761" />
          <ellipse cx="207.168" cy="208.09" rx="2.432" ry="2.64" />
          <ellipse cx="253.897" cy="123.099" rx="0.81" ry="0.88" />
          <ellipse cx="25.579" cy="278.401" rx="0.81" ry="0.88" />
          <ellipse cx="194.039" cy="155.704" rx="0.81" ry="0.88" />
          <ellipse cx="205.551" cy="237.231" rx="0.81" ry="0.88" />
          <ellipse cx="81.051" cy="5.583" rx="0.81" ry="0.88" />
          <path d="M147.986 200.384 145.554 201.908v-3.049zM104.941 213.073l-1.277.373-.344 1.388-.344-1.388-1.277-.373 1.277-.373.344-1.388.344 1.388z" />
        </g>
        <g>
          <ellipse cx="30.004" cy="136.102" rx="1.621" ry="1.761" />
          <ellipse cx="190.473" cy="36.485" rx="0.81" ry="0.88" />
          <ellipse cx="228.525" cy="50.771" rx="0.81" ry="0.88" />
          <ellipse cx="98.873" cy="153.772" rx="0.81" ry="0.88" />
          <ellipse cx="92.745" cy="129.149" rx="0.81" ry="0.88" />
          <ellipse cx="171.268" cy="218.421" rx="0.81" ry="0.88" />
          <path d="M35.947 79.782l-1.277.374-.344 1.387-.344-1.387-1.277-.374 1.277-.373.344-1.387.344 1.387z" />
        </g>
        <g>
          <ellipse cx="10.055" cy="225.224" rx="2.432" ry="2.64" />
          <ellipse cx="118.258" cy="244.038" rx="0.81" ry="0.88" />
          <ellipse cx="72.421" cy="29.034" rx="0.81" ry="0.88" />
          <ellipse cx="130.764" cy="0.88" rx="0.81" ry="0.88" />
          <ellipse cx="82.985" cy="155.771" rx="0.81" ry="0.88" />
          <ellipse cx="31.902" cy="195.448" rx="0.81" ry="0.88" />
          <path d="M22.976 4.696 20.545 6.221V3.171zM220.871 153.428l-1.277.374-.344 1.387-.344-1.387-1.278-.374 1.278-.373.344-1.387.344 1.387z" />
        </g>
      </svg>
      {/* "Rectangle 161124750": a frosted pink pill half below the panel's edge */}
      <span
        className="absolute -bottom-[9px] left-[58px] h-[18px] w-[156px] rounded-full shadow-(--sched-pill-shadow) backdrop-blur-[4.5px]"
        style={{
          // Figma's pill: pink between two paler ends (flat pink in the light frame)
          background: "linear-gradient(225.66deg, var(--sched-pill-end) 10.2%, rgb(255 151 238 / 0.4) 60.2%, var(--sched-pill-end) 103.1%)",
        }}
      >
        <span
          className="absolute inset-0 rounded-[inherit] border-2 border-transparent [mask:linear-gradient(#000_0_0)_padding-box_exclude,linear-gradient(#000_0_0)]"
          style={{ background: "linear-gradient(to top, rgb(255 255 255 / 0.6), var(--sched-pill-rim) 52%, var(--sched-pill-rim-end)) border-box" }}
        />
      </span>
    </div>
  )
}

/**
 * "Schedule a session" from the Dark SaaS forms: the host and session details on the left, a week of days, the open
 * times of the picked day (morning and afternoon) and a live summary on the right. Days without open times are dashed
 * and explained under the strip ("Wed 4 is fully booked. Weekends are unavailable."), the arrows move a week, and
 * "Change time zone" re-reads every time in another zone. Confirm validates, books through `onSubmit` and shows the
 * confirmation. Animated with anime.js: the dialog rises in and its parts stagger, the week slides, a picked day pops,
 * the times re-deal, the slot's check draws, the stars twinkle, a blocked confirm shakes, and the booking's check draws.
 */
function SessionSchedulingForm({
  title = "Schedule a session",
  description = "A 30-minute onboarding call to connect your data sources and set up your first workspace.",
  host = sampleSessionHost,
  duration = 30,
  location = "Google Meet · link sent by email",
  getSlots = sampleSessionSlots,
  today: todayProp,
  timeZones = sampleSessionTimeZones,
  defaultValues,
  values: valuesProp,
  onValuesChange,
  successMessage = "The calendar invite and the meeting link are on their way to your inbox.",
  onSubmit,
  onCancel,
  onClose,
  className,
  style,
  ref,
  ...props
}: SessionSchedulingFormProps) {
  const initial = { ...sampleSessionSchedulingValues, ...defaultValues }
  const [values, setValues] = useControllableState<SessionSchedulingFormValues>({
    value: valuesProp,
    defaultValue: initial,
    onChange: onValuesChange,
  })
  const { status, submit, reset } = useFormSubmit(onSubmit)
  const [attempted, setAttempted] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [shownWeek, setShownWeek] = React.useState(() => isoDate(weekStart(parseDate(initial.date) ?? new Date())))
  // a parent that moves the date to another week moves the strip with it
  const [syncedDate, setSyncedDate] = React.useState(values.date)
  if (syncedDate !== values.date) {
    setSyncedDate(values.date)
    const date = parseDate(values.date)
    if (date && isoDate(weekStart(date)) !== shownWeek) setShownWeek(isoDate(weekStart(date)))
  }

  const today = React.useMemo(() => {
    const value = typeof todayProp === "string" ? parseDate(todayProp) : (todayProp ?? new Date())
    const date = value ?? new Date()
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
  }, [todayProp])

  const hostZone = timeZones[0] ?? sampleSessionTimeZones[0]
  const zone = timeZones.find((z) => z.value === values.timeZone) ?? hostZone
  const shift = zone.offset - hostZone.offset

  // ---- the week ----------------------------------------------------------------------------------------------------

  const monday = parseDate(shownWeek) ?? weekStart(today)
  const days = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i)
        const iso = isoDate(date)
        const past = date < today
        const slots = past ? [] : getSlots(iso)
        const open = slots.some((slot) => slot.available)
        return { date, iso, past, slots, open, booked: !past && slots.length > 0 && !open, closed: !past && slots.length === 0 }
      }),
    // getSlots is usually an inline function: the week is recomputed with the week and today
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shownWeek, today, getSlots],
  )

  const note = React.useMemo(() => {
    const parts: string[] = []
    const past = days.filter((d) => d.past)
    const booked = days.filter((d) => d.booked)
    const closed = days.filter((d) => d.closed)
    if (past.length === 7) return "This week has passed."
    if (past.length) parts.push(`${listDays(past.map((d) => d.date))} ${past.length > 1 ? "have" : "has"} passed.`)
    if (booked.length) parts.push(`${listDays(booked.map((d) => d.date))} ${booked.length > 1 ? "are" : "is"} fully booked.`)
    const weekend = closed.length === 2 && closed.every((d) => d.date.getDay() === 0 || d.date.getDay() === 6)
    if (weekend) parts.push("Weekends are unavailable.")
    else if (closed.length) parts.push(`${listDays(closed.map((d) => d.date))} ${closed.length > 1 ? "are" : "is"} unavailable.`)
    if (!parts.length) parts.push("Every day this week has open times.")
    return parts.join(" ")
  }, [days])

  const selectedDay = parseDate(values.date)
  const selectedSlots = React.useMemo(() => (values.date ? getSlots(values.date) : []), [values.date, getSlots])
  const selectedSlot = selectedSlots.find((slot) => slot.time === values.time && slot.available)

  // the times in the guest's zone, split at noon (a time that moves to another day says so)
  const groups = React.useMemo(() => {
    const read = selectedSlots.map((slot) => {
      const minutes = toMinutes(slot.time) + shift
      return { ...slot, label: clock(minutes), dayShift: Math.floor(minutes / DAY), minuteOfDay: ((minutes % DAY) + DAY) % DAY }
    })
    return [
      { key: "morning", label: "Morning", slots: read.filter((slot) => slot.minuteOfDay < 12 * 60) },
      { key: "afternoon", label: "Afternoon", slots: read.filter((slot) => slot.minuteOfDay >= 12 * 60) },
    ].filter((group) => group.slots.length > 0)
  }, [selectedSlots, shift])

  const start = selectedDay && selectedSlot ? toMinutes(selectedSlot.time) + shift : null
  const startDay = selectedDay && start !== null ? addDays(selectedDay, Math.floor(start / DAY)) : null
  const summary =
    startDay && start !== null
      ? `${WEEKDAYS_LONG[startDay.getDay()]}, ${startDay.getDate()} ${MONTHS_LONG[startDay.getMonth()]} · ${clock(start)}–${clock(start + duration)}`
      : null
  const summaryDetail = `${zone.label} · ${duration} min with ${host.name}`
  const heading = selectedDay
    ? `Available times · ${WEEKDAYS[selectedDay.getDay()]}, ${selectedDay.getDate()} ${MONTHS[selectedDay.getMonth()]}`
    : "Available times"
  const canGoBack = weekStart(today) < monday

  const error = failed
    ? "Couldn't book the session. Try again."
    : attempted && !selectedSlot
      ? values.date
        ? "Pick a time to book the session."
        : "Pick a day and a time to book the session."
      : null

  const titleId = React.useId()
  const descriptionId = React.useId()
  const errorId = React.useId()

  const rootRef = React.useRef<HTMLFormElement>(null)
  const stripRef = React.useRef<HTMLDivElement>(null)
  const slotsRef = React.useRef<HTMLDivElement>(null)
  const summaryRef = React.useRef<HTMLDivElement>(null)
  const errorRef = React.useRef<HTMLParagraphElement>(null)
  const spinnerRef = React.useRef<SVGSVGElement>(null)
  const successRef = React.useRef<HTMLDivElement>(null)
  React.useImperativeHandle(ref, () => rootRef.current as HTMLFormElement)

  const reduced = useReducedMotion()
  const inView = useInView(rootRef)

  // ---- actions -----------------------------------------------------------------------------------------------------

  const update = (patch: Partial<SessionSchedulingFormValues>) => {
    setFailed(false)
    setValues({ ...values, ...patch })
  }

  const pickDay = (iso: string) => {
    if (!iso || iso === values.date) return
    // keep the time when the new day has it open
    const open = getSlots(iso).some((slot) => slot.time === values.time && slot.available)
    update({ date: iso, time: open ? values.time : "" })
  }

  const weekDirection = React.useRef(0)
  const moveWeek = (by: number) => {
    const next = addDays(monday, by * 7)
    weekDirection.current = by
    setShownWeek(isoDate(next))
    // the new week opens on its first open day
    const firstOpen = Array.from({ length: 7 }, (_, i) => addDays(next, i)).find(
      (date) => date >= today && getSlots(isoDate(date)).some((slot) => slot.available),
    )
    update({ date: firstOpen ? isoDate(firstOpen) : "", time: "" })
  }

  const restore = () => {
    setValues(initial)
    setShownWeek(isoDate(weekStart(parseDate(initial.date) ?? today)))
    setAttempted(false)
    setFailed(false)
    reset()
  }

  const onFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status !== "idle") return
    setAttempted(true)
    setFailed(false)
    if (!selectedSlot) {
      const target =
        slotsRef.current?.querySelector<HTMLElement>('[data-slot="session-scheduling-form-time"]:not([disabled])') ??
        stripRef.current?.querySelector<HTMLElement>('[data-slot="session-scheduling-form-day"]:not([disabled])')
      target?.focus()
      shake(rootRef.current)
      return
    }
    try {
      await submit({ date: values.date, time: values.time, timeZone: zone.value })
    } catch {
      setFailed(true)
      shake(rootRef.current)
    }
  }

  // ---- motion ------------------------------------------------------------------------------------------------------

  useFormEntrance(rootRef, (timeline) => {
    const form = rootRef.current
    if (!form) return
    const all = (selector: string) => Array.from(form.querySelectorAll<HTMLElement | SVGElement>(selector))
    const sections = all("[data-entrance]")
    const cells = all('[data-slot="session-scheduling-form-day"]')
    const times = all('[data-slot="session-scheduling-form-time"]')
    const glow = all("[data-glow]")
    timeline.add(form, { opacity: { from: 0 }, y: { from: 18 }, scale: { from: 0.985 }, duration: 760, ease: "outExpo" })
    if (glow.length) timeline.add(glow, { opacity: { from: 0 }, y: { from: 40 }, duration: 1400, ease: "outExpo" }, 120)
    if (sections.length) timeline.add(sections, { opacity: { from: 0 }, y: { from: 10 }, duration: 620, ease: "outExpo", delay: stagger(60) }, 120)
    if (cells.length) timeline.add(cells, { opacity: { from: 0 }, y: { from: 10 }, duration: 520, ease: "outExpo", delay: stagger(40) }, 260)
    if (times.length) timeline.add(times, { opacity: { from: 0 }, scale: { from: 0.94 }, duration: 480, ease: "outExpo", delay: stagger(30) }, 420)
  })

  // A new week slides in from the side it came from.
  useIsomorphicLayoutEffect(() => {
    const by = weekDirection.current
    weekDirection.current = 0
    if (reduced || !by || !stripRef.current) return
    const cells = Array.from(stripRef.current.querySelectorAll<HTMLElement>('[data-slot="session-scheduling-form-day"]'))
    animate(cells, {
      opacity: [0, 1],
      x: [by * 18, 0],
      duration: 460,
      delay: stagger(28, { from: by > 0 ? "first" : "last" }),
      ease: "outExpo",
      onComplete: releaseStyles("opacity", "transform"),
    })
  }, [shownWeek, reduced])

  // A picked day pops, and its times deal in.
  const lastDate = React.useRef(values.date)
  useIsomorphicLayoutEffect(() => {
    const previous = lastDate.current
    lastDate.current = values.date
    if (reduced || previous === values.date) return
    const cell = stripRef.current?.querySelector<HTMLElement>('[data-slot="session-scheduling-form-day"][data-state="checked"]')
    if (cell) animate(cell, { scale: [0.9, 1], duration: 520, ease: "outBack(2)", onComplete: releaseStyles("transform") })
    const times = Array.from(slotsRef.current?.querySelectorAll<HTMLElement>('[data-slot="session-scheduling-form-time"]') ?? [])
    if (times.length)
      animate(times, {
        opacity: [0, 1],
        y: [6, 0],
        duration: 420,
        delay: stagger(26),
        ease: "outExpo",
        onComplete: releaseStyles("opacity", "transform"),
      })
  }, [values.date, reduced])

  // A picked time draws its check; the summary slides to the new text.
  useIsomorphicLayoutEffect(() => {
    if (reduced) return
    const check = slotsRef.current?.querySelector('[data-state="checked"] [data-check] path')
    if (check) animate(svg.createDrawable(check), { draw: ["0 0", "0 1"], duration: 320, ease: "outQuad" })
  }, [values.time, values.date, reduced])

  const lastSummary = React.useRef(summary)
  useIsomorphicLayoutEffect(() => {
    const previous = lastSummary.current
    lastSummary.current = summary
    if (reduced || previous === summary || !summaryRef.current) return
    const lines = Array.from(summaryRef.current.querySelectorAll<HTMLElement>("[data-summary-line]"))
    animate(lines, {
      opacity: [0, 1],
      y: [5, 0],
      duration: 360,
      delay: stagger(50),
      ease: "outQuad",
      onComplete: releaseStyles("opacity", "transform"),
    })
  }, [summary, reduced])

  // Another time zone rolls the times to their new values.
  const lastZone = React.useRef(zone.value)
  useIsomorphicLayoutEffect(() => {
    const previous = lastZone.current
    lastZone.current = zone.value
    if (reduced || previous === zone.value) return
    const labels = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-time-label], [data-zone-label]") ?? [])
    animate(labels, {
      opacity: [0, 1],
      y: [-6, 0],
      duration: 380,
      delay: stagger(20),
      ease: "outQuad",
      onComplete: releaseStyles("opacity", "transform"),
    })
  }, [zone.value, reduced])

  const lastError = React.useRef(error)
  useIsomorphicLayoutEffect(() => {
    const previous = lastError.current
    lastError.current = error
    if (reduced || !error || previous === error || !errorRef.current) return
    animate(errorRef.current, { opacity: [0, 1], y: [-4, 0], duration: 300, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [error, reduced])

  // Booking spins the loader; the confirmation pops in and draws its check.
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
      const badge = panel.querySelector("[data-success-icon]")
      if (badge)
        animate(badge, { scale: [0.4, 1], opacity: [0, 1], duration: 620, ease: "outBack(1.8)", onComplete: releaseStyles("opacity", "transform") })
      const check = panel.querySelector("[data-success-icon] path")
      if (check) animate(svg.createDrawable(check), { draw: ["0 0", "0 1"], duration: 460, delay: 200, ease: "outQuad" })
      const parts = Array.from(panel.querySelectorAll<HTMLElement>("[data-success-part]"))
      if (parts.length)
        animate(parts, {
          opacity: [0, 1],
          y: [10, 0],
          duration: 520,
          delay: stagger(70, { start: 140 }),
          ease: "outExpo",
          onComplete: releaseStyles("opacity", "transform"),
        })
    }
  }, [status, reduced])

  // ---- render ------------------------------------------------------------------------------------------------------

  const booking = status === "submitting"
  const success = status === "success"
  const statusText = booking ? "Booking…" : success ? `Booked: ${summary ?? ""}` : ""
  const hostInitials = host.initials ?? initialsOf(host.name)
  const monthDay = days.find((d) => d.iso === values.date)?.date ?? monday
  const details = [
    { key: "duration", Icon: ClockIcon, text: `${duration} minutes` },
    { key: "location", Icon: VideoIcon, text: location },
    { key: "zone", Icon: GlobeIcon, text: `${zone.label} (${utcLabel(zone.offset)})` },
  ]

  return (
    <form
      ref={rootRef}
      noValidate
      data-slot="session-scheduling-form"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={booking || undefined}
      onSubmit={onFormSubmit}
      className={cn(
        "@container/sched w-full max-w-[798px] overflow-hidden rounded-[20px] border border-(--sched-line) bg-(--sched-surface) font-form-geist text-(--sched-ink) antialiased scheme-light dark:scheme-dark",
        className,
      )}
      style={{ ...palette, ...style }}
      {...props}
    >
      <div className="flex @max-[719px]/sched:flex-col">
        <div
          data-slot="session-scheduling-form-details"
          className="relative flex w-[272px] shrink-0 flex-col gap-6 overflow-hidden border-r border-(--sched-line) bg-(--sched-surface-2) px-7 py-8 @max-[719px]/sched:w-full @max-[719px]/sched:border-r-0 @max-[719px]/sched:border-b"
        >
          <PanelGlow inView={inView} reduced={reduced} />
          <div data-entrance className="relative flex flex-col gap-2">
            <h2 id={titleId} className="text-xl leading-7 font-semibold tracking-[-0.3px] text-(--sched-ink)">
              {title}
            </h2>
            <p id={descriptionId} className={cn(text14, "leading-[21px] text-(--sched-ink-2)")}>
              {description}
            </p>
          </div>

          <div data-entrance data-slot="session-scheduling-form-host" className="relative flex items-center gap-3">
            <span className={cn("relative flex size-10 shrink-0 items-center justify-center overflow-visible rounded-full", accentGlow)}>
              {host.avatarSrc ? (
                <img src={host.avatarSrc} alt="" className="absolute inset-0 size-full rounded-full object-cover" />
              ) : (
                <>
                  <AccentFill />
                  <span aria-hidden className="relative text-[16.25px] leading-[22.5px] font-medium text-(--sched-avatar-ink)">
                    {hostInitials}
                  </span>
                </>
              )}
              <AccentEdge />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className={cn(text13, "truncate font-medium text-(--sched-ink)")}>{host.name}</p>
              {host.role && <p className={cn(text12, "truncate text-(--sched-muted)")}>{host.role}</p>}
            </div>
          </div>

          <div data-entrance className="relative flex flex-col gap-3 border-t border-(--sched-line) pt-5">
            {details.map(({ key, Icon, text }) => (
              <p key={key} className="flex items-center gap-2 text-[13px] leading-[19px] text-(--sched-ink-2)">
                <Icon aria-hidden className="size-4 shrink-0 text-(--sched-caption)" />
                <span data-zone-label={key === "zone" ? "" : undefined} className="min-w-0 flex-1">
                  {text}
                </span>
              </p>
            ))}
            <DropdownMenuPrimitive.Root modal={false}>
              <DropdownMenuPrimitive.Trigger
                type="button"
                data-slot="session-scheduling-form-zone"
                disabled={status !== "idle"}
                className={cn(
                  text13,
                  "self-start rounded-[4px] font-medium text-(--sched-ink-2) underline decoration-from-font underline-offset-from-font transition-colors duration-200 hover:text-(--sched-ink) disabled:pointer-events-none",
                  focusRing,
                )}
              >
                Change time zone
              </DropdownMenuPrimitive.Trigger>
              <DropdownMenuPrimitive.Portal>
                <DropdownMenuPrimitive.Content
                  align="start"
                  side="bottom"
                  sideOffset={8}
                  collisionPadding={12}
                  style={palette}
                  className="z-50 flex max-h-[min(320px,var(--radix-dropdown-menu-content-available-height))] min-w-[248px] flex-col overflow-y-auto rounded-xl border border-(--sched-menu-line) bg-(--sched-menu) p-1 font-form-geist text-(--sched-ink) antialiased shadow-[0_18px_40px_-12px_var(--sched-menu-shadow)] outline-none scheme-light dark:scheme-dark"
                >
                  <DropdownMenuPrimitive.Label className={cn(text12, "px-2.5 pt-1.5 pb-1 text-(--sched-muted)")}>
                    Show times in
                  </DropdownMenuPrimitive.Label>
                  <DropdownMenuPrimitive.RadioGroup value={zone.value} onValueChange={(next) => update({ timeZone: next })}>
                    {timeZones.map((option) => (
                      <DropdownMenuPrimitive.RadioItem
                        key={option.value}
                        value={option.value}
                        className={cn(
                          text13,
                          "relative flex h-9 cursor-pointer items-center gap-2 rounded-lg pr-2.5 pl-8 text-(--sched-ink-2) outline-none select-none data-highlighted:bg-(--sched-surface-2) data-highlighted:text-(--sched-ink) data-[state=checked]:text-(--sched-ink)",
                        )}
                      >
                        <DropdownMenuPrimitive.ItemIndicator className="absolute left-2.5">
                          <CheckIcon aria-hidden className="size-3.5 text-(--sched-accent)" strokeWidth={2.25} />
                        </DropdownMenuPrimitive.ItemIndicator>
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        <span className="font-form-geist-mono text-xs text-(--sched-muted)">{utcLabel(option.offset)}</span>
                      </DropdownMenuPrimitive.RadioItem>
                    ))}
                  </DropdownMenuPrimitive.RadioGroup>
                </DropdownMenuPrimitive.Content>
              </DropdownMenuPrimitive.Portal>
            </DropdownMenuPrimitive.Root>
          </div>
        </div>

        <div className="relative min-w-0 flex-1">
          <div
            data-slot="session-scheduling-form-picker"
            inert={status !== "idle"}
            className={cn("flex flex-col gap-6 px-7 pt-8 pb-7 @max-[719px]/sched:px-5 @max-[719px]/sched:pt-6", success && "invisible")}
          >
            <div data-entrance className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="text-[15px] leading-5 font-medium tracking-[-0.075px] text-(--sched-ink)">
                  {MONTHS_LONG[monthDay.getMonth()]} {monthDay.getFullYear()}
                </span>
                <span className={cn(text12, "text-(--sched-muted)")}>
                  Week of {monday.getDate()} {MONTHS[monday.getMonth()]}
                </span>
              </p>
              <div className="flex shrink-0 gap-2">
                {[
                  { by: -1, label: "Previous week", Icon: ChevronLeftIcon, disabled: !canGoBack },
                  { by: 1, label: "Next week", Icon: ChevronRightIcon, disabled: false },
                ].map(({ by, label, Icon, disabled }) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    disabled={disabled}
                    onClick={() => moveWeek(by)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full bg-(--sched-elevated) text-(--sched-soft) transition-colors duration-200 hover:text-(--sched-ink) disabled:pointer-events-none disabled:opacity-40",
                      focusRing,
                    )}
                  >
                    <Icon aria-hidden className="size-4" strokeWidth={1.75} />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <RadioGroupPrimitive.Root
                ref={stripRef}
                data-slot="session-scheduling-form-days"
                value={days.some((d) => d.iso === values.date) ? values.date : ""}
                onValueChange={pickDay}
                orientation="horizontal"
                loop
                aria-label="Day"
                className="flex gap-2 @max-[460px]/sched:gap-1"
              >
                {days.map((day) => {
                  const checked = day.iso === values.date
                  const unavailable = !day.open
                  return (
                    <RadioGroupPrimitive.Item
                      key={day.iso}
                      value={day.iso}
                      disabled={unavailable}
                      data-slot="session-scheduling-form-day"
                      aria-label={`${WEEKDAYS_LONG[day.date.getDay()]}, ${day.date.getDate()} ${MONTHS_LONG[day.date.getMonth()]}${day.booked ? ", fully booked" : unavailable ? ", unavailable" : ""}`}
                      className={cn(
                        "relative flex h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border transition-colors duration-200",
                        checked
                          ? cn("border-0 text-(--sched-on-accent)", accentGlow)
                          : unavailable
                            ? "border-dashed border-(--sched-line) text-(--sched-disabled)"
                            : "cursor-pointer border-(--sched-line) bg-(--sched-day) text-(--sched-day-ink) hover:border-(--sched-line-strong)",
                        focusRing,
                      )}
                    >
                      {checked && <AccentFill />}
                      <span className={cn(text12, "relative", !checked && !unavailable && "text-(--sched-soft)")}>
                        {WEEKDAYS[day.date.getDay()]}
                      </span>
                      <span className="relative text-lg leading-6 font-medium tracking-[-0.18px]">{day.date.getDate()}</span>
                      {checked && <AccentEdge />}
                    </RadioGroupPrimitive.Item>
                  )
                })}
              </RadioGroupPrimitive.Root>
              <p data-entrance data-slot="session-scheduling-form-note" className={cn(text12, "text-(--sched-muted)")}>
                {note}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div data-entrance className="flex items-center justify-between gap-3">
                <p className={cn(text13, "font-medium text-(--sched-ink)")}>{heading}</p>
                <p data-zone-label className="font-form-geist-mono text-xs leading-4 whitespace-nowrap text-(--sched-caption)">
                  {utcLabel(zone.offset)}
                </p>
              </div>

              <RadioGroupPrimitive.Root
                ref={slotsRef}
                data-slot="session-scheduling-form-times"
                value={selectedSlot ? values.time : ""}
                onValueChange={(time) => update({ time })}
                loop
                aria-label={heading}
                aria-invalid={(attempted && !selectedSlot) || undefined}
                aria-describedby={error ? errorId : undefined}
                className="flex flex-col gap-4"
              >
                {groups.length === 0 && (
                  <p
                    className={cn(
                      text13,
                      "flex h-16 items-center justify-center rounded-xl border border-dashed border-(--sched-line) text-(--sched-muted)",
                    )}
                  >
                    {values.date ? "No times on this day." : "No open days this week. Try the next one."}
                  </p>
                )}
                {groups.map((group) => (
                  <div key={group.key} role="group" aria-label={group.label} className="flex flex-col gap-2">
                    <p aria-hidden className={cn(text12, "text-(--sched-caption)")}>
                      {group.label}
                    </p>
                    <div className="grid grid-cols-4 gap-2 @max-[460px]/sched:grid-cols-3">
                      {group.slots.map((slot) => {
                        const checked = slot.available && slot.time === values.time
                        return (
                          <RadioGroupPrimitive.Item
                            key={slot.time}
                            value={slot.time}
                            disabled={!slot.available}
                            data-slot="session-scheduling-form-time"
                            aria-label={`${slot.label}${slot.dayShift ? (slot.dayShift > 0 ? ", next day" : ", previous day") : ""}${slot.available ? "" : ", taken"}`}
                            className={cn(
                              text14,
                              "relative flex h-10 min-w-0 items-center justify-center gap-2 overflow-hidden rounded-[10px] border px-3 font-medium transition-colors duration-200",
                              checked
                                ? "border-0 bg-(--sched-picked) text-(--sched-ink)"
                                : slot.available
                                  ? "cursor-pointer border-(--sched-slot-line) bg-(--sched-slot) text-(--sched-time-ink) hover:border-(--sched-line-strong)"
                                  : "border-dashed border-(--sched-slot-line) text-(--sched-slot-off)",
                              attempted && !selectedSlot && slot.available && "border-(--sched-danger)/60",
                              focusRing,
                            )}
                          >
                            {checked && (
                              <>
                                <span
                                  aria-hidden
                                  className="pointer-events-none absolute inset-0 bg-linear-to-r from-(--sched-pick)/55 via-(--sched-pick)/12 via-55% to-(--sched-pick)/0"
                                />
                                <span
                                  aria-hidden
                                  className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent bg-linear-to-r from-(--sched-pick-line)/80 to-(--sched-picked-edge) bg-origin-border [mask:linear-gradient(#000_0_0)_padding-box_exclude,linear-gradient(#000_0_0)]"
                                />
                                <svg
                                  data-check
                                  aria-hidden
                                  viewBox="0 0 16 16"
                                  className="relative size-4 shrink-0"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M13.333 4 6 11.333 2.667 8" />
                                </svg>
                              </>
                            )}
                            <span data-time-label className="relative whitespace-nowrap">
                              {slot.label}
                              {slot.dayShift !== 0 && (
                                <sup className="ml-0.5 text-[10px] text-(--sched-muted)">
                                  {slot.dayShift > 0 ? `+${slot.dayShift}` : slot.dayShift}
                                </sup>
                              )}
                            </span>
                          </RadioGroupPrimitive.Item>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </RadioGroupPrimitive.Root>

              <div
                ref={summaryRef}
                data-entrance
                data-slot="session-scheduling-form-summary"
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-(--sched-summary) px-4 py-3 transition-colors duration-200",
                  error ? "border-(--sched-danger)/70" : "border-(--sched-line-strong)",
                )}
              >
                <CalendarIcon aria-hidden className={cn("size-4 shrink-0", summary ? "text-(--sched-ink)" : "text-(--sched-muted)")} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p data-summary-line className={cn(text13, "truncate font-medium", summary ? "text-(--sched-time-ink)" : "text-(--sched-ink-2)")}>
                    {summary ?? "No time picked yet"}
                  </p>
                  {error ? (
                    <p
                      ref={errorRef}
                      id={errorId}
                      role="alert"
                      data-slot="session-scheduling-form-error"
                      className={cn(text12, "text-(--sched-danger)")}
                    >
                      {error}
                    </p>
                  ) : (
                    <p data-summary-line className={cn(text12, "truncate text-(--sched-caption)")}>
                      {summaryDetail}
                    </p>
                  )}
                </div>
              </div>

              <div data-entrance className="flex items-center justify-end gap-2">
                <button
                  key="idle-1"
                  type="button"
                  disabled={booking}
                  onClick={() => (onCancel ?? restore)()}
                  className={cn(
                    text14,
                    "flex h-10 items-center justify-center rounded-xl px-4 font-medium text-(--sched-soft) transition-colors duration-200 hover:bg-(--sched-surface-2) hover:text-(--sched-ink) disabled:pointer-events-none disabled:opacity-50",
                    focusRing,
                  )}
                >
                  Cancel
                </button>
                <button
                  key="idle-2"
                  type="submit"
                  data-slot="session-scheduling-form-submit"
                  disabled={booking}
                  className={cn(
                    text14,
                    "relative flex h-10 items-center justify-center gap-2 rounded-xl px-[17px] font-medium text-(--sched-on-accent) disabled:cursor-wait",
                    accentGlow,
                    focusRing,
                  )}
                >
                  <AccentFill />
                  {booking && <LoaderCircleIcon ref={spinnerRef} aria-hidden className="relative size-4" strokeWidth={2.25} />}
                  <span className="relative whitespace-nowrap">{booking ? "Booking…" : "Confirm booking"}</span>
                  <AccentEdge />
                </button>
              </div>
            </div>
          </div>

          {success && (
            <div
              ref={successRef}
              data-slot="session-scheduling-form-success"
              className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-7 text-center"
            >
              <span
                data-success-icon
                className={cn("relative flex size-14 items-center justify-center rounded-full text-(--sched-on-accent)", accentGlow)}
              >
                <AccentFill />
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="relative size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13.333 4 6 11.333 2.667 8" />
                </svg>
                <AccentEdge />
              </span>
              <div className="flex flex-col items-center gap-2">
                <p data-success-part className="text-xl leading-7 font-semibold tracking-[-0.3px]">
                  You&apos;re booked
                </p>
                <p data-success-part className={cn(text13, "font-medium text-(--sched-ink)")}>
                  {summary}
                </p>
                <p data-success-part className={cn(text12, "text-(--sched-muted)")}>
                  {summaryDetail}
                </p>
              </div>
              <p data-success-part className={cn(text14, "max-w-[340px] leading-[21px] text-balance text-(--sched-ink-2)")}>
                {successMessage}
              </p>
              <div data-success-part className="flex items-center gap-2">
                <button
                  key="success-1"
                  type="button"
                  onClick={() => {
                    setAttempted(false)
                    setValues({ ...values, time: "" })
                    reset()
                  }}
                  className={cn(
                    text14,
                    "flex h-10 items-center justify-center rounded-xl px-4 font-medium text-(--sched-soft) transition-colors duration-200 hover:bg-(--sched-surface-2) hover:text-(--sched-ink)",
                    focusRing,
                  )}
                >
                  Book another
                </button>
                <button
                  key="success-2"
                  type="button"
                  onClick={() => (onClose ?? restore)()}
                  className={cn(
                    text14,
                    "relative flex h-10 items-center justify-center rounded-xl px-[17px] font-medium text-(--sched-on-accent)",
                    accentGlow,
                    focusRing,
                  )}
                >
                  <AccentFill />
                  <span className="relative">Done</span>
                  <AccentEdge />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {statusText}
      </p>
    </form>
  )
}

export {
  SessionSchedulingForm,
  getSessionStart,
  sampleSessionHost,
  sampleSessionSchedulingValues,
  sampleSessionSlots,
  sampleSessionTimeZones,
  type SessionHost,
  type SessionSchedulingFormProps,
  type SessionSchedulingFormValues,
  type SessionSlot,
  type SessionTimeZone,
}
