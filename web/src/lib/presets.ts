import type { Model } from "./analysis";

export interface Preset {
  id: string;
  label: string;
  year: number;
  countryId: string;
  magnitude: number;
  model: Model;
}

/** Real, in-range (2005-2025) events with a defensible single-country
 * proxy. Magnitudes are round, illustrative numbers, not empirically
 * calibrated to actual losses -- see the caption next to the picker in
 * App.tsx. Caveats that apply to a specific preset (e.g. COVID being a
 * globally synchronized shock, not a single-country default) are folded
 * into the label itself rather than a separate note field, so they're
 * visible without extra UI state. */
export const PRESETS: Preset[] = [
  { id: "gfc-2008", label: "2008 Global Financial Crisis (US)", year: 2008, countryId: "USA", magnitude: 0.6, model: "debtrank" },
  { id: "greece-2010", label: "2010 Greek debt crisis", year: 2010, countryId: "GRC", magnitude: 0.5, model: "debtrank" },
  { id: "china-2015", label: "2015-16 China slowdown", year: 2015, countryId: "CHN", magnitude: 0.4, model: "debtrank" },
  { id: "covid-2020", label: "2020 COVID shock (Italy, stand-in)", year: 2020, countryId: "ITA", magnitude: 0.5, model: "debtrank" },
];
