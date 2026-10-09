import { focus, hairline, selectedSurface } from "./classes";

export interface SegmentedToggleProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for a screen reader, e.g. "Contagion model". */
  label: string;
}

/** A row of mutually exclusive buttons. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedToggleProps<T>) {
  return (
    <div
      className={`flex overflow-hidden rounded-xl border ${hairline} bg-surface/25 p-1`}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          className={`${focus} flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition ${
            option.value === value
              ? selectedSurface
              : "text-fg-muted hover:text-fg-strong"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
