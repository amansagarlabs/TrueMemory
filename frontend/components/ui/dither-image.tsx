"use client"

import Image, { type ImageProps } from "next/image"
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentProps,
  type CSSProperties,
  type HTMLAttributes,
} from "react"

import { cn } from "@/lib/utils"

export type DitherSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl"

const DITHER_SIZE_CLASS: Record<DitherSize, string> = {
  xs: "dither-xs",
  sm: "dither-sm",
  md: "dither-md",
  lg: "dither-lg",
  xl: "dither-xl",
  "2xl": "dither-2xl",
}

export type DitherAspectRatio =
  | "square"
  | "video"
  | "portrait"
  | "wide"
  | (string & {})
  | number

function resolveAspectRatio(ratio: DitherAspectRatio): string {
  if (typeof ratio === "number") return String(ratio)
  if (ratio === "square") return "1 / 1"
  if (ratio === "video") return "16 / 9"
  if (ratio === "portrait") return "3 / 4"
  if (ratio === "wide") return "21 / 9"
  return ratio
}

interface DitherVars {
  "--dither-gray"?: number | string
  "--dither-contrast"?: number | string
  "--dither-bright"?: number | string
  "--dither-blur"?: string
  "--dither-cell"?: string
  "--dither-opacity"?: number | string
  "--dither-image"?: string
}

const DitherImageFrameContext = createContext<{ invertOnDark: boolean } | null>(
  null
)

export type DitherImageProps = ComponentProps<"figure">

const DitherImage = forwardRef<HTMLElement, DitherImageProps>(
  function DitherImage({ className, ...props }, ref) {
    return (
      <figure
        className={cn("inline-flex flex-col gap-3", className)}
        data-slot="dither-image"
        ref={ref}
        {...props}
      />
    )
  }
)
DitherImage.displayName = "DitherImage"

export interface DitherImageFrameProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  size?: DitherSize
  aspectRatio?: DitherAspectRatio
  grayscale?: number
  contrast?: number
  brightness?: number
  blur?: number | string
  opacity?: number
  rounded?: boolean | string
  invertOnDark?: boolean
  style?: CSSProperties & DitherVars
}

const DitherImageFrame = forwardRef<HTMLDivElement, DitherImageFrameProps>(
  function DitherImageFrame(
    {
      className,
      size = "lg",
      aspectRatio,
      grayscale,
      contrast,
      brightness,
      blur,
      opacity,
      rounded = true,
      invertOnDark = false,
      style,
      ...props
    },
    ref
  ) {
    const vars: CSSProperties & DitherVars = { ...style }

    if (grayscale !== undefined) vars["--dither-gray"] = grayscale
    if (contrast !== undefined) vars["--dither-contrast"] = contrast
    if (brightness !== undefined) vars["--dither-bright"] = brightness
    if (blur !== undefined) {
      vars["--dither-blur"] = typeof blur === "number" ? `${blur}px` : blur
    }
    if (opacity !== undefined) vars["--dither-opacity"] = opacity
    if (aspectRatio !== undefined && vars.aspectRatio === undefined) {
      vars.aspectRatio = resolveAspectRatio(aspectRatio)
    }

    const roundedClass =
      rounded === true
        ? "rounded-xl"
        : typeof rounded === "string"
          ? rounded
          : undefined

    const frame = (
      <div
        className={cn(
          DITHER_SIZE_CLASS[size],
          "relative block w-full",
          roundedClass,
          className
        )}
        data-size={size}
        data-slot="dither-image-frame"
        ref={ref}
        style={vars}
        {...props}
      />
    )

    return (
      <DitherImageFrameContext.Provider value={{ invertOnDark }}>
        {invertOnDark ? <div className="invert">{frame}</div> : frame}
      </DitherImageFrameContext.Provider>
    )
  }
)
DitherImageFrame.displayName = "DitherImageFrame"

export type DitherImageRevealProps = ComponentProps<"div">

const DitherImageReveal = forwardRef<HTMLDivElement, DitherImageRevealProps>(
  function DitherImageReveal({ className, ...props }, ref) {
    return (
      <div
        className={cn("relative overflow-hidden", className)}
        data-slot="dither-image-reveal"
        ref={ref}
        {...props}
      />
    )
  }
)
DitherImageReveal.displayName = "DitherImageReveal"

export type DitherRevealDirection =
  | "l"
  | "r"
  | "t"
  | "b"
  | "tl-br"
  | "tr-bl"
  | "bl-tr"
  | "br-tl"
  | "radial"

export type DitherImageOverlayProps = Omit<ImageProps, "style"> & {
  direction?: DitherRevealDirection
  from?: number
  to?: number
  maskClassName?: string
  style?: CSSProperties
}

function revealMaskImage(
  direction: DitherRevealDirection,
  from: number,
  to: number
): string {
  const a = Math.min(from, to)
  const b = Math.max(from, to)
  const gradients: Record<DitherRevealDirection, string> = {
    r: `linear-gradient(to right, black ${a}%, transparent ${b}%)`,
    l: `linear-gradient(to left, black ${a}%, transparent ${b}%)`,
    t: `linear-gradient(to bottom, black ${a}%, transparent ${b}%)`,
    b: `linear-gradient(to top, black ${a}%, transparent ${b}%)`,
    "tl-br": `linear-gradient(to bottom right, black ${a}%, transparent ${b}%)`,
    "tr-bl": `linear-gradient(to bottom left, black ${a}%, transparent ${b}%)`,
    "bl-tr": `linear-gradient(to top right, black ${a}%, transparent ${b}%)`,
    "br-tl": `linear-gradient(to top left, black ${a}%, transparent ${b}%)`,
    radial: `radial-gradient(circle at center, black ${a}%, transparent ${b}%)`,
  }
  return gradients[direction]
}

const DitherImageOverlay = forwardRef<
  HTMLImageElement,
  DitherImageOverlayProps
>(function DitherImageOverlay(
  {
    alt,
    className,
    direction = "r",
    from = 0,
    to = 65,
    maskClassName,
    style,
    ...props
  },
  ref
) {
  const maskImage = revealMaskImage(direction, from, to)
  const typedMaskStyle: CSSProperties =
    maskClassName === undefined
      ? {
          WebkitMaskImage: maskImage,
          maskImage,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        }
      : {}

  return (
    <Image
      alt={alt}
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full object-cover",
        maskClassName,
        className
      )}
      data-slot="dither-image-overlay"
      ref={ref}
      style={{ ...typedMaskStyle, ...style }}
      {...props}
    />
  )
})
DitherImageOverlay.displayName = "DitherImageOverlay"

export type DitherImageContentProps = ImageProps

const DitherImageContent = forwardRef<
  HTMLImageElement,
  DitherImageContentProps
>(function DitherImageContent({ className, alt, ...props }, ref) {
  const context = useContext(DitherImageFrameContext)

  return (
    <Image
      alt={alt}
        className={cn(
          "block h-full w-full object-cover",
        context?.invertOnDark && "invert",
        className
      )}
      data-slot="dither-image-content"
      ref={ref}
      {...props}
    />
  )
})
DitherImageContent.displayName = "DitherImageContent"

export type DitherImageCaptionProps = ComponentProps<"figcaption">

const DitherImageCaption = forwardRef<HTMLElement, DitherImageCaptionProps>(
  function DitherImageCaption({ className, ...props }, ref) {
    return (
      <figcaption
        className={cn(
          "text-pretty text-sm leading-relaxed text-muted-foreground",
          className
        )}
        data-slot="dither-image-caption"
        ref={ref}
        {...props}
      />
    )
  }
)
DitherImageCaption.displayName = "DitherImageCaption"

export {
  DitherImage,
  DitherImageCaption,
  DitherImageContent,
  DitherImageFrame,
  DitherImageOverlay,
  DitherImageReveal,
}
