import { useEffect, useState } from "react";
import { Button } from "./Button";
import { cn } from "./cn";
import { Eyebrow } from "./Eyebrow";
import { IconCheck, IconCopy } from "./icons";

const copiedFor = 1600;

export function shareMessage(url: string) {
  return `Help me find our next game night. Tap the days you can play, it takes 30 seconds: ${url}`;
}

type CopyState = "idle" | "copied" | "blocked";

export function ShareLinkCard({
  url,
  compact = false,
  onRotate,
}: {
  url: string;
  compact?: boolean;
  onRotate?: () => void;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  useResetAfter(copyState === "copied", copiedFor, () => setCopyState("idle"));

  const copy = () => {
    void navigator.clipboard
      .writeText(url)
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("blocked"));
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-accent/30 bg-accent-soft/60 dark:bg-accent-soft/40",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Eyebrow className="text-accent">Player link</Eyebrow>
        {onRotate && (
          <button
            type="button"
            onClick={onRotate}
            className="text-xs font-medium text-ink-3 hover:text-ink"
          >
            Rotate
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-3 py-2.5 font-mono text-sm text-ink select-all">
          {url.replace(/^https?:\/\//, "")}
        </code>
        <Button
          variant={copyState === "copied" ? "free" : "primary"}
          onClick={copy}
          className="min-w-24"
        >
          {copyState === "copied" ? <IconCheck /> : <IconCopy />}
          {copyState === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      {copyState === "blocked" && (
        <p className="mt-2 text-xs text-ink-2">Long-press the link to copy it.</p>
      )}
      {!compact && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <ShareTargets url={url} />
          <p className="hidden text-xs text-ink-3 sm:block">
            Anyone with the link can answer. Keep it in the group.
          </p>
        </div>
      )}
    </div>
  );
}

function ShareTargets({ url }: { url: string }) {
  const message = shareMessage(url);
  const targets = [
    {
      label: "WhatsApp",
      glyph: "W",
      tone: "bg-[#25D366] text-white",
      href: `https://wa.me/?text=${encodeURIComponent(message)}`,
    },
    {
      label: "Telegram",
      glyph: "T",
      tone: "bg-[#2AABEE] text-white",
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message.replace(` ${url}`, ""))}`,
    },
    {
      label: "Mail",
      glyph: "@",
      tone: "bg-surface-2 text-ink",
      href: `mailto:?subject=${encodeURIComponent("Our next game night")}&body=${encodeURIComponent(message)}`,
    },
  ];
  const round =
    "inline-flex size-10 items-center justify-center rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95";
  return (
    <div className="flex items-center gap-2">
      {targets.map((target) => (
        <a
          key={target.label}
          href={target.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Share via ${target.label}`}
          className={cn(round, target.tone)}
        >
          {target.glyph}
        </a>
      ))}
      {canShareNatively() && (
        <button
          type="button"
          aria-label="Share"
          onClick={() => void navigator.share({ text: message }).catch(() => undefined)}
          className={cn(round, "bg-surface-2 text-ink")}
        >
          ↗
        </button>
      )}
    </div>
  );
}

function canShareNatively() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

function useResetAfter(active: boolean, delay: number, reset: () => void) {
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(reset, delay);
    return () => clearTimeout(timer);
  }, [active, delay, reset]);
}
