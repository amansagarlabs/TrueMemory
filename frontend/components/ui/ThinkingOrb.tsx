import type { CSSProperties } from "react";

export type ThinkingOrbVariant = "v1" | "v2";

const CELLS = Array.from({ length: 9 }, (_, index) => index);

export function ThinkingOrb({
  variant = "v1",
  size = "md",
  className = "",
}: {
  variant?: ThinkingOrbVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={`thinking-orb thinking-orb-${size} ${className}`}
      data-variant={variant}
      aria-hidden="true"
    >
      {CELLS.map((cell) => (
        <span
          key={cell}
          className="thinking-orb-cell"
          style={{ "--orb-index": cell } as CSSProperties}
        />
      ))}
    </span>
  );
}
