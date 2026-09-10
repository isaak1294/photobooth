/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as captureStatus from "../captureStatus.js";
import type * as captures from "../captures.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as printJobs from "../printJobs.js";
import type * as printStatus from "../printStatus.js";
import type * as renders from "../renders.js";
import type * as sessions from "../sessions.js";
import type * as styles from "../styles.js";
import type * as themes from "../themes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  captureStatus: typeof captureStatus;
  captures: typeof captures;
  http: typeof http;
  identity: typeof identity;
  printJobs: typeof printJobs;
  printStatus: typeof printStatus;
  renders: typeof renders;
  sessions: typeof sessions;
  styles: typeof styles;
  themes: typeof themes;
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

export declare const components: {};
