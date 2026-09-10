import type { Model, ShockSpec } from "./analysis";
import { YEARS, countries } from "./network";

export interface Scenario {
  year: number;
  /** At least one entry; the first is the primary shock. */
  shocks: ShockSpec[];
  model: Model;
  /** Whether the IMF CPIS portfolio layer was switched on. Part of the
   * scenario because it changes which edges the models propagate through,
   * so a link that drops it reproduces a different result than the one
   * that was shared. */
  includePortfolio: boolean;
}

const MAGNITUDE_MIN = 0.05;
const MAGNITUDE_MAX = 1;
// A shock arriving later than the cascade itself runs is indistinguishable
// from one that never arrives, and an unbounded value from a URL would just
// spin the engine's loop.
export const MAX_DELAY = 20;

/** Chrome-less rendering for `?embed=1`: no nav, no controls panel, just
 * the globe and a caption. The scenario parameters already make any view
 * reproducible from a URL, so an embed needs nothing beyond a flag saying
 * "don't draw the application around it". Read separately from
 * parseScenarioFromUrl because it is orthogonal -- an embed with no
 * scenario is a perfectly good idle globe. */
export function isEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("embed") === "1";
}

/** Reads a scenario out of the current URL's query string, or null if
 * absent/invalid -- never throws, so a hand-edited or stale link just falls
 * through to normal defaults instead of crashing the app. */
export function parseScenarioFromUrl(): Scenario | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const yearRaw = params.get("year");
  const shockRaw = params.get("shock");
  const modelRaw = params.get("model");
  if (!yearRaw || !shockRaw || !modelRaw) return null;

  const year = Number(yearRaw);
  if (!YEARS.includes(year)) return null;

  if (modelRaw !== "debtrank" && modelRaw !== "eisenberg-noe") return null;

  const shocks = parseShocks(shockRaw, params.get("magnitude"));
  if (shocks.length === 0) return null;

  // Optional, unlike the rest: links shared before this parameter existed
  // are still valid and mean the toggle was off.
  const includePortfolio = params.get("portfolio") === "1";

  return { year, shocks, model: modelRaw, includePortfolio };
}

/** `GRC:1.00,PRT:0.60@2` -- id, magnitude, and an optional arrival round.
 * A bare `GRC` is the pre-multi-shock form, whose magnitude lived in its own
 * `magnitude` parameter; those links still work and still mean one shock. */
function parseShocks(raw: string, legacyMagnitude: string | null): ShockSpec[] {
  const out: ShockSpec[] = [];
  const seen = new Set<string>();

  for (const part of raw.split(",")) {
    const [idPart, rest] = part.split(":");
    const id = idPart.trim();
    if (!id || seen.has(id) || !countries.some((c) => c.id === id)) continue;

    const [magRaw, delayRaw] = (rest ?? legacyMagnitude ?? "").split("@");
    const magnitude = Number(magRaw);
    if (!Number.isFinite(magnitude) || magnitude < MAGNITUDE_MIN || magnitude > MAGNITUDE_MAX) continue;

    const delay = delayRaw === undefined ? 0 : Number(delayRaw);
    if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DELAY) continue;

    seen.add(id);
    out.push({ id, magnitude, delay });
  }
  return out;
}

/** Mirrors the current scenario into the URL via replaceState (not
 * pushState) so dragging the magnitude slider doesn't spam browser
 * back-history -- the address bar stays a live, copyable link regardless. */
export function writeScenarioToUrl(scenario: Scenario): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  params.set("year", String(scenario.year));
  params.set(
    "shock",
    scenario.shocks
      .map((s) => `${s.id}:${s.magnitude.toFixed(2)}${s.delay > 0 ? `@${s.delay}` : ""}`)
      .join(","),
  );
  params.set("model", scenario.model);
  if (scenario.includePortfolio) params.set("portfolio", "1");
  // Carried through every rewrite: the flag is read at load, so dropping it
  // here would un-embed the page on the viewer's next refresh.
  if (isEmbedded()) params.set("embed", "1");
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

export function clearScenarioFromUrl(): void {
  if (typeof window === "undefined") return;
  const suffix = isEmbedded() ? "?embed=1" : "";
  window.history.replaceState(null, "", `${window.location.pathname}${suffix}`);
}

/** The same view in the full application, for the embed's "open in" link.
 * Built from `window.location` rather than a stored scenario so it carries
 * whatever the viewer has since changed inside the iframe. */
export function fullAppUrl(): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.delete("embed");
  return url.toString();
}
