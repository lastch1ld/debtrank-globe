# Tailwind and Atmosphere Refinement Design

## Goal

Refine the Debtrank interface toward the approved “Premium Observatory” direction while
preserving its full-screen globe layout, simulation behavior, data flow, and scientific
character. Replace the application’s authored component CSS with Tailwind CSS v4 utilities and
make the globe atmosphere broader, softer, and less intense.

## Visual direction

The globe remains the dominant element. Interface chrome should feel layered and deliberate
without becoming theatrical:

- deep blue-black surfaces with subtle tonal variation;
- restrained cyan accents used for focus, active state, and data emphasis;
- clearer type hierarchy and more consistent spacing;
- softly dimensional glass panels with fine borders and controlled shadows;
- rounded controls that remain compact and information-dense;
- responsive behavior that preserves the existing mobile panel interaction.

This is a refinement of the current layout, not a structural redesign.

## Tailwind migration

Use Tailwind CSS v4 with its Vite integration. Styling should live directly in JSX utility
classes, including responsive states, hover/focus/disabled states, open-panel state, and
browser-specific range input pseudo-elements through Tailwind arbitrary variants.

`index.css` should contain only the Tailwind import and no authored selector rules. `App.css`
should be removed after all of its behavior has been represented in utilities. CSS variables
that remain useful as design tokens should be expressed through Tailwind v4 theme values or
replaced by explicit utility values.

The migration covers `App.tsx`, `YearAnalysisChart.tsx`, and any other rendered web component
that currently depends on application CSS. It must not alter component state, simulation
logic, loading behavior, chart calculations, or accessibility attributes.

## Globe atmosphere

Replace the single strong atmosphere shell with two independently controlled Fresnel shells:

1. An inner shell close to the globe provides a faint, defined cyan rim.
2. A larger outer shell provides a broad, low-opacity falloff.

Both shells use additive blending, remain transparent, do not write depth, and render on the
back side so the glow stays outside the planet silhouette. The outer shell uses a gentler
Fresnel exponent and lower intensity than the inner shell. The result should read as a gradual
atmosphere rather than a bright outline.

No post-processing bloom dependency will be introduced. This avoids applying glow to country
markers, arcs, and other bright scene elements.

## Component behavior and accessibility

Existing interactions remain unchanged:

- the menu toggles the control panel and keeps its current accessible name and expanded state;
- all model, year, country, magnitude, reset, and analysis controls keep their behavior;
- keyboard focus remains clearly visible;
- disabled controls remain visibly distinct;
- the panel continues to scroll independently when its content exceeds the viewport;
- mobile and desktop layouts remain usable without covering essential controls.

## Verification

Implementation is complete when:

- no component imports `App.css`;
- `App.css` is removed;
- `index.css` contains only the Tailwind import;
- Tailwind produces the full interface styling, including range thumbs;
- the two atmosphere layers render without obscuring the globe or brightening unrelated scene
  objects;
- existing web tests pass;
- lint, TypeScript compilation, and the production Vite build pass;
- a local visual check confirms the panel open/closed states, responsive layout, focus states,
  range controls, and the broader/fainter globe glow.

## Out of scope

- simulation or financial-model changes;
- data-pipeline changes;
- new controls or analytical features;
- post-processing bloom;
- deployment or publishing;
- unrelated component refactoring.
