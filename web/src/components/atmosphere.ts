export interface AtmosphereLayer {
  readonly scale: number;
  readonly intensity: number;
  readonly opacity: number;
  readonly bias: number;
  readonly power: number;
}

export const ATMOSPHERE_LAYERS = [
  { scale: 1.055, intensity: 0.68, opacity: 0.38, bias: 0.72, power: 3.2 },
  { scale: 1.14, intensity: 0.22, opacity: 0.16, bias: 0.58, power: 1.65 },
] as const satisfies readonly AtmosphereLayer[];
