import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../../ui/cn";

export type RailPanels = { bestNights: ReactNode; players: ReactNode; sessions: ReactNode };

type Tab = keyof RailPanels;

const tabs: { id: Tab; label: string }[] = [
  { id: "bestNights", label: "Best nights" },
  { id: "players", label: "Players" },
  { id: "sessions", label: "Sessions" },
];

export function GroupRail({
  wide,
  rosterEmpty,
  shareLink,
  dayPanel,
  panels,
}: {
  wide: boolean;
  rosterEmpty: boolean;
  shareLink: ReactNode;
  dayPanel: ReactNode;
  panels: RailPanels;
}) {
  if (!wide) return <PhoneRail panels={panels} firstTab={rosterEmpty ? "players" : "bestNights"} />;
  return (
    <aside aria-label="Group overview" className="flex flex-col gap-4">
      {shareLink}
      {dayPanel}
      {panels.bestNights}
      {panels.sessions}
      {panels.players}
    </aside>
  );
}

function PhoneRail({ panels, firstTab }: { panels: RailPanels; firstTab: Tab }) {
  const [active, setActive] = useState(firstTab);
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  const baseId = useId();
  const tabId = (tab: Tab) => `${baseId}-tab-${tab}`;
  const panelId = `${baseId}-panel`;

  const moveTo = (tab: Tab) => {
    setActive(tab);
    tabRefs.current.get(tab)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const next = neighbour(active, event.key);
    if (next === null) return;
    event.preventDefault();
    moveTo(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Group overview"
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 rounded-md bg-surface-2 p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(button) => {
              if (button) tabRefs.current.set(tab.id, button);
              else tabRefs.current.delete(tab.id);
            }}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            aria-controls={panelId}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => setActive(tab.id)}
            className={cn(
              "rounded-sm py-1.5 text-sm font-semibold transition-colors",
              tab.id === active ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(active)}>
        {panels[active]}
      </div>
    </div>
  );
}

function neighbour(current: Tab, key: string): Tab | null {
  const index = tabs.findIndex((tab) => tab.id === current);
  const last = tabs.length - 1;
  const target: Partial<Record<string, number>> = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  };
  const next = target[key];
  return next === undefined ? null : (tabs[next]?.id ?? null);
}
