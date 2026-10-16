import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { SESSION_STATES } from "../shared/sessions";

export const answerValue = v.union(v.literal("free"), v.literal("maybe"), v.literal("busy"));

export const sessionState = v.union(...SESSION_STATES.map((state) => v.literal(state)));

export const mailProvider = v.union(v.literal("resend"), v.literal("workflows"));

export const datedSession = v.object({ date: v.string(), state: sessionState });

export const publishedSession = v.object({
  state: sessionState,
  start: v.optional(v.number()),
  end: v.optional(v.number()),
  location: v.optional(v.string()),
  summary: v.optional(v.string()),
  revision: v.number(),
});

export const frozenEntry = v.object({
  uid: v.string(),
  sequence: v.number(),
  start: v.number(),
  end: v.number(),
  summary: v.string(),
});

export const frozenNight = v.object({ date: v.string(), entry: frozenEntry });

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    acceptedTermsVersion: v.optional(v.string()),
    acceptedPrivacyVersion: v.optional(v.string()),
    acceptedLegalAt: v.optional(v.number()),
    analyticsObjectedAt: v.optional(v.number()),
    tipsRequestedAt: v.optional(v.number()),
    tipsConsentVersion: v.optional(v.string()),
    tipsCodeHash: v.optional(v.string()),
    sessionEmailsEnabled: v.optional(v.boolean()),
    remindersEnabled: v.optional(v.boolean()),
    reminderLinkToken: v.optional(v.string()),
    tipsConfirmedAt: v.optional(v.number()),
    profileImageId: v.optional(v.id("_storage")),
    profileImageFrom: v.optional(v.string()),
    calendarFeedToken: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_tipsCodeHash", ["tipsCodeHash"])
    .index("by_reminderLinkToken", ["reminderLinkToken"])
    .index("by_calendarFeedToken", ["calendarFeedToken"]),

  groups: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    shareToken: v.string(),
    previousShareToken: v.optional(v.string()),
    shareTokenRotatedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    startTime: v.optional(v.string()),
    lengthMinutes: v.optional(v.number()),
    timeZone: v.optional(v.string()),
    location: v.optional(v.string()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_shareToken", ["shareToken"])
    .index("by_expiresAt", ["expiresAt"]),

  players: defineTable({
    groupId: v.id("groups"),
    name: v.string(),
    nameKey: v.string(),
    userId: v.optional(v.id("users")),
  })
    .index("by_groupId_and_nameKey", ["groupId", "nameKey"])
    .index("by_userId_and_groupId", ["userId", "groupId"]),

  groupRemovals: defineTable({
    userId: v.id("users"),
    groupId: v.id("groups"),
  })
    .index("by_userId_and_groupId", ["userId", "groupId"])
    .index("by_groupId", ["groupId"]),

  answers: defineTable({
    groupId: v.id("groups"),
    playerId: v.id("players"),
    date: v.string(),
    answer: answerValue,
  })
    .index("by_groupId_and_date", ["groupId", "date"])
    .index("by_playerId_and_date", ["playerId", "date"]),

  sessions: defineTable({
    groupId: v.id("groups"),
    date: v.string(),
    state: v.optional(sessionState),
    changedAt: v.optional(v.number()),
    published: v.optional(publishedSession),
    startTime: v.optional(v.string()),
    lengthMinutes: v.optional(v.number()),
    location: v.optional(v.string()),
    remindersRevision: v.optional(v.number()),
    sequence: v.optional(v.number()),
  })
    .index("by_groupId_and_date", ["groupId", "date"])
    .index("by_date", ["date"]),

  calendarCancellations: defineTable({
    groupId: v.id("groups"),
    ownerId: v.id("users"),
    recipients: v.array(v.id("users")),
    nights: v.array(frozenNight),
    cursor: v.number(),
  }),

  mailVolume: defineTable({
    day: v.string(),
    count: v.number(),
    provider: v.optional(mailProvider),
  }).index("by_provider_and_day", ["provider", "day"]),

  saveClaims: defineTable({
    anonymousUserId: v.id("users"),
    codeHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_anonymousUserId", ["anonymousUserId"]),
});
