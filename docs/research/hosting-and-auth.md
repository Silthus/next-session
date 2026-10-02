# Hosting on Convex with next-session.link, and free auth

Last reviewed: 2026-10-02
Status: Research. Resolves [#4](https://github.com/Silthus/next-session/issues/4) on map [#1](https://github.com/Silthus/next-session/issues/1).

## Answers

| Question | Recommendation | Needs Michael? |
| --- | --- | --- |
| 1. Static hosting | Backend on Convex Free. SPA on **Cloudflare Workers Static Assets**, not `@convex-dev/static-hosting`. | No, apart from the token in question 2. |
| 2. Custom domain | Convex Free cannot serve `next-session.link`. Attach it to the Worker as a **Workers Custom Domain**. The zone is already on Cloudflare, so nothing changes at the registrar. Skip Vercel. | Yes: one Cloudflare API token, and deleting the current redirect rule at cutover. |
| 3. Auth | Ship **Password** (`@convex-dev/auth` 0.0.96, no email verification) now. Add **Google OAuth** as the first upgrade. | Password: no. Google: one OAuth client. |
| 4. Provisioning | Yes. The CLI token on this machine can create projects, deployments, deploy keys and env vars without prompts. A `next-session` project already exists. | No. |

The two Cloudflare steps are the only things that block a launch on `next-session.link`. Everything else an agent can do alone.

---

## 1. Static hosting

### How `@convex-dev/static-hosting` works

- The latest version is `0.2.1`, published 2026-07-28. It needs `convex ^1.37.0` ([npm](https://registry.npmjs.org/@convex-dev/static-hosting), [repo](https://github.com/get-convex/static-hosting)). Lonir and `convex-starter-template` both pin `0.1.4`.
- Files live in Convex file storage that the component owns. A `staticAssets` table maps each path to a `storageId` and content type (`src/component/schema.ts`). Before 0.2, files lived in the app's own storage.
- One HTTP action serves every request. It reads the file with `ctx.storage.get()` and streams it back (`src/component/http.ts`). So **every uncached asset hit costs one function call plus file egress**.
- Caching (`src/component/serving.ts`):
  - Hashed assets get `max-age=31536000, immutable`. Everything else gets `max-age=0, must-revalidate`.
  - The ETag is the `storageId`, and `If-None-Match` returns a 304.
  - It handles GET only, not HEAD.
- SPA fallback is on by default: paths without a file extension get `index.html`.
- Routing has two modes:
  - **Default:** the component owns `/` and the app's own `http.ts` routes move under `/api`.
  - **Keep-root:** `registerStaticRoutes(http, components.x)` runs after your own routes. The README recommends this when auth routes must stay at the root, which is the case for Convex Auth.
  - Both references use keep-root: [lonir `http.ts`](https://github.com/Omni-GM/lonir/blob/main/packages/backend/convex/http.ts) and starter `packages/backend/convex/http.ts`. Each calls `auth.addHttpRoutes(http)` first, then loops over a `STATIC_HOSTING_APPS` registry.
- Deploys:
  - Either run `convex deploy --cmd '<build>' --cmd-url-env-var-name VITE_CONVEX_URL`, then `static-hosting upload --dist <dir> --component <name> --prod`.
  - Or run `npx @convex-dev/static-hosting deploy` in one step.
  - Lonir's `packages/backend/scripts/deploy.ts` uses the two-step form (steps 3/6 and 4/6).
  - The upload uses the Convex CLI's normal auth, so CI needs only `CONVEX_DEPLOY_KEY`.
  - Each upload is atomic, with at most 1,800 files per deploy.
  - Preview deploy keys break the upload: [issue #38](https://github.com/get-convex/static-hosting/issues/38). Lonir works around it by swapping the preview key for an admin key and URL (`deploy.ts`, the `authorizePreview` comment).
- docs.convex.dev has no first-party frontend hosting. "Deploy Your Frontend" lists only Vercel, Netlify and custom hosting ([custom](https://docs.convex.dev/production/hosting/custom)).
  - The `*.convex.app` publish path in the official Convex Claude plugin (`skills/labs-quickstart`) is a moderated labs gateway.
  - That skill says custom domains are not part of the release, so it does not fit here.

### Free plan limits

Two sources agree:

- [convex.dev/pricing](https://www.convex.dev/pricing) and [limits](https://docs.convex.dev/production/state/limits).
- This team's own entitlements, read through the dashboard API on 2026-10-02 (`GET /api/dashboard/teams/<id>/get_entitlements`, team `omni-gm`).

| Resource | Free cap per month |
| --- | --- |
| Function calls | 1,000,000 |
| Action compute | 20 GB-hours |
| Database storage / bandwidth | 0.5 GB / 1 GB |
| File storage / file bandwidth | 1 GB / 1 GB |
| Deployments | 40 |
| Custom domains | `customDomainsEnabled: false`, `maxCustomDomains: 0` |

Free caps are hard: when one is hit, the app starts failing. Serving the SPA from Convex would spend the 1 GB file bandwidth on JS bundles that the app's real data also needs.

### Recommendation

Put the Vite build on **Cloudflare Workers Static Assets** and keep the whole backend on Convex Free.

- [Cloudflare's billing page](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) says "Requests to static assets are free and unlimited". Limits are 20,000 files and 25 MiB per file.
- SPA fallback is one line of config: `assets.not_found_handling = "single-page-application"` ([docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)).
- The deploy is `convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL`, then `wrangler deploy`.

**Call:** Workers Static Assets for the SPA.
**Alternative:** keep `@convex-dev/static-hosting` on `<prod>.convex.site` and put a small proxy Worker in front for the domain (option B in section 2). That keeps one deploy pipeline, but every page load counts against Convex's hard caps, and every Worker request counts against the Worker's 100k-a-day free cap.

**Note for the conductor:** the map's Destination says "Convex static hosting". This call moves the SPA to Cloudflare and keeps everything else on Convex. Switching back is one line.

---

## 2. Custom domain

### Who owns `next-session.link` today

Checked on this machine on 2026-10-02:

- **Registrar:** Spaceship, Inc. Registered 2026-02-22, expires 2027-02-22, status `client transfer prohibited`, no DNSSEC (RDAP via `rdap.org`).
- **Nameservers:** `jobs.ns.cloudflare.com` and `nena.ns.cloudflare.com`. That is a full Cloudflare setup, which is what Workers Custom Domains need on the Free plan ([partial setup is Business+](https://developers.cloudflare.com/dns/zone-setups/partial-setup/)).
- **Records:** the apex resolves to Cloudflare anycast IPs (`104.21.80.222`, `172.67.187.75`), so it is proxied. There are no apex MX or TXT records, and `www` has no record.
- **Resend records are already in place:** a DKIM key at `resend._domainkey`, plus MX and SPF on `send.next-session.link`. So the domain is already set up for sending through Resend. Ticket [#8](https://github.com/Silthus/next-session/issues/8) found the same and adds that the zone is a Free Cloudflare zone on Michael's account, with the redirect as a Single Redirect rule.
- **Behaviour:** `https://next-session.link/<path>` returns a Cloudflare **301 to `https://little-spaniel-709.convex.site/<path>`**, keeping the path and query. That is Lonir's provisioned prod deployment ([lonir ADR-0178](https://github.com/Omni-GM/lonir/blob/main/docs/adr/0178-provisioned-convex-origin-with-path-mounted-next-session.md)).
- **History:** Lonir served this domain as a Convex custom domain until the project went back to the free plan, and then got 403s (ADR-0178). So the current redirect is a Cloudflare Redirect Rule in Michael's Cloudflare account.

### Options

| Option | Free? | Works? | Notes |
| --- | --- | --- | --- |
| Convex custom domain | No | n/a | "Custom domains require a Convex Pro plan" ([docs](https://docs.convex.dev/production/custom-domains)). Pro is $25 per developer per month. |
| Proxied CNAME to `<prod>.convex.site` | Yes | **No** | Convex routes by Host, and I measured a **403** for `Host: next-session.link` against a `convex.site` origin. Host header override is Enterprise-only in [Origin Rules](https://developers.cloudflare.com/rules/origin-rules/). A CNAME across accounts into Convex's own Cloudflare setup also risks [Error 1014](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1014/). |
| A. Workers Static Assets + Custom Domain | Yes | Yes | Cloudflare creates the DNS record and certificate. The apex is supported ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)). |
| B. Proxy Worker, `fetch()` to `convex.site` | Yes, up to 100k req/day | Yes | `fetch()` sends the `convex.site` Host, so the 403 does not apply. [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/): 100,000 requests a day, then Error 1027. |
| Keep the redirect rule, retarget it | Yes | Partly | Zero code, but the address bar ends on `*.convex.site`. Good as a stopgap, not as the destination. |
| Vercel Hobby | Yes | Yes | Custom domains are allowed, but Hobby is "restricted to non-commercial personal use only" ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)). It would also move DNS for no gain, since the zone is already on Cloudflare. |

### Recommendation

**Option A.** The zone is already on Cloudflare and Workers Static Assets is free, so Vercel is not needed. Nothing changes at Spaceship.

Agent-run auth on the domain (section 3) needs no extra work:

- Convex Auth keeps tokens in `localStorage`.
- Sign-in runs through the `auth:signIn` action over the Convex client. So a frontend on `next-session.link` talking to `<prod>.convex.cloud` works across origins.
- Set `SITE_URL=https://next-session.link`. Source: `@convex-dev/auth@0.0.96` `src/react/index.tsx`, `src/server/implementation/redirects.ts`, and the [manual setup docs](https://labs.convex.dev/auth/setup/manual).

### What the cutover needs from Michael

1. **Create one Cloudflare API token** with these permissions:
   - Account: *Workers Scripts: Edit*.
   - Zone `next-session.link`: *Workers Routes: Edit* and *DNS: Edit*.

   Store it and the account ID as GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` on `Silthus/next-session`, and in 1Password for local deploys. From then on an agent deploys and attaches the custom domain with `wrangler`.
2. **Delete the Single Redirect rule** that sends `next-session.link` to `little-spaniel-709.convex.site`, at cutover time. Redirect Rules run before Workers, so it would shadow the new app. The token above does not cover rulesets on purpose, which keeps it narrow.
3. Nothing at the registrar.

An agent can do everything else alone: build, `wrangler deploy`, attach the custom domain, set Convex env vars, and the deploy key.

---

## 3. Auth

### Package state

- `@convex-dev/auth` **0.0.96** (2026-09-30) is the stable v1. Convex still calls it beta ([docs.convex.dev/auth](https://docs.convex.dev/auth), [labs.convex.dev/auth](https://labs.convex.dev/auth)).
- v2 is `2.0.0-alpha.2`. Its docs say "Do not use Convex Auth v2 in production projects yet" ([auth-v2 preview](https://auth-v2.previews.convex.dev)).
- `@convex-dev/better-auth` 0.12.5 exists, but it adds a second auth stack for no gain here.

### Providers

Sources: the 0.0.96 tarball and the [Convex Auth docs](https://labs.convex.dev/auth).

| Method | Extra credential | Notes |
| --- | --- | --- |
| **Password** (no verify) | None | Minimum 8 characters (`src/providers/Password.ts`). The email address is never proven, and there is **no reset** without an email sender. `convex-starter-template` ships exactly this. |
| Password + verify/reset | `AUTH_RESEND_KEY` | Uses `ResendOTP` / `ResendOTPPasswordReset` ([docs](https://labs.convex.dev/auth/config/passwords)). |
| Magic link / OTP | `AUTH_RESEND_KEY` | Unverified Resend domains can send only to the account owner ([docs](https://labs.convex.dev/auth/config/email), [Resend 403](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain.md)). |
| Anonymous | None | Instant session. Not needed: players already use share links without an account. |
| **Google OAuth** | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | The redirect URI is `https://<prod>.convex.site/api/auth/callback/google` (`src/server/oauth/convexAuth.ts:13`). Separate clients for dev and prod ([docs](https://labs.convex.dev/auth/config/oauth/google)). |
| GitHub OAuth | `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | OAuth apps are created only in the web UI ([docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)). Worse fit for a non-developer audience. |
| Passkeys | None | Only in the v2 alpha (`setupUsernamePasskey`, `rpId: "next-session.link"`). Not production-ready. |

Every method needs `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL`.

- An agent sets these without prompts: `npx @convex-dev/auth --prod --web-server-url https://next-session.link` takes defaults when there is no TTY (`src/cli/index.ts`).
- Or generate the keys with the [`generateKeys.mjs`](https://labs.convex.dev/auth/setup/manual) script and run `convex env set`. The starter's `scripts/setup.ts` already does this.

### Free tiers for email sign-in

Every option needs DNS records on `next-session.link` before strangers can receive mail. Resend's are already there:

- [Resend](https://resend.com/pricing): 100 a day, 3,000 a month, 3 domains. Michael already has an account, with `lonir.app` verified in Lonir's `transactionalEmail`.
- [Mailgun](https://www.mailgun.com/pricing/): 100 a day.
- [Brevo](https://www.brevo.com/pricing/): 300 a day, after manual account approval.
- [Postmark](https://postmarkapp.com/pricing): 100 a month.
- [SES](https://aws.amazon.com/ses/pricing/): a sandbox until a manual review.

### Google OAuth for strangers

- With only basic scopes (`openid email profile`) in production, any Google user can sign in.
- There is no warning screen and no 100-user cap. Verification is needed only to show the app's name and logo ([Google](https://support.google.com/cloud/answer/15549945); the 100-user cap is for sensitive scopes, [Google](https://support.google.com/cloud/answer/7454865)).
- The consent screen will name `<prod>.convex.site` as the callback host, because Convex custom domains need Pro.

### Recommendation

- **v1, agent-only:** Password with no verification. It is stable, free, and needs no credential.
  - Risk: a lost password is a lost account, and nothing stops someone signing up with an address they don't own.
  - That is acceptable for a free scheduling tool whose players don't need accounts.
- **First upgrade, one credential:** Google OAuth.
  - It is the smoothest sign-up (one click, verified email) and needs no DNS.
  - Michael spends about 5 minutes in the Google Cloud console and puts `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in 1Password. An agent then runs `convex env set --prod`.
- **Second upgrade, one credential:** Resend, for password reset and email verification. The domain's Resend DNS records already exist, so Michael only needs to make a sending API key scoped to `next-session.link` and store it as `AUTH_RESEND_KEY` in 1Password. Free tier: 100 a day.

**Call:** Password now, Google next.
**Alternatives:**

- Google-only from day one. Smoothest, but it blocks launch on Michael.
- Passkeys through the v2 alpha. No credential, but alpha churn.

---

## 4. Provisioning

Checked read-only on this machine with Convex CLI `1.46.0` (`bunx convex@latest`) and the access token in `~/.convex/config.json`.

- **The token works for the dashboard API.**
  - `GET https://api.convex.dev/api/dashboard/teams` lists two teams: `omni-gm` (Free) and `lonir`.
  - `GET /v1/teams/<id>/list_projects` and `GET /v1/projects/<id>/list_deployments` both answer.
  - `/v1/token_details` rejects it because it is a user token, not an OAuth team token.
- **A `next-session` project already exists** in team `omni-gm`, created 2026-10-02 17:54 UTC, presumably by the provisioning ticket. It has:
  - dev `helpful-mastiff-82` (`dev/michael`)
  - prod `pleasant-sockeye-672`, which has had functions pushed; `https://pleasant-sockeye-672.convex.site/` returned 404 at the time.
- **The team is on Free:** `customDomainsEnabled: false`, `managementApiEnabled: false`.

These CLI commands run without prompts once the access token is present (from `--help` on 1.46.0):

```sh
bunx convex project create next-session --team omni-gm        # project only
bunx convex deployment create production --type prod --default  # add prod
bunx convex deployment create dev/agent --type dev --select     # dev + write .env.local
bunx convex deployment token create ci --prod                   # prints a prod deploy key
bunx convex env set --prod SITE_URL https://next-session.link
bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL
```

- **Recommendation:** the agent provisions alone. Create a prod deploy key, store it with `gh secret set CONVEX_DEPLOY_KEY`, and let CI deploy from `main`.
- **Michael's part:** only the Cloudflare token for the frontend half, plus the optional Google client.

---

## Human steps vs agent steps

| Step | Who |
| --- | --- |
| Convex project, deployments, deploy key, env vars, auth keys | Agent |
| Build, `convex deploy`, `wrangler deploy`, attach the Workers Custom Domain | Agent, once the Cloudflare token exists |
| Cloudflare API token, stored as GitHub secrets and in 1Password | **Michael** |
| Delete the `next-session.link` → `little-spaniel-709.convex.site` Single Redirect rule at cutover | **Michael** |
| Google OAuth client (optional upgrade) | **Michael** |
| Resend API key (optional; the domain's DNS records already exist) | **Michael** |
| Anything at the Spaceship registrar | Nobody |

## Sources

- `@convex-dev/static-hosting@0.2.1` tarball: `src/component/{schema,http,serving}.ts`, `src/cli/deploy.ts`, README, INTEGRATION.md.
- `@convex-dev/auth@0.0.96` tarball: `src/providers/{Password,Anonymous}.ts`, `src/server/oauth/convexAuth.ts`, `src/server/implementation/{redirects,tokens}.ts`, `src/cli/index.ts`, `src/react/index.tsx`.
- Convex: [pricing](https://www.convex.dev/pricing), [limits](https://docs.convex.dev/production/state/limits), [custom domains](https://docs.convex.dev/production/custom-domains), [custom hosting](https://docs.convex.dev/production/hosting/custom), [auth](https://docs.convex.dev/auth), [Convex Auth](https://labs.convex.dev/auth).
- Cloudflare: [Workers static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Origin Rules](https://developers.cloudflare.com/rules/origin-rules/), [Error 1014](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1014/), [partial setup](https://developers.cloudflare.com/dns/zone-setups/partial-setup/).
- Vercel: [Hobby](https://vercel.com/docs/plans/hobby), [fair use](https://vercel.com/docs/limits/fair-use-guidelines).
- Google: [unverified apps](https://support.google.com/cloud/answer/7454865), [consent screen publishing](https://support.google.com/cloud/answer/15549945).
- Local checks, 2026-10-02: `dig` (NS/A/AAAA/MX/TXT/SOA), RDAP, `curl -I` on `next-session.link`, a Host-mismatch probe against `little-spaniel-709.convex.site`, read-only Convex dashboard API calls, and `convex --help` on 1.46.0.
- Lonir (read-only clone): `packages/backend/convex/http.ts`, `packages/backend/scripts/deploy.ts`, `docs/adr/0086-player-vanity-domain-via-second-custom-domain.md`, `docs/adr/0178-…`, `docs/research/cross-origin-session-handoff-cost.md`, `docs/specs/next-session-link-standalone.md`.
- `convex-starter-template`: `packages/backend/convex/{auth,http,convex.config,auth.config}.ts`, `scripts/setup.ts`.
