# No PR preview deployments; CI runs end-to-end tests on a local Convex backend

Convex preview deployments are not on the Free plan and the dev deployment is shared, so a preview frontend would talk to whatever backend the dev deployment last received. Instead, every PR runs Playwright against `vite dev` and a local Convex backend started with `CONVEX_AGENT_MODE=anonymous convex dev`, which needs no Convex login (verified on CLI 1.46.0). Production deploys only from `main`.

## Considered Options

- Workers preview URLs (`wrangler versions upload --preview-alias pr-<n>`) against the dev deployment: honest for UI-only PRs, misleading for backend PRs. Cheap to add later.
- E2E against the shared dev deployment, serialized by a concurrency group: parallel PRs would push conflicting functions and schemas to it.
