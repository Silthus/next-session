import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

declare const process: { env: Record<string, string | undefined> };

const PRODUCT = "next-session";
const SERVICE_NAME = "next-session-convex";
const EVENT_PREFIX = "next_session:";

type UserActor = Pick<Doc<"users">, "_id" | "email" | "isAnonymous" | "analyticsObjectedAt">;
type PlayerActor = { playerId: Id<"players"> };
export type Actor = UserActor | PlayerActor;

export type ServerEvent =
  | { name: "link_created"; actor: Actor; group_id: string }
  | { name: "group_created"; actor: Actor; group_id: string }
  | { name: "account_created"; actor: Actor; method: "password" | "google" }
  | { name: "groups_saved"; actor: Actor; group_count: number }
  | { name: "player_joined"; actor: Actor; group_id: string; claimed: boolean }
  | { name: "player_claimed"; actor: Actor; group_id: string }
  | { name: "player_released"; actor: Actor; group_id: string }
  | {
      name: "session_scheduled";
      actor: Actor;
      group_id: string;
      player_count: number;
      is_first_for_group: boolean;
    }
  | { name: "session_unscheduled"; actor: Actor; group_id: string }
  | { name: "share_link_rotated"; actor: Actor; group_id: string };

type PropertyValue = string | number | boolean | Record<string, boolean>;

export type PostHogEvent = {
  event: string;
  distinct_id: string;
  timestamp: string;
  properties: Record<string, PropertyValue>;
};

const logAttributes = v.record(v.string(), v.union(v.string(), v.number(), v.boolean()));

export const logRecord = v.object({
  level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
  body: v.string(),
  attributes: logAttributes,
  time: v.number(),
});

export type LogRecord = Infer<typeof logRecord>;
type LogLevel = LogRecord["level"];

export async function track(ctx: MutationCtx, event: ServerEvent) {
  if (!telemetryEnabled() || hasObjected(event.actor)) return;
  await ctx.scheduler.runAfter(0, internal.telemetry.send, {
    events: [JSON.stringify(toPostHogEvent(event, Date.now()))],
    logs: [],
  });
}

export async function serverLog(
  ctx: MutationCtx,
  level: LogLevel,
  body: string,
  attributes: LogRecord["attributes"],
) {
  if (!telemetryEnabled()) return;
  await ctx.scheduler.runAfter(0, internal.telemetry.send, {
    events: [],
    logs: [{ level, body, attributes, time: Date.now() }],
  });
}

export function postHogProjectToken() {
  return process.env.POSTHOG_PROJECT_TOKEN;
}

function telemetryEnabled() {
  return Boolean(postHogProjectToken());
}

function hasObjected(actor: Actor) {
  return isUser(actor) && actor.analyticsObjectedAt !== undefined;
}

export function toPostHogEvent(event: ServerEvent, now: number): PostHogEvent {
  const { name, actor, ...fields } = event;
  return {
    event: `${EVENT_PREFIX}${name}`,
    distinct_id: distinctIdOf(actor),
    timestamp: new Date(now).toISOString(),
    properties: {
      product: PRODUCT,
      ...fields,
      ...personProperties(event),
      ...(isTestAccount(actor) ? { is_test_account: true } : {}),
    },
  };
}

function personProperties({ name, actor }: ServerEvent): Record<string, PropertyValue> {
  if (!isAccount(actor)) return { $process_person_profile: false };
  if (name === "account_created") return { $set: { next_session_account: true } };
  return {};
}

function distinctIdOf(actor: Actor) {
  return isUser(actor) ? `${PRODUCT}:${actor._id}` : `${PRODUCT}:player:${actor.playerId}`;
}

function isUser(actor: Actor): actor is UserActor {
  return "_id" in actor;
}

function isAccount(actor: Actor) {
  return isUser(actor) && actor.isAnonymous !== true;
}

function isTestAccount(actor: Actor) {
  return isUser(actor) && actor.email !== undefined && /@[^@]*\.test$/i.test(actor.email);
}

const SEVERITY: Record<LogLevel, { severityNumber: number; severityText: string }> = {
  info: { severityNumber: 9, severityText: "INFO" },
  warn: { severityNumber: 13, severityText: "WARN" },
  error: { severityNumber: 17, severityText: "ERROR" },
};

export function toOtlpLogs(records: LogRecord[]) {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            otlpAttribute("service.name", SERVICE_NAME),
            otlpAttribute("product", PRODUCT),
          ],
        },
        scopeLogs: [{ scope: { name: SERVICE_NAME }, logRecords: records.map(toOtlpLogRecord) }],
      },
    ],
  };
}

function toOtlpLogRecord({ level, body, attributes, time }: LogRecord) {
  return {
    timeUnixNano: `${time}000000`,
    ...SEVERITY[level],
    body: { stringValue: body },
    attributes: Object.entries(attributes).map(([key, value]) => otlpAttribute(key, value)),
  };
}

function otlpAttribute(key: string, value: string | number | boolean) {
  return { key, value: otlpValue(value) };
}

function otlpValue(value: string | number | boolean) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { boolValue: value };
  return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
}
