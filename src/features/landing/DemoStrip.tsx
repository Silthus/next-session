import { cn } from "../../ui/cn";

type DemoAnswer = "free" | "maybe" | "busy";

const week: { day: string; answers: DemoAnswer[] }[] = [
  { day: "Mo", answers: ["free", "free", "busy", "maybe", "free"] },
  { day: "Tu", answers: ["free", "maybe", "free", "free", "busy"] },
  { day: "We", answers: ["busy", "busy", "maybe", "free", "free"] },
  { day: "Th", answers: ["free", "free", "free", "free", "free"] },
  { day: "Fr", answers: ["maybe", "free", "busy", "busy", "free"] },
  { day: "Sa", answers: ["free", "free", "free", "free", "maybe"] },
  { day: "Su", answers: ["busy", "maybe", "free", "busy", "busy"] },
];

const bar: Record<DemoAnswer, string> = { free: "bg-free", maybe: "bg-maybe-bar", busy: "bg-busy" };

export function DemoStrip() {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card" aria-hidden="true">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-base font-bold">Thursday Crew</span>
        <span className="rounded-full bg-free-soft px-2 py-0.5 text-xs font-semibold text-free">
          Thu is perfect
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {week.map(({ day, answers }) => (
          <div
            key={day}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md border p-1.5",
              answers.every((answer) => answer === "free")
                ? "border-free bg-free-soft"
                : "border-line bg-surface",
            )}
          >
            <span className="text-[10px] font-semibold text-ink-3">{day}</span>
            <div className="flex gap-0.5">
              {answers.map((answer, index) => (
                <span key={index} className={cn("h-3 w-1 rounded-full", bar[answer])} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Five players, one week. Each bar is a player's answer.
      </p>
    </div>
  );
}
