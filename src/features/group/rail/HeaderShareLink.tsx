import { useRef } from "react";
import { Button } from "../../../ui/Button";
import { cn } from "../../../ui/cn";
import { IconCheck, IconCopy, IconShare } from "../../../ui/icons";
import { ShareLinkCard, useCopyLink } from "../../../ui/ShareLinkCard";
import type { ShowToast } from "../useToast";
import { hoverRow } from "../../../ui/interactive";
import { Popover } from "./Popover";

const iconButton = `inline-flex size-9 items-center justify-center rounded-full text-ink-2 hover:text-ink ${hoverRow}`;

export function HeaderShareLink({
  url,
  wide = false,
  onRotate,
  showToast,
}: {
  url: string;
  wide?: boolean;
  onRotate: () => void;
  showToast: ShowToast;
}) {
  const shareTrigger = useRef<HTMLButtonElement>(null);
  const { copyState, copy } = useCopyLink(url, "header");
  const copied = copyState === "copied";
  const copyAndConfirm = () =>
    void copy().then((state) =>
      showToast(
        state === "copied"
          ? "Link copied. Send it to your players."
          : "Copying didn't work. Open Share and long-press the link.",
      ),
    );

  return (
    <div
      className={cn(
        "flex items-center",
        wide &&
          "gap-1 rounded-full border border-accent/30 bg-accent-soft/60 py-0.5 pr-0.5 pl-3 dark:bg-accent-soft/40",
      )}
    >
      {wide ? (
        <>
          <code className="max-w-52 truncate font-mono text-xs text-ink select-all">
            {url.replace(/^https?:\/\//, "")}
          </code>
          <Button
            size="sm"
            variant={copied ? "free" : "primary"}
            aria-label={copied ? "Copied player link" : "Copy player link"}
            onClick={copyAndConfirm}
            className="ml-1 h-7 rounded-full"
          >
            {copied ? <IconCheck /> : <IconCopy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </>
      ) : (
        <button
          type="button"
          aria-label="Copy player link"
          onClick={copyAndConfirm}
          className={cn(iconButton, copied && "text-free hover:text-free")}
        >
          {copied ? <IconCheck /> : <IconCopy />}
        </button>
      )}
      <Popover
        triggerRef={shareTrigger}
        align={wide ? "end" : "full"}
        className={cn(wide && "w-96")}
        trigger={(props) => (
          <button
            {...props}
            type="button"
            aria-label="Share player link"
            className={cn(iconButton, wide && "size-7")}
          >
            <IconShare />
          </button>
        )}
      >
        <ShareLinkCard url={url} compact onRotate={onRotate} />
      </Popover>
    </div>
  );
}
