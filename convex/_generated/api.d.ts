/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as auth from "../auth.js";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as me from "../me.js";
import type * as model_access from "../model/access.js";
import type * as model_errors from "../model/errors.js";
import type * as model_gms from "../model/gms.js";
import type * as model_groups from "../model/groups.js";
import type * as model_players from "../model/players.js";
import type * as model_rateLimits from "../model/rateLimits.js";
import type * as player from "../player.js";
import type * as roster from "../roster.js";
import type * as schedule from "../schedule.js";
import type * as sessions from "../sessions.js";
import type * as signInOptions from "../signInOptions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  cleanup: typeof cleanup;
  crons: typeof crons;
  groups: typeof groups;
  http: typeof http;
  me: typeof me;
  "model/access": typeof model_access;
  "model/errors": typeof model_errors;
  "model/gms": typeof model_gms;
  "model/groups": typeof model_groups;
  "model/players": typeof model_players;
  "model/rateLimits": typeof model_rateLimits;
  player: typeof player;
  roster: typeof roster;
  schedule: typeof schedule;
  sessions: typeof sessions;
  signInOptions: typeof signInOptions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
