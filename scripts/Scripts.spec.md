# Scripts

Developer and CI scripts: local auth keys, the end-to-end runner and its local backend, and brand asset generation.

## entrances
- auth env: a developer or CI prints the Convex Auth key environment for a deployment
  handler: auth-env.ts
  trust: operator
- e2e run: a developer or CI runs the Playwright suite against a local backend
  handler: e2e-run.ts
  trust: operator
- e2e serve: the e2e runner serves the app from an isolated project on the port it chose
  handler: e2e-run.ts
  trust: operator
- e2e server: the end-to-end runner starts the local Convex backend and the web app
  handler: e2e-server.ts
  trust: operator
- generate brand: a developer regenerates the brand assets
  handler: generate-brand.ts
  trust: operator

## invariants
