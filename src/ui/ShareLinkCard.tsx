import { useEffect, useState } from "react";
import { Button } from "./Button";
import { cn } from "./cn";
import { Eyebrow } from "./Eyebrow";
import { IconCheck, IconCopy } from "./icons";

const copiedFor = 1600;
const invitation =
  "Help me find our next game night. Tap the days you can play, it takes 30 seconds";

export function shareMessage(url: string) {
  return `${invitation}: ${url}`;
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
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = setTimeout(() => setCopyState("idle"), copiedFor);
    return () => clearTimeout(timer);
  }, [copyState]);

  const copy = () => {
    void writeToClipboard(url)
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
        <Eyebrow className="text-accent-strong">Player link</Eyebrow>
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <ShareTargets url={url} />
          <p className="text-xs text-ink-3">
            Anyone with the link can answer. Keep it in the group.
          </p>
        </div>
      )}
    </div>
  );
}

function writeToClipboard(text: string): Promise<void> {
  try {
    return navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("No clipboard"));
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("Clipboard blocked"));
  }
}

function shareNatively(text: string) {
  try {
    void navigator.share({ text }).catch(() => undefined);
  } catch {
    return;
  }
}

const roundTarget =
  "inline-flex size-10 items-center justify-center rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95";

function ShareTargets({ url }: { url: string }) {
  const message = shareMessage(url);
  const encoded = encodeURIComponent(message);
  const targets = [
    {
      label: "WhatsApp",
      glyph: "W",
      tone: "bg-[#25D366] text-white",
      href: `https://wa.me/?text=${encoded}`,
      newTab: true,
    },
    {
      label: "Telegram",
      glyph: "T",
      tone: "bg-[#2AABEE] text-white",
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`${invitation}.`)}`,
      newTab: true,
    },
    {
      label: "Mail",
      glyph: "@",
      tone: "bg-surface-2 text-ink",
      href: `mailto:?subject=${encodeURIComponent("Our next game night")}&body=${encoded}`,
      newTab: false,
    },
  ];
  return (
    <div className="flex items-center gap-2">
      {targets.map((target) => (
        <a
          key={target.label}
          href={target.href}
          {...(target.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
          aria-label={`Share via ${target.label}`}
          className={cn(roundTarget, target.tone)}
        >
          {target.glyph}
        </a>
      ))}
      {canShareNatively() && (
        <button
          type="button"
          aria-label="Share"
          onClick={() => shareNatively(message)}
          className={cn(roundTarget, "bg-surface-2 text-ink")}
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
