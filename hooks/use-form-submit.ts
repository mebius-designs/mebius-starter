"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type FormSubmitStatus = "idle" | "submitting" | "success"

/**
 * The submit status a form block shows. `submit(values)` calls `onSubmit`: while a returned promise is pending the
 * status is "submitting", then "success". When `onSubmit` throws (or its promise rejects) the status goes back to
 * "idle" and `submit` rethrows, so the form can show the error. `reset()` returns to "idle", e.g. for "Send another".
 */
export function useFormSubmit<T>(onSubmit?: (values: T) => void | Promise<void>) {
  const [status, setStatus] = useState<FormSubmitStatus>("idle")
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const submit = useCallback(
    async (values: T) => {
      setStatus("submitting")
      try {
        await onSubmit?.(values)
        if (alive.current) setStatus("success")
      } catch (error) {
        if (alive.current) setStatus("idle")
        throw error
      }
    },
    [onSubmit],
  )
  const reset = useCallback(() => setStatus("idle"), [])

  return { status, submit, reset }
}
