"use client"

import { useEffect } from "react"

const THEME_STORAGE_KEY = "theme"
const THEME_CHANGE_EVENT = "kontext-theme-change"

function applyThemeFromStorage() {
  const root = document.documentElement
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const isDark = storedTheme ? storedTheme === "dark" : prefersDark

  root.classList.toggle("dark", isDark)
  root.style.colorScheme = isDark ? "dark" : "light"
}

export function ThemeSync() {
  useEffect(() => {
    applyThemeFromStorage()

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== THEME_STORAGE_KEY) return
      applyThemeFromStorage()
    }

    const handleThemeChange = () => {
      applyThemeFromStorage()
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleMediaChange = () => {
      if (!localStorage.getItem(THEME_STORAGE_KEY)) {
        applyThemeFromStorage()
      }
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    mediaQuery.addEventListener("change", handleMediaChange)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      mediaQuery.removeEventListener("change", handleMediaChange)
    }
  }, [])

  return null
}
