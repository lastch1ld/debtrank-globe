import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { focus, selectedSurface } from "./classes";
import { nextTabIndex } from "./tabKeys";

export interface TabItem {
  id: string;
  label: string;
}

const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

export interface TabsProps {
  tabs: readonly TabItem[];
  /** Controlled: the app owns the selection, so it can mirror it in the URL. */
  value: string;
  onChange: (id: string) => void;
  label: string;
  /** Ties each tab to its `TabPanel`; unique per Tabs on a page. */
  idPrefix: string;
}

/** A tab bar. Arrow keys move and select (roving tabindex); the bar scrolls
 * sideways on a narrow screen instead of wrapping. */
export function Tabs({ tabs, value, onChange, label, idPrefix }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const next = nextTabIndex(event.key, index, tabs.length);
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={tabId(idPrefix, tab.id)}
            aria-selected={selected}
            aria-controls={panelId(idPrefix, tab.id)}
            tabIndex={selected ? 0 : -1}
            className={`${focus} shrink-0 cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition ${
              selected ? selectedSurface : "text-fg-muted hover:text-fg-strong"
            }`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  idPrefix,
  active,
  children,
}: {
  id: string;
  idPrefix: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={panelId(idPrefix, id)}
      aria-labelledby={tabId(idPrefix, id)}
      hidden={!active}
    >
      {children}
    </div>
  );
}
