import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { errorMessage } from "../../lib/errors";

export function SessionEmailSettings() {
  const enabled = useQuery(api.me.sessionEmails);
  const save = useMutation(api.me.setSessionEmails);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function change(next: boolean) {
    setSaving(true);
    setError(undefined);
    try {
      await save({ enabled: next });
    } catch (cause) {
      setError(errorMessage(cause, "session"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Session emails" className="flex flex-col gap-2 border-t border-line pt-5">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-2">
        <input
          type="checkbox"
          role="switch"
          checked={enabled === true}
          disabled={enabled == null || saving}
          onChange={(event) => void change(event.target.checked)}
          className="size-5 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-4"
        />
        Email me when a session is set or cancelled
      </label>
      <p className="text-sm text-ink-3">Your preference applies to every group you keep.</p>
      <p aria-live="polite" className="text-sm text-ink-3">
        {saving ? "Saving…" : ""}
      </p>
      {error && (
        <p role="alert" className="text-sm text-busy">
          {error}
        </p>
      )}
    </section>
  );
}
