/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounting from "../accounting.js";
import type * as appAssistant from "../appAssistant.js";
import type * as auditLog from "../auditLog.js";
import type * as auth from "../auth.js";
import type * as boardroom from "../boardroom.js";
import type * as changeDocumentTemplates from "../changeDocumentTemplates.js";
import type * as changeFormTemplates from "../changeFormTemplates.js";
import type * as crons from "../crons.js";
import type * as documentPresence from "../documentPresence.js";
import type * as documentVersions from "../documentVersions.js";
import type * as documents from "../documents.js";
import type * as drawingMarkups from "../drawingMarkups.js";
import type * as drawings from "../drawings.js";
import type * as email from "../email.js";
import type * as employeeManualQa from "../employeeManualQa.js";
import type * as employeeManuals from "../employeeManuals.js";
import type * as graphClient from "../graphClient.js";
import type * as http from "../http.js";
import type * as jotformWebhook from "../jotformWebhook.js";
import type * as lib_centralTime from "../lib/centralTime.js";
import type * as lib_geminiFetch from "../lib/geminiFetch.js";
import type * as lib_markupPayload from "../lib/markupPayload.js";
import type * as lib_projectAccess from "../lib/projectAccess.js";
import type * as lib_requireAdmin from "../lib/requireAdmin.js";
import type * as migrations_backfillAssistantMessageUserIds from "../migrations/backfillAssistantMessageUserIds.js";
import type * as migrations_backfillDocumentVersions from "../migrations/backfillDocumentVersions.js";
import type * as migrations_removeEstimating from "../migrations/removeEstimating.js";
import type * as notifications from "../notifications.js";
import type * as outlookResponses from "../outlookResponses.js";
import type * as outlookRules from "../outlookRules.js";
import type * as outlookSubscriptions from "../outlookSubscriptions.js";
import type * as outlookWebhook from "../outlookWebhook.js";
import type * as passwordReset from "../passwordReset.js";
import type * as personalCalendar from "../personalCalendar.js";
import type * as projectCalendar from "../projectCalendar.js";
import type * as projectSitePhotos from "../projectSitePhotos.js";
import type * as projects from "../projects.js";
import type * as roleAccess from "../roleAccess.js";
import type * as safety from "../safety.js";
import type * as sitePhotoMarkups from "../sitePhotoMarkups.js";
import type * as subtradeTodos from "../subtradeTodos.js";
import type * as subtrades from "../subtrades.js";
import type * as tasks from "../tasks.js";
import type * as todoList from "../todoList.js";
import type * as tradePortal from "../tradePortal.js";
import type * as userCustomNotifications from "../userCustomNotifications.js";
import type * as users from "../users.js";
import type * as weeklyDigest from "../weeklyDigest.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounting: typeof accounting;
  appAssistant: typeof appAssistant;
  auditLog: typeof auditLog;
  auth: typeof auth;
  boardroom: typeof boardroom;
  changeDocumentTemplates: typeof changeDocumentTemplates;
  changeFormTemplates: typeof changeFormTemplates;
  crons: typeof crons;
  documentPresence: typeof documentPresence;
  documentVersions: typeof documentVersions;
  documents: typeof documents;
  drawingMarkups: typeof drawingMarkups;
  drawings: typeof drawings;
  email: typeof email;
  employeeManualQa: typeof employeeManualQa;
  employeeManuals: typeof employeeManuals;
  graphClient: typeof graphClient;
  http: typeof http;
  jotformWebhook: typeof jotformWebhook;
  "lib/centralTime": typeof lib_centralTime;
  "lib/geminiFetch": typeof lib_geminiFetch;
  "lib/markupPayload": typeof lib_markupPayload;
  "lib/projectAccess": typeof lib_projectAccess;
  "lib/requireAdmin": typeof lib_requireAdmin;
  "migrations/backfillAssistantMessageUserIds": typeof migrations_backfillAssistantMessageUserIds;
  "migrations/backfillDocumentVersions": typeof migrations_backfillDocumentVersions;
  "migrations/removeEstimating": typeof migrations_removeEstimating;
  notifications: typeof notifications;
  outlookResponses: typeof outlookResponses;
  outlookRules: typeof outlookRules;
  outlookSubscriptions: typeof outlookSubscriptions;
  outlookWebhook: typeof outlookWebhook;
  passwordReset: typeof passwordReset;
  personalCalendar: typeof personalCalendar;
  projectCalendar: typeof projectCalendar;
  projectSitePhotos: typeof projectSitePhotos;
  projects: typeof projects;
  roleAccess: typeof roleAccess;
  safety: typeof safety;
  sitePhotoMarkups: typeof sitePhotoMarkups;
  subtradeTodos: typeof subtradeTodos;
  subtrades: typeof subtrades;
  tasks: typeof tasks;
  todoList: typeof todoList;
  tradePortal: typeof tradePortal;
  userCustomNotifications: typeof userCustomNotifications;
  users: typeof users;
  weeklyDigest: typeof weeklyDigest;
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
