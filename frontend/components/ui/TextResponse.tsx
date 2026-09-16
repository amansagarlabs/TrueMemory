import type { ReactNode } from "react";

export function TextResponse({
  children,
  streaming = false,
}: {
  children?: ReactNode;
  streaming?: boolean;
}) {
  return (
    <div className="text-response" aria-live={streaming ? "polite" : undefined} aria-busy={streaming || undefined}>
      {children}
      {streaming ? <span className="streaming-text-caret" aria-hidden="true" /> : null}
    </div>
  );
}
