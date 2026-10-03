/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as groups from "../groups.js";
import type * as model_access from "../model/access.js";
import type * as model_errors from "../model/errors.js";
import type * as model_gms from "../model/gms.js";
import type * as model_groups from "../model/groups.js";
import type * as model_rateLimits from "../model/rateLimits.js";
import type * as roster from "../roster.js";
import type * as schedule from "../schedule.js";
import type * as sessions from "../sessions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  groups: typeof groups;
  "model/access": typeof model_access;
  "model/errors": typeof model_errors;
  "model/gms": typeof model_gms;
  "model/groups": typeof model_groups;
  "model/rateLimits": typeof model_rateLimits;
  roster: typeof roster;
  schedule: typeof schedule;
  sessions: typeof sessions;
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
