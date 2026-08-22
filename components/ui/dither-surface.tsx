import type { CSSProperties, ReactNode } from "react"

import { PaperDither, type DitherShape } from "@/components/ui/paper-dither"
import { cn } from "@/lib/utils"

export type DitherTone = "orange" | "citrus" | "sage" | "midnight"

const toneClasses: Record<DitherTone, string> = {
  orange:
    "bg-[radial-gradient(circle_at_78%_24%,rgba(255,189,92,0.96)_0%,rgba(245,112,35,0.74)_24%,transparent_56%),linear-gradient(135deg,#6f2414_0%,#e35d1c_54%,#f59b3f_100%)]",
  citrus:
    "bg-[radial-gradient(circle_at_74%_20%,rgba(255,244,127,0.96)_0%,rgba(224,192,50,0.72)_28%,transparent_58%),linear-gradient(135deg,#343721_0%,#777b35_48%,#f2cf48_100%)]",
  sage:
    "bg-[radial-gradient(circle_at_78%_22%,rgba(207,224,194,0.9)_0%,rgba(83,116,88,0.62)_28%,transparent_58%),linear-gradient(135deg,#18251c_0%,#3f644a_52%,#b8c96b_100%)]",
  midnight:
    "bg-[radial-gradient(circle_at_76%_18%,rgba(245,218,82,0.9)_0%,rgba(72,75,125,0.68)_26%,transparent_58%),linear-gradient(135deg,#101427_0%,#25294d_50%,#55506f_100%)]",
}

const toneShaders: Record<
  DitherTone,
  {
    wave: {
      light: { colorBack: string; colorFront: string }
      dark: { colorBack: string; colorFront: string }
    }
    sphere: {
      light: { colorBack: string; colorFront: string }
      dark: { colorBack: string; colorFront: string }
    }
  }
> = {
  orange: {
    wave: {
      light: { colorBack: "#f7d4ab", colorFront: "#7f3215" },
      dark: { colorBack: "#100d09", colorFront: "#c25316" },
    },
    sphere: {
      light: { colorBack: "#00000000", colorFront: "#ff7b24" },
      dark: { colorBack: "#00000000", colorFront: "#df3f00" },
    },
  },
  citrus: {
    wave: {
      light: { colorBack: "#f0ec9f", colorFront: "#5f631e" },
      dark: { colorBack: "#121309", colorFront: "#c5ba4a" },
    },
    sphere: {
      light: { colorBack: "#00000000", colorFront: "#f2d94f" },
      dark: { colorBack: "#00000000", colorFront: "#e8dc62" },
    },
  },
  sage: {
    wave: {
      light: { colorBack: "#d8e3d2", colorFront: "#47684f" },
      dark: { colorBack: "#0f1511", colorFront: "#7da36f" },
    },
    sphere: {
      light: { colorBack: "#00000000", colorFront: "#8cb67b" },
      dark: { colorBack: "#00000000", colorFront: "#6f9361" },
    },
  },
  midnight: {
    wave: {
      light: { colorBack: "#d3d0b2", colorFront: "#535c97" },
      dark: { colorBack: "#0c0f1a", colorFront: "#ddc658" },
    },
    sphere: {
      light: { colorBack: "#00000000", colorFront: "#7d81c7" },
      dark: { colorBack: "#00000000", colorFront: "#f0dd61" },
    },
  },
}

const toneShapes: Record<DitherTone, { field: DitherShape; accent: DitherShape }> = {
  orange: { field: "wave", accent: "sphere" },
  citrus: { field: "ripple", accent: "dots" },
  sage: { field: "warp", accent: "swirl" },
  midnight: { field: "simplex", accent: "sphere" },
}

interface DitherTextureProps {
  className?: string
  tone?: DitherTone
  opacity?: number
}

export function DitherTexture({
  className,
  tone = "orange",
  opacity = 0.72,
}: DitherTextureProps) {
  const style = { "--dither-texture-opacity": opacity } as CSSProperties
  const shader = toneShaders[tone]
  const shapes = toneShapes[tone]

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        toneClasses[tone],
        className
      )}
      style={style}
    >
      <PaperDither
        className="inset-0 opacity-[var(--dither-texture-opacity)]"
        dark={shader.wave.dark}
        light={shader.wave.light}
        maxPixelCount={1600 * 900}
        scale={0.78}
        shape={shapes.field}
        size={2}
        speed={0.18}
        type="4x4"
      />
      <PaperDither
        className="left-auto right-[4%] top-[8%] h-[72%] w-[38%]"
        dark={shader.sphere.dark}
        light={shader.sphere.light}
        frame={5000 * 120}
        maxPixelCount={900 * 900}
        scale={0.52}
        shape={shapes.accent}
        size={3}
        speed={shapes.accent === "sphere" ? 0 : 0.1}
        type="4x4"
      />
      <div className="absolute inset-0 opacity-[var(--dither-texture-opacity)] [background-image:radial-gradient(rgba(8,10,8,0.94)_0.65px,transparent_0.8px)] [background-position:0_0] [background-size:4px_4px] [mask-image:radial-gradient(ellipse_at_68%_38%,black_5%,rgba(0,0,0,0.92)_38%,transparent_82%)]" />
      <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(rgba(255,239,164,0.84)_0.55px,transparent_0.72px)] [background-position:2px_2px] [background-size:5px_5px] [mask-image:radial-gradient(ellipse_at_24%_78%,black_4%,rgba(0,0,0,0.84)_34%,transparent_76%)]" />
      <div className="absolute -bottom-[38%] right-[4%] size-[70%] rounded-full bg-black/45 [background-image:radial-gradient(rgba(255,149,48,0.7)_0.7px,transparent_0.85px)] [background-size:4px_4px] [mask-image:radial-gradient(circle,black_28%,transparent_72%)]" />
    </div>
  )
}

interface DitherSurfaceProps {
  children: ReactNode
  className?: string
  contentClassName?: string
  tone?: DitherTone
  textureOpacity?: number
}

export function DitherSurface({
  children,
  className,
  contentClassName,
  tone = "orange",
  textureOpacity,
}: DitherSurfaceProps) {
  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      <DitherTexture opacity={textureOpacity} tone={tone} />
      <div className={cn("relative z-10", contentClassName)}>{children}</div>
    </div>
  )
}
