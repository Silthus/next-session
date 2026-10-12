- change what reaches PostHog: A change to what the product sends to PostHog ships with the Privacy Policy that describes it.
  when: edit convex/model/telemetry.ts | edit src/lib/telemetry.ts
  step: name every new event, property or log field, and check that none carries a Group name, Player name, Share Token, claim code, email or campaign parameter
    leaves: the redaction tests in convex/telemetry.callSites.test.ts and src/lib/telemetry.test.ts pass with the new fields
  step: when a new kind of data leaves, or its retention or opt-out changes, update docs/legal/privacy.md and bump privacy and effective in LEGAL_VERSIONS
    leaves: shared/legal.test.ts pins the new version
  step: when nothing new in kind leaves, say so in the pull request instead of bumping the version
  pitfall: campaign parameters and the search keyword reached PostHog until they were stripped by hand (2db5a98)
  learned: 8194063, 76001e6, 2db5a98
  invariants: convex/no personal data to posthog
  because: the shared PostHog project and the Privacy Policy are a promise to every Player; each telemetry change so far needed a policy version, and one leak was found only after it shipped
