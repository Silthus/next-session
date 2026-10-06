# Apex run for #23

`BASE_URL=https://next-session.link bun run e2e:prod` after #22's cutover (`/` answers 200 with the new app).

| Log | What it shows |
| --- | --- |
| [apex-run-1](apex-run-1.log) | Merged `main` at `c12c383`: red at step 5. Since #49, the toast live region stays mounted and the Group loading state has `role="status"`, so a bare `getByRole("status")` matched two elements. The app worked, and the `afterEach` deleted the run's Group |
| [apex-run-2-toast-fix](apex-run-2-toast-fix.log) | [#53](https://github.com/Silthus/next-session/pull/53)'s branch, with both toast lookups on `toastRegion`: green, all seven steps |
| [apex-run-3-merged-main](apex-run-3-merged-main.log) | **Merged `main` at `67fe709`, after the green deploy: all seven steps green on `https://next-session.link` in 7.1 s** |
| [check](check.log) | `bun run check` on #53's branch (613 tests) |

Screenshots from run 3: [1](1-link-created.png) · [2](2-group-renamed.png) · [3](3-player-answered.png) · [4 GM](4-gm-session-scheduled.png) · [4 Player](4-player-sees-session.png) · [5 saved](5-gm-saved.png) · [5 elsewhere](5-logged-in-elsewhere.png) · [7](7-link-gone.png). HTML report summary: [index](report-index.png), [test](report-test.png).
