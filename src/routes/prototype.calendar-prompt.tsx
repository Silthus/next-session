// PROTOTYPE, throwaway (#127). Never merged.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  CalendarPromptPrototype,
  STATES,
  VARIANTS,
  type PrototypeState,
  type Variant,
} from "../features/player/prototype/CalendarPromptPrototype";

type Search = { state?: PrototypeState; variant?: Variant; embed?: boolean };

const stateKeys = Object.keys(STATES) as PrototypeState[];
const variantKeys = Object.keys(VARIANTS) as Variant[];

export const Route = createFileRoute("/prototype/calendar-prompt")({
  validateSearch: ({ state, variant, embed }: Record<string, unknown>): Search => ({
    state: stateKeys.find((key) => key === state),
    variant: variantKeys.find((key) => key === variant),
    embed: embed === true || embed === "1" || embed === 1 ? true : undefined,
  }),
  component: PrototypeRoute,
});

function PrototypeRoute() {
  const { state, variant = "A", embed } = Route.useSearch();
  if (!state) return <Gallery variant={variant} />;
  return (
    <>
      <CalendarPromptPrototype state={state} variant={variant} />
      {!embed && <Switcher state={state} variant={variant} />}
    </>
  );
}

function Switcher({ state, variant }: { state: PrototypeState; variant: Variant }) {
  const navigate = Route.useNavigate();
  const cycle = (step: number) => {
    const index = (variantKeys.indexOf(variant) + step + variantKeys.length) % variantKeys.length;
    void navigate({ search: { state, variant: variantKeys[index] }, replace: true });
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#111] px-2 py-1.5 font-mono text-xs text-white shadow-lg">
      <button type="button" className="px-2 py-1" onClick={() => cycle(-1)}>
        ←
      </button>
      <span className="whitespace-nowrap">
        {variant} · {VARIANTS[variant]}
      </span>
      <button type="button" className="px-2 py-1" onClick={() => cycle(1)}>
        →
      </button>
      <select
        aria-label="State"
        value={state}
        onChange={(event) =>
          void navigate({
            search: { state: event.target.value as PrototypeState, variant },
            replace: true,
          })
        }
        className="max-w-48 rounded-full bg-[#333] px-2 py-1"
      >
        {stateKeys.map((key) => (
          <option key={key} value={key}>
            {STATES[key]}
          </option>
        ))}
      </select>
      <Link to="/prototype/calendar-prompt" search={{ variant }} className="px-2 py-1 underline">
        all
      </Link>
    </div>
  );
}

function Gallery({ variant }: { variant: Variant }) {
  return (
    <main className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="font-display text-2xl font-semibold">Calendar prompt prototype (#127)</h1>
        <nav className="flex gap-2 text-sm">
          {variantKeys.map((key) => (
            <Link
              key={key}
              to="/prototype/calendar-prompt"
              search={{ variant: key }}
              className={key === variant ? "font-bold underline" : "text-ink-2"}
            >
              {key} · {VARIANTS[key]}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-ink-3">
          Variants only change visitor states. Theme follows your OS. Click a title to open it full
          size.
        </p>
      </header>
      <div className="flex gap-6 overflow-x-auto pb-4">
        {stateKeys.map((key) => (
          <figure key={key} className="flex shrink-0 flex-col gap-2">
            <Link
              to="/prototype/calendar-prompt"
              search={{ state: key, variant }}
              className="font-mono text-xs text-accent-strong underline"
            >
              {STATES[key]}
            </Link>
            <iframe
              title={STATES[key]}
              src={`/prototype/calendar-prompt?state=${key}&variant=${variant}&embed=1`}
              className="h-[1500px] w-[390px] rounded-xl border border-line bg-paper"
            />
          </figure>
        ))}
      </div>
    </main>
  );
}
