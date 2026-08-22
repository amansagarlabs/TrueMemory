import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribeToMobileChange(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mediaQuery.addEventListener("change", onStoreChange)
  return () => mediaQuery.removeEventListener("change", onStoreChange)
}

function getMobileSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerMobileSnapshot() {
  return false
}

function subscribeToReducedMotionChange(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
  mediaQuery.addEventListener("change", onStoreChange)
  return () => mediaQuery.removeEventListener("change", onStoreChange)
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function getServerReducedMotionSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeToMobileChange,
    getMobileSnapshot,
    getServerMobileSnapshot,
  )
}

export function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribeToReducedMotionChange,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  )
}
