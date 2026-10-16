import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  AddressSuggestionsProvider,
  geoapifySearch,
  suggestUntilFailure,
} from "./features/group/settings/addressSuggestions";
import "./index.css";
import { convexUrl, geoapifyKey } from "./lib/env";
import { initTelemetry, reactErrorReporting } from "./lib/telemetry";
import { routeTree } from "./routeTree.gen";

void initTelemetry();

const convex = new ConvexReactClient(convexUrl());
const router = createRouter({ routeTree });
const geoapify = geoapifyKey();
const addressSuggestions = geoapify
  ? suggestUntilFailure(geoapifySearch({ apiKey: geoapify, language: navigator.language }))
  : null;

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!, reactErrorReporting).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <AddressSuggestionsProvider value={addressSuggestions}>
        <RouterProvider router={router} />
      </AddressSuggestionsProvider>
    </ConvexAuthProvider>
  </StrictMode>,
);
