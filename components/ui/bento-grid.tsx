import { type ComponentPropsWithoutRef, type ReactNode } from "react"
import { ArrowRightIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DitherTexture, type DitherTone } from "@/components/ui/dither-surface"

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode
  className?: string
}

interface BentoCardProps extends ComponentPropsWithoutRef<"div"> {
  name: string
  className: string
  background: ReactNode
  Icon?: React.ElementType
  layout?: "default" | "wide" | "reverse"
  description: string
  href: string
  cta: string
  ditherTone?: DitherTone
  eyebrow?: string
  featured?: boolean
  headingLevel?: 2 | 3
}

const BentoGrid = ({ children, className, ...props }: BentoGridProps) => {
  return (
    <div
      className={cn(
        "grid w-full auto-rows-[22rem] grid-cols-3 gap-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const BentoCard = ({
  name,
  className,
  background,
  Icon,
  layout = "default",
  description,
  href,
  cta,
  ditherTone = "orange",
  eyebrow,
  featured = false,
  headingLevel = 3,
  ...props
}: BentoCardProps) => {
  const Heading = headingLevel === 2 ? "h2" : "h3"

  return (
    <article
      key={name}
      className={cn(
        "group relative col-span-3 flex flex-col justify-end overflow-hidden rounded-[24px] transition-[border-color,box-shadow,transform] duration-200 ease-out",
        "border border-[#d8ded9] bg-white [box-shadow:0_1px_2px_rgba(15,23,42,.04),0_18px_42px_-30px_rgba(0,0,0,.18)] hover:-translate-y-px hover:border-[#b9c7c0] hover:[box-shadow:0_2px_4px_rgba(15,23,42,.05),0_24px_54px_-32px_rgba(0,0,0,.24)]",
        "dark:border-white/10 dark:bg-[#11140f] dark:[box-shadow:0_1px_0_rgba(255,255,255,.02)] dark:hover:border-white/20 dark:hover:[box-shadow:0_18px_48px_-32px_rgba(246,130,31,.28)]",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden">
        {background}
        <DitherTexture
          className="opacity-55 mix-blend-multiply dark:opacity-70 dark:mix-blend-screen"
          opacity={0.72}
          tone={ditherTone}
        />
      </div>
      <div
        className={cn(
          "relative z-10 mt-auto min-h-[9.5rem] border-t border-[#d8ded9]/80 bg-[#fafbf6]/94 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d100d]/94 sm:p-6",
          layout === "wide" &&
            "lg:mr-[56%] lg:flex lg:min-h-full lg:flex-col lg:justify-center lg:border-r lg:border-t-0",
          layout === "reverse" &&
            "lg:ml-[56%] lg:flex lg:min-h-full lg:flex-col lg:justify-center lg:border-l lg:border-t-0"
        )}
      >
      <div className="pointer-events-none flex flex-col gap-1.5">
        {eyebrow ? (
          <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a6480c] dark:text-[#f6821f]">
            {eyebrow}
          </p>
        ) : null}
        {Icon ? (
          <Icon className="mb-1 size-6 text-[#315a50] dark:text-[#CAE0DA]" />
        ) : null}
        <Heading
          className={cn(
            "font-semibold tracking-[-0.035em] text-[#171a15] dark:text-[#f2f5ef]",
            featured ? "text-2xl leading-tight sm:text-3xl" : "text-lg sm:text-xl"
          )}
        >
          {name}
        </Heading>
        <p className="max-w-lg text-sm leading-6 text-[#626a61] dark:text-[#aeb6ad]">{description}</p>
      </div>

      <Button
        variant="link"
        size="sm"
        className="mt-2 min-h-11 p-0 text-[#315a50] decoration-transparent hover:text-[#171a15] dark:text-[#CAE0DA] dark:hover:text-white"
        render={<a href={href} />}
        nativeButton={false}
      >
        {cta}
        <ArrowRightIcon className="ms-2 size-4 rtl:rotate-180" />
      </Button>
      </div>
    </article>
  )
}

export { BentoCard, BentoGrid }
