# Next Session

Next Session schedules tabletop sessions. A GM shares one link with their group, players mark the days they can play, and the GM picks the next session date.

This repo is the standalone port of `apps/nextsession` from the `Omni-GM/lonir` monorepo.

## Stack

Bun, TypeScript, React, Vite, TanStack Router, Tailwind, Convex, and Convex Auth. Use `bun`. Never use npm or yarn.

## Where things are decided

- `docs/spec.md`: architecture, schema, auth, routes, test seams, CI, cutover, and the build plan.
- `DESIGN.md`: the UI direction. The spec overrides it where they differ.
- `docs/legal/`: draft Terms, Privacy Policy, and Imprint.

## Agent skills

### Issue tracker

GitHub issues on `Silthus/next-session`, with wayfinder maps as sub-issue trees and native issue dependencies. See `docs/agents/issue-tracker.md`.

### Domain docs

Single context: `CONTEXT.md` at the root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.
