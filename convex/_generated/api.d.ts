/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminStatus from "../adminStatus.js";
import type * as attendance from "../attendance.js";
import type * as auditLogs from "../auditLogs.js";
import type * as authTest from "../authTest.js";
import type * as bootstrap from "../bootstrap.js";
import type * as bootstrapAction from "../bootstrapAction.js";
import type * as http from "../http.js";
import type * as hrCore from "../hrCore.js";
import type * as financialReports from "../financialReports.js";
import type * as payroll from "../payroll.js";
import type * as finance from "../finance.js";
import type * as employeeActions from "../employeeActions.js";
import type * as hrSetup from "../hrSetup.js";
import type * as invitations from "../invitations.js";
import type * as leaveManagement from "../leaveManagement.js";
import type * as productionRecords from "../productionRecords.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as securityChecks from "../securityChecks.js";
import type * as shifts from "../shifts.js";
import type * as stations from "../stations.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminStatus: typeof adminStatus;
  attendance: typeof attendance;
  auditLogs: typeof auditLogs;
  authTest: typeof authTest;
  bootstrap: typeof bootstrap;
  bootstrapAction: typeof bootstrapAction;
  http: typeof http;
  hrCore: typeof hrCore;
  financialReports: typeof financialReports;
  payroll: typeof payroll;
  finance: typeof finance;
  employeeActions: typeof employeeActions;
  hrSetup: typeof hrSetup;
  invitations: typeof invitations;
  leaveManagement: typeof leaveManagement;
  productionRecords: typeof productionRecords;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  securityChecks: typeof securityChecks;
  shifts: typeof shifts;
  stations: typeof stations;
  users: typeof users;
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
