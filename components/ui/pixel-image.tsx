"use client"

import { useMemo } from "react"

import { cn } from "@/lib/utils"

type Grid = {
  rows: number
  cols: number
}

const DEFAULT_GRIDS: Record<string, Grid> = {
  "6x4": { rows: 4, cols: 6 },
  "8x8": { rows: 8, cols: 8 },
  "8x3": { rows: 3, cols: 8 },
  "4x6": { rows: 6, cols: 4 },
  "3x8": { rows: 8, cols: 3 },
}

type PredefinedGridKey = keyof typeof DEFAULT_GRIDS

interface PixelImageProps {
  src: string
  grid?: PredefinedGridKey
  customGrid?: Grid
  grayscaleAnimation?: boolean
  pixelFadeInDuration?: number // in ms
  maxAnimationDelay?: number // in ms
  colorRevealDelay?: number // in ms
}

export const PixelImage = ({
  src,
  grid = "6x4",
  grayscaleAnimation = true,
  pixelFadeInDuration = 1000,
  maxAnimationDelay = 1200,
  colorRevealDelay = 1300,
  customGrid,
}: PixelImageProps) => {
  const MIN_GRID = 1
  const MAX_GRID = 16

  const { rows, cols } = useMemo(() => {
    const isValidGrid = (grid?: Grid) => {
      if (!grid) return false
      const { rows, cols } = grid
      return (
        Number.isInteger(rows) &&
        Number.isInteger(cols) &&
        rows >= MIN_GRID &&
        cols >= MIN_GRID &&
        rows <= MAX_GRID &&
        cols <= MAX_GRID
      )
    }

    return isValidGrid(customGrid) ? customGrid! : DEFAULT_GRIDS[grid]
  }, [customGrid, grid])

  const pieces = useMemo(() => {
    const total = rows * cols
    return Array.from({ length: total }, (_, index) => {
      const row = Math.floor(index / cols)
      const col = index % cols

      const clipPath = `polygon(
        ${col * (100 / cols)}% ${row * (100 / rows)}%,
        ${(col + 1) * (100 / cols)}% ${row * (100 / rows)}%,
        ${(col + 1) * (100 / cols)}% ${(row + 1) * (100 / rows)}%,
        ${col * (100 / cols)}% ${(row + 1) * (100 / rows)}%
      )`

      const delay = getDeterministicDelay({
        src,
        index,
        rows,
        cols,
        maxAnimationDelay,
      })

      return {
        clipPath,
        delay,
      }
    })
  }, [rows, cols, maxAnimationDelay, src])

  return (
    <div className="relative h-72 w-72 select-none md:h-96 md:w-96">
      {pieces.map((piece, index) => (
        <div
          key={index}
          className="absolute inset-0 opacity-0"
          style={{
            clipPath: piece.clipPath,
            animationName: "pixel-image-fade-in",
            animationDelay: `${piece.delay}ms`,
            animationDuration: `${pixelFadeInDuration}ms`,
            animationTimingFunction: "ease-out",
            animationFillMode: "forwards",
          }}
        >
          <img
            src={src}
            alt={`Pixel image piece ${index + 1}`}
            className={cn(
              "z-1 rounded-[2.5rem] object-cover",
              grayscaleAnimation ? "grayscale" : "grayscale-0"
            )}
            style={{
              animationName: grayscaleAnimation
                ? "pixel-image-color-reveal"
                : "none",
              animationDelay: `${colorRevealDelay}ms`,
              animationDuration: `${pixelFadeInDuration}ms`,
              animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
              animationFillMode: "forwards",
            }}
            draggable={false}
          />
        </div>
      ))}
    </div>
  )
}

function getDeterministicDelay({
  src,
  index,
  rows,
  cols,
  maxAnimationDelay,
}: {
  src: string
  index: number
  rows: number
  cols: number
  maxAnimationDelay: number
}) {
  const seed = `${src}:${rows}:${cols}:${index}`
  let hash = 0

  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }

  return (hash / 0xffffffff) * maxAnimationDelay
}
