import type { SVGProps } from "react";

export function ContextMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="3 3 34 34"
      className={className}
      fill="none"
      role="img"
      aria-label="TrueMemory"
      {...props}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <path
          key={index}
          d="M20 20C16.1 17.9 13.1 14.5 12.9 10.7C12.8 8.3 14 6.1 15.8 4.5C17.8 6.8 19 9.4 19.4 12.2C19.8 15.1 20.3 17.7 20 20Z"
          fill="currentColor"
          transform={`rotate(${index * 60} 20 20)`}
        />
      ))}
      <circle cx="20" cy="20" r="3" fill="currentColor" />
    </svg>
  );
}
