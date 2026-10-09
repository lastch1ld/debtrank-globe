import type { HTMLAttributes } from "react";

export interface DrawerProps extends HTMLAttributes<HTMLElement> {
  open: boolean;
}

/** A panel that slides in from the right. The caller supplies its geometry
 * (offset, width, padding, gap) through `className`; this owns the surface
 * and the slide. While closed it is `inert`, so its controls can't be
 * reached by Tab or a screen reader from off-screen. */
export function Drawer({ open, className = "", ...props }: DrawerProps) {
  return (
    <aside
      inert={!open}
      className={`fixed bottom-0 right-0 z-30 flex min-h-0 flex-col overflow-hidden border-l border-line/10 bg-[linear-gradient(160deg,rgba(10,23,39,0.985),rgba(2,7,15,0.98))] shadow-[-24px_0_100px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
        open ? "translate-x-0" : "translate-x-full"
      } ${className}`}
      {...props}
    />
  );
}
