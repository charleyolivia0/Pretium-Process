/* Stub until you run `npx convex dev`. Do not edit. */
export const api = {
  users: {
    current: "users:current",
    listUsers: "users:listUsers",
    updateUserRole: "users:updateUserRole",
    setUserActive: "users:setUserActive",
  },
  projects: {
    listProjects: "projects:listProjects",
    getProjectById: "projects:getProjectById",
    getDashboardSummary: "projects:getDashboardSummary",
    createProject: "projects:createProject",
    updateProject: "projects:updateProject",
    updateProjectHealth: "projects:updateProjectHealth",
  },
  tasks: {
    listTasksByProject: "tasks:listTasksByProject",
    createTask: "tasks:createTask",
    updateTask: "tasks:updateTask",
    updateTaskStatus: "tasks:updateTaskStatus",
  },
  documents: {
    listDocumentsByProject: "documents:listDocumentsByProject",
    createDocumentRecord: "documents:createDocumentRecord",
    deleteDocumentRecord: "documents:deleteDocumentRecord",
  },
  accounting: {
    listAccountingRecordsByProject: "accounting:listAccountingRecordsByProject",
    createAccountingRecord: "accounting:createAccountingRecord",
    updateAccountingRecord: "accounting:updateAccountingRecord",
  },
};
export const internal = {};
