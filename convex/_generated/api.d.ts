/* Stub until you run `npx convex dev`. Do not edit. */
import type { FunctionReference } from "convex/server";

export declare const api: {
  users: {
    current: FunctionReference<"query", "public", Record<string, never>, unknown>;
    listUsers: FunctionReference<"query", "public", Record<string, never>, unknown>;
    updateUserRole: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
    setUserActive: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
  };
  projects: {
    listProjects: FunctionReference<"query", "public", Record<string, unknown>, unknown>;
    getProjectById: FunctionReference<"query", "public", { projectId: string }, unknown>;
    getDashboardSummary: FunctionReference<"query", "public", Record<string, never>, unknown>;
    createProject: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
    updateProject: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
    updateProjectHealth: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
  };
  tasks: {
    listTasksByProject: FunctionReference<"query", "public", { projectId: string }, unknown>;
    createTask: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
    updateTask: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
    updateTaskStatus: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
  };
  documents: {
    listDocumentsByProject: FunctionReference<"query", "public", { projectId: string }, unknown>;
    createDocumentRecord: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
    deleteDocumentRecord: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
  };
  accounting: {
    listAccountingRecordsByProject: FunctionReference<"query", "public", { projectId: string }, unknown>;
    createAccountingRecord: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
    updateAccountingRecord: FunctionReference<"mutation", "public", Record<string, unknown>, unknown>;
  };
};
export declare const internal: Record<string, unknown>;
