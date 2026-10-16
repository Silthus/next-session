# Player

The player surface behind the Share Link: joining with a name, when and where the next Sessions are with **Add to calendar** for the Calendar download, answering days on the calendar, Fill Rest, and keeping the group on an Account.

## invariants
- invites only when promised: The player page shows **Invite sent** and "Calendar invites go to" only when `player.group` says the caller gets calendar invites for this Group.
  over: every value player.group's calendarInvites takes for an Account that keeps the Group: on, off and null
  via: shows Invite sent and where invites go only when player.group says the Account gets them
  because: the page can't see whether mail goes out; if it decided "invites are on" itself it would tell a player an invite was sent when Session mail skips them (Session emails off, a .test address, a deployment without RESEND_API_KEY), and that player would stop adding the night by hand (#165)
  crossing: store -> signed-in user
  refuted: PlayerScreen passed inviteSent for any non-null calendarInvites, so off showed Invite sent -> the oracle failed by name (2026-10-16)
  entrances: none
  kinds: none
