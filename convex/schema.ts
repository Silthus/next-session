import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const answerValue = v.union(v.literal("free"), v.literal("maybe"), v.literal("busy"));

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
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
    tipsConfirmedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_tipsCodeHash", ["tipsCodeHash"]),

  groups: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    shareToken: v.string(),
    previousShareToken: v.optional(v.string()),
    shareTokenRotatedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
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
  }).index("by_groupId_and_date", ["groupId", "date"]),

  mailVolume: defineTable({ day: v.string(), count: v.number() }).index("by_day", ["day"]),

  sessionMailStates: defineTable({
    groupId: v.id("groups"),
    date: v.string(),
    sessionId: v.id("sessions"),
    change: v.union(v.literal("scheduled"), v.literal("cancelled")),
    changedAt: v.number(),
    notify: v.optional(v.boolean()),
    settled: v.optional(v.boolean()),
  }).index("by_groupId_and_date", ["groupId", "date"]),

  saveClaims: defineTable({
    anonymousUserId: v.id("users"),
    codeHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_anonymousUserId", ["anonymousUserId"]),
});
