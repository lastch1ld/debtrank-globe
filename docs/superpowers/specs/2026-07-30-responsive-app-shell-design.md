# Responsive App Shell Design

## Goal

Correct the desktop composition so the control panel neither obscures the
globe nor sits awkwardly beneath the global navigation. Keep every control at
its intended height when the simulation produces a long ranked-country list.

## Root causes

The Three.js canvas currently fills the viewport while a fixed 380px sidebar
overlays its right edge. This hides part of the globe and turns the atmosphere
into a hard vertical cutoff.

The sidebar is one fixed-height flex column whose direct children may shrink.
The ranked list remains in the same flow as the controls, so a long result set
compresses the model tabs and pushes the control stack through the panel's
outer scroll region.

## Desktop layout

At the `sm` breakpoint and above, use a two-region application shell:

- reserve 380px on the right for the control panel while it is open;
- size and center the canvas within the remaining viewport width;
- let the global navbar end before the open panel;
- render the sidebar as its own full-height surface, with an internal top row
  and close control rather than placing it beneath the navbar;
- animate the canvas/navbar inset and the panel transform together when the
  panel opens or closes.

The globe camera and atmosphere settings remain unchanged. Reflowing the
canvas, rather than scaling the Three.js scene manually, lets React Three Fiber
recalculate its aspect ratio and preserve the complete halo.

## Sidebar layout

Divide the panel into two vertical regions:

1. a non-shrinking controls region containing the description, statistics,
   year selector, model tabs, country selector, shock magnitude, result
   summary, market check, and analysis action/chart;
2. a flexible results region whose ranked-country list owns vertical
   scrolling.

Interactive controls must use `shrink-0` or live inside the non-shrinking
region. The ranked list receives `min-h-0`, `flex-1`, and vertical overflow.
Short lists should not create a needless inner scrollbar.

## Mobile layout

Below `sm`, retain an overlay drawer because reserving most of a narrow screen
for controls would make the globe unusable. The navbar spans the viewport, and
the drawer begins below it so neither surface overlaps the other. The panel
uses the same fixed-controls/scrolling-results structure as desktop.

## Accessibility and behavior

- Preserve the existing panel toggle label and `aria-expanded` state.
- Preserve keyboard focus styles and all simulation controls.
- Do not change model calculations, data loading, globe interaction, or
  atmosphere shader values.
- Respect the existing open/close transition and avoid content jumping between
  result states.

## Verification

Add focused layout contract coverage for:

- the open desktop shell reserving the 380px panel width;
- the navbar ending before the panel on desktop;
- the mobile drawer starting below the navbar;
- non-shrinking controls and an independently scrolling ranked list.

Run the complete web test, lint, and production-build suites. Visually verify
an open panel with a long 100% distress list at desktop width and a narrow
mobile viewport.
