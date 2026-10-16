// PROTOTYPE for #128, throwaway. Variant C: the usual night as one sentence.
// Each gold slot opens a sheet with one field.
import { useState, type ReactNode } from "react";
import { Button } from "../../../../ui/Button";
import { cn } from "../../../../ui/cn";
import { Eyebrow } from "../../../../ui/Eyebrow";
import { focusRing } from "../../../../ui/interactive";
import { Sheet } from "../../../../ui/Sheet";
import { AddressField, locationHint } from "./AddressField";
import { LengthChips, SettingsFrame, StartInput, TimeZoneLine } from "./fields";
import { endTime, groupName, zoneLabel, type UsualNight } from "./fixtures";
import type { StateSetup } from "./states";

export const variantCName = "One sentence";

type Slot = "start" | "hours" | "location";

const sheetTitles: Record<Slot, string> = {
  start: "When do you start?",
  hours: "How long do you play?",
  location: "Where do you play?",
};

export function VariantC({ setup }: { setup: StateSetup }) {
  const [night, setNight] = useState(setup.night);
  const [editing, setEditing] = useState<Slot | null>(setup.locationOpen ? "location" : null);
  const [draft, setDraft] = useState(setup.night);

  const open = (slot: Slot) => {
    setDraft(night);
    setEditing(slot);
  };
  const done = () => {
    setNight(draft);
    setEditing(null);
  };

  return (
    <SettingsFrame>
      <Eyebrow>Group settings</Eyebrow>
      <p className="font-display text-3xl leading-snug font-medium text-balance sm:text-4xl sm:leading-snug">
        {`${groupName} plays `}
        {night.start ? (
          <>
            {"at "}
            <SlotButton onClick={() => open("start")}>{night.start}</SlotButton>
            {" for "}
            <SlotButton onClick={() => open("hours")}>{`${String(night.hours)} hours`}</SlotButton>
          </>
        ) : (
          <SlotButton empty onClick={() => open("start")}>
            some time
          </SlotButton>
        )}
        {" at "}
        <SlotButton empty={!night.location} onClick={() => open("location")}>
          {shortPlace(night.location) || "some place"}
        </SlotButton>
        .
      </p>
      <p className="text-sm text-ink-2">
        {night.start
          ? `Players' calendars show ${night.start}–${endTime(night.start, night.hours)}, ${zoneLabel(night.timeZone)}.`
          : "Until you pick a time, players' calendars show Sessions as all day."}{" "}
        Tap a gold word to change it.
      </p>
      <Sheet open={editing !== null} title={editing ? sheetTitles[editing] : ""} onClose={() => setEditing(null)}>
        <div className="flex flex-col gap-4">
          {editing === "start" && (
            <>
              <StartInput value={draft.start} onChange={(start) => setDraft({ ...draft, start })} className="w-40" />
              <TimeZoneLine value={draft.timeZone} onChange={(timeZone) => setDraft({ ...draft, timeZone })} />
            </>
          )}
          {editing === "hours" && (
            <LengthChips
              hours={draft.hours}
              start={draft.start}
              onChange={(hours) => setDraft({ ...draft, hours })}
            />
          )}
          {editing === "location" && (
            <>
              <AddressField
                value={draft.location}
                onChange={(location) => setDraft({ ...draft, location })}
                autocomplete={setup.autocomplete}
                startOpen={setup.locationOpen}
                autoFocus
              />
              <p className="text-xs text-ink-3">{locationHint}</p>
            </>
          )}
          <Button size="lg" className="mt-2 w-full" onClick={done}>
            Done
          </Button>
        </div>
      </Sheet>
    </SettingsFrame>
  );
}

function SlotButton({
  empty = false,
  onClick,
  children,
}: {
  empty?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm underline decoration-2 underline-offset-[0.2em] transition-colors hover:bg-accent-soft",
        focusRing,
        empty
          ? "text-ink-3 decoration-accent decoration-dashed"
          : "text-accent-strong decoration-accent",
      )}
    >
      {children}
    </button>
  );
}

function shortPlace(location: string) {
  return location.split(",")[0]?.trim() ?? "";
}
