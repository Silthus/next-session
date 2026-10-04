import { useId } from "react";
import { UNSAVED_GROUP_QUIET_DAYS } from "../../../../shared/limits";
import { Button } from "../../../ui/Button";
import { joinedLine } from "./nudge";

export function Nudge({
  names,
  onSave,
  onLater,
}: {
  names: readonly string[];
  onSave: () => void;
  onLater: () => void;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="animate-rise flex flex-col gap-3 rounded-lg border border-maybe/50 bg-maybe-soft/70 px-4 py-3 sm:flex-row sm:items-center"
    >
      <h2 id={headingId} className="sr-only">
        Save your group
      </h2>
      <p className="min-w-0 flex-1 text-sm break-words text-ink">
        <span className="font-semibold">{joinedLine(names)}</span>
        {` Save this group to keep it on every device. Unsaved groups vanish after ${String(UNSAVED_GROUP_QUIET_DAYS)} quiet days.`}
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>
          Save group
        </Button>
        <Button size="sm" variant="ghost" onClick={onLater}>
          Later
        </Button>
      </div>
    </section>
  );
}
