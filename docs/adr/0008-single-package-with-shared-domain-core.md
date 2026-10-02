# One package with a pure domain core shared by backend and UI

The repo is one Bun package, not a monorepo. `shared/` holds the pure scheduling logic: dates and the Booking Window, the answer cycle, the month summary with Best Nights, name rules, and legal versions. Both `convex/` and `src/` import it. The GM month query returns raw rows, and the client derives the grid, the day panel, and Best Nights with `summarizeMonth`. That logic lives in one deep, plain-data module instead of being split across query handlers and hooks as in Lonir.

## Considered Options

- Lonir's layout (`packages/schedule`, `packages/backend`, `apps/nextsession`): workspaces and cross-package builds cost more than they give for a product this size.
- Deriving the summary in Convex queries: more server reads on every month or selection change, and the logic would only be testable through the backend.
