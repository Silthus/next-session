# Proof for #23: Prove it in production

`e2e/production.spec.ts` run with `BASE_URL=<url> bun run e2e:prod`. No local backend; it drives the deployed app on the prod Convex deployment.

## Runs on `https://next-session.silthus.workers.dev`

| Log | What it shows |
| --- | --- |
| [red-1-apex-before-cutover](logs/red-1-apex-before-cutover.log) | Step 1 against `https://next-session.link` before #22's cutover: the apex 301s to Lonir, and the origin assertion stops the run before it touches Lonir |
| [green-1-step1-workers-dev](logs/green-1-step1-workers-dev.log) | Step 1 alone, green on workers.dev |
| [red-2-join-label-workers-dev](logs/red-2-join-label-workers-dev.log) | All seven steps, red at step 3: an empty roster labels the field "Your name" |
| [red-3-switcher-flake-workers-dev](logs/red-3-switcher-flake-workers-dev.log) | Step 2 flaked: the switcher menu closed when the Group screen finished loading |
| [green-3-run1](logs/green-3-run1-workers-dev.log), [run2](logs/green-3-run2-workers-dev.log), [run3](logs/green-3-run3-workers-dev.log) | All seven steps green, three runs in a row |
| [check-1](logs/check-1.log) | `bun run check` on the branch |
| [normal-e2e-list](logs/normal-e2e-list.log) | `bun run e2e --list`: the normal suite does not pick up the production spec |

Screenshots from the last green run: [workers-dev/](workers-dev/). The HTML report summary: [report-index.png](workers-dev/report-index.png) and [report-test.png](workers-dev/report-test.png).

The HTML report and the traces stay off this branch: a trace records the throwaway Account's password as typed.
