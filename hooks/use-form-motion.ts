"use client"

import { animate, createScope, createTimeline, type JSAnimation, type Scope, type Timeline } from "animejs"
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react"

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/** Whether the user asked their system for reduced motion. Always false on the server. */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  )
}

/** The same preference read once, outside React (event handlers). */
export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION).matches
}

/**
 * An onComplete that removes the given inline properties from the animation's targets, so the element's classes (the
 * React state the tween animated towards) apply again. utils.cleanInlineStyles is not the same thing: it restores the
 * inline value from before the animation, which is a frame of the earlier animation it interrupted.
 */
export function releaseStyles(...properties: string[]) {
  return (animation: JSAnimation) => {
    for (const target of animation.targets) {
      if (target instanceof HTMLElement || target instanceof SVGElement) for (const property of properties) target.style.removeProperty(property)
    }
  }
}

/** useLayoutEffect in the browser, so animations set their first frame before paint; useEffect on the server. */
export const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * An anime.js scope on `root` for as long as the component is mounted. Animations created through
 * `scope.current.execute(() => animate(…))` belong to it and are reverted on unmount, so nothing keeps
 * animating a removed form.
 */
export function useAnimeScope(root: RefObject<HTMLElement | null>) {
  const scope = useRef<Scope | null>(null)
  useIsomorphicLayoutEffect(() => {
    scope.current = createScope({ root })
    return () => {
      scope.current?.revert()
      scope.current = null
    }
  }, [root])
  return scope
}

/**
 * Runs a form's entrance once, when at least `amount` of `root` is in view. `build` adds the tweens to a paused
 * timeline (and may return a cleanup). Every tween's first frame is applied right away, before paint, so the form
 * never flashes its final state, also for tweens that start later in the timeline. With reduced motion nothing
 * animates and the form renders as is. On unmount the timeline is reverted, which restores the styles it set.
 */
export function useFormEntrance(
  root: RefObject<HTMLElement | null>,
  build: (timeline: Timeline) => void | (() => void),
  { amount = 0.25 }: { amount?: number } = {},
) {
  const reduced = useReducedMotion()
  const buildRef = useRef(build)
  useIsomorphicLayoutEffect(() => {
    buildRef.current = build
  })

  useIsomorphicLayoutEffect(() => {
    const element = root.current
    if (!element || reduced) return
    const timeline = createTimeline({ autoplay: false })
    const cleanup = buildRef.current(timeline)
    // seek(0) alone only renders tweens that start at 0: passing the end and coming back renders every tween's
    // starting values (callbacks muted, so counters keep their text until they run).
    timeline.seek(timeline.duration, true).seek(0, true)

    let observer: IntersectionObserver | undefined
    if (typeof IntersectionObserver === "undefined") timeline.play()
    else {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return
          observer?.disconnect()
          timeline.play()
        },
        { threshold: amount },
      )
      observer.observe(element)
    }
    return () => {
      observer?.disconnect()
      timeline.revert()
      cleanup?.()
    }
  }, [root, reduced, amount])
}

/**
 * Whether any of `root` is on screen, to pause an ambient loop (a blinking cursor, a breathing glow) while the form is
 * scrolled away. True until the first observation, and always without IntersectionObserver (on the server).
 */
export function useInView(root: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const element = root.current
    if (!element || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    observer.observe(element)
    return () => observer.disconnect()
  }, [root])
  return inView
}

/**
 * Counts the text of `ref` from the previous `value` to the new one whenever `value` changes (React renders the
 * final text; this only animates the way there). `enabled: false` stops a running count so React's text stays.
 */
export function useCountUp(
  ref: RefObject<HTMLElement | null>,
  value: number,
  format: (value: number) => string,
  { enabled = true, duration = 600 }: { enabled?: boolean; duration?: number } = {},
) {
  const reduced = useReducedMotion()
  const last = useRef(value)
  const tween = useRef<JSAnimation | null>(null)
  const active = enabled && !reduced

  useIsomorphicLayoutEffect(() => {
    if (active) return
    tween.current?.cancel()
    tween.current = null
  }, [active])

  useIsomorphicLayoutEffect(() => {
    const from = last.current
    last.current = value
    const el = ref.current
    if (!el || !active || from === value) return
    tween.current?.cancel()
    const counter = { n: from }
    tween.current = animate(counter, {
      n: value,
      duration,
      ease: "outExpo",
      onUpdate: () => {
        el.textContent = format(counter.n)
      },
      onComplete: () => {
        el.textContent = format(value)
      },
    })
  }, [value, active])

  useEffect(
    () => () => {
      tween.current?.cancel()
    },
    [],
  )
}

/**
 * A two-state ease for blinking loops (a caret, a status light): each iteration holds the start value for its first
 * half and the end value for its second, so `{ opacity: [1, 0], duration: 1060, ease: blink, loop: true }` blinks every
 * 530ms. anime.js 4.5 has no string steps() ease any more, and `steps(1)` with `alternate: true` never leaves the start
 * value.
 */
export const blink = (t: number) => (t < 0.5 ? 0 : 1)

/**
 * A short sideways shake, for a submit that found invalid fields. Does nothing with reduced motion (the error text
 * and the field's invalid state say it already).
 */
export function shake(target: Element | null | undefined, { distance = 6, duration = 420 }: { distance?: number; duration?: number } = {}) {
  if (!target || prefersReducedMotion()) return
  return animate(target, {
    x: [0, -distance, distance, -distance * 0.6, distance * 0.6, -distance * 0.25, 0],
    duration,
    ease: "inOutSine",
    onComplete: releaseStyles("transform"),
  })
}
