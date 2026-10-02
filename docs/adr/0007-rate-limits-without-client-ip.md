# Rate limits key on the GM, Group, and Player, plus one global bucket for anonymous sign-ups

Convex functions do not see the client IP, so per-IP limits are impossible without a proxy in front of Convex. Every public write goes through `@convex-dev/rate-limiter` with a key the server can trust: the GM id for creating Groups and starting a Save, the Group id for joins and the total answer rate, the Player id for answer taps, and one global token bucket for anonymous sign-ups. Hard caps back them up: 100 Players per Group and 50 Groups per GM.

## Considered Options

- Cloudflare Turnstile on Create your link: strong, but it adds a widget and a site key to the one-click path. It is the first upgrade if abuse ever drains the global bucket.
- Rate limiting by IP in the Worker: the Worker serves static files and never sees Convex traffic.

## Consequences

- A flood of anonymous sign-ups can lock real visitors out for a minute. The bucket is sized well above organic traffic, and hitting it is the signal to add Turnstile.
