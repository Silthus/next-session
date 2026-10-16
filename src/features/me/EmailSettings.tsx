import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { errorMessage } from "../../lib/errors";

export type NotificationSettings = NonNullable<
  FunctionReturnType<typeof api.me.notificationSettings>
>;

type Save = (enabled: boolean) => Promise<unknown>;

export function EmailSettings({
  settings,
  saveSessionEmails,
  saveReminders,
}: {
  settings: NotificationSettings | undefined;
  saveSessionEmails: Save;
  saveReminders: Save;
}) {
  return (
    <section aria-label="Emails" className="flex flex-col gap-2 border-t border-line pt-5">
      <EmailSwitch
        label="Email me when a session is set or cancelled"
        checked={settings?.sessionEmails}
        onSave={saveSessionEmails}
      />
      {settings?.reminders != null && (
        <EmailSwitch
          label="Email me 1 day and 2 hours before a session"
          checked={settings.reminders}
          onSave={saveReminders}
        />
      )}
      <p className="text-sm text-ink-3">These apply to every group you keep.</p>
    </section>
  );
}

function EmailSwitch({
  label,
  checked,
  onSave,
}: {
  label: string;
  checked: boolean | undefined;
  onSave: Save;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function change(next: boolean) {
    setSaving(true);
    setError(undefined);
    try {
      await onSave(next);
    } catch (cause) {
      setError(errorMessage(cause, "session"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-2">
        <input
          type="checkbox"
          role="switch"
          checked={checked === true}
          disabled={checked === undefined || saving}
          onChange={(event) => void change(event.target.checked)}
          className="size-5 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-strong"
        />
        {label}
      </label>
      <p aria-live="polite" className="text-sm text-ink-3">
        {saving ? "Saving…" : ""}
      </p>
      {error && (
        <p role="alert" className="text-sm text-busy">
          {error}
        </p>
      )}
    </div>
  );
}
