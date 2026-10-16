// PROTOTYPE switcher, throwaway. Cycles ?variant= with the arrows or ← →; hidden in production builds.
import { useEffect } from "react";

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: readonly { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );
  const step = (by: number) => {
    const next = variants[(index + by + variants.length) % variants.length];
    if (next) onChange(next.key);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;
  const variant = variants[index];
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1.5 font-mono text-xs text-white shadow-lg ring-2 ring-fuchsia-500">
      <button type="button" onClick={() => step(-1)} className="rounded-full px-2 py-1 hover:bg-white/15" aria-label="Previous variant">
        ←
      </button>
      <span className="px-2">{variant ? `${variant.key} (${variant.name})` : current}</span>
      <button type="button" onClick={() => step(1)} className="rounded-full px-2 py-1 hover:bg-white/15" aria-label="Next variant">
        →
      </button>
    </div>
  );
}
