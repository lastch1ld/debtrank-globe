import type { Model } from "./analysis";
import { YEARS, countries } from "./network";

export interface Scenario {
  year: number;
  shockId: string;
  magnitude: number;
  model: Model;
}

const MAGNITUDE_MIN = 0.05;
const MAGNITUDE_MAX = 1;

/** Reads a scenario out of the current URL's query string, or null if
 * absent/invalid -- never throws, so a hand-edited or stale link just falls
 * through to normal defaults instead of crashing the app. */
export function parseScenarioFromUrl(): Scenario | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const yearRaw = params.get("year");
  const shockId = params.get("shock");
  const magnitudeRaw = params.get("magnitude");
  const modelRaw = params.get("model");
  if (!yearRaw || !shockId || !magnitudeRaw || !modelRaw) return null;

  const year = Number(yearRaw);
  if (!YEARS.includes(year)) return null;

  if (!countries.some((c) => c.id === shockId)) return null;

  const magnitude = Number(magnitudeRaw);
  if (!Number.isFinite(magnitude) || magnitude < MAGNITUDE_MIN || magnitude > MAGNITUDE_MAX) return null;

  if (modelRaw !== "debtrank" && modelRaw !== "eisenberg-noe") return null;

  return { year, shockId, magnitude, model: modelRaw };
}

/** Mirrors the current scenario into the URL via replaceState (not
 * pushState) so dragging the magnitude slider doesn't spam browser
 * back-history -- the address bar stays a live, copyable link regardless. */
export function writeScenarioToUrl(scenario: Scenario): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  params.set("year", String(scenario.year));
  params.set("shock", scenario.shockId);
  params.set("magnitude", scenario.magnitude.toFixed(2));
  params.set("model", scenario.model);
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

export function clearScenarioFromUrl(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname);
}
