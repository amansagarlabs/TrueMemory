"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

const Dithering = dynamic(
  () => import("@paper-design/shaders-react").then((mod) => mod.Dithering),
  { ssr: false }
)

export type DitherShape = "simplex" | "warp" | "dots" | "wave" | "ripple" | "swirl" | "sphere"
type DitherType = "random" | "2x2" | "4x4" | "8x8"

interface DitherTheme {
  colorBack: string
  colorFront: string
}

interface PaperDitherProps {
  className?: string
  dark: DitherTheme
  light: DitherTheme
  shape?: DitherShape
  type?: DitherType
  size?: number
  speed?: number
  scale?: number
  frame?: number
  rotation?: number
  offsetX?: number
  offsetY?: number
  fit?: "contain" | "cover"
  worldWidth?: number
  worldHeight?: number
  originX?: number
  originY?: number
  minPixelRatio?: number
  maxPixelCount?: number
  eager?: boolean
}

function ShaderLayer({
  className,
  colors,
  shape = "wave",
  type = "4x4",
  size = 2,
  speed = 0.2,
  scale = 0.6,
  frame = 0,
  rotation = 0,
  offsetX = 0,
  offsetY = 0,
  fit = "cover",
  worldWidth,
  worldHeight,
  originX,
  originY,
  minPixelRatio = 1,
  maxPixelCount = 1920 * 1080,
}: {
  className?: string
  colors: DitherTheme
  shape?: DitherShape
  type?: DitherType
  size?: number
  speed?: number
  scale?: number
  frame?: number
  rotation?: number
  offsetX?: number
  offsetY?: number
  fit?: "contain" | "cover"
  worldWidth?: number
  worldHeight?: number
  originX?: number
  originY?: number
  minPixelRatio?: number
  maxPixelCount?: number
}) {
  return (
    <Dithering
      className={cn("size-full", className)}
      colorBack={colors.colorBack}
      colorFront={colors.colorFront}
      fit={fit}
      frame={frame}
      height="100%"
      maxPixelCount={maxPixelCount}
      minPixelRatio={minPixelRatio}
      offsetX={offsetX}
      offsetY={offsetY}
      originX={originX}
      originY={originY}
      rotation={rotation}
      scale={scale}
      shape={shape}
      size={size}
      speed={speed}
      type={type}
      width="100%"
      worldHeight={worldHeight}
      worldWidth={worldWidth}
    />
  )
}

export function PaperDither({
  className,
  dark,
  light,
  shape = "wave",
  type = "4x4",
  size = 2,
  speed = 0.2,
  scale = 0.6,
  frame = 0,
  rotation = 0,
  offsetX = 0,
  offsetY = 0,
  fit = "cover",
  worldWidth,
  worldHeight,
  originX,
  originY,
  minPixelRatio = 1,
  maxPixelCount = 1920 * 1080,
  eager = false,
}: PaperDitherProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<"light" | "dark" | null>(null)
  const [isNearViewport, setIsNearViewport] = useState(eager)

  useEffect(() => {
    const root = document.documentElement
    const syncTheme = () => setTheme(root.classList.contains("dark") ? "dark" : "light")

    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(root, { attributeFilter: ["class"], attributes: true })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (eager) return

    const node = rootRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => setIsNearViewport(entry.isIntersecting),
      { rootMargin: "240px 0px" }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [eager])

  const colors = theme === "dark" ? dark : light

  return (
    <div ref={rootRef} aria-hidden="true" className={cn("pointer-events-none absolute z-10 overflow-hidden", className)}>
      {theme && isNearViewport ? (
        <ShaderLayer
          colors={colors}
          fit={fit}
          frame={frame}
          maxPixelCount={maxPixelCount}
          minPixelRatio={minPixelRatio}
          offsetX={offsetX}
          offsetY={offsetY}
          originX={originX}
          originY={originY}
          rotation={rotation}
          scale={scale}
          shape={shape}
          size={size}
          speed={speed}
          type={type}
          worldHeight={worldHeight}
          worldWidth={worldWidth}
        />
      ) : null}
    </div>
  )
}
