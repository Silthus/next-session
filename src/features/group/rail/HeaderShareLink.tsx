import { useRef } from "react";
import { cn } from "../../../ui/cn";
import { IconCheck, IconCopy, IconShare } from "../../../ui/icons";
import { ShareLinkCard, useCopyLink } from "../../../ui/ShareLinkCard";
import type { ShowToast } from "../useToast";
import { Popover } from "./Popover";

const iconButton =
  "inline-flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink";

export function HeaderShareLink({
  url,
  onRotate,
  showToast,
}: {
  url: string;
  onRotate: () => void;
  showToast: ShowToast;
}) {
  const shareTrigger = useRef<HTMLButtonElement>(null);
  const { copyState, copy } = useCopyLink(url, "header");
  const copyAndConfirm = () =>
    void copy().then((state) =>
      showToast(
        state === "copied"
          ? "Link copied. Send it to your players."
          : "Copying didn't work. Open Share and long-press the link.",
      ),
    );

  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label="Copy player link"
        onClick={copyAndConfirm}
        className={cn(iconButton, copyState === "copied" && "text-free hover:text-free")}
      >
        {copyState === "copied" ? <IconCheck /> : <IconCopy />}
      </button>
      <Popover
        triggerRef={shareTrigger}
        align="full"
        trigger={(props) => (
          <button {...props} type="button" aria-label="Share player link" className={iconButton}>
            <IconShare />
          </button>
        )}
      >
        <ShareLinkCard url={url} compact onRotate={onRotate} />
      </Popover>
    </div>
  );
}
