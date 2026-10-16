import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geoapifySearch } from "./addressSuggestions";

function fetchAnswering(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

function geoapifyAnswer(results: { address_line1: string; address_line2: string }[]) {
  return new Response(JSON.stringify({ results }), { status: 200 });
}

const neverCancelled = () => new AbortController().signal;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("geoapifySearch", () => {
  it("asks for at most five addresses in the browser's language, in any country", async () => {
    const fetch = fetchAnswering(
      geoapifyAnswer([{ address_line1: "Hauptstraße 5", address_line2: "10115 Berlin, Germany" }]),
    );
    const search = geoapifySearch({ apiKey: "geo_test", language: "de-DE", fetch });

    const addresses = await search("Hauptstr", neverCancelled());

    const url = new URL(fetch.mock.calls[0]?.[0] as URL);
    expect(`${url.origin}${url.pathname}`).toBe("https://api.geoapify.com/v1/geocode/autocomplete");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      text: "Hauptstr",
      limit: "5",
      lang: "de",
      format: "json",
      apiKey: "geo_test",
    });
    expect(addresses).toEqual([{ street: "Hauptstraße 5", town: "10115 Berlin, Germany" }]);
  });

  it.each([429, 500, 503])("fails when Geoapify answers %i", async (status) => {
    const search = geoapifySearch({
      apiKey: "geo_test",
      language: "en",
      fetch: fetchAnswering(new Response("", { status })),
    });

    await expect(search("Hauptstr", neverCancelled())).rejects.toThrow(String(status));
  });

  it("fails when Geoapify takes too long", async () => {
    const neverAnswering = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const search = geoapifySearch({ apiKey: "geo_test", language: "en", fetch: neverAnswering });

    const slow = expect(search("Hauptstr", neverCancelled())).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    await slow;
  });
});
