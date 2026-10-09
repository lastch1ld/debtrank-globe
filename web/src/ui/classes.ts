// Class strings shared by the primitives and by the app. Moved here from
// App.tsx unchanged; they only use the token utilities from tokens.css.

export const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// The panel had grown nine type sizes and three letter-spacings for what is
// really four roles. These are those four, plus the one hairline weight the
// whole surface is drawn with.
export const hairline = "border-line/10";
export const sectionLabel =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle";
export const note = "text-[11px] leading-4 text-fg-subtle";

/** A selected segment or tab. */
export const selectedSurface =
  "bg-accent/12 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.2)]";
