import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AddressSuggestionsProvider,
  suggestUntilFailure,
  type Address,
  type AddressSearch,
  type AddressSuggestions,
} from "./addressSuggestions";
import { LocationField } from "./LocationField";

const hauptstrasse: Address = { street: "Hauptstraße 5", town: "10115 Berlin, Germany" };
const hauptallee: Address = { street: "Hauptallee 12", town: "60311 Frankfurt, Germany" };

function searchAnswering(addresses: Address[]) {
  return vi.fn<AddressSearch>().mockResolvedValue(addresses);
}

function searchHangingUntilCancelled() {
  return vi.fn<AddressSearch>(
    (_text, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancelled")));
      }),
  );
}

function Where({ initial, onSubmit }: { initial: string; onSubmit: () => void }) {
  const [location, setLocation] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="where">Where</label>
      <LocationField id="where" value={location} onChange={setLocation} />
    </form>
  );
}

function renderField({
  suggestions,
  initial = "",
}: {
  suggestions: AddressSuggestions | null;
  initial?: string;
}) {
  const onSubmit = vi.fn();
  const view = render(
    <AddressSuggestionsProvider value={suggestions}>
      <Where initial={initial} onSubmit={onSubmit} />
    </AddressSuggestionsProvider>,
  );
  return { onSubmit, unmount: view.unmount };
}

const user = () => userEvent.setup({ delay: null });
const pause = () => act(() => vi.advanceTimersByTimeAsync(300));
const combobox = () => screen.getByRole<HTMLInputElement>("combobox", { name: "Where" });
const options = () => within(screen.getByRole("listbox")).getAllByRole("option");
const credit = () => screen.queryByRole("link", { name: "Geoapify" });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LocationField with address suggestions", () => {
  it("asks for nothing until three letters are typed", async () => {
    const search = searchAnswering([hauptstrasse]);
    renderField({ suggestions: suggestUntilFailure(search) });

    await user().type(combobox(), "Ha");
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(search).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(credit()).toBeNull();
  });

  it("offers to keep the typed text first, then addresses as street over town, with the credit", async () => {
    const search = searchAnswering([hauptstrasse, hauptallee]);
    renderField({ suggestions: suggestUntilFailure(search) });

    await user().type(combobox(), "Haupt");
    await pause();

    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]?.[0]).toBe("Haupt");
    const [keep, first, second] = options();
    expect(keep?.textContent).toBe("Keep “Haupt”");
    expect(within(first!).getByText("Hauptstraße 5")).toBeTruthy();
    expect(within(first!).getByText("10115 Berlin, Germany")).toBeTruthy();
    expect(second?.textContent).toContain("Hauptallee 12");
    expect(combobox().getAttribute("aria-expanded")).toBe("true");
    expect(credit()?.getAttribute("href")).toBe("https://www.geoapify.com/");
    expect(
      screen.getByRole("link", { name: "© OpenStreetMap contributors" }).getAttribute("href"),
    ).toBe("https://www.openstreetmap.org/copyright");
  });

  it("waits for a pause in typing and cancels the request still in flight", async () => {
    const search = searchHangingUntilCancelled();
    renderField({ suggestions: suggestUntilFailure(search) });

    await user().type(combobox(), "Hauptstr");
    await pause();
    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]?.[0]).toBe("Hauptstr");

    await user().type(combobox(), "aße");
    await pause();

    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[0]?.[1].aborted).toBe(true);
    expect(search.mock.calls[1]?.[0]).toBe("Hauptstraße");
    expect(combobox()).toBeTruthy();
  });

  it("drops an answer that arrives after the GM left the field", async () => {
    let answer: (addresses: Address[]) => void = () => undefined;
    const search = vi.fn<AddressSearch>(() => new Promise((resolve) => (answer = resolve)));
    renderField({ suggestions: suggestUntilFailure(search) });

    await user().type(combobox(), "Haupt");
    await pause();
    act(() => combobox().blur());
    await act(() => Promise.resolve(answer([hauptstrasse])));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox().getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the typed text on Enter when no row is chosen, without submitting the form", async () => {
    const search = searchAnswering([]);
    const { onSubmit } = renderField({ suggestions: suggestUntilFailure(search) });

    await user().type(combobox(), "Max’s place");
    await pause();
    expect(
      screen.getByText("No address matches. That’s fine, players see what you typed."),
    ).toBeTruthy();

    await user().keyboard("{Enter}");

    expect(combobox().value).toBe("Max’s place");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(credit()).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("replaces the text with a row picked by the arrow keys, and asks nothing more for it", async () => {
    const search = searchAnswering([hauptstrasse, hauptallee]);
    renderField({ suggestions: suggestUntilFailure(search) });

    await user().type(combobox(), "Haupt");
    await pause();
    await user().keyboard("{ArrowDown}");
    expect(combobox().getAttribute("aria-activedescendant")).toBe(options()[0]?.id);
    await user().keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");
    expect(options()[1]?.getAttribute("aria-selected")).toBe("true");
    await user().keyboard("{Enter}");
    await pause();

    expect(combobox().value).toBe("Hauptstraße 5, 10115 Berlin, Germany");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(search).toHaveBeenCalledOnce();
  });

  it("leaves the keys to a composition still in progress", async () => {
    renderField({ suggestions: suggestUntilFailure(searchAnswering([hauptstrasse])) });

    await user().type(combobox(), "Haupt");
    await pause();
    await user().keyboard("{ArrowDown}{ArrowDown}");
    fireEvent.keyDown(combobox(), { key: "Enter", isComposing: true });

    expect(combobox().value).toBe("Haupt");
    expect(options()[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("replaces the text with a clicked row", async () => {
    renderField({ suggestions: suggestUntilFailure(searchAnswering([hauptstrasse, hauptallee])) });

    await user().type(combobox(), "Haupt");
    await pause();
    await user().click(screen.getByRole("option", { name: /Hauptallee 12/ }));

    expect(combobox().value).toBe("Hauptallee 12, 60311 Frankfurt, Germany");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes the list on Escape and keeps the text", async () => {
    renderField({ suggestions: suggestUntilFailure(searchAnswering([hauptstrasse])) });

    await user().type(combobox(), "Haupt");
    await pause();
    await user().keyboard("{Escape}");

    expect(combobox().value).toBe("Haupt");
    expect(combobox().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("asks nothing more for the rest of the visit after a failed request, and still takes text", async () => {
    const search = vi.fn<AddressSearch>().mockRejectedValue(new Error("Geoapify answered 429"));
    const suggestions = suggestUntilFailure(search);
    const { unmount } = renderField({ suggestions });

    await user().type(combobox(), "Haupt");
    await pause();
    const plain = screen.getByRole<HTMLInputElement>("textbox", { name: "Where" });
    await user().type(plain, "straße 5");
    await pause();

    expect(search).toHaveBeenCalledOnce();
    expect(plain.value).toBe("Hauptstraße 5");
    expect(screen.queryByRole("combobox")).toBeNull();

    unmount();
    renderField({ suggestions, initial: "Hauptstraße 5" });
    await user().type(screen.getByRole("textbox", { name: "Where" }), " Berlin");
    await pause();
    expect(search).toHaveBeenCalledOnce();
  });
});

describe("LocationField without address suggestions", () => {
  it("is a plain text field that offers nothing", async () => {
    renderField({ suggestions: null });

    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "Where" });
    await user().type(field, "Hauptstraße 5");
    await pause();

    expect(field.value).toBe("Hauptstraße 5");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
