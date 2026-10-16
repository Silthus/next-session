// PROTOTYPE for #128, throwaway. Every state side by side, each in a real 390 px iframe
// so phone breakpoints apply, with its copy rationale underneath.
import { cn } from "../../../../ui/cn";
import { Eyebrow } from "../../../../ui/Eyebrow";
import { entryStates, entryTitles } from "./EntryPoints";
import { entryNotes, pageNotes, variantNotes } from "./rationale";
import { pageStates, stateTitles } from "./states";

export type BoardKey = "A" | "B" | "C" | "entry";

export const variants = [
  { key: "A", name: "Plain form" },
  { key: "B", name: "Live calendar preview" },
  { key: "C", name: "One sentence" },
] as const;

const base = "/prototype/group-settings";

export function Board({ board }: { board: BoardKey }) {
  const frames =
    board === "entry"
      ? entryStates.map((state) => ({
          title: entryTitles[state],
          src: `${base}?entry=${state}&frame=1`,
          note: entryNotes[state],
          height: 720,
        }))
      : pageStates.map((state) => ({
          title: stateTitles[state],
          src: `${base}?variant=${board}&state=${state}&frame=1`,
          note: pageNotes[state],
          height: 844,
        }));
  const variant = variants.find((candidate) => candidate.key === board);
  return (
    <div className="min-h-dvh p-6">
      <nav className="flex flex-wrap items-center gap-2">
        <Eyebrow className="mr-2">Prototype #128 · Group settings</Eyebrow>
        {[...variants.map((v) => ({ key: v.key, label: `${v.key} · ${v.name}` })), { key: "entry", label: "Entry points" }].map(
          (tab) => (
            <a
              key={tab.key}
              href={`${base}?board=${tab.key}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                tab.key === board ? "border-accent bg-accent-soft font-semibold" : "border-line-strong",
              )}
            >
              {tab.label}
            </a>
          ),
        )}
      </nav>
      <h1 className="mt-4 font-display text-3xl font-medium">
        {variant ? `Variant ${variant.key}: ${variant.name}` : "Where the GM finds it"}
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-2">
        {variant
          ? variantNotes[variant.key]
          : "Three entry points, the same on every page variant. None of them is a step or a modal: the map rules out explicit onboarding, so the GM meets the setting where they already look before a Session goes out."}
      </p>
      <div className="mt-6 flex gap-6">
        {frames.map((frame) => (
          <figure key={frame.src} className="flex w-[390px] shrink-0 flex-col gap-2">
            <figcaption className="font-mono text-[11px] font-medium tracking-[0.18em] text-ink-3 uppercase">
              {frame.title}
            </figcaption>
            <iframe
              title={frame.title}
              src={frame.src}
              width={390}
              height={frame.height}
              className="rounded-2xl border border-line-strong bg-paper shadow-card"
            />
            <p className="text-[13px] leading-relaxed text-ink-2">{frame.note}</p>
          </figure>
        ))}
      </div>
    </div>
  );
}
