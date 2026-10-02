# The Share Token is the only Player credential; Player identity stays on the device

Players never sign in. Every player function takes the Share Token and checks that the Player belongs to the Group behind it. Which Player this browser answers as is stored in `localStorage` (`next-session.players`, keyed by Group id so it survives a token rotation), not on the server. Anyone holding the link can answer as any Player; rotating the token is the GM's remedy. This ports Lonir ADR-0077, which replaced anonymous Player sessions and server-side claims after they added cost without adding real protection.

## Considered Options

- Anonymous Convex Auth sessions for Players with server-side claims (Lonir before ADR-0077).
- A secret link per Player: stronger, but the GM would send a different link to every Player, which breaks the one-link product.

## Consequences

- Public mutations need rate limits keyed by Group and Player (ADR-0007).
- New Share Tokens are 10 characters (60 bits) from `A-Za-z0-9_-`. Lonir's were 8, and the length difference lets the Worker tell legacy links apart (ADR-0005).
