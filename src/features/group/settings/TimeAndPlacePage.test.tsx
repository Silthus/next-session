import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import {
  AddressSuggestionsProvider,
  suggestUntilFailure,
  type AddressSearch,
  type AddressSuggestions,
} from "./addressSuggestions";
import { TimeAndPlacePage, type TimeAndPlaceValues } from "./TimeAndPlacePage";

vi.mock("../../../lib/timeZone", () => ({ browserTimeZone: () => "Europe/Berlin" }));

const usualNight: TimeAndPlaceValues = {
  startTime: "19:00",
  lengthMinutes: 240,
  timeZone: "Europe/Berlin",
  location: "",
};

function renderPage({
  initial = usualNight,
  onSave = vi.fn<(values: TimeAndPlaceValues) => Promise<void>>().mockResolvedValue(undefined),
  suggestions = null,
}: {
  initial?: TimeAndPlaceValues;
  onSave?: (values: TimeAndPlaceValues) => Promise<void>;
  suggestions?: AddressSuggestions | null;
} = {}) {
  render(
    <AddressSuggestionsProvider value={suggestions}>
      <TimeAndPlacePage
        groupName="Tuesday Crew"
        previewDate="2026-10-20"
        initial={initial}
        onSave={onSave}
      />
    </AddressSuggestionsProvider>,
  );
  return { onSave, preview: screen.getByRole("region", { name: "In players' calendars" }) };
}

const startTime = () => screen.getByLabelText<HTMLInputElement>("Starts at");
const length = (hours: number) => screen.getByRole("radio", { name: `${String(hours)} h` });

describe("TimeAndPlacePage", () => {
  it("opens on 19:00 for 4 hours in Berlin time for a Group never saved", () => {
    const { preview } = renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "When and where you play" })).toBeTruthy();
    expect(startTime().value).toBe("19:00");
    expect(length(4).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Until about 23:00")).toBeTruthy();
    expect(
      screen.getByText(/^Berlin time\. Players abroad see it in their own time\./),
    ).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Where").placeholder).toBe("Where you play");
    expect(preview.textContent).toContain("Tuesday Crew");
    expect(preview.textContent).toContain("Tue, Oct 20 · 19:00–23:00");
    expect(preview.textContent).toContain("No place yet");
  });

  it("opens with what the GM saved", () => {
    renderPage({
      initial: {
        startTime: "18:30",
        lengthMinutes: 180,
        timeZone: "Europe/London",
        location: "Max's place",
      },
    });
    expect(startTime().value).toBe("18:30");
    expect(length(3).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/^London time\./)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Where").value).toBe("Max's place");
  });

  it("moves the end time and the preview as soon as the start or the length changes", async () => {
    const { preview } = renderPage();
    fireEvent.change(startTime(), { target: { value: "18:30" } });
    expect(screen.getByText("Until about 22:30")).toBeTruthy();
    expect(preview.textContent).toContain("18:30–22:30");

    await userEvent.click(length(6));
    expect(length(6).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Until about 00:30")).toBeTruthy();
    expect(preview.textContent).toContain("18:30–00:30");
  });

  it("never lets the start time go empty", () => {
    renderPage();
    fireEvent.change(startTime(), { target: { value: "" } });
    expect(startTime().value).toBe("19:00");
  });

  it("shows the place in the preview as it is typed", async () => {
    const { preview } = renderPage();
    await userEvent.type(screen.getByLabelText("Where"), "Max's place");
    expect(preview.textContent).toContain("Max's place");
    expect(preview.textContent).not.toContain("No place yet");
  });

  it("changes the zone from a searchable list and names it in the preview", async () => {
    const { preview } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Change time zone" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Find a time zone" }), "new york");
    await userEvent.click(screen.getByRole("option", { name: "New York time · America/New_York" }));

    expect(
      screen.getByText(/^New York time\. Players abroad see it in their own time\./),
    ).toBeTruthy();
    expect(preview.textContent).toContain("19:00–23:00 New York time");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Change time zone" }));
  });

  it("lists the cities that start with what the GM typed first", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Change time zone" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Find a time zone" }), "lon");
    expect(screen.getAllByRole("option")[0]?.textContent).toBe("London time · Europe/London");
  });

  it("keeps the zone when the GM backs out of the list", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Change time zone" }));
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Find a time zone" }),
      "lond{Escape}",
    );
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByText(/^Berlin time\./)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Change time zone" }));
  });

  it("picks the top zone on Enter without saving, then saves it", async () => {
    const { onSave } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Change time zone" }));
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Find a time zone" }),
      "new york{Enter}",
    );

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByText(/^New York time\./)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Change time zone" }));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ ...usualNight, timeZone: "America/New_York" });
  });

  it("does nothing on Enter when no zone matches", async () => {
    const { onSave } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Change time zone" }));
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Find a time zone" }),
      "atlantis{Enter}",
    );

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox", { name: "Find a time zone" })).toBeTruthy();
    expect(screen.getByText("No zone matches")).toBeTruthy();
  });

  it("keeps the zone on Enter before anything is typed", async () => {
    const { onSave } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Change time zone" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Find a time zone" }), "{Enter}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox", { name: "Find a time zone" })).toBeTruthy();
  });

  it("waits for an Enter that ends a composition before picking a zone", async () => {
    const { onSave } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Change time zone" }));
    const search = screen.getByRole("searchbox", { name: "Find a time zone" });
    await userEvent.type(search, "tokyo");
    fireEvent.keyDown(search, { key: "Enter", isComposing: true });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox", { name: "Find a time zone" })).toBeTruthy();
  });

  it("says that saving moves upcoming Sessions", () => {
    renderPage();
    expect(screen.getByText("Upcoming Sessions move in players' calendars.")).toBeTruthy();
  });

  it("saves exactly the page's values once", async () => {
    let finish: () => void = () => undefined;
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderPage({ onSave });
    fireEvent.change(startTime(), { target: { value: "18:30" } });
    await userEvent.click(length(3));
    await userEvent.type(screen.getByLabelText("Where"), "Max's place");

    const save = screen.getByRole("button", { name: "Save" });
    await userEvent.click(save);
    await userEvent.click(screen.getByRole("button", { name: /Saving/ }));
    finish();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      startTime: "18:30",
      lengthMinutes: 180,
      timeZone: "Europe/Berlin",
      location: "Max's place",
    });
  });

  it("saves the typed place when address suggestions have failed", async () => {
    const search = vi.fn<AddressSearch>().mockRejectedValue(new Error("Geoapify answered 503"));
    const { onSave } = renderPage({ suggestions: suggestUntilFailure(search) });

    await userEvent.type(screen.getByRole("combobox", { name: "Where" }), "Haupt");
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    await userEvent.type(screen.getByRole("textbox", { name: "Where" }), "straße 5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(search).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({ ...usualNight, location: "Hauptstraße 5" });
  });

  it.each([
    ["INVALID_SETTINGS", "Check the start time and the place, then save again."],
    ["RATE_LIMITED", "Slow down a moment, then try again."],
  ])("shows %s inline and keeps the values", async (code, message) => {
    const onSave = vi.fn().mockRejectedValue(new ConvexError({ code, retryAfter: 1000 }));
    renderPage({ onSave });
    await userEvent.type(screen.getByLabelText("Where"), "Max's place");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.getByLabelText<HTMLInputElement>("Where").value).toBe("Max's place");
    expect(within(screen.getByRole("button", { name: "Save" })).queryByText(/Saving/)).toBeNull();
  });
});
