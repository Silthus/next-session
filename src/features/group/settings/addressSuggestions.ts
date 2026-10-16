import { createContext, useContext } from "react";

export type Address = { street: string; town: string };

export type AddressSearch = (text: string, signal: AbortSignal) => Promise<Address[]>;

export type AddressSuggestions = {
  isStopped: () => boolean;
  search: AddressSearch;
};

const AddressSuggestionsContext = createContext<AddressSuggestions | null>(null);

export const AddressSuggestionsProvider = AddressSuggestionsContext.Provider;

export function useAddressSuggestions() {
  return useContext(AddressSuggestionsContext);
}

export function suggestUntilFailure(search: AddressSearch): AddressSuggestions {
  let stopped = false;
  return {
    isStopped: () => stopped,
    search: async (text, signal) => {
      try {
        return await search(text, signal);
      } catch (error) {
        if (!signal.aborted) stopped = true;
        throw error;
      }
    },
  };
}

const geoapifyAutocomplete = "https://api.geoapify.com/v1/geocode/autocomplete";
const suggestionLimit = 5;
const patienceMs = 5000;

type GeoapifyAnswer = { results: { address_line1: string; address_line2?: string }[] };

export function geoapifySearch({
  apiKey,
  language,
  fetch = globalThis.fetch,
}: {
  apiKey: string;
  language: string;
  fetch?: typeof globalThis.fetch;
}): AddressSearch {
  return async (text, signal) => {
    const url = new URL(geoapifyAutocomplete);
    url.search = new URLSearchParams({
      text,
      limit: String(suggestionLimit),
      lang: primaryLanguage(language),
      format: "json",
      apiKey,
    }).toString();
    const answer = await withPatience(signal, async (patient) => {
      const response = await fetch(url, { signal: patient });
      if (!response.ok) throw new Error(`Geoapify answered ${String(response.status)}`);
      return (await response.json()) as GeoapifyAnswer;
    });
    return answer.results.map((result) => ({
      street: result.address_line1,
      town: result.address_line2 ?? "",
    }));
  };
}

function primaryLanguage(language: string) {
  return language.split("-")[0] ?? language;
}

async function withPatience<T>(signal: AbortSignal, run: (patient: AbortSignal) => Promise<T>) {
  const patient = new AbortController();
  const giveUp = () => patient.abort(signal.reason);
  signal.addEventListener("abort", giveUp);
  const timer = setTimeout(
    () => patient.abort(new DOMException("Geoapify timed out", "TimeoutError")),
    patienceMs,
  );
  try {
    return await run(patient.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", giveUp);
  }
}
