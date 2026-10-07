# Share icons supplemental shipping proof

Issue #94's added share-icon scope shipped in [PR #100](https://github.com/Silthus/next-session/pull/100), merged as `6c44434de30766b4da38f582abcf11c6dc0a65e0`. #95 already shipped the original logo, favicon, font and shape scope.

The original Claude implementation and Codex cross-family approval are preserved. The review approved with no material findings. The reviewer could run TypeScript but its read-only sandbox blocked tests and browser proof; the local gates, CI and screenshots supply those checks. Recovery introduced no new implementation. It merged upstream #93's isolated e2e harness without conflict. The gate head `057b54ddb99d0e768e10a180b9535575837374af` and squash merge have identical trees.

- Red-first seam: `ShareLinkCard`, rendered and queried by role and unchanged accessible name. All four old text symbols fail the icon assertions in `logs/red-share-icons.log`.
- Local green gate: `logs/check-share-recovery.log`, 76 test files and 1,137 tests passed, followed by build and Worker dry run.
- Local e2e: `logs/e2e-share-recovery.log`, 67 passed including mobile WebKit, 29 opt-in screenshot cases skipped.
- Original review: `logs/codex-review-share.md`, approve with no findings.
- PR CI: https://github.com/Silthus/next-session/actions/runs/37586397517
- Main deploy: https://github.com/Silthus/next-session/actions/runs/37586744655, with its jobs saved in `logs/deploy-share-recovery.json`.
- Production proof: `logs/prod-share-recovery.log` and `screenshots/prod-share-icons/`. At 390 CSS px, light and dark, the actual landing and GM share targets have SVG marks, preserved names, 44 px targets and no horizontal overflow. WhatsApp and Telegram URLs are checked. No external share message is sent.
- Headless Chromium and WebKit expose no native share API. The additional `native-api-stub` screenshots enable that API solely to reveal the fourth production icon. They do not prove a device's native share sheet. The existing mobile e2e tests verify the share payload with an API stub.
- One anonymous test Group is created through the normal UI and removed in `finally`. The script verifies zero remaining test Groups. No production Account is created.
- T3 preview was attempted first but AppArmor rejected its browser sandbox. Playwright is the authorized fallback.

To repeat the anonymous production visual check from a checkout with dependencies installed:

```sh
bun tools/prod-share-proof-recovery.ts /absolute/output/directory /absolute/repository/path
```

The code uses inline Simple Icons marks rather than adding an icon dependency. Accessible names, hrefs and handlers stay the same. The change is a two-way door and has no danger-area hunks. No follow-up code is needed for this scope.
