"use client"

import { animate, stagger, svg } from "animejs"
import { RadioGroup as RadioGroupPrimitive, Select as SelectPrimitive } from "radix-ui"
import * as React from "react"

import { useControllableState } from "@/hooks/use-controllable-state"
import { releaseStyles, shake, useCountUp, useFormEntrance, useInView, useIsomorphicLayoutEffect, useReducedMotion } from "@/hooks/use-form-motion"
import { useFormSubmit } from "@/hooks/use-form-submit"
import { cn } from "@/lib/utils"

/** A token the wallet holds. */
type TokenTransferToken = {
  /** "USDC": the value submitted and the unit shown next to amounts. */
  symbol: string
  /** "USD Coin": shown in the token contract line. */
  name: string
  /** The token's mark in its round chip: an icon, or a character ("$"). Defaults to the symbol's first letter. */
  glyph?: React.ReactNode
  /** What the wallet holds, in the token. */
  balance: number
  /** USD per token, for the "≈ $…" estimate. */
  usdPrice: number
  /** The token contract; shown shortened ("0xA0b8…eB48"). Leave it out for a network's native coin. */
  contract?: string
  /** Shows "verified" after the contract. */
  verified?: boolean
}

/** A network the transfer can go over. */
type TokenTransferNetwork = {
  value: string
  label: string
  /** The coin gas is paid in ("ETH"). */
  feeSymbol: string
  /** The gas fee at the "standard" speed, in `feeSymbol`; speeds scale it by their `feeMultiplier`. */
  fee: number
  /** The network's icon in the round chip. Defaults to the label's first letter. */
  icon?: React.ReactNode
}

/** One option of the Network speed control. */
type TokenTransferSpeed = {
  value: string
  label: string
  /** Scales the network's standard fee (0.7 for slow, 1.5 for fast). */
  feeMultiplier: number
  /** How long the transfer takes, for "Recipient gets: … in {eta}." ("about 30 seconds"). */
  eta: string
  /** Where the gauge's needle points, in degrees from Figma's standard position. */
  needle?: number
}

/** A saved recipient. */
type TokenTransferRecipient = {
  /** The 0x address, or an ENS name. */
  address: string
  /** An ENS or contact name shown after the address ("treasury.northwind.eth"). */
  name?: string
  /** The line under the address ("Verified 14 days ago"). */
  note?: string
}

type TokenTransferFormValues = {
  /** The token's `symbol`. */
  token: string
  /** The network's `value`. */
  network: string
  /** The recipient's address (a saved one, or one typed with the pencil). */
  recipient: string
  /** The amount, in the token. */
  amount: number
  /** The speed's `value`. */
  speed: string
}

type TokenTransferFormProps = Omit<React.ComponentProps<"form">, "onSubmit" | "children" | "defaultValue"> & {
  title?: string
  /**
   * Starting token, network, recipient, amount and speed. Without it the form opens on Figma's choices with the amount
   * empty (0 is an empty amount); `sampleTokenTransferValues` is the filled Figma sample (1,500 USDC).
   */
  defaultValues?: Partial<TokenTransferFormValues>
  tokens?: TokenTransferToken[]
  networks?: TokenTransferNetwork[]
  speeds?: TokenTransferSpeed[]
  recipients?: TokenTransferRecipient[]
  /** Controlled speed (pair with `onSpeedChange`). */
  speed?: string
  onSpeedChange?: (speed: string) => void
  /** The pill above the button. */
  learnMoreLabel?: string
  onLearnMore?: () => void
  onSubmit?: (values: TokenTransferFormValues) => void | Promise<void>
  /** Called by the close button. */
  onClose?: () => void
}

// The sample coins' marks, drawn in currentColor for the round chips (16px in a trigger, 12px in a menu).

/** USD Coin: the dollar sign between the ring's two arcs. */
function UsdcIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" className="size-4">
      <path d="M5.6 2.95A5.6 5.6 0 0 0 5.6 13.05M10.4 2.95A5.6 5.6 0 0 1 10.4 13.05" strokeWidth={1.2} />
      <path d="M9.9 6.2c-.25-.75-.95-1.15-1.9-1.15-1.15 0-1.9.55-1.9 1.4 0 1.95 3.9 1.05 3.9 3.1 0 .9-.85 1.5-2.05 1.5-1.05 0-1.8-.45-2.05-1.25M8 3.9v8.2" strokeWidth={1.1} />
    </svg>
  )
}

/** Tether: the T with the ring around its stem. */
function UsdtIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4">
      <path d="M3.4 3.3h9.2v2H9v7.4H7V5.3H3.4Z" className="fill-current" />
      <ellipse cx="8" cy="7.7" rx="4.6" ry="1.45" fill="none" stroke="currentColor" strokeWidth={1.1} />
    </svg>
  )
}

/** Dai: the D crossed by two bars. */
function DaiIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M5.2 3.6h2.9a4.4 4.4 0 0 1 0 8.8H5.2Z" strokeWidth={1.3} />
      <path d="M3.3 6.9h9.4M3.3 9.1h9.4" strokeWidth={1.1} />
    </svg>
  )
}

/** Arbitrum: the hexagon and the A inside it. */
function ArbitrumIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M8 1.8 13.4 4.9v6.2L8 14.2l-5.4-3.1V4.9Z" />
      <path d="M5.4 11.2 8 5.6l2.6 5.6" />
    </svg>
  )
}

/** Base: the disc with its bar cut in from the left. */
function BaseIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4">
      <path d="M2.05 7.25A6 6 0 1 1 2.05 8.75H9.6v-1.5Z" className="fill-current" />
    </svg>
  )
}

/** BNB Chain: a diamond with four smaller ones around it. */
function BnbIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4">
      <path
        d="M8 5.9 10.1 8 8 10.1 5.9 8ZM8 1.6l1.5 1.5L8 4.6 6.5 3.1ZM8 11.4l1.5 1.5L8 14.4l-1.5-1.5ZM3.1 6.5 4.6 8 3.1 9.5 1.6 8ZM12.9 6.5 14.4 8l-1.5 1.5L11.4 8Z"
        className="fill-current"
      />
    </svg>
  )
}

/** Figma's ETH glyph (ph:currency-eth-fill). */
function EthIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 fill-current">
      <path d="M13.8928 7.69085L8.39277 0.69085C8.34598 0.631319 8.28629 0.58319 8.21819 0.550095C8.15009 0.517001 8.07536 0.499805 7.99964 0.499805C7.92393 0.499805 7.8492 0.517001 7.7811 0.550095C7.713 0.58319 7.6533 0.631319 7.60652 0.69085L2.10652 7.69085C2.03738 7.77892 1.9998 7.88764 1.9998 7.9996C1.9998 8.11156 2.03738 8.22028 2.10652 8.30835L7.60652 15.3084C7.6533 15.3679 7.713 15.416 7.7811 15.4491C7.8492 15.4822 7.92393 15.4994 7.99964 15.4994C8.07536 15.4994 8.15009 15.4822 8.21819 15.4491C8.28629 15.416 8.34598 15.3679 8.39277 15.3084L13.8928 8.30835C13.9619 8.22028 13.9995 8.11156 13.9995 7.9996C13.9995 7.88764 13.9619 7.77892 13.8928 7.69085ZM8.49964 9.72335V2.44523L12.7134 7.80773L8.49964 9.72335ZM7.49964 9.72335L3.28589 7.80773L7.49964 2.44523V9.72335ZM7.49964 10.8215V13.554L4.16027 9.30398L7.49964 10.8215Z" />
    </svg>
  )
}

const sampleTokenTransferTokens: TokenTransferToken[] = [
  { symbol: "USDC", name: "USD Coin", glyph: <UsdcIcon />, balance: 4210.55, usdPrice: 1.00008, contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", verified: true },
  { symbol: "USDT", name: "Tether USD", glyph: <UsdtIcon />, balance: 980.2, usdPrice: 0.9998, contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", verified: true },
  { symbol: "DAI", name: "Dai Stablecoin", glyph: <DaiIcon />, balance: 2500, usdPrice: 0.9999, contract: "0x6B175474E89094C44Da98b954EedeAC495271d0F", verified: true },
  { symbol: "ETH", name: "Ether", glyph: <EthIcon />, balance: 1.84, usdPrice: 3412.4 },
]

const sampleTokenTransferNetworks: TokenTransferNetwork[] = [
  { value: "ethereum", label: "Ethereum", feeSymbol: "ETH", fee: 0.006, icon: <EthIcon /> },
  { value: "arbitrum", label: "Arbitrum", feeSymbol: "ETH", fee: 0.00012, icon: <ArbitrumIcon /> },
  { value: "base", label: "Base", feeSymbol: "ETH", fee: 0.00004, icon: <BaseIcon /> },
  { value: "bnb", label: "BNB Chain", feeSymbol: "BNB", fee: 0.00021, icon: <BnbIcon /> },
]

const sampleTokenTransferSpeeds: TokenTransferSpeed[] = [
  { value: "slow", label: "Slow", feeMultiplier: 0.7, eta: "about 2 minutes", needle: -90 },
  { value: "standard", label: "Standard", feeMultiplier: 1, eta: "about 30 seconds", needle: 0 },
  { value: "fast", label: "Fast", feeMultiplier: 1.5, eta: "about 10 seconds", needle: 60 },
]

const sampleTokenTransferRecipients: TokenTransferRecipient[] = [
  { address: "0x9c1b5d4e2a7f03b91c58d6e0a3f72b19d6cac5e4", name: "treasury.northwind.eth", note: "Verified 14 days ago" },
  { address: "0x3f8e21c07b4d96a5e1f2830c9d7b46a1e05b2d71", name: "payroll.northwind.eth", note: "Verified 3 months ago" },
  { address: "0x71d0a4be9c3f5e2817b6d04a9fe3c58b2a6d0e19", note: "Last used 2 days ago" },
]

const sampleTokenTransferValues: TokenTransferFormValues = {
  token: "USDC",
  network: "ethereum",
  recipient: "0x9c1b5d4e2a7f03b91c58d6e0a3f72b19d6cac5e4",
  amount: 1500,
  speed: "standard",
}

// What the sheet opens with: Figma's token, network, recipient and speed, the amount empty (its placeholder shows).
const defaultTokenTransferValues: TokenTransferFormValues = { ...sampleTokenTransferValues, amount: 0 }

// Figma's raw colours by role (only text/primary and text/muted are library variables: form-primary, form-muted), light
// and dark (light 2713:28198, dark 1891:100105) as light-dark(light, dark), so the form follows your app's dark class (it
// sets its own color-scheme from it). Override any of them on the form (style or a CSS rule on
// [data-slot="token-transfer-form"]) to re-skin it.
const palette = {
  "--tt-panel-top": "light-dark(#ffffff, #2a2a2c)", // the sheet's gradient: top
  "--tt-panel-mid": "light-dark(#ffffff, #171718)", // … at 40%
  "--tt-panel-bottom": "light-dark(rgb(255 255 255 / 0.733), #0d0d0e)", // … bottom
  "--tt-panel-sheen": "light-dark(rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.07))", // … the glow at its top
  "--tt-menu": "light-dark(#ffffff, #1c1c1f)", // the token / network / recipient menus
  "--tt-chip-top": "light-dark(#ffffff, #4a4a4e)", // token chips: top
  "--tt-chip-bottom": "light-dark(#ffffff, #232326)", // token chips: bottom
  "--tt-tab-top": "light-dark(#d0d0d2, var(--tt-chip-top))", // the picked speed: top
  "--tt-tab-bottom": "light-dark(#dadadc, #2c2c2f)", // … bottom
  "--tt-tab-ink": "light-dark(#1a1a1a, #ffffff)", // … its label and gauge
  "--tt-heading": "light-dark(#1a1a1a, #ededed)", // "Network"
  "--tt-heading-muted": "light-dark(#7d7d82, #6e6e73)", // "speed"
  "--tt-key": "light-dark(#1a1a1a, #e5e5e5)", // detail keys, the brand icon
  "--tt-icon": "light-dark(#27272b, #d4d4d8)", // icons, the learn-more pill
  "--tt-icon-hover": "light-dark(#1a1a1a, #ffffff)", // the recipient's edit button, hovered
  "--tt-soft": "light-dark(#3d3d42, #bdbdc2)", // speed labels, the fee, bullets
  "--tt-detail": "light-dark(#55555e, #a1a1aa)", // detail text, the pill's chevron
  "--tt-code": "light-dark(#6f6f75, #8a8a90)", // the token contract
  "--tt-faint": "light-dark(#7c7c83, #77777d)", // "Gas fee"
  "--tt-accent": "#47b2e3", // the recipient's arrows, the hero rings and glow, focus rings
  "--tt-accent-ink": "light-dark(#1e8ec3, var(--tt-accent))", // the recipient, Max
  "--tt-field-from": "light-dark(rgb(188 213 230 / 0.1), rgb(0 20 34 / 0))", // the amount field's wash: top
  "--tt-field": "light-dark(rgb(188 213 230 / 0.1), #004b7d)", // … bottom
  "--tt-field-edge-from": "light-dark(var(--tt-field-edge), rgb(0 20 34 / 0))", // … its edge: top
  "--tt-field-edge": "#29a9ff", // … bottom
  "--tt-field-error-from": "light-dark(var(--tt-danger), rgb(0 20 34 / 0))", // … the edge of a bad amount: top (danger below)
  "--tt-field-glow": "#0099ff", // … its inner shadow
  "--tt-field-shadow": "light-dark(color-mix(in srgb, var(--tt-field-glow) 9.4%, transparent), color-mix(in srgb, var(--tt-field-glow) 16%, transparent))",
  "--tt-button-top": "#77cdf4", // the primary button: top
  "--tt-button-bottom": "#1488be", // … bottom
  "--tt-node-top": "#0073ff", // the lock node: top
  "--tt-node-bottom": "#0da2ff", // … bottom
  "--tt-node-edge": "#0088ff", // … its ring
  "--tt-node-light": "light-dark(rgb(210 234 255 / 0.6), #d2eaff)", // … its inner light
  "--tt-node-shadow": "#57b1ff", // … its glow
  // … the glow's four drop shadows (radius r drawn as a CSS blur of about 0.9r), fainter in the light frame
  "--tt-node-glow":
    "0 8.17px 9.6px light-dark(color-mix(in srgb, var(--tt-node-shadow) 9%, transparent), color-mix(in srgb, var(--tt-node-shadow) 15%, transparent)), 0 22.59px 26.5px light-dark(color-mix(in srgb, var(--tt-node-shadow) 13%, transparent), color-mix(in srgb, var(--tt-node-shadow) 22%, transparent)), 0 54.39px 63.9px light-dark(color-mix(in srgb, var(--tt-node-shadow) 11%, transparent), color-mix(in srgb, var(--tt-node-shadow) 19%, transparent)), 0 92.4px 211.9px light-dark(color-mix(in srgb, var(--tt-node-shadow) 20%, transparent), color-mix(in srgb, var(--tt-node-shadow) 34%, transparent))",
  "--tt-beam": "#85e9ff", // the narrow light beam (dark only)
  "--tt-beam-deep": "#2563eb", // the wide light beam (dark only)
  "--tt-dots": "#eeeeee", // the halftone
  "--tt-danger": "#f97066", // errors (Figma draws none)
  "--tt-warning": "#fdb022", // an unverified recipient
  "--tt-success": "#47cd89", // the sent confirmation
  // the glass: the brand tile and the route panel, their edges, the route's divider, the ×, token chips' edges
  "--tt-card": "light-dark(rgb(10 10 10 / 0.03), rgb(255 255 255 / 0.04))",
  "--tt-card-line": "light-dark(rgb(10 10 10 / 0.063), rgb(255 255 255 / 0.07))",
  "--tt-divider": "light-dark(rgb(10 10 10 / 0.055), rgb(255 255 255 / 0.06))",
  "--tt-close": "light-dark(rgb(10 10 10 / 0.055), rgb(255 255 255 / 0.06))",
  "--tt-close-hover": "light-dark(rgb(10 10 10 / 0.09), rgb(255 255 255 / 0.1))",
  "--tt-chip-line": "light-dark(rgb(10 10 10 / 0.09), rgb(255 255 255 / 0.1))",
  // the menus' edge, shadow and highlighted item (not drawn in Figma)
  "--tt-menu-line": "light-dark(rgb(10 10 10 / 0.09), rgb(255 255 255 / 0.1))",
  "--tt-menu-shadow": "light-dark(rgb(15 18 26 / 0.12), rgb(0 0 0 / 0.6))",
  "--tt-menu-hover": "light-dark(rgb(10 10 10 / 0.055), rgb(255 255 255 / 0.06))",
  // speeds at rest, and the picked one's edge, top light and shadow
  "--tt-tab": "light-dark(rgb(10 10 10 / 0.04), rgb(255 255 255 / 0.05))",
  "--tt-tab-hover": "light-dark(rgb(10 10 10 / 0.07), rgb(255 255 255 / 0.08))",
  "--tt-tab-line": "light-dark(rgb(10 10 10 / 0.11), rgb(255 255 255 / 0.12))",
  "--tt-tab-light": "light-dark(rgb(0 0 0 / 0.05), rgb(255 255 255 / 0.12))",
  "--tt-tab-shadow": "light-dark(rgb(15 18 26 / 0.08), rgb(0 0 0 / 0.35))",
  // the learn-more pill: its edge, gradient (left to right) and hover; "New transfer"
  "--tt-pill-line": "light-dark(rgb(10 10 10 / 0.055), rgb(255 255 255 / 0.06))",
  "--tt-pill-from": "light-dark(rgb(10 10 10 / 0.063), rgb(255 255 255 / 0.07))",
  "--tt-pill-to": "light-dark(rgb(10 10 10 / 0.027), rgb(255 255 255 / 0.03))",
  "--tt-pill-hover": "light-dark(rgb(10 10 10 / 0.09), rgb(255 255 255 / 0.1))",
  "--tt-secondary": "light-dark(rgb(10 10 10 / 0.055), rgb(255 255 255 / 0.06))",
  "--tt-secondary-hover": "light-dark(rgb(10 10 10 / 0.09), rgb(255 255 255 / 0.1))",
  "--tt-secondary-line": "light-dark(rgb(10 10 10 / 0.09), rgb(255 255 255 / 0.1))",
  // the primary button's glow, top light and edge (top to bottom; none in the light frame); the home bar
  "--tt-button-glow": "light-dark(color-mix(in srgb, var(--tt-accent) 21%, transparent), color-mix(in srgb, var(--tt-accent) 35%, transparent))",
  "--tt-button-light": "light-dark(rgb(0 0 0 / 0.05), rgb(255 255 255 / 0.5))",
  "--tt-button-edge-from": "light-dark(transparent, rgb(255 255 255 / 0.7))",
  "--tt-button-edge-to": "light-dark(transparent, rgb(255 255 255 / 0.05))",
  "--tt-home": "light-dark(rgb(10 10 10 / 0.196), rgb(255 255 255 / 0.22))",
  // the sheet's shadow, its gradient stroke (top, 30%, bottom) and its top light
  "--tt-panel-shadow": "light-dark(rgb(15 18 26 / 0.08), rgb(0 0 0 / 0.7))",
  "--tt-panel-edge-top": "light-dark(rgb(10 10 10 / 0.004), rgb(255 255 255 / 0.3))",
  "--tt-panel-edge-mid": "light-dark(rgb(10 10 10 / 0), rgb(255 255 255 / 0.08))",
  "--tt-panel-edge-bottom": "light-dark(rgb(10 10 10 / 0), rgb(255 255 255 / 0.04))",
  "--tt-panel-light": "light-dark(rgb(0 0 0 / 0.05), rgb(255 255 255 / 0.1))",
} as React.CSSProperties

const ADDRESS = /^0x[0-9a-f]{40}$/i
const ENS = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i

const focusRing = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-(--tt-accent)"
// Figma's gradient strokes, drawn inside the box: a 1px ring masked out of a gradient.
const gradientStroke =
  "pointer-events-none absolute inset-0 rounded-[inherit] p-px [mask-image:linear-gradient(#000_0_0),linear-gradient(#000_0_0)] [mask-clip:content-box,border-box] [mask-composite:exclude]"

const amountFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
const amountText = (value: number) => amountFormat.format(value)
const feeText = (value: number) => String(Number(value.toFixed(value < 0.001 ? 6 : 4)))

/** "1,500.5" → 1500.5; NaN for anything that isn't a number. */
function parseAmount(text: string) {
  const clean = text.replace(/[,\s]/g, "")
  return clean === "" || !/^\d*\.?\d*$/.test(clean) || clean === "." ? NaN : Number(clean)
}

/** "0x9c1b5d4e…6cac5e4" → "0x9c1b5d…6cac5e4" (an ENS name stays as it is). */
function shortAddress(address: string, head = 8, tail = 7) {
  return ADDRESS.test(address) ? `${address.slice(0, head)}…${address.slice(-tail)}` : address
}

function recipientProblem(address: string) {
  return ADDRESS.test(address.trim()) || ENS.test(address.trim()) ? null : "Enter a 0x address (42 characters) or an ENS name."
}

// ---- the halftone ------------------------------------------------------------------------------------------------

// Figma's hero texture: a 33 × 31 halftone (dots shrinking from the centre) at 10%, seen through a "Lens distortion"
// shader (strength 0.5, no aberration). The dots are computed in the image's space and pushed through the shader's
// mapping, so the SVG matches Figma without the shader runtime.
let halftonePath: string | undefined
function getHalftonePath() {
  if (halftonePath) return halftonePath
  const W = 514
  const H = 342
  const scale = W / 1024 // the 1024 × 683 image, cover-fitted
  const offsetY = (H - 683 * scale) / 2
  const cx = W / 2
  const cy = H / 2
  const radius = Math.hypot(W, H) / 2
  const k = 0.5
  const f = (r: number) => r * (1 + k * ((r / radius) ** 2 + (r / radius) ** 4))
  const df = (r: number) => 1 + k * (3 * (r / radius) ** 2 + 5 * (r / radius) ** 4)
  let d = ""
  for (let j = -16; j <= 16; j++) {
    for (let i = -17; i <= 17; i++) {
      const ix = i * 19.656
      const iy = j * 19.667
      const dist = Math.hypot(ix, iy)
      const size = dist > 321 ? 0 : 3.4439e-5 * dist * dist - 0.0378936 * dist + 9.12136 // dot radius by distance
      if (size <= 0.1) continue
      const x = (511.5 + ix) * scale - cx
      const y = (341 + iy) * scale + offsetY - cy
      const input = Math.hypot(x, y)
      // the shader samples the image at f(r): a dot at input distance D shows at the r where f(r) = D
      let r = input
      for (let n = 0; n < 8; n++) r -= (f(r) - input) / df(r)
      const ratio = input ? r / input : 1
      const dot = (size * scale) / Math.sqrt(df(r) * (input ? f(r) / r : 1))
      const px = cx + x * ratio
      const py = cy + y * ratio
      d += `M${(px - dot).toFixed(2)} ${py.toFixed(2)}a${dot.toFixed(2)} ${dot.toFixed(2)} 0 1 0 ${(2 * dot).toFixed(2)} 0a${dot.toFixed(2)} ${dot.toFixed(2)} 0 1 0 ${(-2 * dot).toFixed(2)} 0`
    }
  }
  halftonePath = d
  return d
}

/** The menus portal to <body>: they take the form's palette (as overridden on the form) and drop in. */
function usePortalPalette(root: React.RefObject<HTMLFormElement | null>) {
  const reduced = useReducedMotion()
  return React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !root.current) return
      const computed = getComputedStyle(root.current)
      for (const name of Object.keys(palette)) node.style.setProperty(name, computed.getPropertyValue(name))
      // and the form's light or dark, which its light-dark() colours resolve against
      node.style.setProperty("color-scheme", computed.colorScheme)
      if (!reduced) animate(node, { opacity: [0, 1], y: [-4, 0], duration: 200, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
    },
    [root, reduced],
  )
}

// ---- icons (Figma's vectors) ---------------------------------------------------------------------------------------

const line = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const

function ChevronDown() {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 shrink-0 text-(--tt-icon)" {...line} strokeWidth={1.1667}>
      <path d="M3.5 5.25L7 8.75L10.5 5.25" />
    </svg>
  )
}

/**
 * "Secure Transfer" from the Keitoto library, a glass sheet for sending a token: pick the token, the network and a
 * saved recipient (or type an address with the pencil), enter an amount (Max fills the balance), pick a network speed,
 * and read what the recipient gets, the gas fee and the token contract, all computed from the choices. Animated with
 * anime.js: the sheet rises in under its light beams, the rings and lock node pop, the rings breathe, the gauge needle
 * swings to the picked speed, the fee counts, a blocked transfer shakes, and sending turns the lock into a check.
 */
function TokenTransferForm({
  title = "Secure Transfer",
  defaultValues,
  tokens = sampleTokenTransferTokens,
  networks = sampleTokenTransferNetworks,
  speeds = sampleTokenTransferSpeeds,
  recipients = sampleTokenTransferRecipients,
  speed: speedProp,
  onSpeedChange,
  learnMoreLabel = "Transfers can’t be reversed — learn more",
  onLearnMore,
  onSubmit,
  onClose,
  className,
  style,
  ref,
  ...props
}: TokenTransferFormProps) {
  const initial = { ...defaultTokenTransferValues, ...defaultValues }
  const initialToken = tokens.find((t) => t.symbol === initial.token)?.symbol ?? tokens[0]?.symbol ?? ""
  const initialNetwork = networks.find((n) => n.value === initial.network)?.value ?? networks[0]?.value ?? ""
  const initialSpeed = speeds.find((s) => s.value === initial.speed)?.value ?? speeds[Math.floor(speeds.length / 2)]?.value ?? ""

  const [token, setToken] = React.useState(initialToken)
  const [network, setNetwork] = React.useState(initialNetwork)
  const [recipient, setRecipient] = React.useState(initial.recipient)
  const [amount, setAmount] = React.useState(Number.isFinite(initial.amount) && initial.amount > 0 ? amountText(initial.amount) : "")
  const [speed, setSpeed] = useControllableState({ value: speedProp, defaultValue: initialSpeed, onChange: onSpeedChange })
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [attempted, setAttempted] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [sent, setSent] = React.useState<TokenTransferFormValues | null>(null)
  const { status, submit, reset } = useFormSubmit(onSubmit)
  const busy = status !== "idle"

  const tokenInfo = tokens.find((t) => t.symbol === token) ?? tokens[0]
  const networkInfo = networks.find((n) => n.value === network) ?? networks[0]
  const speedInfo = speeds.find((s) => s.value === speed) ?? speeds[0]
  const saved = recipients.find((r) => r.address.toLowerCase() === recipient.toLowerCase())

  // ---- numbers from the data
  const value = parseAmount(amount)
  const fee = (networkInfo?.fee ?? 0) * (speedInfo?.feeMultiplier ?? 1)
  const feeSymbol = networkInfo?.feeSymbol ?? ""
  const native = tokenInfo?.symbol === feeSymbol // paying the fee in the coin being sent
  const balance = tokenInfo?.balance ?? 0
  const spendable = Math.max(0, native ? balance - fee : balance)
  const symbol = tokenInfo?.symbol ?? ""
  const shownAmount = Number.isFinite(value) ? amountText(value) : "0.00"
  const fiat = Number.isFinite(value) ? value * (tokenInfo?.usdPrice ?? 0) : 0

  const amountProblem = !attempted
    ? null
    : !Number.isFinite(value) || value <= 0
      ? "Enter an amount to send."
      : value > balance
        ? `That’s more than your balance of ${amountText(balance)} ${symbol}.`
        : native && value > spendable
          ? `Leave ${feeText(fee)} ${feeSymbol} for the gas fee: up to ${amountText(Math.floor(spendable * 100) / 100)} ${symbol}.`
          : null
  const toProblem = attempted ? (editing ? recipientProblem(draft) : recipientProblem(recipient)) : null

  const ids = {
    title: React.useId(),
    amount: React.useId(),
    amountError: React.useId(),
    balance: React.useId(),
    recipient: React.useId(),
    recipientError: React.useId(),
    draft: React.useId(),
    speed: React.useId(),
    status: React.useId(),
  }

  const rootRef = React.useRef<HTMLFormElement>(null)
  const amountRef = React.useRef<HTMLInputElement>(null)
  const draftRef = React.useRef<HTMLInputElement>(null)
  const recipientRef = React.useRef<HTMLButtonElement>(null)
  const feeRef = React.useRef<HTMLSpanElement>(null)
  const nodeRef = React.useRef<HTMLDivElement>(null)
  const ringsRef = React.useRef<HTMLDivElement>(null)
  const spinnerRef = React.useRef<SVGSVGElement>(null)
  const amountErrorRef = React.useRef<HTMLParagraphElement>(null)
  const recipientErrorRef = React.useRef<HTMLParagraphElement>(null)
  React.useImperativeHandle(ref, () => rootRef.current as HTMLFormElement)
  const reduced = useReducedMotion()
  const inView = useInView(rootRef)
  const portalRef = usePortalPalette(rootRef)

  // ---- actions

  const startEditing = () => {
    setDraft(saved ? "" : recipient)
    setEditing(true)
  }
  React.useEffect(() => {
    if (editing) draftRef.current?.focus()
  }, [editing])

  /** Takes the typed address when it's valid; returns whether it did. */
  const commitDraft = () => {
    const next = draft.trim()
    if (!next) {
      setEditing(false)
      return true
    }
    if (recipientProblem(next)) return false
    setRecipient(next)
    setEditing(false)
    return true
  }

  const restore = () => {
    setToken(initialToken)
    setNetwork(initialNetwork)
    setRecipient(initial.recipient)
    setAmount(Number.isFinite(initial.amount) && initial.amount > 0 ? amountText(initial.amount) : "")
    setSpeed(initialSpeed)
    setEditing(false)
    setAttempted(false)
    setFailed(false)
    setSent(null)
    reset()
  }

  const onFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setAttempted(true)
    setFailed(false)
    let to = recipient
    let toBad = recipientProblem(recipient)
    if (editing) {
      toBad = recipientProblem(draft)
      if (!toBad || !draft.trim()) {
        if (draft.trim()) to = draft.trim()
        toBad = recipientProblem(to)
        commitDraft()
      }
    }
    const amountBad = !Number.isFinite(value) || value <= 0 || value > spendable
    if (amountBad || toBad) {
      if (toBad) (editing ? draftRef.current : recipientRef.current)?.focus()
      else amountRef.current?.focus()
      shake(rootRef.current)
      return
    }
    const values: TokenTransferFormValues = { token: symbol, network: networkInfo?.value ?? network, recipient: to, amount: Math.round(value * 1e8) / 1e8, speed: speedInfo?.value ?? speed }
    setAmount(amountText(value))
    setSent(values)
    try {
      await submit(values)
    } catch {
      setFailed(true)
    }
  }

  // ---- motion

  // Entrance: the sheet rises in, its light fades up, the rings and the lock node pop, the sections follow.
  useFormEntrance(rootRef, (timeline) => {
    const form = rootRef.current
    if (!form) return
    const all = (selector: string) => Array.from(form.querySelectorAll<HTMLElement | SVGElement>(selector))
    const rings = all("[data-ring]")
    const sections = all("[data-entrance]")
    timeline.add(form, { opacity: { from: 0 }, y: { from: 24 }, scale: { from: 0.98 }, duration: 800, ease: "outExpo" })
    timeline.add(all("[data-light]"), { opacity: { from: 0 }, duration: 1400, ease: "outQuad" }, 100)
    if (rings.length) timeline.add(rings, { scale: { from: 0.6 }, opacity: { from: 0 }, duration: 900, ease: "outExpo", delay: stagger(90) }, 200)
    if (nodeRef.current) timeline.add(nodeRef.current, { scale: { from: 0.4 }, opacity: { from: 0 }, duration: 700, ease: "outBack(1.8)" }, 260)
    if (sections.length) timeline.add(sections, { opacity: { from: 0 }, y: { from: 10 }, duration: 600, ease: "outExpo", delay: stagger(60) }, 320)
    // hand the sheet and its sections back to their classes: the menus position against the page and not a
    // transformed form, and an open menu stays over the sections under it (a section left with a transform is a
    // stacking context of its own, painted over the menu of the one before it)
    timeline.call(() => {
      for (const el of [form, ...sections]) {
        el.style.removeProperty("transform")
        el.style.removeProperty("opacity")
      }
    })
  })

  // Ambient: the rings breathe outwards while the sheet is on screen.
  useIsomorphicLayoutEffect(() => {
    const rings = ringsRef.current ? Array.from(ringsRef.current.querySelectorAll("[data-ring]")) : []
    if (reduced || !inView || !rings.length) return
    const loop = animate(rings, { opacity: [1, 0.35, 1], scale: [1, 1.04, 1], duration: 3600, delay: stagger(450, { start: 1800 }), ease: "inOutSine", loop: true })
    return () => {
      loop.revert()
    }
  }, [reduced, inView])

  // The gas fee counts to its new value.
  useCountUp(feeRef, fee, (n) => `${feeText(n)} ${feeSymbol}`, { duration: 500 })

  // The picked speed pops and its gauge needle swings from where the last one pointed.
  const lastNeedle = React.useRef(speedInfo?.needle ?? 0)
  useIsomorphicLayoutEffect(() => {
    const from = lastNeedle.current
    const to = speedInfo?.needle ?? 0
    lastNeedle.current = to
    if (reduced || from === to) return
    const tab = rootRef.current?.querySelector('[data-slot="token-transfer-form-speed"][data-state="checked"]')
    const needle = tab?.querySelector("[data-needle]")
    if (tab) animate(tab, { scale: [0.94, 1], duration: 420, ease: "outBack(2)", onComplete: releaseStyles("transform") })
    if (needle) animate(needle, { rotate: [from - to, 0], duration: 700, ease: "outElastic(1, 0.6)", onComplete: releaseStyles("transform") })
  }, [speed, reduced])

  // Errors drop in when they appear or change.
  const lastErrors = React.useRef({ amountProblem, toProblem })
  useIsomorphicLayoutEffect(() => {
    const previous = lastErrors.current
    lastErrors.current = { amountProblem, toProblem }
    if (reduced) return
    const drop = (el: HTMLElement | null) => el && animate(el, { opacity: [0, 1], y: [-4, 0], duration: 300, ease: "outQuad", onComplete: releaseStyles("opacity", "transform") })
    if (amountProblem && amountProblem !== previous.amountProblem) drop(amountErrorRef.current)
    if (toProblem && toProblem !== previous.toProblem) drop(recipientErrorRef.current)
  }, [amountProblem, toProblem, reduced])

  // Submitting spins the spinner and pulses the node; sent pops the node and draws its check.
  useIsomorphicLayoutEffect(() => {
    if (reduced) return
    const node = nodeRef.current
    if (status === "submitting") {
      const spin = spinnerRef.current && animate(spinnerRef.current, { rotate: [0, 360], duration: 800, ease: "linear", loop: true })
      const pulse = node && animate(node, { scale: [1, 1.06, 1], duration: 900, ease: "inOutSine", loop: true })
      return () => {
        spin?.revert()
        pulse?.revert()
      }
    }
    if (status === "success" && node) {
      animate(node, { scale: [0.7, 1], duration: 620, ease: "outBack(2.2)", onComplete: releaseStyles("transform") })
      const check = node.querySelector("[data-check]")
      if (check) animate(svg.createDrawable(check), { draw: ["0 0", "0 1"], duration: 480, delay: 120, ease: "outQuad" })
      const note = rootRef.current?.querySelector('[data-slot="token-transfer-form-sent"]')
      if (note) animate(note, { opacity: [0, 1], y: [8, 0], duration: 500, ease: "outExpo", onComplete: releaseStyles("opacity", "transform") })
    }
  }, [status, reduced])

  // ---- render

  const recipientLabel = saved
    ? `${shortAddress(saved.address)}${saved.name ? ` · ${saved.name}` : ""}`
    : shortAddress(recipient)
  const recipientNote = saved ? (saved.note ?? "Saved recipient") : "New recipient  |  Not verified yet"
  const menu =
    "z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-y-auto rounded-xl border border-(--tt-menu-line) bg-(--tt-menu) p-1 font-form-montserrat text-form-primary antialiased shadow-[0_16px_40px_var(--tt-menu-shadow)] outline-none"
  const menuItem =
    "relative flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-8 pl-2.5 text-[13px] leading-4 font-medium text-form-primary outline-none select-none data-highlighted:bg-(--tt-menu-hover) data-disabled:opacity-40"
  const check = (
    <SelectPrimitive.ItemIndicator className="absolute right-2.5 text-(--tt-accent)">
      <svg aria-hidden viewBox="0 0 14 14" className="size-3.5" {...line} strokeWidth={1.5}>
        <path d="M3 7.5l2.5 2.5L11 4.5" />
      </svg>
    </SelectPrimitive.ItemIndicator>
  )
  const chip = (content: React.ReactNode) => (
    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-(--tt-chip-line) bg-linear-to-b from-(--tt-chip-top) to-(--tt-chip-bottom) text-xs leading-[17px] font-semibold text-form-primary">
      {content}
    </span>
  )

  return (
    <form
      ref={rootRef}
      noValidate
      aria-labelledby={ids.title}
      data-slot="token-transfer-form"
      onSubmit={onFormSubmit}
      className={cn(
        "relative isolate flex w-full max-w-[420px] flex-col rounded-[28px] bg-[radial-gradient(262.5px_267.14px_at_50%_-26.71px,var(--tt-panel-sheen),rgba(255,255,255,0)),linear-gradient(180deg,var(--tt-panel-top)_0%,var(--tt-panel-mid)_40%,var(--tt-panel-bottom)_100%)] p-px font-form-montserrat text-form-primary antialiased shadow-[0_40px_81px_var(--tt-panel-shadow)] scheme-light dark:scheme-dark",
        className,
      )}
      style={{ ...palette, ...style }}
      {...props}
    >
      {/* the light: halftone, beams (clipped to the sheet, under everything else) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <svg data-light width={514} height={342} viewBox="0 0 514 342" className="absolute top-[-60px] left-[calc(50%-259px)] max-w-none">
          <path d={getHalftonePath()} className="fill-(--tt-dots)" opacity={0.1} />
        </svg>
        {/* "Rectangle 3": the narrow beam, layer blur 36.4, plus-lighter, 50% of the group's 59% (the beams are dark only:
            the light frame has none) */}
        <svg data-light width={299.1} height={498.93} viewBox="0 0 299.104 498.93" className="absolute top-[-232.42px] left-[calc(50%-149.55px)] hidden max-w-none overflow-visible opacity-59 mix-blend-plus-lighter dark:block">
          <defs>
            <filter id="tt-beam-blur" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="16.4" />
            </filter>
            <linearGradient id="tt-beam-fill" x1="142.319" y1="36.4183" x2="142.319" y2="440.973" gradientUnits="userSpaceOnUse">
              <stop style={{ stopColor: "var(--tt-beam)" }} />
              <stop offset="1" style={{ stopColor: "var(--tt-beam)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path
            opacity={0.5}
            filter="url(#tt-beam-blur)"
            fill="url(#tt-beam-fill)"
            d="M108.529 69.3616C112.783 50.118 129.842 36.4183 149.55 36.4183C169.258 36.4183 186.317 50.1178 190.571 69.3611L261.236 389.008C269.579 426.745 240.855 462.512 202.207 462.512H96.8969C58.2488 462.512 29.5256 426.746 37.8677 389.009L108.529 69.3616Z"
          />
        </svg>
        {/* "Rectangle 4": the wide beam, layer blur 87.4, plus-lighter */}
        <svg data-light width={780.81} height={625.67} viewBox="0 0 780.808 625.666" className="absolute top-[-283.4px] left-[calc(50%-390.4px)] hidden max-w-none overflow-visible opacity-59 mix-blend-plus-lighter dark:block">
          <defs>
            <filter id="tt-wide-blur" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="39.3" />
            </filter>
            <linearGradient id="tt-wide-fill" x1="380.529" y1="87.4039" x2="380.529" y2="515.471" gradientUnits="userSpaceOnUse">
              <stop style={{ stopColor: "var(--tt-beam-deep)" }} />
              <stop offset="1" style={{ stopColor: "var(--tt-beam-deep)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path filter="url(#tt-wide-blur)" fill="url(#tt-wide-fill)" fillOpacity={0.8} d="M344.369 87.4039H436.414L693.404 538.262H87.4039L344.369 87.4039Z" />
        </svg>
      </div>

      {/* header */}
      <div data-slot="token-transfer-form-header" className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-full border border-(--tt-card-line) bg-(--tt-card) text-(--tt-key)">
            <svg viewBox="0 0 16 16" className="size-4" {...line} strokeWidth={1.1667}>
              <path d="M8 1.33398L14 4.66732V11.334L8 14.6673L2 11.334V4.66732L8 1.33398Z" />
              <path d="M8 14.6667V8" />
              <path d="M14 4.66602L8 7.99935L2 4.66602" />
            </svg>
          </span>
          <h2 id={ids.title} className="text-[15px] leading-[22px] font-medium text-form-primary">
            {title}
          </h2>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn("flex size-7 items-center justify-center rounded-[14px] bg-(--tt-close) text-(--tt-icon) transition-colors hover:bg-(--tt-close-hover)", focusRing)}
          >
            <svg aria-hidden viewBox="0 0 14 14" className="size-3.5" {...line} strokeWidth={1.1667}>
              <path d="M10.5 3.5L7 7M7 7L3.5 10.5M7 7L3.5 3.5M7 7L10.5 10.5" />
            </svg>
          </button>
        )}
      </div>

      {/* hero: rings, glow and the lock node */}
      <div aria-hidden className="relative h-[150px] shrink-0 overflow-hidden">
        <div ref={ringsRef} className="absolute inset-0">
          {[
            [176, 0.08],
            [140, 0.16],
            [104, 0.3],
          ].map(([size, alpha]) => (
            <svg
              key={size}
              data-ring
              viewBox={`0 0 ${size + 1} ${size + 1}`}
              width={size + 1}
              height={size + 1}
              className="absolute max-w-none"
              style={{ left: `calc(50% + 1px - ${(size + 1) / 2}px)`, top: 72 - (size + 1) / 2 }}
            >
              <circle cx={(size + 1) / 2} cy={(size + 1) / 2} r={size / 2} fill="none" strokeOpacity={alpha} className="stroke-(--tt-accent)" />
            </svg>
          ))}
        </div>
        {/* "Glow": 340×150 radial, layer blur 30 (dark only: the light frame has none) */}
        <svg data-light width={400} height={210} viewBox="0 0 400 210" className="absolute top-0 left-[calc(50%-199px)] hidden max-w-none dark:block">
          <defs>
            <filter id="tt-glow-blur" x="0" y="0" width="400" height="210" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="13.5" />
            </filter>
            <radialGradient id="tt-glow-fill" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(200 105) scale(170 75)">
              <stop style={{ stopColor: "var(--tt-accent)", stopOpacity: 0.5 }} />
              <stop offset="1" style={{ stopColor: "var(--tt-accent)", stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <ellipse cx="200" cy="105" rx="170" ry="75" fill="url(#tt-glow-fill)" filter="url(#tt-glow-blur)" />
        </svg>
        <div
          ref={nodeRef}
          data-slot="token-transfer-form-node"
          className="absolute top-[38px] left-[calc(50%-32px)] flex size-[66px] items-center justify-center rounded-full bg-linear-to-b from-(--tt-node-top) to-(--tt-node-bottom) shadow-(--tt-node-glow)"
        >
          {status === "success" ? (
            <svg viewBox="0 0 31.68 31.68" className="relative size-[31.68px]" {...line} strokeWidth={2.64}>
              <path data-check d="M7.5 16.5l5.5 5.5 11-12" className="stroke-white" />
            </svg>
          ) : (
            <svg viewBox="0 0 31.68 31.68" className="relative size-[31.68px] stroke-white" {...line} strokeWidth={2.64}>
              <g transform="translate(2.64 2.64)">
                <path d="M3.96 10.5602H22.44C23.898 10.5602 25.08 11.7422 25.08 13.2002V23.7602C25.08 25.2183 23.898 26.4002 22.44 26.4002H3.96C2.50197 26.4002 1.32 25.2183 1.32 23.7602V13.2002C1.32 11.7422 2.50197 10.5602 3.96 10.5602Z" />
                <path d="M5.28021 5.28C5.28021 4.22974 5.69742 3.2225 6.44006 2.47986C7.18271 1.73721 8.18995 1.32 9.24021 1.32H17.1602C18.2105 1.32 19.2177 1.73721 19.9603 2.47986C20.703 3.2225 21.1202 4.22974 21.1202 5.28V10.56H5.28021V5.28Z" />
              </g>
            </svg>
          )}
          {/* its ring (gradient, 30%) and inner light, over the icon like Figma */}
          <span className={cn(gradientStroke, "p-[2.2px] bg-linear-to-b from-(--tt-node-edge)/30 to-[color-mix(in_srgb,#77c0ff_30%,transparent)]")} />
          <span className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_2.2px_7.9px_4.4px_var(--tt-node-light),inset_0_2.2px_35.6px_4.4px_var(--tt-node-light)]" />
        </div>
      </div>

      {/* body */}
      <div className="relative flex min-w-0 flex-col gap-4 px-5 pb-4">
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        <legend className="sr-only">Transfer</legend>

        {/* token, network, fee, recipient */}
        <div data-entrance data-slot="token-transfer-form-route" className="rounded-2xl border border-(--tt-card-line) bg-(--tt-card)">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <SelectPrimitive.Root value={token} onValueChange={setToken} disabled={busy}>
              <SelectPrimitive.Trigger aria-label={`Token: ${symbol}`} className={cn("flex shrink-0 items-center gap-2.5 rounded-lg text-left", focusRing)}>
                {chip(tokenInfo?.glyph ?? symbol.charAt(0))}
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex h-4 items-baseline gap-1">
                    <span className="truncate text-base leading-none font-semibold text-form-primary">{symbol}</span>
                    <ChevronDown />
                  </span>
                  <span className="text-[11px] leading-none text-form-muted">Token</span>
                </span>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content ref={portalRef} position="popper" sideOffset={8} align="start" className={menu}>
                  <SelectPrimitive.Viewport>
                    {tokens.map((t) => (
                      <SelectPrimitive.Item key={t.symbol} value={t.symbol} className={menuItem}>
                        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full border border-(--tt-chip-line) bg-linear-to-b from-(--tt-chip-top) to-(--tt-chip-bottom) text-[10px] [&_svg]:size-3">
                          {t.glyph ?? t.symbol.charAt(0)}
                        </span>
                        <SelectPrimitive.ItemText>{t.symbol}</SelectPrimitive.ItemText>
                        <span className="ml-auto text-xs font-normal text-form-muted">{amountText(t.balance)}</span>
                        {check}
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>

            <SelectPrimitive.Root value={network} onValueChange={setNetwork} disabled={busy}>
              <SelectPrimitive.Trigger aria-label={`Network: ${networkInfo?.label ?? ""}`} className={cn("flex shrink-0 items-center gap-2.5 rounded-lg text-left", focusRing)}>
                {chip(networkInfo?.icon ?? networkInfo?.label.charAt(0))}
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex h-4 items-baseline gap-1">
                    <span className="truncate text-base leading-none font-semibold text-form-primary">{networkInfo?.label}</span>
                    <ChevronDown />
                  </span>
                  <span className="text-[11px] leading-none text-form-muted">Network</span>
                </span>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content ref={portalRef} position="popper" sideOffset={8} align="start" className={menu}>
                  <SelectPrimitive.Viewport>
                    {networks.map((n) => (
                      <SelectPrimitive.Item key={n.value} value={n.value} className={menuItem}>
                        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full border border-(--tt-chip-line) bg-linear-to-b from-(--tt-chip-top) to-(--tt-chip-bottom) text-[10px] [&_svg]:size-3">
                          {n.icon ?? n.label.charAt(0)}
                        </span>
                        <SelectPrimitive.ItemText>{n.label}</SelectPrimitive.ItemText>
                        <span className="ml-auto text-xs font-normal text-form-muted">{feeText(n.fee)}</span>
                        {check}
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>

            <p className="flex shrink-0 flex-col items-end gap-1 text-[11px] leading-none whitespace-nowrap">
              <span className="text-(--tt-faint)">Gas fee</span>
              <span ref={feeRef} data-slot="token-transfer-form-fee" className="text-(--tt-soft)">
                {`${feeText(fee)} ${feeSymbol}`}
              </span>
            </p>
          </div>

          <div aria-hidden className="h-px bg-(--tt-divider)" />

          <div className="flex items-center gap-3 px-4 py-3.5">
            {editing ? (
              <>
                <svg aria-hidden viewBox="0 0 18 18" className="size-[18px] shrink-0 text-(--tt-accent)" {...line} strokeWidth={1.5}>
                  <path d="M5.25 11.25L9 15L12.75 11.25" />
                  <path d="M5.25 6.75L9 3L12.75 6.75" />
                </svg>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <label htmlFor={ids.draft} className="sr-only">
                    Recipient address
                  </label>
                  <input
                    ref={draftRef}
                    id={ids.draft}
                    value={draft}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="0x… or name.eth"
                    aria-invalid={toProblem ? true : undefined}
                    aria-describedby={toProblem ? ids.recipientError : undefined}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        if (!commitDraft()) setAttempted(true)
                      } else if (event.key === "Escape") {
                        event.preventDefault()
                        setEditing(false)
                        recipientRef.current?.focus()
                      }
                    }}
                    onBlur={() => {
                      if (draft.trim() && !recipientProblem(draft)) commitDraft()
                    }}
                    className="h-[11px] w-full min-w-0 bg-transparent font-form-jetbrains-mono text-[11px] leading-none font-medium text-(--tt-accent-ink) outline-none placeholder:text-(--tt-accent-ink)/45"
                  />
                  <span className="text-[11px] leading-none whitespace-pre text-(--tt-accent-ink)/75">Paste an address  |  Enter to use it</span>
                </span>
              </>
            ) : (
              <SelectPrimitive.Root value={saved?.address ?? recipient} onValueChange={setRecipient} disabled={busy}>
                <SelectPrimitive.Trigger
                  ref={recipientRef}
                  id={ids.recipient}
                  aria-label={`Recipient: ${saved?.name ?? recipient}`}
                  aria-invalid={toProblem ? true : undefined}
                  aria-describedby={toProblem ? ids.recipientError : undefined}
                  className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left", focusRing)}
                >
                  <svg aria-hidden viewBox="0 0 18 18" className="size-[18px] shrink-0 text-(--tt-accent)" {...line} strokeWidth={1.5}>
                    <path d="M5.25 11.25L9 15L12.75 11.25" />
                    <path d="M5.25 6.75L9 3L12.75 6.75" />
                  </svg>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] leading-none">
                    <span className="truncate font-form-jetbrains-mono font-medium text-(--tt-accent-ink)">{recipientLabel}</span>
                    <span className={cn("truncate whitespace-pre", saved ? "text-(--tt-accent-ink)/75" : "text-(--tt-warning)")}>
                      {saved ? `Recipient  |  ${recipientNote}` : recipientNote}
                    </span>
                  </span>
                </SelectPrimitive.Trigger>
                <SelectPrimitive.Portal>
                  <SelectPrimitive.Content ref={portalRef} position="popper" sideOffset={8} align="start" className={menu}>
                    <SelectPrimitive.Viewport>
                      {[...recipients, ...(saved ? [] : [{ address: recipient, note: "New recipient" } as TokenTransferRecipient])].map((r) => (
                        <SelectPrimitive.Item key={r.address} value={r.address} className={cn(menuItem, "flex-col items-start gap-1")}>
                          <SelectPrimitive.ItemText>
                            <span className="font-form-jetbrains-mono text-[11px] text-(--tt-accent-ink)">{shortAddress(r.address)}</span>
                          </SelectPrimitive.ItemText>
                          <span className="text-[11px] leading-none font-normal text-form-muted">{[r.name, r.note].filter(Boolean).join(" · ")}</span>
                          {check}
                        </SelectPrimitive.Item>
                      ))}
                    </SelectPrimitive.Viewport>
                  </SelectPrimitive.Content>
                </SelectPrimitive.Portal>
              </SelectPrimitive.Root>
            )}
            <button
              type="button"
              aria-label={editing ? "Use a saved recipient" : "Type an address"}
              aria-pressed={editing}
              onClick={() => (editing ? setEditing(false) : startEditing())}
              className={cn("-m-1 flex size-6 shrink-0 items-center justify-center rounded-md text-(--tt-icon) transition-colors hover:text-(--tt-icon-hover)", focusRing)}
            >
              <svg aria-hidden viewBox="0 0 16 16" className="size-4" {...line} strokeWidth={1.1667}>
                <path d="M8 13.334H14" />
                <path d="M11 2.33414C11.2652 2.06892 11.6249 1.91992 12 1.91992C12.1857 1.91992 12.3696 1.9565 12.5412 2.02757C12.7128 2.09864 12.8687 2.20281 13 2.33414C13.1313 2.46546 13.2355 2.62136 13.3066 2.79294C13.3776 2.96452 13.4142 3.14842 13.4142 3.33414C13.4142 3.51985 13.3776 3.70375 13.3066 3.87533C13.2355 4.04691 13.1313 4.20281 13 4.33414L4.66667 12.6675L2 13.3341L2.66667 10.6675L11 2.33414Z" />
              </svg>
            </button>
          </div>
        </div>
        {toProblem && (
          <p ref={recipientErrorRef} id={ids.recipientError} className="-mt-2 text-xs leading-4 text-(--tt-danger)">
            {toProblem}
          </p>
        )}

        {/* amount */}
        <div data-entrance data-slot="token-transfer-form-amount" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 leading-none whitespace-nowrap">
            <label htmlFor={ids.amount} className="text-[13px] font-medium text-form-primary">
              Amount
            </label>
            <span id={ids.balance} className="truncate text-xs leading-none text-form-muted">
              Balance {amountText(balance)} {symbol}
            </span>
          </div>
          <div
            className={cn(
              "relative flex h-12 items-center gap-2 rounded-xl bg-linear-to-b from-(--tt-field-from) to-(--tt-field) pr-1.5 pl-3.5",
            )}
          >
            <input
              ref={amountRef}
              id={ids.amount}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              aria-invalid={amountProblem ? true : undefined}
              aria-describedby={[ids.balance, amountProblem && ids.amountError].filter(Boolean).join(" ")}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))}
              onBlur={() => {
                if (Number.isFinite(value)) setAmount(amountText(value))
              }}
              className="h-full min-w-0 flex-1 bg-transparent text-base leading-none font-semibold text-form-primary caret-(--tt-accent) outline-none placeholder:text-form-muted"
              placeholder="0.00"
            />
            <span className="text-xs leading-none whitespace-nowrap text-form-muted">≈ {usdFormat.format(fiat)}</span>
            <button
              type="button"
              onClick={() => {
                setAmount(amountText(Math.floor(spendable * 100) / 100))
                amountRef.current?.focus()
              }}
              className={cn(
                "flex h-8 w-12 shrink-0 items-center justify-center rounded-[9px] border border-(--tt-accent)/35 bg-(--tt-accent)/12 text-xs leading-[17px] font-semibold text-(--tt-accent-ink) transition-colors hover:bg-(--tt-accent)/20",
                focusRing,
              )}
            >
              Max
            </button>
            <span className={cn(gradientStroke, "bg-linear-to-b", amountProblem ? "from-(--tt-field-error-from) to-(--tt-danger)" : "from-(--tt-field-edge-from) to-(--tt-field-edge)")} />
            <span className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_4px_3.6px_var(--tt-field-shadow)]" />
          </div>
          {amountProblem && (
            <p ref={amountErrorRef} id={ids.amountError} className="text-xs leading-4 text-(--tt-danger)">
              {amountProblem}
            </p>
          )}
        </div>

        {/* network speed */}
        <div data-entrance className="flex flex-col items-center gap-3 pt-1">
          <p id={ids.speed} className="text-center text-[15px] leading-none font-medium text-(--tt-heading)">
            Network <span className="text-(--tt-heading-muted)">speed</span>
          </p>
          <RadioGroupPrimitive.Root
            aria-labelledby={ids.speed}
            value={speed}
            onValueChange={setSpeed}
            orientation="horizontal"
            loop
            className="flex w-full items-center gap-2"
          >
            {speeds.map((s) => {
              const on = s.value === speed
              return (
                <RadioGroupPrimitive.Item
                  key={s.value}
                  value={s.value}
                  data-slot="token-transfer-form-speed"
                  className={cn(
                    "flex min-w-0 flex-1 basis-0 cursor-pointer items-center justify-center gap-2 rounded-[10px] px-3 text-[13px] leading-none font-medium whitespace-nowrap transition-colors",
                    on
                      ? "bg-linear-to-b from-(--tt-tab-top) to-(--tt-tab-bottom) py-[7px] text-(--tt-tab-ink) shadow-[inset_0_0_0_1px_var(--tt-tab-line),inset_0_1px_0_var(--tt-tab-light),0_2px_5.4px_var(--tt-tab-shadow)]"
                      : "bg-(--tt-tab) py-1.5 text-(--tt-soft) hover:bg-(--tt-tab-hover)",
                    focusRing,
                  )}
                >
                  {on && (
                    <svg aria-hidden viewBox="0 0 15 15" className="size-[15px] shrink-0 overflow-visible" {...line} strokeWidth={1.25}>
                      <g data-needle style={{ transformOrigin: "7.5px 8.75px", transformBox: "view-box" }}>
                        <path d="M7.5 8.75L10 6.25" transform={`rotate(${s.needle ?? 0} 7.5 8.75)`} />
                      </g>
                      <path d="M2.0875 11.8753C1.53889 10.9252 1.25004 9.84737 1.25 8.75024C1.24996 7.65311 1.53872 6.57529 2.08726 5.62514C2.6358 4.67498 3.42479 3.88596 4.37493 3.33738C5.32507 2.7888 6.40287 2.5 7.5 2.5C8.59713 2.5 9.67493 2.7888 10.6251 3.33738C11.5752 3.88596 12.3642 4.67498 12.9127 5.62514C13.4613 6.57529 13.75 7.65311 13.75 8.75024C13.75 9.84737 13.4611 10.9252 12.9125 11.8753" />
                    </svg>
                  )}
                  {s.label}
                </RadioGroupPrimitive.Item>
              )
            })}
          </RadioGroupPrimitive.Root>
        </div>

        {/* details */}
        <ul data-entrance data-slot="token-transfer-form-details" className="flex flex-col gap-4 pl-1 text-xs">
          <li className="flex gap-2.5">
            <span aria-hidden className="leading-[17px] text-(--tt-soft)">
              •
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="leading-none font-semibold text-(--tt-key)">Recipient gets:</span>
              <span className="leading-[17px] text-(--tt-detail)">
                {shownAmount} {symbol} in {speedInfo?.eta}.{" "}
                {native ? `The ${feeSymbol} fee is paid on top of the amount.` : `The fee is paid in ${feeSymbol}, not deducted from the amount.`}
              </span>
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="leading-[17px] text-(--tt-soft)">
              •
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="leading-none font-semibold text-(--tt-key)">Token contract:</span>
              <span className="font-form-jetbrains-mono leading-[17px] break-all text-(--tt-code)">
                {tokenInfo?.contract
                  ? `${shortAddress(tokenInfo.contract, 6, 4)} (${tokenInfo.name}${tokenInfo.verified ? ", verified" : ""})`
                  : `None: ${tokenInfo?.name ?? symbol} is ${networkInfo?.label ?? "the network"}’s own coin`}
              </span>
            </span>
          </li>
        </ul>

      </fieldset>

        {/* note + button */}
        {status === "success" && sent ? (
          <p
            key="success-note"
            role="status"
            data-slot="token-transfer-form-sent"
            className="flex items-center gap-2.5 rounded-full border border-(--tt-success)/30 bg-(--tt-success)/10 py-2.5 pr-3 pl-3.5 text-xs leading-4 font-medium text-(--tt-success)"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0" {...line} strokeWidth={1.4}>
              <circle cx="8" cy="8" r="6.4" />
              <path d="M5.4 8.2l1.8 1.8 3.4-3.6" />
            </svg>
            <span className="min-w-0 flex-1">
              Sent {amountText(sent.amount)} {sent.token} to {saved?.name ?? shortAddress(sent.recipient)}
            </span>
          </p>
        ) : (
          <button
            key="idle-note"
            type="button"
            onClick={onLearnMore}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-full border border-(--tt-pill-line) bg-linear-to-r from-(--tt-pill-from) to-(--tt-pill-to) py-2.5 pr-3 pl-3.5 text-left text-(--tt-icon) transition-colors hover:from-(--tt-pill-hover)",
              focusRing,
            )}
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0" {...line} strokeWidth={1.1667}>
              <path d="M6 12H10" />
              <path d="M6.66666 14.666H9.33332" />
              <path d="M8.00001 1.33398C7.0145 1.34283 6.0571 1.66346 5.26502 2.24991C4.47295 2.83636 3.88687 3.65851 3.5908 4.59854C3.29473 5.53856 3.30387 6.54819 3.6169 7.4827C3.92993 8.41721 4.53079 9.22863 5.33334 9.80065V11.334H10.6667V9.80065C11.4692 9.22863 12.0701 8.41721 12.3831 7.4827C12.6962 6.54819 12.7053 5.53856 12.4092 4.59854C12.1131 3.65851 11.5271 2.83636 10.735 2.24991C9.94292 1.66346 8.98552 1.34283 8.00001 1.33398Z" />
            </svg>
            <span className="min-w-0 flex-1 text-xs leading-none font-medium">{learnMoreLabel}</span>
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-(--tt-detail)" {...line} strokeWidth={1.1667}>
              <path d="M6 12L10 8L6 4" />
            </svg>
          </button>
        )}

        {status === "success" ? (
          <button
            key="success-1"
            type="button"
            onClick={restore}
            className={cn(
              "relative flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-(--tt-secondary-line) bg-(--tt-secondary) px-5 text-sm leading-none font-semibold text-form-primary transition-colors hover:bg-(--tt-secondary-hover)",
              focusRing,
            )}
          >
            New transfer
          </button>
        ) : (
          <button
            key="idle-1"
            type="submit"
            disabled={status === "submitting"}
            data-slot="token-transfer-form-submit"
            className={cn(
              "relative flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-linear-to-b from-(--tt-button-top) to-(--tt-button-bottom) px-5 text-sm leading-none font-semibold text-white shadow-[0_8px_21.6px_var(--tt-button-glow),inset_0_1px_1.8px_var(--tt-button-light)] transition-[filter] hover:brightness-110 disabled:cursor-progress",
              focusRing,
            )}
          >
            {status === "submitting" ? (
              <>
                <svg ref={spinnerRef} aria-hidden viewBox="0 0 16 16" className="size-4" {...line} strokeWidth={1.75}>
                  <path d="M14 8a6 6 0 1 1-6-6" />
                </svg>
                Sending…
              </>
            ) : (
              "Review transfer"
            )}
            <span className={cn(gradientStroke, "bg-linear-to-b from-(--tt-button-edge-from) to-(--tt-button-edge-to)")} />
          </button>
        )}

        <p id={ids.status} aria-live="polite" className="sr-only">
          {status === "submitting"
            ? "Sending the transfer…"
            : status === "success" && sent
              ? `Sent ${amountText(sent.amount)} ${sent.token}.`
              : failed
                ? "The transfer didn’t go through. Try again."
                : ""}
        </p>
        {failed && <p className="-mt-2 text-center text-xs leading-4 text-(--tt-danger)">The transfer didn’t go through. Try again.</p>}

        <div aria-hidden className="flex justify-center">
          <span className="h-1 w-[120px] rounded-[2px] bg-(--tt-home)" />
        </div>
      </div>

      {/* the sheet's gradient stroke and top highlight, over its content like Figma */}
      <span aria-hidden className={cn(gradientStroke, "bg-[linear-gradient(180deg,var(--tt-panel-edge-top)_0%,var(--tt-panel-edge-mid)_30%,var(--tt-panel-edge-bottom)_100%)]")} />
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_var(--tt-panel-light)]" />
    </form>
  )
}

export {
  TokenTransferForm,
  sampleTokenTransferNetworks,
  sampleTokenTransferRecipients,
  sampleTokenTransferSpeeds,
  sampleTokenTransferTokens,
  sampleTokenTransferValues,
  type TokenTransferFormProps,
  type TokenTransferFormValues,
  type TokenTransferNetwork,
  type TokenTransferRecipient,
  type TokenTransferSpeed,
  type TokenTransferToken,
}
