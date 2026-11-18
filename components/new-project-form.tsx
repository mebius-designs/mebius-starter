"use client"

import { animate, createTimeline, stagger, svg } from "animejs"
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon, PlusIcon, XIcon } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive, Select as SelectPrimitive } from "radix-ui"
import * as React from "react"

import { useControllableState } from "@/hooks/use-controllable-state"
import { releaseStyles, shake, useCountUp, useFormEntrance, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-form-motion"
import { useFormSubmit } from "@/hooks/use-form-submit"
import { cn } from "@/lib/utils"

type NewProjectStep = "details" | "repository" | "environment" | "review"

/** One environment variable. */
type NewProjectEnvVar = { key: string; value: string }

type NewProjectFormValues = {
  /** The project name ("storefront-v2"). */
  name: string
  /** The path after `urlPrefix`. Follows the name until it is edited. */
  slug: string
  /** `value` of the selected team. */
  team: string
  /** `value` of the selected visibility option ("private"). */
  visibility: string
  /** `value` of the repository to import ("" until one is picked). */
  repository: string
  /** The production branch ("main"). */
  branch: string
  /** Where the app lives in the repository ("./"). */
  rootDirectory: string
  /** Environment variables; empty rows are left out. */
  env: NewProjectEnvVar[]
}

/** A team's plan. The plan card reads its meter from it; leave `limit` out for a plan without a project limit. */
type NewProjectPlan = { name: string; used: number; limit?: number }

type NewProjectTeam = { value: string; label: string; plan?: NewProjectPlan }

/** A visibility option or a repository: one radio row with a second line. */
type NewProjectOption = { value: string; label: string; description?: string }

type NewProjectFormProps = Omit<React.ComponentProps<"form">, "onSubmit" | "children"> & {
  /** The header title. */
  title?: string
  /** The fixed part of the project URL, in front of the editable path. */
  urlPrefix?: string
  teams?: NewProjectTeam[]
  visibilityOptions?: NewProjectOption[]
  repositories?: NewProjectOption[]
  /**
   * Starting values, also what Cancel and "Create another" go back to: the text fields empty (their placeholders show)
   * and no variables, on Figma's team and Private, by default (`sampleNewProjectValues` is the filled Figma sample).
   */
  defaultValues?: Partial<NewProjectFormValues>
  step?: NewProjectStep
  defaultStep?: NewProjectStep
  onStepChange?: (step: NewProjectStep) => void
  /** Called by "Create project" on the last step with every value; may return a promise. */
  onSubmit?: (values: NewProjectFormValues) => void | Promise<void>
  /** The footer's Cancel. Without it, Cancel resets the form. */
  onCancel?: () => void
  /** The header's close button and "Done" after creating. Without it, both reset the form. */
  onClose?: () => void
  /** "Upgrade for unlimited" in the plan card. */
  onUpgrade?: (team: NewProjectTeam) => void
}

const STEPS: { id: NewProjectStep; label: string; title: string }[] = [
  { id: "details", label: "Details", title: "Project details" },
  { id: "repository", label: "Repository", title: "Import repository" },
  { id: "environment", label: "Environment", title: "Environment variables" },
  { id: "review", label: "Review", title: "Review and create" },
]

const sampleNewProjectTeams: NewProjectTeam[] = [
  { value: "mebius-studio", label: "Mebius Studio", plan: { name: "Hobby plan", used: 2, limit: 3 } },
  { value: "rina-sato", label: "Rina Sato", plan: { name: "Hobby plan", used: 0, limit: 3 } },
  { value: "northwind-labs", label: "Northwind Labs", plan: { name: "Pro plan", used: 14 } },
]

const sampleNewProjectVisibility: NewProjectOption[] = [
  { value: "private", label: "Private", description: "Only your team can see it" },
  { value: "public", label: "Public", description: "Anyone with the link" },
]

const sampleNewProjectRepositories: NewProjectOption[] = [
  { value: "mebius-studio/storefront-v2", label: "storefront-v2", description: "mebius-studio · updated 2 hours ago" },
  { value: "mebius-studio/storefront", label: "storefront", description: "mebius-studio · updated 3 weeks ago" },
  { value: "mebius-studio/design-tokens", label: "design-tokens", description: "mebius-studio · updated 5 days ago" },
]

const sampleNewProjectValues: NewProjectFormValues = {
  name: "storefront-v2",
  slug: "storefront-v2",
  team: "mebius-studio",
  visibility: "private",
  repository: "",
  branch: "main",
  rootDirectory: "./",
  env: [
    { key: "NEXT_PUBLIC_SITE_URL", value: "https://storefront.dev" },
    { key: "API_TIMEOUT_MS", value: "8000" },
  ],
}

// What the form opens with: the name, URL, branch and root directory empty (their placeholders show), no variables,
// Figma's team and visibility.
const defaultNewProjectValues: NewProjectFormValues = { ...sampleNewProjectValues, name: "", slug: "", branch: "", rootDirectory: "", env: [] }

// The Figma frame's raw colours by role, light and dark ("Stage / 01 Split panes" light 2713:8474, dark 1891:79658) as
// light-dark(light, dark), so the form follows your app's dark class (it sets its own color-scheme from it). Override
// any of them on the form (style or a CSS rule on [data-slot="new-project-form"]) to re-skin it.
const palette = {
  "--np-surface": "light-dark(#ffffff, #0a0a0a)", // the modal
  "--np-sunken": "light-dark(#f5f5f5, #000000)", // fields and the steps pane
  "--np-raised": "light-dark(#f8f8f8, #111111)", // the selected option row
  "--np-selected": "light-dark(#ededed, #1c1c1c)", // the current step
  "--np-line": "light-dark(#e4e4e4, #2a2a2a)", // field borders, option dividers
  "--np-divider": "light-dark(#ededed, #1f1f1f)", // the modal border, section dividers, the plan card
  "--np-text": "light-dark(#1a1a1a, #ededed)",
  "--np-text-2": "light-dark(#5e5e5e, #a1a1a1)",
  "--np-text-3": "light-dark(#808080, #6b6b6b)",
  "--np-accent": "light-dark(#1c1c1c, #ededed)", // the primary button, a focused field, the meter's used segments
  "--np-on-accent": "light-dark(#ffffff, #000000)",
  // a radio: its inside, its ring, and the thick ring of the checked one
  "--np-radio": "light-dark(#ffffff, #000000)",
  "--np-radio-line": "light-dark(#d5d5d5, #2a2a2a)",
  "--np-radio-on": "light-dark(#1a1a1a, #ededed)",
  "--np-meter": "light-dark(#dfdfdf, #2a2a2a)", // the meter's empty segments
  "--np-ring": "light-dark(rgb(26 26 26 / 0.4), rgb(237 237 237 / 0.4))", // focus rings (Figma draws none): the text at 40%
  // Figma draws no error or warning: light is the forms theme's form-danger and form-warning
  "--np-danger": "light-dark(#dc2626, #ff6166)",
  "--np-success": "#3dd68c",
  "--np-warning": "light-dark(#a0660d, #f5b451)",
  // the modal's shadow, and the team menu's (not drawn in Figma)
  "--np-shadow": "light-dark(rgb(15 18 26 / 0.08), rgb(0 0 0 / 0.6))",
  "--np-menu-shadow": "light-dark(rgb(15 18 26 / 0.12), rgb(0 0 0 / 0.7))",
} as React.CSSProperties

// Figma's text styles: Geist with -1% tracking, Geist Mono without.
const text14 = "text-[14px] leading-5 tracking-[-0.01em]"
const text13 = "text-[13px] leading-[19px] tracking-[-0.01em]"
const text12 = "text-[12px] leading-[17px] tracking-[-0.01em]"
const mono12 = "font-form-geist-mono text-[12px] leading-[17px]"
const mono13 = "font-form-geist-mono text-[13px] leading-[19px]"
const mono14 = "font-form-geist-mono text-[14px] leading-5"
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-(--np-ring)"
const ICON_STROKE = 1.875 // Figma's 1.25px at 16px (1.09375px at 14px) in Lucide's 24-unit grid

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const SLUG_MAX = 48
const NAME_MAX = 64

type EnvRow = NewProjectEnvVar & { id: string }
type FormState = Omit<NewProjectFormValues, "env"> & { env: EnvRow[]; slugAuto: boolean }
type Errors = Record<string, string>

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
}

function toState(values: NewProjectFormValues): FormState {
  return {
    ...values,
    env: values.env.map((row, i) => ({ ...row, id: `env-${i}` })),
    slugAuto: values.slug === slugify(values.name),
  }
}

function toValues({ env, slugAuto: _slugAuto, ...state }: FormState): NewProjectFormValues {
  return {
    ...state,
    name: state.name.trim(),
    branch: state.branch.trim(),
    rootDirectory: state.rootDirectory.trim(),
    env: env.filter((row) => row.key.trim() || row.value.trim()).map((row) => ({ key: row.key.trim(), value: row.value })),
  }
}

const envError = (id: string, part: "key" | "value") => `env-${id}-${part}`

/** The errors of one step. Team limits count the projects created in this form too (`used`). */
function validateStep(step: NewProjectStep, state: FormState, team: NewProjectTeam | undefined, used: number): Errors {
  const errors: Errors = {}
  if (step === "details") {
    const name = state.name.trim()
    if (!name) errors.name = "Enter a project name."
    else if (name.length > NAME_MAX) errors.name = `Keep the name under ${NAME_MAX} characters.`
    if (!state.slug) errors.slug = "Enter a URL for the project."
    else if (state.slug.length > SLUG_MAX) errors.slug = `Keep the URL under ${SLUG_MAX} characters.`
    else if (!SLUG.test(state.slug)) errors.slug = "Use lowercase letters, numbers and single dashes."
    if (!team) errors.team = "Pick a team."
    else if (team.plan?.limit !== undefined && used >= team.plan.limit)
      errors.team = `${team.label} has used all ${team.plan.limit} projects on the ${team.plan.name}.`
    if (!state.visibility) errors.visibility = "Choose who can see the project."
  }
  if (step === "repository") {
    if (!state.repository) errors.repository = "Pick a repository to import."
    const branch = state.branch.trim()
    if (!branch) errors.branch = "Enter the branch to deploy."
    else if (/\s/.test(branch)) errors.branch = "Branch names can't contain spaces."
    if (!state.rootDirectory.trim().startsWith("./")) errors.rootDirectory = "Start the path with ./ (the repository root)."
  }
  if (step === "environment") {
    const seen = new Set<string>()
    for (const row of state.env) {
      const key = row.key.trim()
      if (!key && !row.value.trim()) continue
      if (!key) errors[envError(row.id, "key")] = "Add a key for this value."
      else if (!ENV_KEY.test(key)) errors[envError(row.id, "key")] = "Use letters, numbers and underscores."
      else if (seen.has(key)) errors[envError(row.id, "key")] = `${key} is already set.`
      else if (!row.value.trim()) errors[envError(row.id, "value")] = `Add a value for ${key}.`
      if (key) seen.add(key)
    }
  }
  return errors
}

/** A path or URL that may wrap after each "/" (edgeline.app/ | storefront-v2) before it breaks inside a word. */
function breakAfterSlashes(value: string) {
  return value.split("/").flatMap((part, i, parts) => (i < parts.length - 1 ? [part, "/", <wbr key={i} />] : [part]))
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T) {
  if (typeof ref === "function") ref(value)
  else if (ref) (ref as React.RefObject<T>).current = value
}

/** Figma's "Icon / folder" (Untitled UI), drawn on Lucide's 24-unit grid. */
function FolderIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M13 7 11.8845 4.76892C11.5634 4.1268 11.4029 3.80573 11.1634 3.57116C10.9516 3.36373 10.6963 3.20597 10.4161 3.10931C10.0992 3 9.74021 3 9.02229 3H5.2C4.0799 3 3.51984 3 3.09202 3.21799C2.71569 3.40973 2.40973 3.71569 2.21799 4.09202C2 4.51984 2 5.0799 2 6.2V7M2 7H17.2C18.8802 7 19.7202 7 20.362 7.32698C20.9265 7.6146 21.3854 8.07354 21.673 8.63803C22 9.27976 22 10.1198 22 11.8V16.2C22 17.8802 22 18.7202 21.673 19.362C21.3854 19.9265 20.9265 20.3854 20.362 20.673C19.7202 21 18.8802 21 17.2 21H6.8C5.11984 21 4.27976 21 3.63803 20.673C3.07354 20.3854 2.6146 19.9265 2.32698 19.362C2 18.7202 2 17.8802 2 16.2V7Z" />
    </svg>
  )
}

/** One field: the label row (with an optional note on the right), the control and its error. */
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
  const Label = htmlFor ? "label" : "p"
  return (
    <div data-slot="new-project-form-section" className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-h-[19px] items-center justify-between gap-3">
        <Label id={labelId} htmlFor={htmlFor} className={cn(text13, "text-(--np-text-2)")}>
          {label}
        </Label>
        {aside}
      </div>
      {children}
      {error && (
        <p id={errorId} data-slot="new-project-form-error" data-error={errorId} className={cn(text12, "text-(--np-danger)")}>
          {error}
        </p>
      )}
    </div>
  )
}

/** The bordered box every text field and the team select are drawn in (Figma: 40px, radius 8, a 1px line). */
function fieldBox(invalid: boolean, className?: string) {
  return cn(
    "flex h-10 w-full min-w-0 items-center gap-2 rounded-[8px] border bg-(--np-sunken) px-3 text-left transition-colors duration-150",
    invalid ? "border-(--np-danger)" : "border-(--np-line) hover:not-focus-within:border-(--np-text-3) focus-within:border-(--np-accent)",
    className,
  )
}

const inputClass = "h-full min-w-0 flex-1 bg-transparent text-(--np-text) outline-none placeholder:text-(--np-text-3) disabled:cursor-not-allowed"

/** Clicking the box around an input (the URL prefix, the padding) focuses the input. */
function focusInputInside(event: React.MouseEvent<HTMLElement>) {
  const target = event.target as HTMLElement
  if (target.closest("input, button")) return
  event.preventDefault()
  event.currentTarget.querySelector("input")?.focus()
}

/** A radio list drawn like Figma's Visibility group: rows in one bordered box, the checked row raised. */
function OptionList({
  value,
  onValueChange,
  options,
  labelId,
  invalid,
  errorId,
  slot,
}: {
  value: string
  onValueChange: (value: string) => void
  options: NewProjectOption[]
  labelId: string
  invalid: boolean
  errorId?: string
  slot: string
}) {
  return (
    <RadioGroupPrimitive.Root
      data-slot={slot}
      value={value}
      onValueChange={onValueChange}
      aria-labelledby={labelId}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? errorId : undefined}
      className={cn("flex flex-col overflow-hidden rounded-[8px] border", invalid ? "border-(--np-danger)" : "border-(--np-line)")}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none not-first:border-t not-first:border-(--np-line) hover:bg-(--np-raised)/60 focus-visible:shadow-[inset_0_0_0_1px_var(--np-text-3)] disabled:cursor-not-allowed data-[state=checked]:bg-(--np-raised)"
        >
          <span aria-hidden className="relative size-3.5 shrink-0 rounded-full bg-(--np-radio) shadow-[inset_0_0_0_1.5px_var(--np-radio-line)]">
            <RadioGroupPrimitive.Indicator data-slot="new-project-form-radio-dot" className="absolute inset-0 rounded-full shadow-[inset_0_0_0_4px_var(--np-radio-on)]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cn(text13, "truncate font-medium text-(--np-text)")}>{option.label}</span>
            {option.description && <span className={cn(text12, "truncate text-(--np-text-3)")}>{option.description}</span>}
          </span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

/** The submit button's spinner: a quarter arc on a faint ring, turned by anime.js while the project is created. */
function Spinner() {
  return (
    <svg data-slot="new-project-form-spinner" viewBox="0 0 16 16" fill="none" aria-hidden className="size-3.5">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/**
 * "New project" from the Keitoto library ("Stage / 01 Split panes"): a four-step project setup in a split modal.
 * The steps pane tracks where you are (the current step raised, finished steps checked, earlier steps clickable) and
 * shows the selected team's plan usage; the right pane holds the step: Details (name, a URL that follows the name
 * until you edit it, a team select, Private / Public), Repository (the repository to import, branch, root directory),
 * Environment (key / value rows you add and remove) and Review (everything, each row editable). Continue validates
 * the step and moves on; "Create project" sends every value to `onSubmit`. Animated with anime.js: the modal rises
 * in, the step highlight glides between steps, step content slides in while the pane eases to its new height, radio
 * dots pop, meters fill, an invalid step shakes and the success check draws itself.
 */
function NewProjectForm({
  title = "New project",
  urlPrefix = "edgeline.app/",
  teams = sampleNewProjectTeams,
  visibilityOptions = sampleNewProjectVisibility,
  repositories = sampleNewProjectRepositories,
  defaultValues,
  step: stepProp,
  defaultStep = "details",
  onStepChange,
  onSubmit,
  onCancel,
  onClose,
  onUpgrade,
  className,
  style,
  ref,
  ...props
}: NewProjectFormProps) {
  const id = React.useId()
  const ids = {
    steps: `${id}-steps`,
    name: `${id}-name`,
    slug: `${id}-slug`,
    prefix: `${id}-prefix`,
    team: `${id}-team`,
    visibility: `${id}-visibility`,
    repository: `${id}-repository`,
    branch: `${id}-branch`,
    rootDirectory: `${id}-root`,
    env: `${id}-env`,
    error: (key: string) => `${id}-${key}-error`,
  }

  const [state, setState] = React.useState(() => toState({ ...defaultNewProjectValues, ...defaultValues }))
  const [stepId, setStepId] = useControllableState({ value: stepProp, defaultValue: defaultStep, onChange: onStepChange })
  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.id === stepId))
  const step = STEPS[stepIndex]
  const last = STEPS.length - 1
  const [reached, setReached] = React.useState(stepIndex)
  const furthest = Math.max(reached, stepIndex)
  const [errors, setErrors] = React.useState<Errors>({})
  const [created, setCreated] = React.useState<Record<string, number>>({})
  const [copied, setCopied] = React.useState(false)
  const { status, submit, reset: resetStatus } = useFormSubmit(onSubmit)
  const done = status === "success"
  const submitting = status === "submitting"

  const team = teams.find((t) => t.value === state.team)
  const plan = team?.plan
  const used = (plan?.used ?? 0) + (created[state.team] ?? 0)
  const limit = plan?.limit
  const full = limit !== undefined && used >= limit
  const visibility = visibilityOptions.find((o) => o.value === state.visibility)
  const repository = repositories.find((r) => r.value === state.repository)
  const envCount = state.env.filter((row) => row.key.trim()).length

  const root = React.useRef<HTMLFormElement>(null)
  const pane = React.useRef<HTMLDivElement>(null)
  const usedRef = React.useRef<HTMLSpanElement>(null)
  const defaults = React.useRef(defaultValues)
  const nextRowId = React.useRef(0)
  const direction = React.useRef(1)
  const paneHeight = React.useRef<number | null>(null)
  const focusInvalid = React.useRef(false)
  const focusRow = React.useRef<string | null>(null)
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reduced = useReducedMotion()

  const latest = React.useRef({ state, errors })
  useIsomorphicLayoutEffect(() => {
    defaults.current = defaultValues
    latest.current = { state, errors }
  })
  React.useEffect(() => () => clearTimeout(copyTimer.current), [])

  const setRoot = React.useCallback(
    (node: HTMLFormElement | null) => {
      root.current = node
      setRef(ref, node)
    },
    [ref],
  )

  const all = (selector: string, scope?: Element | null) => Array.from((scope ?? root.current)?.querySelectorAll<HTMLElement>(selector) ?? [])

  /**
   * Updates fields from the latest state (also when called after a tween); an error that the change fixes goes away,
   * new errors wait for Continue.
   */
  const update = (patch: Partial<FormState> | ((current: FormState) => Partial<FormState>)) => {
    const current = latest.current.state
    const changes = typeof patch === "function" ? patch(current) : patch
    const next = { ...current, ...changes }
    if (changes.name !== undefined && next.slugAuto) next.slug = slugify(changes.name)
    latest.current = { ...latest.current, state: next }
    setState(next)
    if (!Object.keys(latest.current.errors).length) return
    const nextTeam = teams.find((t) => t.value === next.team)
    const fresh = validateStep(step.id, next, nextTeam, (nextTeam?.plan?.used ?? 0) + (created[next.team] ?? 0))
    setErrors((errorsNow) => {
      const kept: Errors = {}
      for (const key of Object.keys(errorsNow)) if (fresh[key]) kept[key] = fresh[key]
      return kept
    })
  }

  const updateRow = (rowId: string, patch: Partial<NewProjectEnvVar>) =>
    update((current) => ({ env: current.env.map((row) => (row.id === rowId ? { ...row, ...patch } : row)) }))

  const go = (index: number) => {
    if (index === stepIndex) return
    direction.current = index > stepIndex ? 1 : -1
    setErrors({})
    setReached((r) => Math.max(r, index))
    setStepId(STEPS[index].id)
  }

  const fail = (found: Errors, index: number) => {
    if (index !== stepIndex) go(index)
    setErrors(found)
    focusInvalid.current = true
    shake(root.current)
  }

  const resetForm = () => {
    direction.current = -1
    setState(toState({ ...defaultNewProjectValues, ...defaults.current }))
    setErrors({})
    setReached(0)
    setCopied(false)
    resetStatus()
    setStepId(defaultStep)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status !== "idle") return
    if (stepIndex < last) {
      const found = validateStep(step.id, state, team, used)
      if (Object.keys(found).length) return fail(found, stepIndex)
      go(stepIndex + 1)
      return
    }
    for (let i = 0; i < last; i++) {
      const found = validateStep(STEPS[i].id, state, team, used)
      if (Object.keys(found).length) return fail(found, i)
    }
    setErrors({})
    direction.current = 1
    try {
      await submit(toValues(state))
      setCreated((c) => ({ ...c, [state.team]: (c[state.team] ?? 0) + 1 }))
    } catch {
      setErrors({ form: "Couldn't create the project. Try again." })
    }
  }

  const goToStep = (index: number) => {
    if (done || submitting || index === stepIndex || index > furthest) return
    if (index < stepIndex) return go(index)
    // forward to a step reached before: every step on the way must still be valid
    for (let i = stepIndex; i < index; i++) {
      const found = validateStep(STEPS[i].id, state, team, used)
      if (Object.keys(found).length) return fail(found, i)
    }
    go(index)
  }

  const addRow = () => {
    const rowId = `env-new-${nextRowId.current++}`
    focusRow.current = rowId
    update((current) => ({ env: [...current.env, { id: rowId, key: "", value: "" }] }))
  }

  const removeRow = (rowId: string, element: HTMLElement | null) => {
    const index = state.env.findIndex((row) => row.id === rowId)
    const nextRow = state.env[index + 1] ?? state.env[index - 1]
    const commit = () => {
      focusRow.current = nextRow?.id ?? "add"
      update((current) => ({ env: current.env.filter((row) => row.id !== rowId) }))
    }
    if (!element || reduced) return commit()
    animate(element, { opacity: [1, 0], x: [0, 12], duration: 180, ease: "inQuad", onComplete: commit })
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(`https://${urlPrefix}${state.slug}`)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard blocked (an iframe without permission): the URL stays selectable
    }
  }

  // ── motion ──────────────────────────────────────────────────────────────────────────────────────────────────────

  // Entrance, once the form is in view: the modal rises, the steps slide in, the fields and footer follow, and the
  // plan meter fills.
  useFormEntrance(root, (timeline) => {
    const form = root.current
    if (!form) return
    timeline
      .add(form, { opacity: { from: 0 }, y: { from: 18 }, scale: { from: 0.985 }, duration: 700, ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
      .add(all('[data-slot="new-project-form-step"]'), { opacity: { from: 0 }, x: { from: -10 }, duration: 500, ease: "outQuad", delay: stagger(60), onComplete: releaseStyles("opacity", "transform") }, 150)
      .add(all('[data-slot="new-project-form-section"]'), { opacity: { from: 0 }, y: { from: 10 }, duration: 550, ease: "outQuad", delay: stagger(55), onComplete: releaseStyles("opacity", "transform") }, 200)
      .add(all('[data-slot="new-project-form-meter-fill"]'), { scaleX: { from: 0 }, duration: 800, ease: "outExpo", delay: stagger(110), onComplete: releaseStyles("transform") }, 450)
      .add(all('[data-slot="new-project-form-footer"] > *'), { opacity: { from: 0 }, duration: 500, ease: "outQuad", delay: stagger(80), onComplete: releaseStyles("opacity") }, 350)
  })

  // The pane's last laid-out height (also mid-tween), the starting point when a step changes its height.
  React.useEffect(() => {
    const element = pane.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => (paneHeight.current = element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // A new step (or the success panel): the pane eases from its old height to the new one and the content slides in
  // from the side you are heading to; a finished step's check pops in.
  const view = done ? "success" : step.id
  const lastView = React.useRef({ view, index: stepIndex })
  const heightTween = React.useRef<ReturnType<typeof animate> | null>(null)
  useIsomorphicLayoutEffect(() => {
    const previous = lastView.current
    lastView.current = { view, index: stepIndex }
    const element = pane.current
    if (!element || previous.view === view || reduced) return
    heightTween.current?.cancel()
    element.style.removeProperty("height")
    const to = element.offsetHeight
    const from = paneHeight.current
    if (from !== null && Math.abs(from - to) > 1)
      heightTween.current = animate(element, { height: [from, to], duration: 520, ease: "outExpo", onComplete: releaseStyles("height") })
    animate(all('[data-slot="new-project-form-section"]', element), {
      opacity: [0, 1],
      x: [direction.current * 18, 0],
      duration: 480,
      ease: "outQuart",
      delay: stagger(45),
      onComplete: releaseStyles("opacity", "transform"),
    })
    const popped = view === "success" ? last : previous.index < stepIndex ? previous.index : -1
    const check = all('[data-slot="new-project-form-step"]')[popped]?.querySelector('[data-slot="new-project-form-step-check"]')
    if (check) animate(check, { scale: [0.3, 1], opacity: [0, 1], duration: 450, ease: "outBack(2.2)", onComplete: releaseStyles("transform", "opacity") })
  }, [view, stepIndex, reduced])

  // The current-step highlight glides from the step you left (FLIP: React already moved it).
  const lastIndex = React.useRef(stepIndex)
  useIsomorphicLayoutEffect(() => {
    const previous = lastIndex.current
    lastIndex.current = stepIndex
    if (previous === stepIndex || reduced) return
    const buttons = all('[data-slot="new-project-form-step"]')
    const from = buttons[previous]
    const to = buttons[stepIndex]
    const highlight = to?.querySelector('[data-slot="new-project-form-step-highlight"]')
    if (!from || !to || !highlight) return
    animate(highlight, {
      x: [from.offsetLeft - to.offsetLeft, 0],
      y: [from.offsetTop - to.offsetTop, 0],
      duration: 480,
      ease: "outExpo",
      onComplete: releaseStyles("transform"),
    })
  }, [stepIndex, reduced])

  // A newly checked radio's dot pops.
  const lastChoice = React.useRef({ visibility: state.visibility, repository: state.repository })
  useIsomorphicLayoutEffect(() => {
    const previous = lastChoice.current
    lastChoice.current = { visibility: state.visibility, repository: state.repository }
    if (reduced) return
    const changed = [previous.visibility !== state.visibility && "visibility", previous.repository !== state.repository && "repository"].filter(Boolean)
    for (const group of changed) {
      const dot = root.current?.querySelector(`[data-slot="new-project-form-${group}"] [data-slot="new-project-form-radio-dot"]`)
      if (dot) animate(dot, { scale: [0.45, 1], opacity: [0.3, 1], duration: 380, ease: "outBack(2.4)", onComplete: releaseStyles("transform", "opacity") })
    }
  }, [state.visibility, state.repository, reduced])

  // The plan meter: a new team's used segments fill one after another, a project created fills the next one.
  const lastMeter = React.useRef({ team: state.team, used })
  useIsomorphicLayoutEffect(() => {
    const previous = lastMeter.current
    lastMeter.current = { team: state.team, used }
    if (reduced || (previous.team === state.team && previous.used === used)) return
    const fills = all('[data-slot="new-project-form-meter-fill"]')
    const fresh = previous.team === state.team ? fills.slice(previous.used) : fills
    if (fresh.length) animate(fresh, { scaleX: [0, 1], duration: 700, ease: "outExpo", delay: stagger(90), onComplete: releaseStyles("transform") })
    animate(all('[data-slot="new-project-form-plan"] > *'), { opacity: [0.35, 1], duration: 400, ease: "outQuad", onComplete: releaseStyles("opacity") })
  }, [state.team, used, reduced])
  useCountUp(usedRef, used, (n) => String(Math.round(n)), { duration: 500 })

  // New error messages drop in; the first invalid field takes focus after a failed Continue.
  const errorKeys = Object.keys(errors)
  const lastErrors = React.useRef<string[]>([])
  useIsomorphicLayoutEffect(() => {
    const previous = lastErrors.current
    lastErrors.current = errorKeys
    if (focusInvalid.current) {
      focusInvalid.current = false
      const target = root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      const focusable = target?.getAttribute("role") === "radiogroup" ? target.querySelector<HTMLElement>('[role="radio"][data-state="checked"], [role="radio"]') : target
      focusable?.focus({ preventScroll: false })
    }
    if (reduced) return
    const fresh = errorKeys.filter((key) => !previous.includes(key)).map((key) => ids.error(key))
    const messages = all('[data-slot="new-project-form-error"]').filter((el) => fresh.includes(el.dataset.error ?? ""))
    if (messages.length) animate(messages, { opacity: [0, 1], y: [-4, 0], duration: 320, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [errorKeys.join("|"), reduced])

  // A row just added (or the row after a removed one) takes focus; an added row slides in.
  const rowIds = state.env.map((row) => row.id).join("|")
  useIsomorphicLayoutEffect(() => {
    const target = focusRow.current
    if (!target) return
    focusRow.current = null
    if (target === "add") return root.current?.querySelector<HTMLElement>('[data-slot="new-project-form-add-row"]')?.focus()
    const row = root.current?.querySelector<HTMLElement>(`[data-row="${target}"]`)
    row?.querySelector("input")?.focus()
    if (row && !reduced && target.startsWith("env-new-")) animate(row, { opacity: [0, 1], y: [-6, 0], duration: 320, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
  }, [rowIds, reduced])

  // While submitting, the spinner turns.
  useIsomorphicLayoutEffect(() => {
    if (!submitting || reduced) return
    const spinner = root.current?.querySelector('[data-slot="new-project-form-spinner"]')
    if (!spinner) return
    const spin = animate(spinner, { rotate: 360, duration: 750, ease: "linear", loop: true })
    return () => {
      spin.revert()
    }
  }, [submitting, reduced])

  // Success: the badge pops and its check draws itself.
  useIsomorphicLayoutEffect(() => {
    if (!done || reduced) return
    const badge = root.current?.querySelector('[data-slot="new-project-form-success-badge"]')
    const check = badge?.querySelector("path")
    if (!badge || !check) return
    const timeline = createTimeline()
      .add(badge, { scale: [0.6, 1], opacity: [0, 1], duration: 500, ease: "outBack(1.8)", onComplete: releaseStyles("transform", "opacity") })
      .add(svg.createDrawable(check), { draw: ["0 0", "0 1"], duration: 420, ease: "outQuad" }, 180)
    return () => {
      timeline.revert()
    }
  }, [done, reduced])

  // The copy button's icon swaps with a small pop.
  const copyIcon = React.useRef<HTMLSpanElement>(null)
  const lastCopied = React.useRef(copied)
  useIsomorphicLayoutEffect(() => {
    if (lastCopied.current === copied) return
    lastCopied.current = copied
    if (reduced || !copyIcon.current) return
    animate(copyIcon.current, { scale: [0.5, 1], rotate: [copied ? -20 : 20, 0], duration: 360, ease: "outBack(2)", onComplete: releaseStyles("transform") })
  }, [copied, reduced])

  // The team list portals to <body>: it gets the form's palette (as overridden on the form) and fades in.
  const setListRef = React.useCallback(
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

  const error = (key: string) => errors[key]
  const described = (key: string, ...others: (string | false | undefined)[]) =>
    [errors[key] && ids.error(key), ...others].filter(Boolean).join(" ") || undefined

  const details = (
    <>
      <Field label="Name" htmlFor={ids.name} error={error("name")} errorId={ids.error("name")}>
        <div className={fieldBox(!!errors.name)} onMouseDown={focusInputInside}>
          <input
            id={ids.name}
            name="name"
            value={state.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder="my-project"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!errors.name || undefined}
            aria-describedby={described("name")}
            className={cn(inputClass, text14)}
          />
        </div>
      </Field>
      <Field
        label="URL"
        htmlFor={ids.slug}
        error={error("slug")}
        errorId={ids.error("slug")}
        aside={
          state.slugAuto ? (
            <span className={cn(mono12, "text-(--np-text-3)")}>auto</span>
          ) : (
            <button
              type="button"
              onClick={() => update({ slugAuto: true, slug: slugify(state.name) })}
              className={cn(mono12, focusRing, "rounded-[4px] text-(--np-text-3) transition-colors hover:text-(--np-text)")}
            >
              reset to auto
            </button>
          )
        }
      >
        <div className={fieldBox(!!errors.slug, "cursor-text")} onMouseDown={focusInputInside}>
          <span id={ids.prefix} className={cn(mono13, "shrink-0 text-(--np-text-3)")}>
            {urlPrefix}
          </span>
          <input
            id={ids.slug}
            name="slug"
            value={state.slug}
            onChange={(event) => update({ slug: event.target.value.toLowerCase().replace(/\s+/g, "-"), slugAuto: false })}
            placeholder="my-project"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!errors.slug || undefined}
            aria-describedby={described("slug", ids.prefix)}
            className={cn(inputClass, mono14)}
          />
        </div>
      </Field>
      <Field label="Team" htmlFor={ids.team} error={error("team")} errorId={ids.error("team")}>
        <SelectPrimitive.Root name="team" value={state.team} onValueChange={(value) => update({ team: value })}>
          <SelectPrimitive.Trigger
            id={ids.team}
            aria-invalid={!!errors.team || undefined}
            aria-describedby={described("team")}
            className={fieldBox(
              !!errors.team,
              "cursor-pointer outline-none focus-visible:border-(--np-accent) disabled:cursor-not-allowed data-[state=open]:border-(--np-accent)",
            )}
          >
            {/* Radix drops a className on Value, so the text style sits on a wrapper */}
            <span className={cn(text14, "min-w-0 flex-1 truncate text-(--np-text)")}>
              <SelectPrimitive.Value />
            </span>
            <SelectPrimitive.Icon className="shrink-0 text-(--np-text-3)">
              <ChevronDownIcon className="size-4" strokeWidth={ICON_STROKE} />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              position="popper"
              sideOffset={6}
              ref={setListRef}
              className="z-50 max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) overflow-hidden rounded-[8px] border border-(--np-line) bg-(--np-surface) font-form-geist text-(--np-text) antialiased shadow-[0_16px_32px_-12px_var(--np-menu-shadow)]"
            >
              <SelectPrimitive.Viewport className="p-1">
                {teams.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    className={cn(text14, "flex h-9 cursor-pointer items-center gap-2 rounded-[6px] px-2.5 outline-none select-none data-highlighted:bg-(--np-selected)")}
                  >
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                    {option.plan && <span className={cn(text12, "ml-auto text-(--np-text-3)")}>{option.plan.name}</span>}
                    <span className={cn("flex size-3.5 shrink-0 items-center justify-center", !option.plan && "ml-auto")}>
                      <SelectPrimitive.ItemIndicator>
                        <CheckIcon className="size-3.5 text-(--np-text)" strokeWidth={ICON_STROKE} />
                      </SelectPrimitive.ItemIndicator>
                    </span>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
      </Field>
      <Field label="Visibility" labelId={ids.visibility} error={error("visibility")} errorId={ids.error("visibility")}>
        <OptionList
          slot="new-project-form-visibility"
          value={state.visibility}
          onValueChange={(value) => update({ visibility: value })}
          options={visibilityOptions}
          labelId={ids.visibility}
          invalid={!!errors.visibility}
          errorId={ids.error("visibility")}
        />
      </Field>
    </>
  )

  const repositoryStep = (
    <>
      <Field
        label="Git repository"
        labelId={ids.repository}
        error={error("repository")}
        errorId={ids.error("repository")}
        aside={<span className={cn(mono12, "text-(--np-text-3)")}>{repositories.length} found</span>}
      >
        <OptionList
          slot="new-project-form-repository"
          value={state.repository}
          onValueChange={(value) => update({ repository: value })}
          options={repositories}
          labelId={ids.repository}
          invalid={!!errors.repository}
          errorId={ids.error("repository")}
        />
      </Field>
      <Field label="Production branch" htmlFor={ids.branch} error={error("branch")} errorId={ids.error("branch")}>
        <div className={fieldBox(!!errors.branch, "cursor-text")} onMouseDown={focusInputInside}>
          <input
            id={ids.branch}
            name="branch"
            value={state.branch}
            onChange={(event) => update({ branch: event.target.value })}
            placeholder="main"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!errors.branch || undefined}
            aria-describedby={described("branch")}
            className={cn(inputClass, mono14)}
          />
        </div>
      </Field>
      <Field label="Root directory" htmlFor={ids.rootDirectory} error={error("rootDirectory")} errorId={ids.error("rootDirectory")}>
        <div className={fieldBox(!!errors.rootDirectory, "cursor-text")} onMouseDown={focusInputInside}>
          <input
            id={ids.rootDirectory}
            name="rootDirectory"
            value={state.rootDirectory}
            onChange={(event) => update({ rootDirectory: event.target.value })}
            placeholder="./"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!errors.rootDirectory || undefined}
            aria-describedby={described("rootDirectory")}
            className={cn(inputClass, mono14)}
          />
        </div>
      </Field>
    </>
  )

  const environmentStep = (
    <>
      <div data-slot="new-project-form-section" className="flex flex-col gap-2">
        <div className="flex min-h-[19px] items-center justify-between gap-3">
          <p id={ids.env} className={cn(text13, "text-(--np-text-2)")}>
            Variables
          </p>
          <span data-slot="new-project-form-env-count" className={cn(mono12, "text-(--np-text-3)")}>
            {envCount === 1 ? "1 variable" : `${envCount} variables`}
          </span>
        </div>
        <div role="group" aria-labelledby={ids.env} className="flex flex-col gap-2">
          {state.env.map((row, i) => {
            const keyError = errors[envError(row.id, "key")]
            const valueError = errors[envError(row.id, "value")]
            const message = keyError ?? valueError
            const messageId = ids.error(envError(row.id, keyError ? "key" : "value"))
            return (
              <div key={row.id} data-row={row.id} className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <div className={fieldBox(!!keyError, "flex-1 cursor-text")} onMouseDown={focusInputInside}>
                    <input
                      name={`env.${i}.key`}
                      aria-label={`Variable ${i + 1} key`}
                      value={row.key}
                      onChange={(event) => updateRow(row.id, { key: event.target.value.toUpperCase().replace(/[\s-]+/g, "_") })}
                      placeholder="KEY"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={!!keyError || undefined}
                      aria-describedby={keyError ? messageId : undefined}
                      className={cn(inputClass, mono13)}
                    />
                  </div>
                  <div className={fieldBox(!!valueError, "flex-[1.35] cursor-text")} onMouseDown={focusInputInside}>
                    <input
                      name={`env.${i}.value`}
                      aria-label={`Variable ${i + 1} value`}
                      value={row.value}
                      onChange={(event) => updateRow(row.id, { value: event.target.value })}
                      placeholder="value"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={!!valueError || undefined}
                      aria-describedby={valueError ? messageId : undefined}
                      className={cn(inputClass, mono13)}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${row.key.trim() || `variable ${i + 1}`}`}
                    onClick={(event) => removeRow(row.id, event.currentTarget.closest<HTMLElement>("[data-row]"))}
                    className={cn(
                      focusRing,
                      "flex size-10 shrink-0 items-center justify-center rounded-[8px] border border-(--np-line) text-(--np-text-3) transition-colors hover:border-(--np-text-3) hover:text-(--np-text)",
                    )}
                  >
                    <XIcon className="size-3.5" strokeWidth={ICON_STROKE} />
                  </button>
                </div>
                {message && (
                  <p id={messageId} data-slot="new-project-form-error" data-error={messageId} className={cn(text12, "text-(--np-danger)")}>
                    {message}
                  </p>
                )}
              </div>
            )
          })}
          <button
            type="button"
            data-slot="new-project-form-add-row"
            onClick={addRow}
            className={cn(
              focusRing,
              text13,
              "flex h-10 items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-(--np-line) text-(--np-text-2) transition-colors hover:border-(--np-text-3) hover:text-(--np-text)",
            )}
          >
            <PlusIcon className="size-3.5" strokeWidth={ICON_STROKE} />
            Add variable
          </button>
        </div>
      </div>
      <p data-slot="new-project-form-section" className={cn(text12, "text-(--np-text-3)")}>
        Values are encrypted and available to every deployment of {state.slug || "this project"}.
      </p>
    </>
  )

  const reviewRows: { label: string; value: string; step: number; mono?: boolean }[] = [
    { label: "Name", value: state.name.trim(), step: 0 },
    { label: "URL", value: `${urlPrefix}${state.slug}`, step: 0, mono: true },
    { label: "Team", value: team?.label ?? "", step: 0 },
    { label: "Visibility", value: visibility?.label ?? "", step: 0 },
    { label: "Repository", value: state.repository, step: 1, mono: true },
    { label: "Branch", value: state.branch.trim(), step: 1, mono: true },
    { label: "Root directory", value: state.rootDirectory.trim(), step: 1, mono: true },
    { label: "Variables", value: envCount === 1 ? "1 variable" : `${envCount} variables`, step: 2 },
  ]
  const left = limit === undefined ? undefined : limit - used
  const reviewNote = !team
    ? ""
    : left === undefined
      ? `${team.label} is on the ${plan?.name ?? "current plan"}, without a project limit.`
      : left === 1
        ? `This is the last project ${team.label} can create on the ${plan?.name}.`
        : `${team.label} will have ${Math.max(0, left - 1)} of ${limit} projects left on the ${plan?.name}.`

  const reviewStep = (
    <>
      <dl data-slot="new-project-form-section" className="flex flex-col overflow-hidden rounded-[8px] border border-(--np-line)">
        {reviewRows.map((row) => (
          <div key={row.label} className="flex items-start gap-2.5 px-3 py-2.5 not-first:border-t not-first:border-(--np-line)">
            <dt className={cn(text13, "w-[92px] shrink-0 text-(--np-text-3)")}>{row.label}</dt>
            <dd className="flex min-w-0 flex-1 items-start gap-2.5">
              {/* a review shows whole values: long ones wrap instead of truncating */}
              <span className={cn(row.mono ? mono13 : text13, "min-w-0 flex-1 text-(--np-text) [overflow-wrap:anywhere]")}>{breakAfterSlashes(row.value) || "—"}</span>
              <button
                type="button"
                onClick={() => goToStep(row.step)}
                aria-label={`Edit ${row.label.toLowerCase()}`}
                className={cn(mono12, focusRing, "mt-px shrink-0 rounded-[4px] text-(--np-text-3) transition-colors hover:text-(--np-text)")}
              >
                Edit
              </button>
            </dd>
          </div>
        ))}
      </dl>
      {reviewNote && (
        <p data-slot="new-project-form-section" className={cn(text12, left === 1 ? "text-(--np-warning)" : "text-(--np-text-3)")}>
          {reviewNote}
        </p>
      )}
    </>
  )

  const projectUrl = `${urlPrefix}${state.slug}`
  const successPanel = (
    <>
      <div data-slot="new-project-form-section" className="flex flex-col items-start gap-4">
        <span
          data-slot="new-project-form-success-badge"
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full border border-(--np-line) bg-(--np-raised) text-(--np-success)"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-5">
            <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[18px] leading-6 font-semibold tracking-[-0.01em] text-(--np-text)">Project created</h3>
          <p className={cn(text13, "text-(--np-text-2)")}>
            {state.name.trim()} is ready in {team?.label}. The first deployment builds {repository?.label ?? state.repository} from {state.branch.trim()}.
          </p>
        </div>
      </div>
      <div data-slot="new-project-form-section" className="flex flex-col gap-2">
        <p className={cn(text13, "text-(--np-text-2)")}>Project URL</p>
        <div className={fieldBox(false, "pr-1.5")}>
          <span className={cn(mono14, "min-w-0 flex-1 truncate text-(--np-text) select-all")}>{projectUrl}</span>
          <button
            type="button"
            onClick={copyUrl}
            aria-label={copied ? "Copied" : "Copy URL"}
            className={cn(
              focusRing,
              "flex size-7 shrink-0 items-center justify-center rounded-[6px] text-(--np-text-3) transition-colors hover:bg-(--np-selected) hover:text-(--np-text)",
            )}
          >
            <span ref={copyIcon} className="flex">
              {copied ? <CheckIcon className="size-3.5 text-(--np-success)" strokeWidth={ICON_STROKE} /> : <CopyIcon className="size-3.5" strokeWidth={ICON_STROKE} />}
            </span>
          </button>
        </div>
      </div>
    </>
  )

  const content = done ? successPanel : { details, repository: repositoryStep, environment: environmentStep, review: reviewStep }[step.id]
  const secondary = done
    ? { label: "Create another", onClick: resetForm }
    : stepIndex === 0
      ? { label: "Cancel", onClick: onCancel ?? resetForm }
      : { label: "Back", onClick: () => go(stepIndex - 1) }
  const primaryLabel = done ? "Done" : submitting ? "Creating…" : stepIndex === last ? "Create project" : "Continue"
  const statusText = errors.form ?? (done ? "All steps done" : `Step ${stepIndex + 1} of ${STEPS.length}`)
  const segments = limit !== undefined && limit <= 12 ? limit : 0

  return (
    <form
      ref={setRoot}
      noValidate
      data-slot="new-project-form"
      aria-labelledby={`${id}-title`}
      onSubmit={handleSubmit}
      className={cn(
        "@container relative flex w-full max-w-[600px] flex-col rounded-[12px] border border-(--np-divider) bg-(--np-surface) font-form-geist text-(--np-text) antialiased",
        // Figma: 0 30 60 -20 black at 60% (a Figma blur of 60 is a CSS blur of about 54)
        "shadow-[0_30px_54px_-20px_var(--np-shadow)] scheme-light dark:scheme-dark",
        className,
      )}
      style={{ ...palette, ...style }}
      {...props}
    >
      <header data-slot="new-project-form-header" className="flex items-center justify-between border-b border-(--np-divider) py-[14px] pr-4 pl-5">
        <div className="flex min-w-0 items-center gap-2">
          <FolderIcon className="size-4 shrink-0 text-(--np-text-2)" />
          <h2 id={`${id}-title`} className={cn(text14, "truncate font-medium text-(--np-text)")}>
            {title}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose ?? resetForm}
          className={cn(
            focusRing,
            "relative size-4 shrink-0 rounded-[4px] text-(--np-text-3) transition-colors before:absolute before:-inset-2 hover:text-(--np-text)",
          )}
        >
          <XIcon className="size-4" strokeWidth={ICON_STROKE} />
        </button>
      </header>

      <fieldset disabled={submitting} className="m-0 flex min-w-0 flex-col border-0 p-0 @min-[520px]:flex-row">
        <nav
          aria-labelledby={ids.steps}
          className="flex flex-col gap-1 border-b border-(--np-divider) bg-(--np-sunken) p-3 @min-[520px]:w-[196px] @min-[520px]:shrink-0 @min-[520px]:rounded-bl-[11px] @min-[520px]:border-r @min-[520px]:border-b-0 @min-[520px]:py-5"
        >
          <p id={ids.steps} className={cn(mono12, "sr-only text-(--np-text-3) @min-[520px]:not-sr-only")}>
            Steps
          </p>
          <ol className="relative isolate grid grid-cols-4 gap-1 @min-[520px]:flex @min-[520px]:flex-col">
            {STEPS.map((item, i) => {
              const current = i === stepIndex
              const finished = done || (i < furthest && !current)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    data-slot="new-project-form-step"
                    aria-current={current ? "step" : undefined}
                    disabled={i > furthest || done}
                    onClick={() => goToStep(i)}
                    className={cn(
                      focusRing,
                      "relative flex w-full items-center justify-center gap-2.5 rounded-[8px] px-2.5 py-[9px] text-left transition-colors @min-[520px]:justify-start",
                      !current && "enabled:hover:bg-(--np-raised)",
                      "disabled:cursor-default",
                    )}
                  >
                    {current && <span aria-hidden data-slot="new-project-form-step-highlight" className="absolute inset-0 -z-10 rounded-[8px] bg-(--np-selected)" />}
                    <span className={cn(mono12, "flex w-[15px] shrink-0 justify-center", current ? "text-(--np-text)" : "text-(--np-text-3)")}>
                      {finished ? (
                        <span data-slot="new-project-form-step-check" className="flex h-[17px] items-center">
                          <CheckIcon className="size-3 text-(--np-success)" strokeWidth={2.5} />
                        </span>
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <span
                      className={cn(
                        text14,
                        "sr-only @min-[520px]:not-sr-only @min-[520px]:min-w-0 @min-[520px]:flex-1",
                        current ? "font-medium text-(--np-text)" : "text-(--np-text-2)",
                      )}
                    >
                      {item.label}
                      {finished && <span className="sr-only"> (done)</span>}
                    </span>
                    {current && (
                      <ChevronRightIcon aria-hidden className="hidden size-3.5 shrink-0 text-(--np-text-3) @min-[520px]:block" strokeWidth={ICON_STROKE} />
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
          {plan && (
            <div className="hidden pt-4 @min-[520px]:block">
              <div data-slot="new-project-form-plan" className="flex flex-col gap-1.5 rounded-[10px] border border-(--np-divider) p-3">
                <p className={cn(text13, "font-medium text-(--np-text)")}>{plan.name}</p>
                <p className={cn(text12, full ? "text-(--np-warning)" : "text-(--np-text-3)")}>
                  {limit === undefined ? (
                    <>
                      <span ref={usedRef}>{used}</span> projects, no limit
                    </>
                  ) : (
                    <>
                      <span ref={usedRef}>{used}</span> of {limit} projects used
                    </>
                  )}
                </p>
                {limit !== undefined && (
                  <div
                    role="meter"
                    aria-label={`Projects used on the ${plan.name}`}
                    aria-valuemin={0}
                    aria-valuemax={limit}
                    aria-valuenow={Math.min(used, limit)}
                    className="flex gap-[3px]"
                  >
                    {segments ? (
                      Array.from({ length: segments }, (_, i) => (
                        <span key={`${state.team}-${i}`} data-slot="new-project-form-meter-segment" className="relative h-[3px] min-w-0 flex-1 bg-(--np-meter)">
                          {i < used && (
                            <span
                              data-slot="new-project-form-meter-fill"
                              className={cn("absolute inset-0 origin-left", full ? "bg-(--np-warning)" : "bg-(--np-accent)")}
                            />
                          )}
                        </span>
                      ))
                    ) : (
                      <span data-slot="new-project-form-meter-segment" className="relative h-[3px] min-w-0 flex-1 bg-(--np-meter)">
                        <span
                          data-slot="new-project-form-meter-fill"
                          className={cn("absolute inset-y-0 left-0 origin-left", full ? "bg-(--np-warning)" : "bg-(--np-accent)")}
                          style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
                        />
                      </span>
                    )}
                  </div>
                )}
                {limit !== undefined && (
                  <button
                    type="button"
                    onClick={() => team && onUpgrade?.(team)}
                    className={cn(text12, focusRing, "self-start rounded-[4px] font-medium text-(--np-text) underline-offset-2 hover:underline")}
                  >
                    Upgrade for unlimited
                  </button>
                )}
              </div>
            </div>
          )}
        </nav>

        <div ref={pane} data-slot="new-project-form-pane" className="min-w-0 flex-1 overflow-hidden">
          <div key={view} className="flex flex-col gap-5 px-5 pt-5 pb-6 @min-[520px]:px-6 @min-[520px]:pt-[22px]">
            {!done && (
              <h3 data-slot="new-project-form-section" className="text-[18px] leading-6 font-semibold tracking-[-0.01em] text-(--np-text)">
                {step.title}
              </h3>
            )}
            {content}
          </div>
        </div>
      </fieldset>

      <footer data-slot="new-project-form-footer" className="flex items-center justify-between gap-3 border-t border-(--np-divider) py-[14px] pr-4 pl-5">
        <p aria-live="polite" className={cn(mono12, "min-w-0", errors.form ? "text-(--np-danger)" : "text-(--np-text-3)")}>
          {statusText}
          <span className="sr-only">{submitting ? `. Creating ${state.name.trim()}.` : done ? `. ${state.name.trim()} was created.` : ""}</span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={secondary.onClick}
            disabled={submitting}
            className={cn(
              text14,
              focusRing,
              "inline-flex h-[38px] items-center justify-center rounded-[8px] px-4 font-medium whitespace-nowrap text-(--np-text-2) transition-colors hover:bg-(--np-raised) hover:text-(--np-text) disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {secondary.label}
          </button>
          <button
            type={done ? "button" : "submit"}
            data-slot="new-project-form-primary"
            onClick={
              done
                ? (event) => {
                    // a reset turns this button back into the submit button before the click's default action runs:
                    // cancel it, or the fresh form would submit its first step straight away
                    event.preventDefault()
                    if (onClose) onClose()
                    else resetForm()
                  }
                : undefined
            }
            aria-disabled={submitting || undefined}
            className={cn(
              text14,
              focusRing,
              "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[8px] bg-(--np-accent) px-4 font-medium whitespace-nowrap text-(--np-on-accent) transition-[filter] hover:brightness-90 aria-disabled:cursor-progress",
              "focus-visible:ring-offset-2 focus-visible:ring-offset-(--np-surface)",
            )}
          >
            {submitting && <Spinner />}
            {primaryLabel}
          </button>
        </div>
      </footer>
    </form>
  )
}

export {
  NewProjectForm,
  sampleNewProjectRepositories,
  sampleNewProjectTeams,
  sampleNewProjectValues,
  sampleNewProjectVisibility,
  type NewProjectEnvVar,
  type NewProjectFormProps,
  type NewProjectFormValues,
  type NewProjectOption,
  type NewProjectPlan,
  type NewProjectStep,
  type NewProjectTeam,
}
