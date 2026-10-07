import { useEffect, useState } from "react";
import { log, track, type BrowserEvent } from "../lib/telemetry";
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
type ShareSurface = Extract<BrowserEvent, { name: "share_link_copied" }>["surface"];
type ShareChannel = Extract<BrowserEvent, { name: "share_link_shared" }>["channel"];
type CopyMethod = Extract<BrowserEvent, { name: "share_link_copied" }>["method"];

export function ShareLinkCard({
  url,
  compact = false,
  surface = compact ? "compact" : "rail",
  onRotate,
}: {
  url: string;
  compact?: boolean;
  surface?: ShareSurface;
  onRotate?: () => void;
}) {
  const [copied, setCopied] = useState<{ url: string; state: CopyState }>({ url, state: "idle" });
  const copyState = copied.url === url ? copied.state : "idle";
  const setCopyState = (state: CopyState) => setCopied({ url, state });
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = setTimeout(() => setCopied({ url, state: "idle" }), copiedFor);
    return () => clearTimeout(timer);
  }, [copyState, url]);

  const copy = () => {
    void copyText(url, surface).then((method) => {
      track({ name: "share_link_copied", surface, method });
      setCopyState(method === "failed" ? "blocked" : "copied");
    });
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-accent/30 bg-accent-soft/60 dark:bg-accent-soft/40",
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
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3",
          compact ? "mt-2" : "mt-3",
        )}
      >
        <ShareTargets
          url={url}
          onShared={(channel) => track({ name: "share_link_shared", surface, channel })}
        />
        {!compact && (
          <p className="text-xs text-ink-3">
            Anyone with the link can answer. Keep it in the group.
          </p>
        )}
      </div>
    </div>
  );
}

function copyText(text: string, surface: ShareSurface): Promise<CopyMethod> {
  return writeToClipboard(text).then(
    () => "clipboard",
    (refusal: unknown) => {
      const reason = refusalName(refusal);
      if (copyThroughSelection(text)) {
        log("warn", "Copy fell back to the selection", { surface, reason });
        return "fallback";
      }
      log("error", "Copy failed", { surface, reason });
      return "failed";
    },
  );
}

function refusalName(refusal: unknown) {
  const name: unknown =
    typeof refusal === "object" && refusal !== null && "name" in refusal ? refusal.name : null;
  return typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name) ? name : "unknown";
}

function copyThroughSelection(text: string) {
  const focused = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.className = "fixed top-0 left-0 text-base opacity-0";
  document.body.append(field);
  field.select();
  field.setSelectionRange(0, text.length);
  const copied = runCopyCommand();
  field.remove();
  if (focused instanceof HTMLElement) focused.focus();
  return copied;
}

function runCopyCommand() {
  try {
    return typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    return false;
  }
}

function writeToClipboard(text: string): Promise<void> {
  try {
    return navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("No clipboard"));
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("Clipboard blocked"));
  }
}

function shareNatively(text: string, onShared: () => void) {
  try {
    void navigator.share({ text }).then(onShared, () => undefined);
  } catch {
    return;
  }
}

type ShareTarget = {
  channel: ShareChannel;
  label: string;
  glyph: string;
  tone: string;
  href: string;
  newTab: boolean;
};

const roundTarget =
  "inline-flex size-10 items-center justify-center rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95";

function ShareTargets({
  url,
  onShared,
}: {
  url: string;
  onShared: (channel: ShareChannel) => void;
}) {
  const message = shareMessage(url);
  const encoded = encodeURIComponent(message);
  const targets: ShareTarget[] = [
    {
      channel: "whatsapp",
      label: "WhatsApp",
      glyph: "W",
      tone: "bg-[#25D366] text-white",
      href: `https://wa.me/?text=${encoded}`,
      newTab: true,
    },
    {
      channel: "telegram",
      label: "Telegram",
      glyph: "T",
      tone: "bg-[#2AABEE] text-white",
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`${invitation}.`)}`,
      newTab: true,
    },
    {
      channel: "mail",
      label: "Mail",
      glyph: "@",
      tone: "bg-surface text-ink",
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
          onClick={() => onShared(target.channel)}
          className={cn(roundTarget, target.tone)}
        >
          {target.glyph}
        </a>
      ))}
      {canShareNatively() && (
        <button
          type="button"
          aria-label="Share"
          onClick={() => shareNatively(message, () => onShared("native"))}
          className={cn(roundTarget, "bg-surface text-ink")}
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
