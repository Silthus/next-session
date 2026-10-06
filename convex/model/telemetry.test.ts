import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { toOtlpLogs, toPostHogEvent, type ServerEvent } from "./telemetry";

const NOW = Date.UTC(2026, 9, 6, 15, 0);
const ACCOUNT_EMAIL = "ada@example.com";

const account = { _id: "account1" as Id<"users">, _creationTime: NOW, email: ACCOUNT_EMAIL };
const anonymousGm = { _id: "anonymous1" as Id<"users">, _creationTime: NOW, isAnonymous: true };
const player = { playerId: "player1" as Id<"players"> };

const everyEvent: ServerEvent[] = [
  { name: "link_created", actor: anonymousGm, group_id: "group1" },
  { name: "group_created", actor: account, group_id: "group1" },
  { name: "account_created", actor: account, method: "google", tips_requested: false },
  { name: "groups_saved", actor: account, group_count: 2 },
  { name: "player_joined", actor: player, group_id: "group1", claimed: false },
  { name: "player_claimed", actor: account, group_id: "group1" },
  { name: "player_released", actor: account, group_id: "group1" },
  {
    name: "session_scheduled",
    actor: account,
    group_id: "group1",
    player_count: 4,
    is_first_for_group: true,
  },
  { name: "session_unscheduled", actor: account, group_id: "group1" },
  { name: "share_link_rotated", actor: account, group_id: "group1" },
  { name: "tips_confirmed", actor: account },
];

describe("toPostHogEvent", () => {
  it("names the event under next_session, marks the product, and keeps the event's fields", () => {
    expect(
      toPostHogEvent({ name: "group_created", actor: account, group_id: "group1" }, NOW),
    ).toEqual({
      event: "next_session:group_created",
      distinct_id: "next-session:account1",
      timestamp: "2026-10-06T15:00:00.000Z",
      properties: { product: "next-session", group_id: "group1" },
    });
  });

  it("keeps an Anonymous GM out of person profiles", () => {
    expect(
      toPostHogEvent({ name: "link_created", actor: anonymousGm, group_id: "group1" }, NOW),
    ).toMatchObject({
      distinct_id: "next-session:anonymous1",
      properties: { $process_person_profile: false },
    });
  });

  it("identifies a Player without an Account by the Player, without a person profile", () => {
    expect(
      toPostHogEvent(
        { name: "player_joined", actor: player, group_id: "group1", claimed: false },
        NOW,
      ),
    ).toEqual({
      event: "next_session:player_joined",
      distinct_id: "next-session:player:player1",
      timestamp: "2026-10-06T15:00:00.000Z",
      properties: {
        product: "next-session",
        group_id: "group1",
        claimed: false,
        $process_person_profile: false,
      },
    });
  });

  it("sets only next_session_account on the person of a new Account", () => {
    expect(
      toPostHogEvent(
        { name: "account_created", actor: account, method: "password", tips_requested: true },
        NOW,
      ).properties,
    ).toEqual({
      product: "next-session",
      method: "password",
      tips_requested: true,
      $set: { next_session_account: true },
    });
  });

  it.each(["prod-proof+1@example.test", "e2e@Next-Session.TEST"])(
    "flags %s as a test account",
    (email) => {
      expect(
        toPostHogEvent({ name: "groups_saved", actor: { ...account, email }, group_count: 1 }, NOW)
          .properties,
      ).toMatchObject({ is_test_account: true });
    },
  );

  it.each(["ada@example.com", "ada@test.example.com", "ada@contest"])(
    "does not flag %s as a test account",
    (email) => {
      expect(
        toPostHogEvent({ name: "groups_saved", actor: { ...account, email }, group_count: 1 }, NOW)
          .properties,
      ).not.toHaveProperty("is_test_account");
    },
  );

  it.each(everyEvent)("never carries the actor's email in $name", (event) => {
    const sent = JSON.stringify(
      toPostHogEvent({ ...event, actor: { ...event.actor, email: ACCOUNT_EMAIL } }, NOW),
    );

    expect(sent).not.toContain(ACCOUNT_EMAIL);
    expect(sent).not.toContain("example.com");
  });
});

describe("toOtlpLogs", () => {
  it("wraps log records in one OTLP/JSON resource marked as Next Session's Convex service", () => {
    expect(
      toOtlpLogs([
        {
          level: "warn",
          body: "Expiry sweep finished",
          attributes: { groups_expired: 3, ratio: 0.5, complete: true, kind: "daily" },
          time: NOW,
        },
      ]),
    ).toEqual({
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "next-session-convex" } },
              { key: "product", value: { stringValue: "next-session" } },
            ],
          },
          scopeLogs: [
            {
              scope: { name: "next-session-convex" },
              logRecords: [
                {
                  timeUnixNano: `${NOW}000000`,
                  severityNumber: 13,
                  severityText: "WARN",
                  body: { stringValue: "Expiry sweep finished" },
                  attributes: [
                    { key: "groups_expired", value: { intValue: 3 } },
                    { key: "ratio", value: { doubleValue: 0.5 } },
                    { key: "complete", value: { boolValue: true } },
                    { key: "kind", value: { stringValue: "daily" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it.each([
    ["info", 9, "INFO"],
    ["error", 17, "ERROR"],
  ] as const)("maps %s to severity %i", (level, severityNumber, severityText) => {
    const [record] = toOtlpLogs([{ level, body: "x", attributes: {}, time: NOW }]).resourceLogs[0]!
      .scopeLogs[0]!.logRecords;

    expect(record).toMatchObject({ severityNumber, severityText });
  });
});
