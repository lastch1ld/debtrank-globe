import type { HTMLAttributes } from "react";
import { hairline, sectionLabel } from "./classes";

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** A small-caps heading. Leave it out when the panel draws its own header. */
  title?: string;
}

/** A section of the controls column: a hairline above, a gap between rows. */
export function Panel({
  title,
  className = "",
  children,
  ...props
}: PanelProps) {
  return (
    <section
      className={`flex shrink-0 flex-col gap-3 border-t ${hairline} pt-4 ${className}`}
      {...props}
    >
      {title && <h2 className={sectionLabel}>{title}</h2>}
      {children}
    </section>
  );
}
