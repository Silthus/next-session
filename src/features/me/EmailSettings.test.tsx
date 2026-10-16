import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { EmailSettings, type NotificationSettings } from "./EmailSettings";

type Save = (enabled: boolean) => Promise<null>;

function renderSettings(
  settings: NotificationSettings | undefined,
  {
    saveSessionEmails = vi.fn<Save>(() => Promise.resolve(null)),
    saveReminders = vi.fn<Save>(() => Promise.resolve(null)),
  } = {},
) {
  render(
    <EmailSettings
      settings={settings}
      saveSessionEmails={saveSessionEmails}
      saveReminders={saveReminders}
    />,
  );
  return { saveSessionEmails, saveReminders };
}

const sessionUpdates = { name: "Email me when a session is set or cancelled" };
const reminders = { name: "Email me 1 day and 2 hours before a session" };

describe("EmailSettings", () => {
  it("shows the Session updates switch alone while Reminders aren't configured", () => {
    renderSettings({ sessionEmails: true, reminders: null });

    expect(screen.getByRole("region", { name: "Emails" })).toBeTruthy();
    expect(screen.getAllByRole("switch")).toEqual([screen.getByRole("switch", sessionUpdates)]);
    expect(screen.getByText("These apply to every group you keep.")).toBeTruthy();
  });

  it("shows the Reminders switch under Session updates once Reminders are configured", () => {
    renderSettings({ sessionEmails: true, reminders: false });

    expect(screen.getAllByRole("switch")).toEqual([
      screen.getByRole("switch", sessionUpdates),
      screen.getByRole("switch", reminders),
    ]);
    expect((screen.getByRole("switch", sessionUpdates) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("switch", reminders) as HTMLInputElement).checked).toBe(false);
  });

  it("turns Reminders off without touching Session updates", async () => {
    const { saveReminders, saveSessionEmails } = renderSettings({
      sessionEmails: true,
      reminders: true,
    });

    await userEvent.click(screen.getByRole("switch", reminders));

    expect(saveReminders).toHaveBeenCalledExactlyOnceWith(false);
    expect(saveSessionEmails).not.toHaveBeenCalled();
  });

  it("turns Session updates off without touching Reminders", async () => {
    const { saveReminders, saveSessionEmails } = renderSettings({
      sessionEmails: true,
      reminders: true,
    });

    await userEvent.click(screen.getByRole("switch", sessionUpdates));

    expect(saveSessionEmails).toHaveBeenCalledExactlyOnceWith(false);
    expect(saveReminders).not.toHaveBeenCalled();
  });

  it("holds the Reminders switch while it saves, and keeps Session updates usable", async () => {
    renderSettings(
      { sessionEmails: false, reminders: false },
      { saveReminders: () => new Promise(() => {}) },
    );

    await userEvent.click(screen.getByRole("switch", reminders));

    expect((screen.getByRole("switch", reminders) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("switch", sessionUpdates) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText("Saving…")).toBeTruthy();
  });

  it("says why a Reminders change failed", async () => {
    renderSettings(
      { sessionEmails: true, reminders: true },
      {
        saveReminders: () =>
          Promise.reject(new ConvexError({ code: "RATE_LIMITED", retryAfter: 1_000 })),
      },
    );

    await userEvent.click(screen.getByRole("switch", reminders));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Slow down a moment, then try again.",
    );
  });

  it("disables the Session updates switch while the settings load", () => {
    renderSettings(undefined);

    expect((screen.getByRole("switch", sessionUpdates) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("switch", reminders)).toBeNull();
  });
});
