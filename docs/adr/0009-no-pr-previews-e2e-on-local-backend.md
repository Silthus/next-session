# No PR preview deployments; CI runs end-to-end tests on a local Convex backend

Convex preview deployments are not on the Free plan and the dev deployment is shared, so a preview frontend would talk to whatever backend the dev deployment last received. Instead, every PR runs Playwright against `vite dev` and a local Convex backend started by `bun run e2e`, which needs no Convex login (verified on CLI 1.46.0). Production deploys only from `main`.

## Considered Options

- Workers preview URLs (`wrangler versions upload --preview-alias pr-<n>`) against the dev deployment: honest for UI-only PRs, misleading for backend PRs. Cheap to add later.
- E2E against the shared dev deployment, serialized by a concurrency group: parallel PRs would push conflicting functions and schemas to it.

## Isolated local runs

`bun run e2e` snapshots the current worktree into a fresh temporary project, excluding developer env files and local backend state. Convex uses its supported project-local `.convex/local/default` storage there, with a unique anonymous deployment name. The runner allocates separate frontend, cloud and site ports, and uses the generated env file to configure auth on that backend. Vite caches and Playwright artifacts are separate per run. The original `.env.local` and generated files stay untouched.

The runner forwards shutdown to Playwright, which stops its own web server and Convex subprocesses before the runner removes its temporary project. Reports and failure traces remain under `test-results/<run>/`. Existing signup tests use unique identities against fresh state; production signup limits stay unchanged.

CI installs Chromium and WebKit. Chromium runs the existing suite; `mobile-webkit` runs only `mobile-copy.spec.ts` for sharing and clipboard refusal on a phone. Run that project alone with `bun run e2e --project mobile-webkit`.
