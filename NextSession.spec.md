# Next Session

Next Session schedules tabletop game nights: a GM shares one link with their group, players mark the days they can play, and the GM picks the date.
owners: @Silthus

## trust levels
- visitor (outside): anyone on the web without a session, including whoever holds a Share Link; the Share Link is the only Player credential
- signed-in user (outside): a caller Convex Auth has identified, an Anonymous GM or an Account; the identity is verified, its intent is not
- operator: the Convex scheduler, its crons and the deploy configuration, run by the project itself
- store: the Groups, Players, Answers, Sessions and Accounts in the Convex database
- egress: what leaves the system: email, and events sent to PostHog

## invariants
