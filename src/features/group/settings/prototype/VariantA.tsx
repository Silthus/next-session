// PROTOTYPE for #128, throwaway. Variant A: a plain form page with one Save button.
import { useState } from "react";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Eyebrow } from "../../../../ui/Eyebrow";
import { Toast, type ToastMessage } from "../../../../ui/Toast";
import { AddressField, locationHint } from "./AddressField";
import { FieldLabel, LengthChips, SettingsFrame, StartInput, TimeZoneLine } from "./fields";
import type { StateSetup } from "./states";

export const variantAName = "Plain form";

export function VariantA({ setup }: { setup: StateSetup }) {
  const [night, setNight] = useState(setup.night);
  const [saved, setSaved] = useState(setup.night);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dirty = JSON.stringify(night) !== JSON.stringify(saved);

  const save = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(night);
      setToast({ id: Date.now(), text: "Saved. Your 2 upcoming Sessions follow." });
      setTimeout(() => setToast(null), 3000);
    }, 600);
  };

  return (
    <SettingsFrame>
      <div>
        <Eyebrow>Group settings</Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">Your usual night</h1>
        <p className="mt-2 text-ink-2">
          Every Session starts with this. Players get it in their calendar invite.
        </p>
      </div>
      <Card className="flex flex-col gap-5">
        <div>
          <FieldLabel hint={night.start ? undefined : "Leave it empty and Sessions show as all day."}>
            Starts at
          </FieldLabel>
          <StartInput
            value={night.start}
            onChange={(start) => setNight({ ...night, start })}
            className="w-36"
          />
        </div>
        <div>
          <FieldLabel>Plays for</FieldLabel>
          <LengthChips
            hours={night.hours}
            start={night.start}
            onChange={(hours) => setNight({ ...night, hours })}
          />
        </div>
        <TimeZoneLine
          value={night.timeZone}
          onChange={(timeZone) => setNight({ ...night, timeZone })}
        />
        <div className="border-t border-line pt-5">
          <FieldLabel hint={locationHint}>Where you play</FieldLabel>
          <AddressField
            value={night.location}
            onChange={(location) => setNight({ ...night, location })}
            autocomplete={setup.autocomplete}
            startOpen={setup.locationOpen}
            autoFocus={setup.locationOpen}
          />
        </div>
      </Card>
      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-center text-xs text-ink-3 sm:mr-auto sm:text-left">
          {dirty
            ? "Upcoming Sessions move in players' calendars."
            : saved.start || saved.location
              ? "All saved."
              : ""}
        </p>
        <Button size="lg" disabled={!dirty} busy={saving && "Saving…"} onClick={save}>
          Save
        </Button>
      </div>
      <Toast message={toast} />
    </SettingsFrame>
  );
}
