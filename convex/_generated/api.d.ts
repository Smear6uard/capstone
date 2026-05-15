/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as disputes from "../disputes.js";
import type * as exams from "../exams.js";
import type * as material_chunks from "../material_chunks.js";
import type * as proctor_snapshots from "../proctor_snapshots.js";
import type * as questions from "../questions.js";
import type * as sessions from "../sessions.js";
import type * as students from "../students.js";
import type * as tutor_conversations from "../tutor_conversations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  disputes: typeof disputes;
  exams: typeof exams;
  material_chunks: typeof material_chunks;
  proctor_snapshots: typeof proctor_snapshots;
  questions: typeof questions;
  sessions: typeof sessions;
  students: typeof students;
  tutor_conversations: typeof tutor_conversations;
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
