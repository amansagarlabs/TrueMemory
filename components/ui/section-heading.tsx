import { cn } from "@/lib/utils"

interface SectionHeadingProps {
  eyebrow: string
  title: string
  text?: string
  align?: "left" | "center"
}

export function SectionHeading({
  eyebrow,
  title,
  text,
  align = "center",
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center",
        align === "left" && "text-left"
      )}
    >
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f6821f]">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {text && (
        <p className="mt-4 max-w-2xl text-pretty text-[15px] leading-7 text-[#686e64] dark:text-[#aeb6ad]">
          {text}
        </p>
      )}
    </div>
  )
}
