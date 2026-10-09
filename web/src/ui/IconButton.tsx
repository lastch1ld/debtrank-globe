import type { ButtonHTMLAttributes } from "react";
import { focus } from "./classes";

const SIZE = {
  // The bordered 36px square used for the navbar and the drawer.
  md: "size-9 rounded-xl border border-line/10 bg-surface/25 hover:border-accent/50",
  // A borderless 24px target inside a row.
  sm: "size-6 shrink-0 rounded-md",
} as const;

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: keyof typeof SIZE;
  /** Required: an icon has no text for a screen reader to read. */
  "aria-label": string;
}

export function IconButton({
  size = "md",
  className = "",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`${focus} flex cursor-pointer items-center justify-center text-fg-muted transition hover:bg-accent/5 hover:text-fg-strong ${SIZE[size]} ${className}`}
      {...props}
    />
  );
}
