"use client"

import { animate, stagger, steps as stepped } from "animejs"
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioGroupPrimitive, Select as SelectPrimitive, Tabs as TabsPrimitive } from "radix-ui"
import * as React from "react"

import { useControllableState } from "@/hooks/use-controllable-state"
import { releaseStyles, shake, useCountUp, useFormEntrance, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-form-motion"
import { useFormSubmit } from "@/hooks/use-form-submit"
import { cn } from "@/lib/utils"

/** A department, account type or lockout choice. */
type RetroOsAccountOption = { value: string; label: string }

/** A step the status bar walks through while `onSubmit` runs and hasn't reported its own progress. */
type RetroOsAccountStep = { label: string; value: number }

type RetroOsAccountTab = "general" | "profile" | "security"

type RetroOsAccountFormValues = {
  /** The account picture; null keeps the default one (Figma's robot.bmp). */
  picture: File | null
  fullName: string
  /** 3–20 of a–z, 0–9, ".", "_" and "-", starting with a letter. Follows the full name until edited ("Yusuf Hadi" → yhadi). */
  userName: string
  email: string
  /** A department's `value`. */
  department: string
  /** At least 8 characters. */
  password: string
  mustChangePassword: boolean
  /** "Account is disabled". */
  disabled: boolean
  /** General tab. */
  description: string
  /** An account type's `value` (General tab). */
  accountType: string
  /** Security tab; off while `mustChangePassword` is on. */
  passwordNeverExpires: boolean
  /** A lockout option's `value` (Security tab). */
  lockout: string
}

/** What `onSubmit` gets besides the values: which button sent them and a way to report progress to the status bar. */
type RetroOsAccountSubmitHelpers = {
  /** "ok" closes on success (the confirmation shows), "apply" keeps the dialog open. */
  action: "ok" | "apply"
  /** Sets the status bar: a percentage and, optionally, what is happening ("Creating home folder..."). */
  progress: (value: number, label?: string) => void
}

/** What the empty fields say. */
type RetroOsAccountFormPlaceholders = { fullName: string; userName: string; email: string; password: string; description: string }

type RetroOsAccountFormProps = Omit<React.ComponentProps<"form">, "onSubmit" | "children" | "title" | "defaultValue"> & {
  /**
   * Starting values, merged over an empty full name, user name, e-mail and password on Figma's department, options and
   * lockout; `sampleRetroOsAccountValues` is the filled Figma sample (Yusuf Hadi in Engineering). Cancel without
   * `onCancel` puts them back.
   */
  defaultValues?: Partial<RetroOsAccountFormValues>
  /** OK and Apply call it with the valid values; while a returned promise is pending the status bar shows the progress. */
  onSubmit?: (values: RetroOsAccountFormValues, helpers: RetroOsAccountSubmitHelpers) => void | Promise<void>
  /** Cancel and the Escape key. Without it they put the default values back. */
  onCancel?: () => void
  /** The title bar's × and the confirmation's OK. Falls back to `onCancel`. */
  onClose?: () => void
  /** The title bar's text. */
  title?: string
  /** What the empty fields say ("First and last name", "jdoe", "At least 8 characters"…). */
  placeholders?: Partial<RetroOsAccountFormPlaceholders>
  departments?: RetroOsAccountOption[]
  accountTypes?: RetroOsAccountOption[]
  lockoutOptions?: RetroOsAccountOption[]
  /** User names that already exist. */
  takenUserNames?: string[]
  /** What the status bar shows while `onSubmit` runs, one step every `stepDuration` ms, until it reports progress. */
  steps?: RetroOsAccountStep[]
  stepDuration?: number
  /** The home folder shown on the General tab and in the confirmation. */
  homeFolder?: (userName: string) => string
  /** The name shown for the default picture. */
  defaultPictureName?: string
  /** Largest picture accepted, in bytes. */
  maxPictureSize?: number
  /** The open tab, controlled, with `onTabChange`. */
  tab?: RetroOsAccountTab
  defaultTab?: RetroOsAccountTab
  onTabChange?: (tab: RetroOsAccountTab) => void
}

const sampleRetroOsAccountDepartments: RetroOsAccountOption[] = [
  { value: "engineering", label: "Engineering" },
  { value: "design", label: "Design" },
  { value: "finance", label: "Finance" },
  { value: "marketing", label: "Marketing" },
  { value: "operations", label: "Operations" },
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
]

const sampleRetroOsAccountTypes: RetroOsAccountOption[] = [
  { value: "standard", label: "Standard user" },
  { value: "administrator", label: "Administrator" },
]

const sampleRetroOsAccountLockout: RetroOsAccountOption[] = [
  { value: "3", label: "3 failed logons" },
  { value: "5", label: "5 failed logons" },
  { value: "10", label: "10 failed logons" },
  { value: "never", label: "Never" },
]

const sampleRetroOsAccountSteps: RetroOsAccountStep[] = [
  { label: "Creating account...", value: 24 },
  { label: "Creating home folder...", value: 64 },
  { label: "Setting permissions...", value: 92 },
]

const sampleRetroOsAccountValues: RetroOsAccountFormValues = {
  picture: null,
  fullName: "Yusuf Hadi",
  userName: "yhadi",
  email: "yusuf@kopi.net",
  department: "engineering",
  password: "kopi2026",
  mustChangePassword: true,
  disabled: false,
  description: "",
  accountType: "standard",
  passwordNeverExpires: false,
  lockout: "5",
}

// What the dialog opens with: the full name, user name, e-mail and password empty (their placeholders show), Figma's
// department, options, account type and lockout.
const defaultRetroOsAccountValues: RetroOsAccountFormValues = { ...sampleRetroOsAccountValues, fullName: "", userName: "", email: "", password: "" }

const defaultPlaceholders: RetroOsAccountFormPlaceholders = {
  fullName: "First and last name",
  userName: "jdoe",
  email: "name@company.com",
  password: "At least 8 characters",
  description: "Optional",
}

const reservedUserNames = ["admin", "administrator", "guest", "root", "system"]

// The Figma frame's raw colours by role, light and dark ("Stage / 12 Retro OS", light 2713:27413, dark 1891:83066) as
// light-dark(light, dark), so the form follows your app's dark class (it sets its own color-scheme from it). The bevels
// are Figma's inner shadows: raised controls get a light top-left and a dark bottom-right edge, sunken wells the other
// way round. The light frame draws the window flat: white with a pale 1px line and a soft shadow, no fill or bevel on
// the title bar, tabs, panel, picture, OK and Cancel, and faint bevels on the other controls. Override any of them on
// the form (style or a CSS rule on [data-slot="retro-os-account-form"]) to re-skin it.
const palette = {
  "--os-window": "light-dark(#ffffff, #2a2a2e)", // the window frame
  "--os-tab": "light-dark(transparent, #2a2a2e)", // the tabs at rest
  "--os-face": "light-dark(transparent, #34343a)", // the panel, the open tab, OK and Cancel
  "--os-button": "light-dark(#cfcfd4, #34343a)", // the title bar's buttons, Browse, Apply, the list's arrow
  "--os-title-icon": "light-dark(#f3f8fa, #34343a)", // the title bar's icon
  "--os-well": "light-dark(#eeeef0, #18181b)", // fields, check boxes, the progress track
  "--os-picture": "light-dark(transparent, #18181b)", // the picture's well
  "--os-cell": "light-dark(#e4e4e7, #18181b)", // the progress bar's empty segments
  "--os-strip": "light-dark(#fbfdfe, transparent)", // the tab strip and the picture's caption box (light only)
  "--os-line": "light-dark(#dbe9ed, transparent)", // the 1px line round the window, the tab strip, the caption box and the icon (light only)
  "--os-text": "light-dark(#17171c, #e8e8ec)",
  "--os-text-2": "light-dark(#595963, #9c9ca6)", // the tabs at rest, the group label, the status bar
  "--os-disabled": "light-dark(#8e8e98, #5f5f69)", // placeholders, text of a button or option that can't be used (Figma draws none)
  "--os-accent": "#7fa7ff", // progress, the picture
  "--os-check": "light-dark(#114cd0, #7fa7ff)", // check marks and the picked option
  "--os-title-from": "light-dark(transparent, #2c3e8c)", // the title bar's gradient (light has none)
  "--os-title-to": "light-dark(transparent, #3e7bb8)",
  "--os-title-text": "light-dark(#17171c, #ffffff)",
  "--os-selection": "#2c3e8c", // selected text and the highlighted list item
  "--os-on-selection": "#ffffff",
  "--os-groove": "light-dark(#ababb3, #5a5a64)", // the Options group's line
  "--os-groove-shadow": "light-dark(rgb(28 29 33 / 0.6), rgb(0 0 0 / 0.6))", // the line's 1px shadow
  "--os-frame": "#000000", // the default button's outline, the list's edge
  "--os-highlight": "light-dark(rgb(0 0 0 / 0.05), rgb(255 255 255 / 0.18))", // raised bevel, top-left
  "--os-shade": "light-dark(rgb(0 0 0 / 0.05), rgb(0 0 0 / 0.85))", // raised bevel, bottom-right
  "--os-well-shade": "light-dark(rgb(0 0 0 / 0.05), rgb(0 0 0 / 0.9))", // sunken bevel, top-left
  "--os-well-light": "light-dark(rgb(0 0 0 / 0.05), rgb(255 255 255 / 0.12))", // sunken bevel, bottom-right
  "--os-shadow": "light-dark(rgb(15 18 26 / 0.08), rgb(0 0 0 / 0.7))", // the window's shadow: soft in light, hard in dark
  "--os-danger": "light-dark(#dc2626, #ff6b6b)", // errors (Figma has no red)
  "--os-success": "light-dark(#1b9346, #6fdc8c)", // "Account created" (Figma has no green)
} as React.CSSProperties

// Figma paints later effects on top; box-shadow lists the top one first.
const raised = "shadow-[inset_-1px_-1px_0_var(--os-shade),inset_1px_1px_0_var(--os-highlight)]"
const sunken = "shadow-[inset_-1px_-1px_0_var(--os-well-light),inset_1px_1px_0_var(--os-well-shade)]"
// The same bevels on what the light frame draws flat (the tabs, the panel, the picture, OK and Cancel): dark only.
const raisedDark = "dark:shadow-[inset_-1px_-1px_0_var(--os-shade),inset_1px_1px_0_var(--os-highlight)]"
const sunkenDark = "dark:shadow-[inset_-1px_-1px_0_var(--os-well-light),inset_1px_1px_0_var(--os-well-shade)]"
// A window: dark draws it raised with a hard shadow; light gives it a 1px line (taking a pixel of the frame, as
// Figma's stroke does) and a soft shadow (Figma's 0 28 56 -12; a shadow radius r renders like a CSS blur of about 0.9r).
const windowLight = "border border-(--os-line) shadow-[0_28px_50px_-12px_var(--os-shadow)] dark:border-0"
// A pressed button: the bevel turns over and the label moves a pixel down and right.
const pressable =
  "not-aria-disabled:not-disabled:active:shadow-[inset_1px_1px_0_var(--os-shade),inset_-1px_-1px_0_var(--os-highlight)] not-aria-disabled:not-disabled:active:[&>span]:translate-x-px not-aria-disabled:not-disabled:active:[&>span]:translate-y-px"
const text12 = "text-xs leading-[17px]"
const text11 = "text-[11px] leading-[15px]"
const glyph10 = "text-[10px] leading-3"
// Focus: the dotted rectangle classic dialogs draw inside a control (Figma draws none).
const focusDots = "outline-none focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-dotted focus-visible:outline-(--os-text)"
const focusAround = "outline-none focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-dotted focus-visible:outline-(--os-text)"

const USER_NAME = /^[a-z][a-z0-9._-]{2,19}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const FIELDS = ["fullName", "userName", "email", "password"] as const
type FieldKey = (typeof FIELDS)[number]
type Errors = Partial<Record<FieldKey | "picture", string>>
type Progress = { value: number; label: string; tone?: "done" | "error" }
type Payload = { values: RetroOsAccountFormValues; action: "ok" | "apply"; skip: boolean; update: boolean }

const NAME_SUFFIXES = ["jr", "sr", "ii", "iii", "iv"]

/** "Yusuf Hadi" → "yhadi": the first initial and the last name (suffixes like "Jr" skipped), a–z only. */
function suggestUserName(fullName: string) {
  const words = fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .split(/[\s-]+/)
    .filter((word, i, all) => word && !(i > 0 && i === all.length - 1 && NAME_SUFFIXES.includes(word)))
  if (!words.length) return ""
  return (words.length === 1 ? words[0] : words[0][0] + words[words.length - 1]).slice(0, 20)
}

function fieldError(key: FieldKey, values: RetroOsAccountFormValues, taken: string[]) {
  if (key === "fullName") return values.fullName.trim() ? undefined : "Type the user's full name."
  if (key === "userName") {
    const name = values.userName.trim()
    if (!name) return "Type a user name."
    if (!USER_NAME.test(name)) return "Use 3–20 of a–z, 0–9, '.', '_' or '-', starting with a letter."
    if (taken.includes(name)) return `"${name}" is already taken.`
    return undefined
  }
  if (key === "email") {
    const email = values.email.trim()
    if (!email) return "Type an e-mail address."
    return EMAIL.test(email) ? undefined : "That isn't a valid e-mail address."
  }
  if (!values.password) return "Type a password."
  return values.password.length < 8 ? "Use at least 8 characters." : undefined
}

/** A key for "has anything changed since the last Apply". */
const keyOf = (values: RetroOsAccountFormValues) =>
  JSON.stringify({ ...values, picture: values.picture ? [values.picture.name, values.picture.size, values.picture.lastModified] : null })

const slots = (root: Element | null | undefined, slot: string) => Array.from(root?.querySelectorAll<HTMLElement | SVGElement>(`[data-slot="retro-os-account-form-${slot}"]`) ?? [])

/** Flickers elements in, like a slow screen redrawing them. */
function redraw(target: Element[] | Element | null | undefined, delay = 0) {
  if (!target || (Array.isArray(target) && !target.length)) return
  animate(target, { opacity: [0, 1], duration: 160, delay, ease: stepped(2), onComplete: releaseStyles("opacity") })
}

// Figma's pixel robot ("robot.bmp"): 6px pixels on a 40px grid.
const ROBOT = [
  [8, 2], [14, 2], [20, 2], [26, 2], [2, 8], [8, 8], [26, 8], [32, 8], [2, 14], [14, 14], [20, 14], [32, 14],
  [2, 20], [32, 20], [2, 26], [8, 26], [14, 26], [20, 26], [26, 26], [32, 26], [8, 32], [26, 32],
]

function RobotPicture({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 40 40" className={className} fill="var(--os-accent)">
      {ROBOT.map(([x, y]) => (
        <rect key={`${x}-${y}`} data-slot="retro-os-account-form-pixel" x={x} y={y} width={6} height={6} />
      ))}
    </svg>
  )
}

// A pixel check for the confirmation (4px pixels).
const CHECK_PIXELS = [[7, 2], [6, 3], [7, 3], [1, 4], [5, 4], [6, 4], [1, 5], [2, 5], [4, 5], [5, 5], [2, 6], [3, 6], [4, 6], [3, 7]]

function CheckPicture() {
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="size-10 shrink-0" fill="var(--os-success)">
      {CHECK_PIXELS.map(([x, y]) => (
        <rect key={`${x}-${y}`} data-slot="retro-os-account-form-pixel" x={x * 4 + 2} y={y * 4} width={4} height={4} />
      ))}
    </svg>
  )
}

/** Figma's ✓ (U+2713 isn't in JetBrains Mono, Figma drew a fallback glyph), outlined at its place in the 14px box. */
function CheckGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="absolute inset-0 size-full" fill="var(--os-check)">
      <path
        transform="translate(3.0098 3.7402)"
        d="M1.58023 7.69977C1.58023 7.6131 1.56357 7.56977 1.53023 7.56977L1.30023 7.67977C1.30023 7.6331 1.27357 7.59977 1.22023 7.57977L1.14023 7.56977C1.0869 7.56977 1.02023 7.5931 0.940234 7.63977C0.926901 7.60643 0.910234 7.5731 0.890234 7.53977C0.870234 7.50643 0.853568 7.47643 0.840234 7.44977C0.753568 7.2831 0.666901 7.09977 0.580234 6.89977C0.500234 6.6931 0.423568 6.49643 0.350234 6.30977C0.283568 6.1231 0.230234 5.97643 0.190234 5.86977C0.163568 5.7831 0.133568 5.6531 0.100234 5.47977C0.0669011 5.30643 0.0335677 5.08643 0.000234403 4.81977C0.0735677 4.86643 0.130234 4.88977 0.170234 4.88977C0.216901 4.88977 0.260234 4.81977 0.300234 4.67977C0.320234 4.70643 0.356901 4.71977 0.410234 4.71977C0.450234 4.71977 0.480234 4.70643 0.500234 4.67977L0.660234 4.43977L0.840234 4.49977H0.850234C0.863568 4.49977 0.876901 4.4931 0.890234 4.47977C0.903568 4.46643 0.923568 4.4531 0.950235 4.43977C1.00357 4.40643 1.04357 4.38977 1.07023 4.38977L1.10023 4.39977C1.2669 4.47977 1.37357 4.62643 1.42023 4.83977C1.54023 5.34643 1.66023 5.59977 1.78023 5.59977C1.90023 5.59977 2.04023 5.4731 2.20023 5.21977C2.28023 5.0931 2.36023 4.94643 2.44023 4.77977C2.5269 4.6131 2.61357 4.42643 2.70023 4.21977C2.71357 4.29977 2.7269 4.33977 2.74023 4.33977C2.77357 4.33977 2.83023 4.25643 2.91023 4.08977C2.9969 3.9231 3.13357 3.6931 3.32023 3.39977C3.4269 3.21977 3.56023 3.01643 3.72023 2.78977C3.8869 2.5631 4.06357 2.32977 4.25023 2.08977C4.4369 1.84977 4.6169 1.6231 4.79023 1.40977C4.97023 1.19643 5.13023 1.0131 5.27023 0.859765C5.41023 0.706432 5.51357 0.606432 5.58023 0.559765C5.83357 0.386432 6.03357 0.219765 6.18023 0.0597653C6.17357 0.106432 6.16357 0.149765 6.15023 0.189765C6.14357 0.223099 6.14023 0.246432 6.14023 0.259765C6.14023 0.286432 6.15357 0.299765 6.18023 0.299765L6.46023 0.159765V0.199765C6.46023 0.253099 6.47357 0.279765 6.50023 0.279765C6.52023 0.279765 6.56023 0.249765 6.62023 0.189765C6.68023 0.129765 6.71357 0.0864321 6.72023 0.0597653L6.70023 0.199765L7.04023 -0.000234485L6.96023 0.179766C7.0669 0.106432 7.14357 0.0697652 7.19023 0.0697652C7.2169 0.0697652 7.2369 0.0864319 7.25023 0.119765C7.26357 0.146432 7.27023 0.173099 7.27023 0.199765C7.27023 0.239765 7.25357 0.286432 7.22023 0.339765C7.1869 0.393099 7.14357 0.456432 7.09023 0.529765C7.05023 0.583099 6.98357 0.663099 6.89023 0.769765C6.80357 0.869765 6.67023 1.01977 6.49023 1.21977C6.31023 1.4131 6.07023 1.6831 5.77023 2.02977C5.69023 2.11643 5.5669 2.26977 5.40023 2.48977C5.23357 2.7031 5.04357 2.9531 4.83023 3.23977C4.62357 3.51977 4.4169 3.8031 4.21023 4.08977C4.00357 4.37643 3.82023 4.63643 3.66023 4.86977C3.50023 5.09643 3.3869 5.26643 3.32023 5.37977L2.70023 6.42977C2.5669 6.65643 2.4569 6.8431 2.37023 6.98977C2.28357 7.12977 2.2169 7.22643 2.17023 7.27977C2.07023 7.39977 1.96023 7.50643 1.84023 7.59977L1.75023 7.54977L1.67023 7.59977L1.58023 7.69977Z"
      />
    </svg>
  )
}

/** Figma's □ (maximize) and ▾ glyphs, outlined at their places (JetBrains Mono's web subsets lack U+25A1 and U+25BE). */
function SquareGlyph({ restore }: { restore: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 18 16" className="absolute inset-0 size-full" fill="currentColor">
      {restore ? (
        // two windows: the restore glyph, drawn in the same 0.5px line
        <path d="M8 4.4h5v5h-1v-.5h.5v-4h-4v.5H8V4.4ZM5 6.4h5v5H5v-5Zm.5.5v4h4v-4h-4Z" />
      ) : (
        <path transform="translate(6 5.4004)" d="M0 5.99961V-0.000390887H6V5.99961H0ZM0.5 5.49961H5.5V0.499609H0.5V5.49961Z" />
      )}
    </svg>
  )
}

function ArrowGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 22 22" className="absolute inset-0 size-full" fill="currentColor">
      <path transform="translate(9.5 9.9004)" d="M5.96046e-08 -0.000391126H3L1.5 3.09961L5.96046e-08 -0.000391126Z" />
    </svg>
  )
}

/**
 * A raised push button; `isDefault` adds the default button's dark outline (Figma's OK). `flat` draws it without a face
 * or bevel in light, as the light frame draws OK and Cancel.
 */
function OsButton({ isDefault = false, flat = false, className, children, ...props }: React.ComponentProps<"button"> & { isDefault?: boolean; flat?: boolean }) {
  const bevel = isDefault
    ? flat
      ? "dark:shadow-[inset_-1px_-1px_0_var(--os-shade),inset_1px_1px_0_var(--os-highlight),inset_0_0_0_1px_var(--os-frame)]"
      : "shadow-[inset_-1px_-1px_0_var(--os-shade),inset_1px_1px_0_var(--os-highlight),inset_0_0_0_1px_var(--os-frame)]"
    : flat
      ? raisedDark
      : raised
  return (
    <button
      type="button"
      {...props}
      className={cn(
        text12,
        "relative flex shrink-0 cursor-default items-center justify-center whitespace-nowrap text-(--os-text) select-none aria-disabled:cursor-wait disabled:text-(--os-disabled) disabled:[text-shadow:1px_1px_0_var(--os-well-light)]",
        flat ? "bg-(--os-face)" : "bg-(--os-button)",
        bevel,
        pressable,
        focusDots,
        className,
      )}
    >
      <span className="block">{children}</span>
    </button>
  )
}

/** A label column and a field, with the error under the field. */
function Row({
  label,
  htmlFor,
  labelId,
  error,
  errorId,
  children,
}: {
  label: string
  htmlFor?: string
  labelId?: string
  error?: string
  errorId?: string
  children: React.ReactNode
}) {
  const labelClass = cn(text12, "truncate text-right", error ? "text-(--os-danger)" : "text-(--os-text)")
  return (
    <div data-slot="retro-os-account-form-row" className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 @max-[400px]/os:grid-cols-[84px_minmax(0,1fr)]">
      {htmlFor ? (
        <label id={labelId} htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      ) : (
        <span id={labelId} className={labelClass}>
          {label}
        </span>
      )}
      {children}
      {error && (
        <p id={errorId} data-slot="retro-os-account-form-error" className={cn(text11, "col-start-2 text-(--os-danger)")}>
          {error}
        </p>
      )}
    </div>
  )
}

const well = cn("flex h-7 min-w-0 items-center bg-(--os-well) px-2", sunken)
const inputClass = cn(
  text12,
  "h-[17px] w-full min-w-0 bg-transparent p-0 text-(--os-text) caret-(--os-text) outline-none placeholder:text-(--os-disabled) selection:bg-(--os-selection) selection:text-(--os-on-selection) read-only:cursor-default",
)

/** A press on a well (its padding) focuses the field inside it. */
function focusWell(event: React.PointerEvent<HTMLElement>, input: HTMLInputElement | null) {
  if (!input || event.target === input) return
  event.preventDefault()
  input.focus()
}

/** A text field in a sunken well; a press anywhere on the well focuses it. */
function WellInput({ invalid, className, ref, ...props }: React.ComponentProps<"input"> & { invalid?: boolean }) {
  const own = React.useRef<HTMLInputElement | null>(null)
  // keeps this component's ref on the input that also takes the consumer's
  const setRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      own.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  return (
    <div className={cn(well, "cursor-text")} onPointerDown={(event) => focusWell(event, own.current)}>
      <input ref={setRef} aria-invalid={invalid || undefined} spellCheck={false} {...props} className={cn(inputClass, className)} />
    </div>
  )
}

/**
 * The password well: a real password field whose characters show as asterisks, the way classic dialogs mask them
 * (the browser's own mask is a dot).
 */
function PasswordInput({
  value,
  invalid,
  onValueChange,
  ref,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & { value: string; invalid?: boolean; onValueChange: (value: string) => void }) {
  const own = React.useRef<HTMLInputElement | null>(null)
  // keeps this component's ref on the input that also takes the consumer's
  const setRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      own.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  const [scroll, setScroll] = React.useState(0)
  const sync = () => setScroll(own.current?.scrollLeft ?? 0)
  return (
    <div className={cn(well, "cursor-text")} onPointerDown={(event) => focusWell(event, own.current)}>
      <span className="relative flex h-[17px] min-w-0 flex-1 overflow-hidden">
        <input
          ref={setRef}
          type="password"
          value={value}
          aria-invalid={invalid || undefined}
          autoComplete="new-password"
          {...props}
          onChange={(event) => {
            onValueChange(event.target.value)
            sync()
          }}
          onSelect={sync}
          onScroll={sync}
          onKeyUp={sync}
          className={cn(inputClass, "text-transparent")}
        />
        <span aria-hidden className={cn(text12, "pointer-events-none absolute top-0 left-0 whitespace-pre text-(--os-text)")} style={{ transform: `translateX(${-scroll}px)` }}>
          {"*".repeat(value.length)}
        </span>
      </span>
    </div>
  )
}

/** A drop-down list: the sunken well with its arrow button, the list in the window's colours. */
function OsSelect({
  id,
  name,
  value,
  onValueChange,
  options,
  disabled,
  listRef,
  labelledBy,
}: {
  id?: string
  name: string
  value: string
  onValueChange: (value: string) => void
  options: RetroOsAccountOption[]
  disabled?: boolean
  listRef: (node: HTMLDivElement | null) => void
  labelledBy?: string
}) {
  return (
    <SelectPrimitive.Root name={name} value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-labelledby={labelledBy}
        data-slot="retro-os-account-form-select"
        className={cn(well, "group/select w-full cursor-default gap-1 pr-[2px] text-left outline-none disabled:cursor-not-allowed")}
      >
        <span className={cn(text12, "min-w-0 flex-1 truncate text-(--os-text) group-focus-visible/select:bg-(--os-selection) group-focus-visible/select:text-(--os-on-selection) group-disabled/select:text-(--os-disabled)")}>
          <SelectPrimitive.Value />
        </span>
        <span aria-hidden className={cn("relative size-[22px] shrink-0 bg-(--os-button) text-(--os-text) group-data-[state=open]/select:shadow-[inset_1px_1px_0_var(--os-shade),inset_-1px_-1px_0_var(--os-highlight)]", raised)}>
          <ArrowGlyph />
        </span>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          ref={listRef}
          position="popper"
          sideOffset={2}
          className="z-50 max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) overflow-hidden bg-(--os-well) p-[2px] font-form-jetbrains-mono text-(--os-text) antialiased shadow-[inset_0_0_0_1px_var(--os-line),0_28px_50px_-12px_var(--os-shadow)] scheme-light dark:shadow-[inset_0_0_0_1px_var(--os-frame),4px_4px_0_var(--os-shadow)] dark:scheme-dark"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className={cn(text12, "flex h-[22px] cursor-default items-center px-2 whitespace-nowrap outline-none select-none data-highlighted:bg-(--os-selection) data-highlighted:text-(--os-on-selection)")}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

/** A check box: a 14px sunken well with Figma's ✓, the label beside it. */
function OsCheckbox({
  id,
  name,
  checked,
  onCheckedChange,
  disabled,
  label,
  note,
  noteId,
}: {
  id: string
  name: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label: string
  note?: string
  noteId?: string
}) {
  return (
    // the box sits on the first line (1.5px down, as in Figma's 17px row) when the label wraps
    <div data-slot="retro-os-account-form-option" className="flex min-h-[17px] items-start gap-2">
      <CheckboxPrimitive.Root
        id={id}
        name={name}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        aria-describedby={note ? noteId : undefined}
        className={cn("relative mt-[1.5px] size-[14px] shrink-0 bg-(--os-well) disabled:opacity-50", sunken, focusAround)}
      >
        <CheckboxPrimitive.Indicator data-slot="retro-os-account-form-check" className="absolute inset-0">
          <CheckGlyph />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id} className={cn(text12, disabled ? "text-(--os-disabled)" : "text-(--os-text)")}>
          {label}
        </label>
        {note && (
          <p id={noteId} className={cn(text11, "text-(--os-text-2)")}>
            {note}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * "New User Account" from the Keitoto library: a retro OS dialog, every edge an inner-shadow bevel. General, Profile and
 * Security tabs; the Profile tab takes a picture (Browse... opens a file), the full name, a user name that follows it
 * until you edit it, e-mail, a department list, a password shown as asterisks and two options. OK and Apply validate
 * and send it to `onSubmit`, which can report its progress to the status bar ("Creating home folder... 64%", one
 * segment per 5%); Apply keeps the dialog open and greys out until something changes, OK ends on a confirmation. The
 * title bar's buttons roll the dialog up, widen it and close it. Animated with anime.js in steps, like an old screen:
 * the window snaps open, the title bar and rows redraw, the robot's pixels fill in, the progress segments light one by
 * one while the percentage counts, tabs redraw, checks pop and an invalid submit shakes the window.
 */
function RetroOsAccountForm({
  defaultValues,
  onSubmit,
  onCancel,
  onClose,
  title = "New User Account",
  placeholders: placeholdersProp,
  departments = sampleRetroOsAccountDepartments,
  accountTypes = sampleRetroOsAccountTypes,
  lockoutOptions = sampleRetroOsAccountLockout,
  takenUserNames = reservedUserNames,
  steps = sampleRetroOsAccountSteps,
  stepDuration = 700,
  homeFolder = (userName: string) => `C:\\Users\\${userName}`,
  defaultPictureName = "robot.bmp",
  maxPictureSize = 2 * 1024 * 1024,
  tab: tabProp,
  defaultTab = "profile",
  onTabChange,
  className,
  style,
  onKeyDown,
  ref,
  ...props
}: RetroOsAccountFormProps) {
  const id = React.useId()
  const ids = {
    title: `${id}-title`,
    picture: `${id}-picture`,
    pictureName: `${id}-picture-name`,
    fullName: `${id}-full-name`,
    userName: `${id}-user-name`,
    email: `${id}-email`,
    department: `${id}-department`,
    departmentLabel: `${id}-department-label`,
    password: `${id}-password`,
    options: `${id}-options`,
    mustChange: `${id}-must-change`,
    disabled: `${id}-disabled`,
    description: `${id}-description`,
    accountType: `${id}-account-type`,
    home: `${id}-home`,
    member: `${id}-member`,
    neverExpires: `${id}-never-expires`,
    neverExpiresNote: `${id}-never-expires-note`,
    lockout: `${id}-lockout`,
    lockoutLabel: `${id}-lockout-label`,
    status: `${id}-status`,
    box: `${id}-box`,
    boxText: `${id}-box-text`,
    error: (key: string) => `${id}-${key}-error`,
  }

  const placeholders = { ...defaultPlaceholders, ...placeholdersProp }
  const [initial] = React.useState(() => {
    const merged = { ...defaultRetroOsAccountValues, ...defaultValues }
    if (!departments.some((option) => option.value === merged.department)) merged.department = departments[0]?.value ?? ""
    if (!accountTypes.some((option) => option.value === merged.accountType)) merged.accountType = accountTypes[0]?.value ?? ""
    if (!lockoutOptions.some((option) => option.value === merged.lockout)) merged.lockout = lockoutOptions[0]?.value ?? ""
    return merged
  })
  const [values, setValues] = React.useState<RetroOsAccountFormValues>(initial)
  // the user name follows the full name until it's typed in
  const [userNameEdited, setUserNameEdited] = React.useState(() => initial.userName !== suggestUserName(initial.fullName))
  const [pictureUrl, setPictureUrl] = React.useState<string | null>(null)
  const [tab, setTab] = useControllableState<RetroOsAccountTab>({ value: tabProp, defaultValue: defaultTab, onChange: onTabChange })
  const [errors, setErrors] = React.useState<Errors>({})
  const [progress, setProgress] = React.useState<Progress | null>(null)
  const [applied, setApplied] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<"normal" | "minimized" | "maximized">("normal")
  const reduced = useReducedMotion()

  const rootRef = React.useRef<HTMLFormElement | null>(null)
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const boxOkRef = React.useRef<HTMLButtonElement>(null)
  const fullNameRef = React.useRef<HTMLInputElement>(null)
  const userNameRef = React.useRef<HTMLInputElement>(null)
  const emailRef = React.useRef<HTMLInputElement>(null)
  const passwordRef = React.useRef<HTMLInputElement>(null)
  const focusField = (key: FieldKey) => ({ fullName: fullNameRef, userName: userNameRef, email: emailRef, password: passwordRef })[key].current?.focus()
  const lastWidth = React.useRef<number | null>(null)
  const lastHeight = React.useRef<number | null>(null)

  const run = React.useCallback(
    async ({ values: submitted, action, skip, update }: Payload) => {
      let reported = false
      let step = 0
      setProgress({ value: steps[0]?.value ?? 0, label: steps[0]?.label ?? "Working..." })
      const timer = setInterval(() => {
        if (reported || step >= steps.length - 1 || !rootRef.current?.isConnected) return clearInterval(timer)
        step += 1
        setProgress({ value: steps[step].value, label: steps[step].label })
      }, stepDuration)
      const report = (value: number, label?: string) => {
        reported = true
        clearInterval(timer)
        setProgress((current) => ({ value: Math.min(100, Math.max(0, value)), label: label ?? current?.label ?? "Working..." }))
      }
      try {
        if (!skip) await onSubmit?.(submitted, { action, progress: report })
      } finally {
        clearInterval(timer)
      }
      setProgress({ value: 100, label: `Account ${submitted.userName} ${update ? "updated" : "created"}.`, tone: "done" })
      setApplied(keyOf(submitted))
    },
    [onSubmit, steps, stepDuration],
  )
  const { status, submit, reset } = useFormSubmit(run)
  const busy = status === "submitting"
  const done = status === "success"
  const dirty = keyOf(values) !== applied

  const setRoot = React.useCallback(
    (node: HTMLFormElement | null) => {
      rootRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  const update = (patch: Partial<RetroOsAccountFormValues>) => {
    if (busy) return
    const next = { ...values, ...patch }
    setValues(next)
    setErrors((current) => {
      let changed = false
      const out = { ...current }
      for (const key of FIELDS) {
        if (!current[key]) continue
        out[key] = fieldError(key, next, takenUserNames)
        changed = true
      }
      return changed ? out : current
    })
  }

  const setFullName = (fullName: string) => update(userNameEdited ? { fullName } : { fullName, userName: suggestUserName(fullName) })

  const pickPicture = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) return setErrors((current) => ({ ...current, picture: "Pick an image file (BMP, PNG, GIF or JPG)." }))
    if (file.size > maxPictureSize) return setErrors((current) => ({ ...current, picture: `Pick a picture under ${Math.round(maxPictureSize / 1024 / 1024)} MB.` }))
    setErrors((current) => ({ ...current, picture: undefined }))
    update({ picture: file })
    const reader = new FileReader()
    reader.onload = () => setPictureUrl(typeof reader.result === "string" ? reader.result : null)
    reader.readAsDataURL(file)
  }

  const restore = () => {
    setValues(initial)
    setUserNameEdited(initial.userName !== suggestUserName(initial.fullName))
    setPictureUrl(null)
    setErrors({})
    setProgress(null)
  }
  const cancel = () => (onCancel ?? restore)()
  const close = () => (onClose ?? onCancel ?? restore)()

  const send = async (action: "ok" | "apply") => {
    if (busy || done) return
    const found: Errors = {}
    for (const key of FIELDS) {
      const message = fieldError(key, values, takenUserNames)
      if (message) found[key] = message
    }
    setErrors(found)
    const first = FIELDS.find((key) => found[key])
    if (first) {
      // every checked field is on the Profile tab: open it before focusing
      setTab("profile")
      requestAnimationFrame(() => focusField(first))
      shake(rootRef.current, { distance: 5, duration: 320 })
      return
    }
    const submitted: RetroOsAccountFormValues = {
      ...values,
      fullName: values.fullName.trim(),
      userName: values.userName.trim(),
      email: values.email.trim(),
      description: values.description.trim(),
      passwordNeverExpires: values.passwordNeverExpires && !values.mustChangePassword,
    }
    try {
      await submit({ values: submitted, action, skip: !dirty, update: applied !== null })
      // Apply keeps the dialog: back to editing, the status bar says what happened
      if (action === "apply") reset()
    } catch {
      setProgress((current) => ({ value: current?.value ?? 0, label: "Account not created. Try again.", tone: "error" }))
    }
  }

  // The confirmation's OK closes the dialog (or starts a new account without onClose); "New user" starts one.
  const startNew = () => {
    setValues({ ...initial, picture: null, fullName: "", userName: "", email: "", password: "", description: "" })
    setUserNameEdited(false)
    setPictureUrl(null)
    setErrors({})
    setProgress(null)
    setApplied(null)
    setTab("profile")
    reset()
    requestAnimationFrame(() => focusField("fullName"))
  }

  const toggleMode = (next: "minimized" | "maximized") => {
    lastWidth.current = rootRef.current?.offsetWidth ?? null
    lastHeight.current = bodyRef.current?.offsetHeight ?? null
    setMode((current) => (current === next ? "normal" : next))
  }

  React.useEffect(() => {
    if (done) boxOkRef.current?.focus({ preventScroll: true })
  }, [done])

  // ── motion ────────────────────────────────────────────────────────────────────────────────────────────────────────

  // Entrance, once the dialog is a quarter in view, in steps like an old screen: the window snaps open, the title bar
  // draws left to right, the tabs and rows redraw one by one, the robot's pixels fill in and the progress lights up.
  useFormEntrance(rootRef, (timeline) => {
    const root = rootRef.current
    if (!root) return
    timeline.add(root, { opacity: [0, 1], scale: [0.92, 1], duration: 220, ease: stepped(4), onComplete: releaseStyles("opacity", "transform") }, 0)
    const bar = slots(root, "titlebar")
    if (bar.length) timeline.add(bar, { clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)"], duration: 300, ease: stepped(8), onComplete: releaseStyles("clip-path") }, 140)
    const tabs = slots(root, "tab")
    if (tabs.length) timeline.add(tabs, { opacity: [0, 1], duration: 120, ease: stepped(2), delay: stagger(70), onComplete: releaseStyles("opacity") }, 300)
    const rows = slots(root.querySelector('[data-slot="retro-os-account-form-panel"] [data-state="active"]'), "row")
    const extra = [...slots(root, "options"), ...slots(root, "status"), ...slots(root, "footer-button")]
    if (rows.length || extra.length) timeline.add([...rows, ...extra], { opacity: [0, 1], duration: 120, ease: stepped(2), delay: stagger(55), onComplete: releaseStyles("opacity") }, 420)
    const pixels = slots(root.querySelector('[data-slot="retro-os-account-form-picture"]'), "pixel")
    if (pixels.length) timeline.add(pixels, { opacity: [0, 1], duration: 30, ease: stepped(1), delay: stagger(22, { from: "random" }), onComplete: releaseStyles("opacity") }, 520)
    const segments = slots(root, "segment")
    if (segments.length) timeline.add(segments, { opacity: [0, 1], duration: 30, ease: stepped(1), delay: stagger(34), onComplete: releaseStyles("opacity") }, 700)
  })

  // The status bar's percentage counts, and the segments a new value lights flash on one after another.
  const percent = progress ? Math.round(progress.value) : 0
  const lit = Math.round((percent / 100) * 20)
  const percentRef = React.useRef<HTMLSpanElement>(null)
  useCountUp(percentRef, percent, (n) => String(Math.round(n)), { duration: 420 })
  const lastLit = React.useRef(lit)
  useIsomorphicLayoutEffect(() => {
    const previous = lastLit.current
    lastLit.current = lit
    if (reduced || lit <= previous) return
    const fresh = slots(rootRef.current, "segment").slice(previous, lit)
    if (fresh.length) animate(fresh, { opacity: [0, 1], duration: 40, ease: stepped(1), delay: stagger(40), onComplete: releaseStyles("opacity") })
  }, [lit, reduced])

  // A tab's page redraws when it opens.
  const lastTab = React.useRef(tab)
  useIsomorphicLayoutEffect(() => {
    const previous = lastTab.current
    lastTab.current = tab
    if (reduced || previous === tab) return
    const page = rootRef.current?.querySelector(`[data-slot="retro-os-account-form-page"][data-state="active"]`)
    if (page) animate(page, { opacity: [0, 1], duration: 160, ease: stepped(3), onComplete: releaseStyles("opacity") })
  }, [tab, reduced])

  // Checks pop in.
  const checksKey = `${values.mustChangePassword}|${values.disabled}|${values.passwordNeverExpires}`
  const lastChecks = React.useRef(checksKey)
  useIsomorphicLayoutEffect(() => {
    const previous = lastChecks.current
    lastChecks.current = checksKey
    if (reduced || previous === checksKey) return
    const checks = slots(rootRef.current, "check")
    if (checks.length) animate(checks, { scale: [0.4, 1.15, 1], duration: 180, ease: stepped(3), onComplete: releaseStyles("transform") })
  }, [checksKey, reduced])

  // Errors redraw where they appear; a new picture redraws.
  const errorKey = Object.entries(errors)
    .filter(([, message]) => message)
    .map(([key]) => key)
    .join()
  useIsomorphicLayoutEffect(() => {
    if (reduced || !errorKey) return
    redraw(slots(rootRef.current, "error"))
  }, [errorKey, reduced])
  useIsomorphicLayoutEffect(() => {
    if (reduced || !pictureUrl) return
    redraw(slots(rootRef.current, "picture"))
  }, [pictureUrl, reduced])

  // Rolled up / widened: the body folds into the title bar (or unfolds), the window snaps to its new width.
  useIsomorphicLayoutEffect(() => {
    const body = bodyRef.current
    const root = rootRef.current
    const fromHeight = lastHeight.current
    const fromWidth = lastWidth.current
    lastHeight.current = null
    lastWidth.current = null
    if (reduced || !body || !root) return
    if (fromHeight !== null && fromHeight !== body.offsetHeight) {
      animate(body, { height: [fromHeight, body.offsetHeight], duration: 200, ease: stepped(5), onComplete: releaseStyles("height") })
    }
    if (fromWidth !== null && fromWidth !== root.offsetWidth) {
      animate(root, { width: [fromWidth, root.offsetWidth], duration: 200, ease: stepped(5), onComplete: releaseStyles("width") })
    }
  }, [mode, reduced])

  // The confirmation snaps open over the dialog.
  useIsomorphicLayoutEffect(() => {
    if (reduced || !done) return
    const box = slots(rootRef.current, "box")[0]
    if (box) animate(box, { scale: [0.86, 1], opacity: [0, 1], duration: 180, ease: stepped(3), onComplete: releaseStyles("transform", "opacity") })
    const pixels = slots(box, "pixel")
    if (pixels.length) animate(pixels, { opacity: [0, 1], duration: 30, ease: stepped(1), delay: stagger(26, { start: 160 }), onComplete: releaseStyles("opacity") })
  }, [done, reduced])

  // Lists portal to <body>: they get the form's palette (as overridden on the form) and redraw in.
  const setListRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !rootRef.current) return
      const computed = getComputedStyle(rootRef.current)
      for (const key of Object.keys(palette)) node.style.setProperty(key, computed.getPropertyValue(key))
      // and the form's light or dark, which its light-dark() colours resolve against
      node.style.setProperty("color-scheme", computed.colorScheme)
      if (!reduced) animate(node, { opacity: [0, 1], duration: 120, ease: stepped(2), onComplete: releaseStyles("opacity") })
    },
    [reduced],
  )

  // ── content ───────────────────────────────────────────────────────────────────────────────────────────────────────

  const describedBy = (key: FieldKey) => (errors[key] ? ids.error(key) : undefined)
  const department = departments.find((option) => option.value === values.department)
  const userName = values.userName.trim()
  const statusText = progress ? `${progress.label} ${percent}%` : "Ready."
  const tabs: { value: RetroOsAccountTab; label: string }[] = [
    { value: "general", label: "General" },
    { value: "profile", label: "Profile" },
    { value: "security", label: "Security" },
  ]
  const neverExpiresOff = values.mustChangePassword

  return (
    <form
      noValidate
      aria-labelledby={ids.title}
      {...props}
      ref={setRoot}
      data-slot="retro-os-account-form"
      data-mode={mode}
      aria-busy={busy || undefined}
      className={cn(
        "@container/os relative isolate flex w-full max-w-[480px] flex-col bg-(--os-window) p-[3px] font-form-jetbrains-mono text-(--os-text) antialiased scheme-light aria-busy:cursor-wait data-[mode=maximized]:max-w-none dark:shadow-[inset_-1px_-1px_0_var(--os-shade),inset_1px_1px_0_var(--os-highlight),8px_8px_0_var(--os-shadow)] dark:scheme-dark",
        windowLight,
        className,
      )}
      style={{ ...palette, ...style }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented || event.key !== "Escape" || busy || !rootRef.current?.contains(event.target as Node)) return
        event.preventDefault()
        if (done) close()
        else cancel()
      }}
      onSubmit={(event) => {
        event.preventDefault()
        void send("ok")
      }}
    >
      <div
        data-slot="retro-os-account-form-titlebar"
        className="flex h-[26px] items-center gap-2 bg-[linear-gradient(to_right,var(--os-title-from),var(--os-title-to))] px-2"
        onDoubleClick={() => toggleMode("maximized")}
      >
        <span aria-hidden className={cn("size-[14px] shrink-0 bg-(--os-title-icon) shadow-[inset_0_0_0_1px_var(--os-line)]", raisedDark)} />
        <h2 id={ids.title} className="min-w-0 flex-1 truncate font-form-silkscreen text-[11px] leading-[15px] font-normal text-(--os-title-text)">
          {title}
        </h2>
        <OsButton aria-label={mode === "minimized" ? "Restore" : "Minimize"} aria-pressed={mode === "minimized"} onClick={() => toggleMode("minimized")} className={cn(glyph10, "h-4 w-[18px]")}>
          _
        </OsButton>
        <OsButton aria-label={mode === "maximized" ? "Restore" : "Maximize"} aria-pressed={mode === "maximized"} onClick={() => toggleMode("maximized")} className="h-4 w-[18px]">
          <SquareGlyph restore={mode === "maximized"} />
        </OsButton>
        <OsButton aria-label="Close" aria-disabled={busy || undefined} onClick={() => !busy && close()} className={cn(glyph10, "h-4 w-[18px]")}>
          ×
        </OsButton>
      </div>

      <div ref={bodyRef} data-slot="retro-os-account-form-body" inert={mode === "minimized" || done} className={cn("flex flex-col", mode === "minimized" && "h-0 overflow-hidden")}>
        <TabsPrimitive.Root value={tab} onValueChange={(next) => setTab(next as RetroOsAccountTab)} className="flex flex-col">
          <TabsPrimitive.List aria-label="Account settings" className="flex items-start gap-[2px] border border-(--os-line) bg-(--os-strip) px-2.5 pt-2.5 dark:border-0">
            {tabs.map((item) => (
              <TabsPrimitive.Trigger
                key={item.value}
                value={item.value}
                data-slot="retro-os-account-form-tab"
                className={cn(
                  text12,
                  "relative cursor-default rounded-t-[3px] bg-(--os-tab) px-3 py-[5px] text-(--os-text-2) select-none data-[state=active]:bg-(--os-face) data-[state=active]:text-(--os-text)",
                  raisedDark,
                  focusDots,
                )}
              >
                <span className="hug-w block whitespace-nowrap">{item.label}</span>
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>

          <div data-slot="retro-os-account-form-panel" className={cn("flex flex-col gap-3 bg-(--os-face) p-4 @max-[400px]/os:p-3", raisedDark)}>
            {/* the pages share one grid cell, so the dialog keeps the tallest page's height whichever is open */}
            <div className="grid">
              <TabsPrimitive.Content forceMount value="profile" data-slot="retro-os-account-form-page" className="col-start-1 row-start-1 flex flex-col gap-3 outline-none data-[state=inactive]:invisible">
                <div data-slot="retro-os-account-form-row" className="flex items-center gap-[14px]">
                  <div data-slot="retro-os-account-form-picture" className={cn("flex size-16 shrink-0 items-center justify-center bg-(--os-picture)", sunkenDark)}>
                    {pictureUrl ? (
                      <img src={pictureUrl} alt="" className="size-10 object-cover [image-rendering:pixelated]" />
                    ) : (
                      <RobotPicture className="size-10" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col items-start gap-1.5 border border-(--os-line) bg-(--os-strip) dark:border-0">
                    <p id={ids.pictureName} className={cn(text12, "max-w-full truncate")}>
                      Picture: {values.picture?.name ?? defaultPictureName}
                    </p>
                    <OsButton
                      aria-describedby={errors.picture ? `${ids.pictureName} ${ids.error("picture")}` : ids.pictureName}
                      onClick={() => !busy && fileRef.current?.click()}
                      aria-disabled={busy || undefined}
                      className="px-3 py-1"
                    >
                      <span className="hug-w block">Browse...</span>
                    </OsButton>
                    <input
                      ref={fileRef}
                      id={ids.picture}
                      type="file"
                      accept="image/*"
                      tabIndex={-1}
                      aria-hidden
                      className="sr-only"
                      onChange={(event) => {
                        pickPicture(event.target.files?.[0])
                        event.target.value = ""
                      }}
                    />
                    {errors.picture && (
                      <p id={ids.error("picture")} data-slot="retro-os-account-form-error" className={cn(text11, "text-(--os-danger)")}>
                        {errors.picture}
                      </p>
                    )}
                  </div>
                </div>

                <Row label="Full name:" htmlFor={ids.fullName} error={errors.fullName} errorId={ids.error("fullName")}>
                  <WellInput
                    ref={fullNameRef}
                    id={ids.fullName}
                    name="fullName"
                    autoComplete="name"
                    value={values.fullName}
                    placeholder={placeholders.fullName}
                    readOnly={busy}
                    onChange={(event) => setFullName(event.target.value)}
                    invalid={Boolean(errors.fullName)}
                    aria-required
                    aria-describedby={describedBy("fullName")}
                  />
                </Row>
                <Row label="User name:" htmlFor={ids.userName} error={errors.userName} errorId={ids.error("userName")}>
                  <WellInput
                    ref={userNameRef}
                    id={ids.userName}
                    name="userName"
                    autoComplete="username"
                    autoCapitalize="none"
                    value={values.userName}
                    placeholder={placeholders.userName}
                    readOnly={busy}
                    onChange={(event) => {
                      setUserNameEdited(true)
                      update({ userName: event.target.value.toLowerCase().replace(/\s/g, "") })
                    }}
                    maxLength={20}
                    invalid={Boolean(errors.userName)}
                    aria-required
                    aria-describedby={describedBy("userName")}
                  />
                </Row>
                <Row label="E-mail:" htmlFor={ids.email} error={errors.email} errorId={ids.error("email")}>
                  <WellInput
                    ref={emailRef}
                    id={ids.email}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={values.email}
                    placeholder={placeholders.email}
                    readOnly={busy}
                    onChange={(event) => update({ email: event.target.value })}
                    invalid={Boolean(errors.email)}
                    aria-required
                    aria-describedby={describedBy("email")}
                  />
                </Row>
                <Row label="Department:" labelId={ids.departmentLabel}>
                  <OsSelect
                    id={ids.department}
                    name="department"
                    value={values.department}
                    onValueChange={(department) => update({ department })}
                    options={departments}
                    listRef={setListRef}
                    labelledBy={ids.departmentLabel}
                  />
                </Row>
                <Row label="Password:" htmlFor={ids.password} error={errors.password} errorId={ids.error("password")}>
                  <PasswordInput
                    ref={passwordRef}
                    id={ids.password}
                    name="password"
                    value={values.password}
                    placeholder={placeholders.password}
                    readOnly={busy}
                    onValueChange={(password) => update({ password })}
                    invalid={Boolean(errors.password)}
                    aria-required
                    aria-describedby={describedBy("password")}
                  />
                </Row>

                <div
                  role="group"
                  aria-labelledby={ids.options}
                  data-slot="retro-os-account-form-options"
                  className="flex flex-col gap-2 border border-(--os-groove) px-3 pt-[14px] pb-3 shadow-[inset_1px_1px_0_var(--os-groove-shadow),1px_1px_0_var(--os-groove-shadow)]"
                >
                  <p id={ids.options} className={cn(text11, "text-(--os-text-2)")}>
                    Options
                  </p>
                  <OsCheckbox
                    id={ids.mustChange}
                    name="mustChangePassword"
                    checked={values.mustChangePassword}
                    onCheckedChange={(mustChangePassword) => update({ mustChangePassword })}
                    label="User must change password at next logon"
                  />
                  <OsCheckbox id={ids.disabled} name="disabled" checked={values.disabled} onCheckedChange={(disabled) => update({ disabled })} label="Account is disabled" />
                </div>
              </TabsPrimitive.Content>

              <TabsPrimitive.Content forceMount value="general" data-slot="retro-os-account-form-page" className="col-start-1 row-start-1 flex flex-col gap-3 outline-none data-[state=inactive]:invisible">
                <Row label="Description:" htmlFor={ids.description}>
                  <WellInput
                    id={ids.description}
                    name="description"
                    value={values.description}
                    readOnly={busy}
                    placeholder={placeholders.description}
                    onChange={(event) => update({ description: event.target.value })}
                  />
                </Row>
                <Row label="Account type:" labelId={ids.accountType}>
                  <RadioGroupPrimitive.Root
                    aria-labelledby={ids.accountType}
                    name="accountType"
                    value={values.accountType}
                    onValueChange={(accountType) => update({ accountType })}
                    className="flex min-h-7 flex-wrap items-center gap-x-4 gap-y-1"
                  >
                    {accountTypes.map((option) => (
                      <label key={option.value} className={cn(text12, "flex cursor-default items-center gap-2")}>
                        <RadioGroupPrimitive.Item value={option.value} className={cn("relative size-[14px] shrink-0 rounded-full bg-(--os-well)", sunken, focusAround)}>
                          <RadioGroupPrimitive.Indicator data-slot="retro-os-account-form-check" className="absolute inset-1 rounded-full bg-(--os-check)" />
                        </RadioGroupPrimitive.Item>
                        {option.label}
                      </label>
                    ))}
                  </RadioGroupPrimitive.Root>
                </Row>
                <Row label="Home folder:" htmlFor={ids.home}>
                  <WellInput id={ids.home} readOnly tabIndex={-1} value={userName ? homeFolder(userName) : ""} className="text-(--os-text-2)" />
                </Row>
                <Row label="Member of:" htmlFor={ids.member}>
                  <WellInput id={ids.member} readOnly tabIndex={-1} value={["Users", department?.label].filter(Boolean).join(", ")} className="text-(--os-text-2)" />
                </Row>
              </TabsPrimitive.Content>

              <TabsPrimitive.Content forceMount value="security" data-slot="retro-os-account-form-page" className="col-start-1 row-start-1 flex flex-col gap-3 outline-none data-[state=inactive]:invisible">
                <div data-slot="retro-os-account-form-row" className="flex flex-col gap-2 border border-(--os-groove) px-3 pt-[14px] pb-3 shadow-[inset_1px_1px_0_var(--os-groove-shadow),1px_1px_0_var(--os-groove-shadow)]">
                  <p className={cn(text11, "text-(--os-text-2)")}>Password</p>
                  <OsCheckbox
                    id={ids.neverExpires}
                    name="passwordNeverExpires"
                    checked={values.passwordNeverExpires && !neverExpiresOff}
                    onCheckedChange={(passwordNeverExpires) => update({ passwordNeverExpires })}
                    disabled={neverExpiresOff}
                    label="Password never expires"
                    note={neverExpiresOff ? "Off while the user must change the password at next logon." : undefined}
                    noteId={ids.neverExpiresNote}
                  />
                </div>
                <Row label="Lock after:" labelId={ids.lockoutLabel}>
                  <OsSelect id={ids.lockout} name="lockout" value={values.lockout} onValueChange={(lockout) => update({ lockout })} options={lockoutOptions} listRef={setListRef} labelledBy={ids.lockoutLabel} />
                </Row>
              </TabsPrimitive.Content>
            </div>

            <div data-slot="retro-os-account-form-status" className="flex flex-col gap-1">
              <p
                id={ids.status}
                aria-live="polite"
                className={cn(text11, progress?.tone === "error" ? "text-(--os-danger)" : progress?.tone === "done" ? "text-(--os-success)" : "text-(--os-text-2)")}
              >
                {progress ? (
                  <>
                    {progress.label} <span ref={percentRef}>{percent}</span>%
                  </>
                ) : (
                  "Ready."
                )}
              </p>
              <div
                role="progressbar"
                aria-labelledby={ids.status}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={statusText}
                className={cn("h-4 bg-(--os-well) p-[3px]", sunken)}
              >
                {/* Figma's 20 segments: 19.9px wide, 2px apart; an SVG keeps their fractional edges (unclipped, so an edge on a
                    half pixel anti-aliases once, as in Figma) */}
                <svg aria-hidden viewBox="0 0 436 10" preserveAspectRatio="none" className="block h-2.5 w-full overflow-visible" fill="var(--os-accent)">
                  {Array.from({ length: lit }, (_, i) => (
                    <rect key={i} data-slot="retro-os-account-form-segment" x={i * 21.9} width={19.9} height={10} />
                  ))}
                  {/* the segments still to fill (the track's own colour in dark) */}
                  {Array.from({ length: 20 - lit }, (_, i) => (
                    <rect key={`empty-${lit + i}`} x={(lit + i) * 21.9} width={19.9} height={10} fill="var(--os-cell)" />
                  ))}
                </svg>
              </div>
            </div>
          </div>
        </TabsPrimitive.Root>

        <div className="flex flex-wrap justify-end gap-2 p-2.5">
          <OsButton key="ok" type="submit" isDefault flat data-slot="retro-os-account-form-footer-button" aria-disabled={busy || undefined} className="h-7 w-[84px] font-medium">
            OK
          </OsButton>
          <OsButton key="cancel" flat data-slot="retro-os-account-form-footer-button" aria-disabled={busy || undefined} onClick={() => !busy && cancel()} aria-keyshortcuts="Escape" className="h-7 w-[84px]">
            Cancel
          </OsButton>
          <OsButton
            key="apply"
            data-slot="retro-os-account-form-footer-button"
            disabled={!busy && !dirty}
            aria-disabled={busy || undefined}
            onClick={() => void send("apply")}
            className="h-7 w-[84px]"
          >
            Apply
          </OsButton>
        </div>
      </div>

      {done && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div
            role="alertdialog"
            aria-modal
            aria-labelledby={ids.box}
            aria-describedby={ids.boxText}
            data-slot="retro-os-account-form-box"
            className={cn("w-full max-w-[340px] bg-(--os-window) p-[3px] dark:shadow-[inset_-1px_-1px_0_var(--os-shade),inset_1px_1px_0_var(--os-highlight),6px_6px_0_var(--os-shadow)]", windowLight)}
          >
            <div className="flex h-[26px] items-center gap-2 bg-[linear-gradient(to_right,var(--os-title-from),var(--os-title-to))] px-2">
              <p id={ids.box} className="min-w-0 flex-1 truncate font-form-silkscreen text-[11px] leading-[15px] text-(--os-title-text)">
                {title}
              </p>
            </div>
            <div className={cn("flex items-start gap-3 bg-(--os-face) p-4", raisedDark)}>
              <CheckPicture />
              <div id={ids.boxText} className={cn(text12, "flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]")}>
                <p>The account {userName} was created.</p>
                <p className="text-(--os-text-2)">Home folder: {homeFolder(userName)}</p>
                {values.disabled && <p className="text-(--os-text-2)">It stays disabled until you turn it on.</p>}
                {values.mustChangePassword && <p className="text-(--os-text-2)">{userName} must change the password at next logon.</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-2.5">
              <OsButton key="box-ok" ref={boxOkRef} isDefault onClick={() => (onClose ? onClose() : startNew())} className="h-7 w-[84px] font-medium">
                OK
              </OsButton>
              <OsButton key="box-new" onClick={startNew} className="h-7 px-3">
                <span className="hug-w block">New user...</span>
              </OsButton>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}

export {
  RetroOsAccountForm,
  sampleRetroOsAccountDepartments,
  sampleRetroOsAccountLockout,
  sampleRetroOsAccountSteps,
  sampleRetroOsAccountTypes,
  sampleRetroOsAccountValues,
  type RetroOsAccountFormPlaceholders,
  type RetroOsAccountFormProps,
  type RetroOsAccountFormValues,
  type RetroOsAccountOption,
  type RetroOsAccountStep,
  type RetroOsAccountSubmitHelpers,
  type RetroOsAccountTab,
}
