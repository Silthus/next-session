# Proof for #23: Prove it in production

`e2e/production.spec.ts`, run with `BASE_URL=<url> bun run e2e:prod`. It needs no local backend and drives the deployed app on the prod Convex deployment. Merged in [#50](https://github.com/Silthus/next-session/pull/50) as `7102086`.

## Runs

| Log | What it shows |
| --- | --- |
| [red-1-apex-before-cutover](logs/red-1-apex-before-cutover.log) | The first spec against `https://next-session.link` before #22's cutover. The apex 301s to Lonir, and the origin check fails |
| [green-1-step1-workers-dev](logs/green-1-step1-workers-dev.log) | Step 1 alone, green on workers.dev |
| [red-2-join-label-workers-dev](logs/red-2-join-label-workers-dev.log) | All seven steps, red at step 3: an empty roster labels the field "Your name" |
| [red-3-switcher-flake-workers-dev](logs/red-3-switcher-flake-workers-dev.log) | Step 2 flaked: the switcher menu closed when the Group screen finished loading |
| [green-3-run1](logs/green-3-run1-workers-dev.log), [run2](logs/green-3-run2-workers-dev.log), [run3](logs/green-3-run3-workers-dev.log) | All seven steps green, three runs in a row |
| [red-4-cleanup-after-failed-step6](logs/red-4-cleanup-after-failed-step6-workers-dev.log) | Step 6 broken on purpose (expects 399). The `afterEach` deleted the saved Group, and its trace shows navigate → switcher → Delete → `/` with no error |
| [red-5-apex-redirect-check](logs/red-5-apex-redirect-check.log) | After qa-swarm round 1, the apex fails at `GET / (no redirects) → 301` in 119 ms, before the browser loads anything |
| [green-4](logs/green-4-round1-fixes-workers-dev.log), [green-5](logs/green-5-round2-fixes-workers-dev.log) | Green after each qa-swarm round's fixes |
| [green-6-merged-main-workers-dev](logs/green-6-merged-main-workers-dev.log) | **Merged `main` after the green deploy: all seven steps on `https://next-session.silthus.workers.dev`** |
| [check-1](logs/check-1.log), [check-2](logs/check-2-round1.log), [check-3](logs/check-3-round2.log) | `bun run check` (568 tests) on each head |
| [normal-e2e-list](logs/normal-e2e-list.log) | `bun run e2e --list`: 45 tests in 5 files, without the production spec |

Screenshots from the merged-main run: [workers-dev/](workers-dev/). The HTML report summary: [report-index.png](workers-dev/report-index.png) and [report-test.png](workers-dev/report-test.png).

## The password stays out of the evidence

- The password reaches the field through `context.exposeFunction` and the native value setter, never `fill`. Trace DOM snapshots are off.
- A synthetic page with a known marker: the marker isn't in `trace.zip` or the HTML report data. A real prod trace has no `password` field. The Convex sign-in goes over the WebSocket, which traces don't record.
- The field is cleared right after submit. A synthetic stuck sheet with a failing expect printed `textbox "Password": MARKER…` in `error-context.md` without the clear, and an empty `textbox "Password"` with it.
- The HTML report and the traces still stay off this branch. Screenshots of the report go here instead.

## Apex run

Pending #22's cutover. The redirect rule still 301s `https://next-session.link/` to Lonir.

qa-swarm ledger: [qa-swarm-ledger.md](qa-swarm-ledger.md).
