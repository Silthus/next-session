# Web

The single-page web app: the landing, the GM surface, the player surface on the Share Link, My groups, Tips and the legal pages.

## entrances
- route /: the landing, where a visitor creates their link
  handler: Route in routes/index.tsx
  trust: visitor
  control: none — the route only renders client code; every read and write it triggers enters through a Backend entrance that carries its own control
- route /g/$groupId: the GM surface for one Group
  handler: Route in routes/g.$groupId.tsx
  trust: signed-in user
  control: none — the route only renders client code; every read and write it triggers enters through a Backend entrance that carries its own control
- route /g/$groupId/settings: the Time and place page, where the GM sets when and where the Group plays
  handler: Route in routes/g.$groupId_.settings.tsx
  trust: signed-in user
  control: none — the route only renders client code; every read and write it triggers enters through a Backend entrance that carries its own control
- route /s/$shareToken: the player surface behind a Share Link
  handler: Route in routes/s.$shareToken.tsx
  trust: visitor
  control: none — the route only renders client code; every read and write it triggers enters through a Backend entrance that carries its own control
- route /me: My groups for an Account
  handler: Route in routes/me.tsx
  trust: signed-in user
  control: none — the route only renders client code; every read and write it triggers enters through a Backend entrance that carries its own control
- route /tips: the page the Welcome Mail links to, where an Account confirms Tips
  handler: Route in routes/tips.tsx
  trust: signed-in user
  control: none — the route only renders client code; every read and write it triggers enters through a Backend entrance that carries its own control
- route /terms: the Terms
  handler: Route in routes/terms.tsx
  trust: visitor
  control: none — the route only renders client code; every read and write it triggers enters through a Backend entrance that carries its own control
- route /privacy: the Privacy Policy
  handler: Route in routes/privacy.tsx
  trust: visitor
  control: none — the route only renders client code; every read and write it triggers enters through a Backend entrance that carries its own control
- route /imprint: the imprint
  handler: Route in routes/imprint.tsx
  trust: visitor
  control: none — the route only renders client code; every read and write it triggers enters through a Backend entrance that carries its own control

## invariants
