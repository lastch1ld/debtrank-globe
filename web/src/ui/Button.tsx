import type { ButtonHTMLAttributes } from "react";
import { focus } from "./classes";

const SIZE = {
  xs: "px-2.5 py-1 text-[11px]",
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-[13px]",
} as const;

const TONE = {
  neutral: "text-fg-muted",
  accent: "text-accent",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: keyof typeof SIZE;
  tone?: keyof typeof TONE;
}

/** The app's one bordered text button. */
export function Button({
  size = "md",
  tone = "neutral",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${focus} rounded-xl border border-line/10 bg-surface/25 ${TONE[tone]} transition hover:border-accent/50 hover:bg-accent/5 hover:text-slate-50 disabled:cursor-default disabled:opacity-35 disabled:hover:border-line/10 disabled:hover:bg-surface/25 disabled:hover:text-fg-muted ${SIZE[size]} ${className}`}
      {...props}
    />
  );
}
