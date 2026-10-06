import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const USER_ROLES = [
  "project_manager",
  "coordinator",
  "accounting",
  "safety",
  "admin",
  "principal",
  "site_superintendent",
] as const;

const PROJECT_STATUSES = [
  "planning",
  "active",
  "substantial_completion",
  "closed",
] as const;

const HEALTH_STATUSES = ["green", "amber", "red"] as const;

const TASK_STATUSES = ["not_started", "in_progress", "blocked", "done"] as const;

const TASK_CATEGORIES = [
  "safety",
  "coordination",
  "paperwork",
  "scheduling",
] as const;

const ESTIMATE_STATUSES = ["draft", "submitted"] as const;

const COMPLIANCE_DOCUMENT_CATEGORIES = [
  "insurance",
  "wcb_wsib",
  "safety_certificate",
  "license",
  "subtrade_compliance",
  "other",
] as const;

const schema = defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(...USER_ROLES.map((r) => v.literal(r)))),
    createdAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    favouriteProjectIds: v.optional(v.array(v.id("projects"))),
    birthdayAt: v.optional(v.number()),
    employmentStartAt: v.optional(v.number()),
    resumeStorageId: v.optional(v.id("_storage")),
    /** false = hide decorative mascots (corner shimeji, PC/PM corner, etc.); Assistant Chuck header unchanged. */
    mascotsEnabled: v.optional(v.boolean()),
  }).index("email", ["email"]),

  projects: defineTable({
    name: v.string(),
    clientName: v.string(),
    location: v.optional(v.string()),
    startDate: v.optional(v.number()),
    closingDay: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.union(...PROJECT_STATUSES.map((s) => v.literal(s))),
    healthStatus: v.optional(v.union(...HEALTH_STATUSES.map((h) => v.literal(h)))),
    healthNotes: v.optional(v.string()),
    pmId: v.optional(v.id("users")),
    coordinatorId: v.optional(v.id("users")),
    principalId: v.optional(v.id("users")),
    siteSuperId: v.optional(v.id("users")),
    accountsPayableId: v.optional(v.id("users")),
    safetyMemberId: v.optional(v.id("users")),
    siteSupers: v.optional(v.array(v.string())),
    /** Client / jobsite site super contact (distinct from internal siteSuperId). */
    siteContactSuperName: v.optional(v.string()),
    siteContactSuperPhone: v.optional(v.string()),
    siteContactSuperEmail: v.optional(v.string()),
    /** Emergency response plan notes; optional until filled in. */
    siteEmergencyPlanNotes: v.optional(v.string()),
    budgetDocumentUrl: v.optional(v.string()),
    safetyDocumentUrl: v.optional(v.string()),
    /** Site / job safety inspection tracking (Safety dashboard). Epoch ms. */
    safetyLastInspectionAt: v.optional(v.number()),
    safetyNextInspectionAt: v.optional(v.number()),
    projectSheetUrl: v.optional(v.string()),
    /** External link shown on project summary dashboard. */
    summaryLinkUrl: v.optional(v.string()),
    summaryLinkLabel: v.optional(v.string()),
    budget: v.optional(v.number()),
    actualCost: v.optional(v.number()),
    budgetVariance: v.optional(v.number()),
    profitStatus: v.optional(v.string()),
    cashFlowNotes: v.optional(v.string()),
    forecastingNotes: v.optional(v.string()),
    insuranceAndBondsNotes: v.optional(v.string()),
    purchaseOrdersNotes: v.optional(v.string()),
    progressClaimsNotes: v.optional(v.string()),
    quotesNotes: v.optional(v.string()),
    subtradeList: v.optional(v.array(v.string())),
    /** false = startup queue only; omitted/true = visible in Project Tracker lists */
    inProjectTracker: v.optional(v.boolean()),
    /** true when startup summary step is finished (still may be in queue until promoted) */
    startupSummaryComplete: v.optional(v.boolean()),
    /** true = listed on Close Out page; omitted/false = not in close out queue */
    inCloseOut: v.optional(v.boolean()),
    updatedAt: v.number(),
    /** CT day key: last time we notified PM/PC/site super about missing daily report (one nudge per day). */
    lastDailyReportMissingNotifyDayKey: v.optional(v.number()),
    /** Accounting / ERP job or phase code (estimate → job handoff). */
    accountingJobCode: v.optional(v.string()),
    /** Soft handoff acknowledgements and optional kickoff date (not enforced on promote). */
    jobHandoffChecklist: v.optional(
      v.object({
        codesReviewedAt: v.optional(v.number()),
        insuranceReviewedAt: v.optional(v.number()),
        kickoffCompleteAt: v.optional(v.number()),
        kickoffHeldAt: v.optional(v.number()),
        assignmentsReviewedAt: v.optional(v.number()),
      })
    ),
  })
    .index("by_status", ["status"])
    .index("by_updated", ["updatedAt"]),

  projectTasks: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    weatherSummary: v.optional(v.string()),
    photoUrls: v.optional(v.array(v.string())),
    documentUrls: v.optional(v.array(v.string())),
    ownerRole: v.optional(v.union(...USER_ROLES.map((r) => v.literal(r)))),
    ownerUserId: v.optional(v.id("users")),
    status: v.union(...TASK_STATUSES.map((s) => v.literal(s))),
    /** Optional explicit start date; if omitted we treat dueDate as a single-day milestone. */
    startDate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    /** Planned baseline window for schedule variance tracking. */
    baselineStartDate: v.optional(v.number()),
    baselineEndDate: v.optional(v.number()),
    /** Actual execution window; may be partial while work is in progress. */
    actualStartDate: v.optional(v.number()),
    actualEndDate: v.optional(v.number()),
    /** Optional manual progress percent (0-100) for in-progress tasks. */
    progressPercent: v.optional(v.number()),
    category: v.optional(v.union(...TASK_CATEGORIES.map((c) => v.literal(c)))),
    /** Task IDs this task depends on; used for simple Gantt-style shifting. */
    dependsOn: v.optional(v.array(v.id("projectTasks"))),
    /** Daily report: which project subtrades were on site (multi-select). */
    subtradeIdsOnSite: v.optional(v.array(v.id("projectSubtrades"))),
    /** If set, this daily report is listed only under this document folder (not on the root Daily Reports list). */
    dailyReportFolderId: v.optional(v.id("documentFolders")),
    /** Schedule spreadsheet: priority label (e.g. low / high). */
    priority: v.optional(v.string()),
    material: v.optional(v.string()),
    taskCost: v.optional(v.number()),
    scheduleComment: v.optional(v.string()),
    /** True when this task/report was submitted from the standalone trade portal. */
    createdFromPortal: v.optional(v.boolean()),
    /** Portal trade identity that submitted this row. */
    portalAccountId: v.optional(v.id("tradePortalAccounts")),
    /** True when created from Daily Reports UI (excluded from schedule task due reminders). */
    isDailyReport: v.optional(v.boolean()),
    /** Client-provided idempotency key for offline/retry-safe creates. */
    clientMutationId: v.optional(v.string()),
    /** CT day key when we last sent "due soon" for this task (dedupe). */
    lastTaskDueSoonNotifiedDayKey: v.optional(v.number()),
    /** CT day key when we last sent "overdue" for this task (dedupe). */
    lastTaskOverdueNotifiedDayKey: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_portal_account", ["portalAccountId"])
    .index("by_clientMutationId", ["clientMutationId"]),

  documents: defineTable({
    projectId: v.id("projects"),
    folderId: v.optional(v.id("documentFolders")),
    uploadedByUserId: v.id("users"),
    type: v.string(),
    name: v.string(),
    fileUrl: v.string(),
    status: v.optional(v.union(v.literal("paid"), v.literal("unpaid"))),
    createdDate: v.optional(v.number()),
    uploadedAt: v.number(),
    updatedAt: v.optional(v.number()),
    /** Optional: due date for action/response workflows (RFI). */
    workflowDueDate: v.optional(v.number()),
    /**
     * Optional: workflow status (e.g. Draft/Open/Closed for RFIs).
     * Stored as string to keep the initial MVP flexible.
     */
    workflowStatus: v.optional(v.string()),
    /** Optional: who is allowed/expected to respond (RFI ball-in-court assignees). */
    assigneeUserIds: v.optional(v.array(v.id("users"))),
    /** Optional: watchers/distribution (future use). */
    distributionUserIds: v.optional(v.array(v.id("users"))),
    /** Optional: who currently "has the ball" to perform the next required action. */
    ballInCourtUserIds: v.optional(v.array(v.id("users"))),
    /** Used to avoid re-sending due-date reminders every day. */
    workflowLastDueReminderAt: v.optional(v.number()),
    /** Submittal: trade / scope (e.g. Electrical). */
    tradeName: v.optional(v.string()),
    /** Submittal: short note on what the upload is for. */
    description: v.optional(v.string()),
    /** Monthly invoice progress: percent complete (0–100) entered by accounting. */
    billingProgressPercent: v.optional(v.number()),
    /** Optional compliance tracking metadata for expiry reminders. */
    complianceCategory: v.optional(
      v.union(...COMPLIANCE_DOCUMENT_CATEGORIES.map((c) => v.literal(c))),
    ),
    /** Optional issue / effective date for compliance documents. */
    issueDate: v.optional(v.number()),
    /** Optional expiry date for compliance documents. */
    expiryDate: v.optional(v.number()),
    /** Optional subtrade association for company-level compliance documents. */
    subtradeId: v.optional(v.id("projectSubtrades")),
    /** Which of 30, 14, 7 (days) expiry reminders were already sent. */
    expiryReminderMilestonesSent: v.optional(v.array(v.number())),
    /**
     * Stringified JSON capturing structured form inputs for documents whose PDF
     * is generated from a fillable popup (e.g. COR). Stored as a string to
     * keep the documents table flexible across form versions.
     */
    formData: v.optional(v.string()),
    /** Client-provided idempotency key for offline/retry-safe creates. */
    clientMutationId: v.optional(v.string()),
    /** CO created from an approved PCN or COR. */
    sourceDocumentId: v.optional(v.id("documents")),
  })
    .index("by_project", ["projectId"])
    .index("by_project_uploadedAt", ["projectId", "uploadedAt"])
    .index("by_project_folder", ["projectId", "folderId"])
    .index("by_project_compliance", ["projectId", "complianceCategory"])
    .index("by_project_expiry", ["projectId", "expiryDate"])
    .index("by_clientMutationId", ["clientMutationId"])
    .index("by_source_document", ["sourceDocumentId"]),

  /** Active viewers for collaborative document viewing (heartbeat-based). */
  documentViewPresence: defineTable({
    resourceKind: v.union(v.literal("document"), v.literal("drawing"), v.literal("sitePhoto")),
    resourceId: v.string(),
    userId: v.id("users"),
    lastSeenAt: v.number(),
    pageIndex: v.optional(v.number()),
  })
    .index("by_resource", ["resourceKind", "resourceId"])
    .index("by_user_resource", ["userId", "resourceKind", "resourceId"]),

  /** Point-in-time snapshots for document version history and autosave. */
  documentVersions: defineTable({
    documentId: v.id("documents"),
    projectId: v.id("projects"),
    versionNumber: v.number(),
    saveType: v.union(
      v.literal("autosave"),
      v.literal("manual"),
      v.literal("publish"),
      v.literal("upload"),
      v.literal("restore"),
      v.literal("branch"),
    ),
    savedByUserId: v.id("users"),
    savedAt: v.number(),
    label: v.optional(v.string()),
    sourceVersionId: v.optional(v.id("documentVersions")),
    name: v.string(),
    type: v.string(),
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    formData: v.optional(v.string()),
    description: v.optional(v.string()),
    tradeName: v.optional(v.string()),
    status: v.optional(v.union(v.literal("paid"), v.literal("unpaid"))),
    folderId: v.optional(v.id("documentFolders")),
    createdDate: v.optional(v.number()),
    workflowDueDate: v.optional(v.number()),
    workflowStatus: v.optional(v.string()),
    assigneeUserIds: v.optional(v.array(v.id("users"))),
    distributionUserIds: v.optional(v.array(v.id("users"))),
    ballInCourtUserIds: v.optional(v.array(v.id("users"))),
    billingProgressPercent: v.optional(v.number()),
    complianceCategory: v.optional(
      v.union(...COMPLIANCE_DOCUMENT_CATEGORIES.map((c) => v.literal(c))),
    ),
    issueDate: v.optional(v.number()),
    expiryDate: v.optional(v.number()),
    subtradeId: v.optional(v.id("projectSubtrades")),
  })
    .index("by_document_version", ["documentId", "versionNumber"])
    .index("by_document_savedAt", ["documentId", "savedAt"]),

  documentFolders: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_name", ["projectId", "name"]),

  drawingFolders: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    parentFolderId: v.optional(v.id("drawingFolders")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_parent", ["projectId", "parentFolderId"])
    .index("by_project_name", ["projectId", "name"]),

  drawings: defineTable({
    projectId: v.id("projects"),
    folderId: v.optional(v.id("drawingFolders")),
    name: v.string(),
    notes: v.optional(v.string()),
    storageId: v.id("_storage"),
    fileUrl: v.string(),
    uploadedByUserId: v.id("users"),
    uploadedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project_uploadedAt", ["projectId", "uploadedAt"])
    .index("by_project_folder_uploadedAt", ["projectId", "folderId", "uploadedAt"]),

  /** Vector markup (normalized ink paths per PDF page or single raster page). One row per drawing. */
  drawingMarkups: defineTable({
    drawingId: v.id("drawings"),
    projectId: v.id("projects"),
    updatedByUserId: v.id("users"),
    updatedAt: v.number(),
    payload: v.object({
      version: v.number(),
      pages: v.array(
        v.object({
          pageIndex: v.number(),
          paths: v.array(
            v.object({
              tool: v.literal("ink"),
              color: v.string(),
              strokeWidth: v.number(),
              points: v.array(v.object({ x: v.number(), y: v.number() })),
            }),
          ),
        }),
      ),
    }),
  }).index("by_drawing", ["drawingId"]),

  /** Workflow response history (one row per response/action for RFI documents). */
  documentWorkflowResponses: defineTable({
    documentId: v.id("documents"),
    responseOption: v.union(
      v.literal("rfi_responded"),
      v.literal("approved"),
      v.literal("approved_as_noted"),
      v.literal("revise_and_resubmit"),
      v.literal("rejected"),
    ),
    /** Optional RFI response notes. */
    comment: v.optional(v.string()),
    responderUserId: v.id("users"),
    /** Optional URL for response attachments (MVP: store link; file upload can be added later). */
    responseUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_document_createdAt", ["documentId", "createdAt"]),

  /** Workflow audit trail (status transitions, ball-in-court shifts, due reminders). */
  documentWorkflowEvents: defineTable({
    documentId: v.id("documents"),
    eventType: v.union(
      v.literal("status_transition"),
      v.literal("ball_in_court_shift"),
      v.literal("response_submitted"),
      v.literal("due_reminder_sent")
    ),
    actorUserId: v.optional(v.id("users")),
    fromWorkflowStatus: v.optional(v.string()),
    toWorkflowStatus: v.optional(v.string()),
    /** Updated when eventType is ball-in-court shift. */
    ballInCourtUserIds: v.optional(v.array(v.id("users"))),
    /** Updated when eventType changes assignment/due responsibility. */
    assigneeUserIds: v.optional(v.array(v.id("users"))),
    /** Optional message (e.g. reminder copy, response notes). */
    message: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_document_createdAt", ["documentId", "createdAt"]),

  /** Per-user reminder when a change document has had no updates for N days. */
  documentPersonalReminders: defineTable({
    documentId: v.id("documents"),
    userId: v.id("users"),
    intervalDays: v.union(v.literal(3), v.literal(5), v.literal(7), v.literal(14)),
    createdAt: v.number(),
    /** Cleared when the document is updated; set when a stale reminder is sent. */
    lastNotifiedAt: v.optional(v.number()),
  })
    .index("by_document", ["documentId"])
    .index("by_document_user", ["documentId", "userId"])
    .index("by_user", ["userId"]),

  /** Notifications for PM/PC when no change-type document activity for 5+ days. */
  documentReminderNotifications: defineTable({
    userId: v.id("users"),
    projectId: v.id("projects"),
    projectName: v.string(),
    message: v.string(),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_projectId", ["userId", "projectId"]),

  /** General in-app notifications (used by the notification bell). */
  notifications: defineTable({
    userId: v.id("users"),
    /** e.g. project_contract_update, project_change_followup, boardroom_booking, boardroom_approved, safety_change, boardroom_admin_new_request. */
    type: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    bookingId: v.optional(v.id("boardroomBookings")),
    incidentId: v.optional(v.id("incidentReports")),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_user_readAt", ["userId", "readAt"]),

  /** Per-user notification preferences for different event types. */
  notificationPreferences: defineTable({
    userId: v.id("users"),
    /** Project subtrade contract uploads/updates. */
    projectContractsEnabled: v.boolean(),
    /** Follow-up reminders when Changes documents are stale (>5 days). */
    projectChangesFollowupEnabled: v.boolean(),
    /** Boardroom bookings that include the user. */
    boardroomBookingsEnabled: v.boolean(),
    /** Boardroom approvals of the user's own requests. */
    boardroomApprovalsEnabled: v.boolean(),
    /** Safety changes on projects (e.g. incident reports). */
    safetyChangesEnabled: v.boolean(),
    /** Admin-only: new boardroom requests awaiting review. */
    adminBoardroomRequestsEnabled: v.boolean(),
    taskDueRemindersEnabled: v.optional(v.boolean()),
    dailyReportRemindersEnabled: v.optional(v.boolean()),
    safetyDocExpiryRemindersEnabled: v.optional(v.boolean()),
    boardroomStatusUpdatesEnabled: v.optional(v.boolean()),
    bidDeadlineRemindersEnabled: v.optional(v.boolean()),
    /** Principal-role popup alerts for overdue tasks and stale changes on any project. */
    principalOverdueAlertsEnabled: v.optional(v.boolean()),
    /** RFI ball-in-court and overdue due-date reminders. */
    rfiActionRequiredEnabled: v.optional(v.boolean()),
    /** Submittal ball-in-court and overdue due-date reminders. */
    submittalActionRequiredEnabled: v.optional(v.boolean()),
    /** Monday weekly update digest. */
    weeklyUpdateEnabled: v.optional(v.boolean()),
    /** Admin-only: PM created subtrade needing trade portal login. */
    tradeLoginSetupRequiredEnabled: v.optional(v.boolean()),
    /** Personal stale-document reminders set on change rows. */
    personalChangeRemindersEnabled: v.optional(v.boolean()),
  }).index("by_userId", ["userId"]),

  /** User-created scheduled and condition-based notifications (Account settings). */
  userCustomNotifications: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("scheduled"), v.literal("condition")),
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Scheduled: fire once at this time (ms). */
    remindAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    conditionType: v.optional(
      v.union(
        v.literal("project_changes_stale"),
        v.literal("document_stale"),
        v.literal("task_overdue"),
        v.literal("custom"),
      ),
    ),
    /** User-written condition description when conditionType is custom. */
    customConditionText: v.optional(v.string()),
    documentId: v.optional(v.id("documents")),
    taskId: v.optional(v.id("projectTasks")),
    intervalDays: v.optional(v.union(v.literal(3), v.literal(5), v.literal(7), v.literal(14))),
    lastTriggeredAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_kind_enabled", ["kind", "enabled"]),

  accountingRecords: defineTable({
    projectId: v.id("projects"),
    type: v.union(
      v.literal("invoice"),
      v.literal("payment"),
      v.literal("change_order"),
      v.literal("cost_code_entry")
    ),
    amount: v.number(),
    status: v.string(),
    date: v.number(),
    notes: v.optional(v.string()),
    createdByUserId: v.id("users"),
  })
    .index("by_project", ["projectId"])
    .index("by_project_date", ["projectId", "date"]),

  boardroomBookings: defineTable({
    requestedByUserId: v.id("users"),
    date: v.number(),
    startTimeMinutes: v.number(),
    durationMinutes: v.number(),
    title: v.optional(v.string()),
    /** Optional: users invited to this meeting (in addition to the requester). */
    attendeeUserIds: v.optional(v.array(v.id("users"))),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    approvedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_status", ["status"])
    .index("by_requested_by", ["requestedByUserId"]),

  personalCalendarEvents: defineTable({
    ownerUserId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    date: v.number(),
    startTimeMinutes: v.number(),
    durationMinutes: v.number(),
    /** Chip colours: same palettes as personal / boardroom / milestone elsewhere in the app. */
    colorPreset: v.optional(v.union(v.literal("emerald"), v.literal("blue"), v.literal("amber"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_date", ["ownerUserId", "date"])
    .index("by_owner_updatedAt", ["ownerUserId", "updatedAt"]),

  socialMediaEvents: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    date: v.number(),
    startTimeMinutes: v.number(),
    durationMinutes: v.number(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_date", ["date"]),

  socialMediaWorkspace: defineTable({
    notes: v.string(),
    nextSteps: v.string(),
    updatedByUserId: v.id("users"),
    updatedAt: v.number(),
  }).index("by_updatedAt", ["updatedAt"]),

  socialMediaDocuments: defineTable({
    name: v.string(),
    storageId: v.id("_storage"),
    fileUrl: v.string(),
    uploadedByUserId: v.id("users"),
    uploadedAt: v.number(),
  }).index("by_uploadedAt", ["uploadedAt"]),

  /** Generated social media graphic outputs from AI image editing. */
  socialMediaGraphicOutputs: defineTable({
    sourceDocumentId: v.id("socialMediaDocuments"),
    storageId: v.id("_storage"),
    fileUrl: v.string(),
    name: v.string(),
    mimeType: v.string(),
    editPrompt: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  /** Social Media Caption AI memory to learn preferred brand voice over time. */
  socialMediaCaptionMemory: defineTable({
    brandVoiceNotes: v.string(),
    learnedSamples: v.array(v.string()),
    updatedByUserId: v.id("users"),
    updatedAt: v.number(),
  }).index("by_updatedAt", ["updatedAt"]),

  sitePhotoFolders: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_name", ["projectId", "name"]),

  projectSitePhotos: defineTable({
    projectId: v.id("projects"),
    /** When set, photo appears under this site photo folder only. */
    sitePhotoFolderId: v.optional(v.id("sitePhotoFolders")),
    storageId: v.id("_storage"),
    fileUrl: v.string(),
    displayName: v.optional(v.string()),
    originalFileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    caption: v.optional(v.string()),
    uploadedByUserId: v.id("users"),
    uploadedAt: v.number(),
    /** Client-provided idempotency key for offline/retry-safe creates. */
    clientMutationId: v.optional(v.string()),
    /** User-tagged location / zone on the job site. */
    areaOnSite: v.optional(v.string()),
    /** Linked project subtrade (“trade”) when tagged. */
    subtradeId: v.optional(v.id("projectSubtrades")),
    /** Calendar date the photo/tag refers to (epoch ms, local date convention). */
    taggedDate: v.optional(v.number()),
    photoCategory: v.optional(
      v.union(
        v.literal("deficiency"),
        v.literal("progress"),
        v.literal("safety_issue"),
        v.literal("close_out"),
      ),
    ),
    /** Optional free-text note from the tag/upload flow. */
    notes: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_uploadedAt", ["projectId", "uploadedAt"])
    .index("by_project_sitePhotoFolder_uploadedAt", ["projectId", "sitePhotoFolderId", "uploadedAt"])
    .index("by_clientMutationId", ["clientMutationId"]),

  /** Vector markup (normalized ink paths per PDF page or single raster page). One row per site photo. */
  sitePhotoMarkups: defineTable({
    photoId: v.id("projectSitePhotos"),
    projectId: v.id("projects"),
    updatedByUserId: v.id("users"),
    updatedAt: v.number(),
    payload: v.object({
      version: v.number(),
      pages: v.array(
        v.object({
          pageIndex: v.number(),
          paths: v.array(
            v.object({
              tool: v.literal("ink"),
              color: v.string(),
              strokeWidth: v.number(),
              points: v.array(v.object({ x: v.number(), y: v.number() })),
            }),
          ),
        }),
      ),
    }),
  }).index("by_photo", ["photoId"]),

  safetyEmployeeDocuments: defineTable({
    projectId: v.id("projects"),
    /** Optional: link a document to a specific subtrade on the project. */
    subtradeId: v.optional(v.id("projectSubtrades")),
    employeeName: v.string(),
    documentType: v.string(),
    name: v.string(),
    /** Omitted when the record is date-only until a file is attached elsewhere. */
    fileUrl: v.optional(v.string()),
    uploadedByUserId: v.id("users"),
    uploadedAt: v.number(),
    /** Issue / effective date (local midnight stored as epoch ms). */
    documentDate: v.optional(v.number()),
    expiryDate: v.optional(v.number()),
    /** Which of 30, 14, 7 (days) expiry reminders were already sent. */
    expiryReminderMilestonesSent: v.optional(v.array(v.number())),
  })
    .index("by_project", ["projectId"])
    .index("by_project_subtrade", ["projectId", "subtradeId"]),

  incidentReports: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.string(),
    date: v.number(),
    severity: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical"))),
    status: v.optional(v.union(v.literal("open"), v.literal("investigating"), v.literal("resolved"))),
    reportType: v.optional(
      v.union(
        v.literal("near_miss"),
        v.literal("notice_of_violation"),
        v.literal("first_aid_log"),
        v.literal("incident_report"),
      ),
    ),
    reportedByUserId: v.id("users"),
    createdAt: v.number(),
    /** Client-provided idempotency key for offline/retry-safe creates. */
    clientMutationId: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_date", ["projectId", "date"])
    .index("by_clientMutationId", ["clientMutationId"]),

  /** External job sign-in/sign-out logs (trades + site supers). */
  jobAttendanceLogs: defineTable({
    projectId: v.id("projects"),
    /** Display value captured at time of entry (the "project number"). */
    projectNumber: v.string(),
    /** The trade on the project for this entry. */
    subtradeId: v.id("projectSubtrades"),
    tradeName: v.string(),
    workerName: v.string(),
    action: v.union(v.literal("in"), v.literal("out")),
    /** Timestamp of the sign in/out event. */
    signedAt: v.number(),
    /** UTC midnight key derived from `signedAt`, used for daily views. */
    dayKey: v.number(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    /** Client-provided idempotency key for offline/retry-safe creates. */
    clientMutationId: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_day", ["projectId", "dayKey"])
    .index("by_project_day_signedAt", ["projectId", "dayKey", "signedAt"])
    .index("by_clientMutationId", ["clientMutationId"]),

  /** Daily attendance predictions derived from historical sign-in/out logs. */
  jobAttendancePredictions: defineTable({
    projectId: v.id("projects"),
    dayKey: v.number(),
    workerName: v.string(),
    workerNameNormalized: v.string(),
    subtradeId: v.id("projectSubtrades"),
    tradeName: v.string(),
    expectedInAt: v.number(),
    confidence: v.number(),
    rationale: v.string(),
    status: v.union(
      v.literal("expected"),
      v.literal("signed_in"),
      v.literal("late"),
      v.literal("no_show")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project_day", ["projectId", "dayKey"])
    .index("by_project_day_confidence", ["projectId", "dayKey", "confidence"])
    .index("by_project_day_worker", ["projectId", "dayKey", "workerNameNormalized"]),

  /** Master list of equipment (catalog) independent of project/checkouts. */
  equipmentCatalog: defineTable({
    name: v.string(),
    serialNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    /** Calendar year purchased (optional). */
    yearBought: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  /** Individual equipment checkouts to projects (sign-out / sign-in log). */
  equipmentCheckouts: defineTable({
    /** fleet = catalog item; rental / project = on-site only (no catalog id). */
    kind: v.optional(
      v.union(v.literal("fleet"), v.literal("rental"), v.literal("project")),
    ),
    equipmentId: v.optional(v.id("equipmentCatalog")),
    /** Required for rental/project rows when equipmentId is omitted. */
    displayName: v.optional(v.string()),
    rentalVendor: v.optional(v.string()),
    notes: v.optional(v.string()),
    projectId: v.id("projects"),
    takenOutByName: v.optional(v.string()),
    dateTaken: v.number(),
    /** When set, equipment has been signed back in. */
    returnedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    /** Client-provided idempotency key for offline/retry-safe creates. */
    clientMutationId: v.optional(v.string()),
  })
    .index("by_project_active", ["projectId", "returnedAt"])
    .index("by_project_dateTaken", ["projectId", "dateTaken"])
    .index("by_equipment", ["equipmentId"])
    .index("by_dateTaken", ["dateTaken"])
    .index("by_clientMutationId", ["clientMutationId"]),

  equipmentInventory: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    category: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    location: v.optional(v.string()),
    lastInspectionDate: v.optional(v.number()),
    status: v.optional(v.union(v.literal("ok"), v.literal("maintenance"), v.literal("out_of_service"))),
    notes: v.optional(v.string()),
    /** When set (e.g. from JotForm webhook), shown as "Taken out by" instead of resolving addedByUserId. */
    takenOutByName: v.optional(v.string()),
    addedByUserId: v.id("users"),
    addedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"]),

  projectSubtrades: defineTable({
    projectId: v.id("projects"),
    bidDivisionId: v.optional(v.id("projectBidDivisions")),
    name: v.string(),
    contractStatus: v.union(
      v.literal("unsigned"),
      v.literal("signed_by_subtrade"),
      v.literal("signed_by_justin")
    ),
    budget: v.optional(v.number()),
    fileUrl: v.optional(v.string()),
    uploadedAt: v.optional(v.number()),
    contractSentOut: v.optional(v.boolean()),
    contractNotes: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    confirmedToBid: v.optional(
      v.union(v.literal("yes"), v.literal("no"), v.literal("waiting_to_hear"))
    ),
    companyName: v.optional(v.string()),
    amountPaid: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_name", ["projectId", "name"]),

  /** Standalone trade portal login identity (trade passcode based). */
  tradePortalAccounts: defineTable({
    tradeName: v.string(),
    tradeNameNormalized: v.string(),
    passcode: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_trade_name_normalized", ["tradeNameNormalized"]),

  /** Assigned jobs/trades that each portal account can access. */
  tradePortalAssignments: defineTable({
    portalAccountId: v.id("tradePortalAccounts"),
    projectId: v.id("projects"),
    subtradeId: v.id("projectSubtrades"),
    createdAt: v.number(),
  })
    .index("by_portal_account", ["portalAccountId"])
    .index("by_project_subtrade", ["projectId", "subtradeId"]),

  /** Pending assignment intents when a trade has no portal login yet. */
  tradePortalPendingAssignments: defineTable({
    projectId: v.id("projects"),
    subtradeId: v.id("projectSubtrades"),
    tradeNameExact: v.string(),
    tradeNameNormalized: v.string(),
    source: v.string(),
    createdAt: v.number(),
  })
    .index("by_trade_name_normalized", ["tradeNameNormalized"])
    .index("by_project_subtrade", ["projectId", "subtradeId"]),

  /** Session rows for trade portal passcode login. */
  tradePortalSessions: defineTable({
    portalAccountId: v.id("tradePortalAccounts"),
    sessionToken: v.string(),
    expiresAt: v.number(),
    lastSeenAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_session_token", ["sessionToken"])
    .index("by_portal_account", ["portalAccountId"]),

  projectBidDivisions: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    createdAt: v.number(),
    /** Bid due date (epoch ms); calendar comparisons use America/Chicago. */
    bidDeadlineAt: v.optional(v.number()),
    /** Milestones already notified: e.g. 7, 3, 1 (days before deadline). */
    bidDeadlineReminderMilestonesSent: v.optional(v.array(v.number())),
  }).index("by_project", ["projectId"]),

  projectCalendarEvents: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    /** Single-day legacy; use startDate/endDate for new events. */
    date: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    description: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    uploadedAt: v.optional(v.number()),
  }).index("by_project", ["projectId"]).index("by_project_date", ["projectId", "date"]).index("by_project_startDate", ["projectId", "startDate"]),

  /** Company manuals / onboarding docs for employees. Admins upload; all signed-in users can open. */
  employeeManuals: defineTable({
    title: v.string(),
    fileName: v.string(),
    storageId: v.id("_storage"),
    uploadedByUserId: v.id("users"),
    uploadedAt: v.number(),
  }).index("by_uploadedAt", ["uploadedAt"]),

  /** Blank copies of change-related forms (RFI, CO, etc.). PM/coordinator/admin; all signed-in users can download. */
  changeDocumentTemplates: defineTable({
    title: v.string(),
    fileName: v.string(),
    storageId: v.id("_storage"),
    category: v.optional(
      v.union(
        v.literal("general"),
        v.literal("rfi"),
        v.literal("co"),
        v.literal("pcn"),
        v.literal("si"),
        v.literal("cor")
      )
    ),
    uploadedByUserId: v.id("users"),
    uploadedAt: v.number(),
  }).index("by_uploadedAt", ["uploadedAt"]),

  /** Editable per-type form template: extra custom fields appended to the change-creation pop-ups & PDFs. */
  changeFormTemplates: defineTable({
    type: v.union(
      v.literal("rfi"),
      v.literal("pcn"),
      v.literal("co"),
      v.literal("cor"),
      v.literal("si"),
      v.literal("submittal"),
      v.literal("po"),
    ),
    fields: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        kind: v.union(
          v.literal("text"),
          v.literal("longtext"),
          v.literal("date"),
          v.literal("number"),
          v.literal("select"),
          v.literal("checkbox"),
        ),
        required: v.boolean(),
        options: v.optional(v.array(v.string())),
      }),
    ),
    updatedByUserId: v.id("users"),
    updatedAt: v.number(),
  }).index("by_type", ["type"]),

  /** Admin-editable: which roles can access each nav/section. pathId e.g. "dashboard", "admin_users". */
  roleAccess: defineTable({
    pathId: v.string(),
    roles: v.array(v.string()),
  }).index("pathId", ["pathId"]),

  /** Admin-editable: which users can access each path. One row per (pathId, userId) grant. */
  userAccess: defineTable({
    pathId: v.string(),
    userId: v.id("users"),
  })
    .index("pathId", ["pathId"])
    .index("userId_pathId", ["userId", "pathId"]),

  /** One-time state for OAuth "connect email" flow. state -> userId; deleted after use. */
  emailOauthState: defineTable({
    state: v.string(),
    userId: v.id("users"),
    provider: v.union(v.literal("gmail"), v.literal("outlook")),
    createdAt: v.number(),
  }).index("by_state", ["state"]),

  /** Stored OAuth tokens for connected email accounts (Gmail/Outlook). */
  emailConnections: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("gmail"), v.literal("outlook")),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    /** Gmail: email address of the connected account. */
    emailAddress: v.optional(v.string()),
    connectedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_provider", ["userId", "provider"]),

  /** Per-user Outlook processing configuration and state for Microsoft 365 integration. */
  outlookSettings: defineTable({
    userId: v.id("users"),
    /** Primary mailbox address, e.g. alice@company.com. */
    mailbox: v.string(),
    /** Whether background Outlook processing is enabled for this user. */
    enabled: v.boolean(),
    /** Processing mode controls whether replies are drafts-only, require approval, or auto-send. */
    processingMode: v.union(
      v.literal("sort_only"),
      v.literal("drafts"),
      v.literal("auto_send")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /** Microsoft Graph subscriptions for Outlook mailboxes (webhook-based). */
  outlookGraphSubscriptions: defineTable({
    userId: v.id("users"),
    subscriptionId: v.string(),
    resource: v.string(),
    notificationUrl: v.string(),
    clientState: v.optional(v.string()),
    /** Expiration time in epoch millis. */
    expiresAt: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("error")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_subscriptionId", ["subscriptionId"]),

  /** Normalized Outlook email records for classification and response tracking. */
  outlookEmails: defineTable({
    userId: v.id("users"),
    /** Microsoft Graph message ID. */
    messageId: v.string(),
    mailbox: v.string(),
    subject: v.optional(v.string()),
    from: v.optional(v.string()),
    receivedAt: v.number(),
    /** High-level classification of importance. */
    importance: v.optional(
      v.union(
        v.literal("high"),
        v.literal("medium"),
        v.literal("low")
      )
    ),
    /** Keyword or rules-based tags applied to the email. */
    tags: v.optional(v.array(v.string())),
    /** Original folder name or id (best-effort). */
    folder: v.optional(v.string()),
    /** Current processing status (for UI/debug). */
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("classified"),
        v.literal("responded"),
        v.literal("error")
      )
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_receivedAt", ["userId", "receivedAt"])
    .index("by_userId_status", ["userId", "status"]),

  /** Shared to-do list shown on everyone's dashboard. Editable by all authenticated users. */
  pmTodoList: defineTable({
    text: v.string(),
    order: v.number(),
    createdAt: v.number(),
    createdByUserId: v.id("users"),
    dueDate: v.optional(v.number()),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    completed: v.optional(v.boolean()),
  }).index("by_order", ["order"]),

  /** Chuck: one conversation thread per user (shown in history sidebar). */
  assistantConversations: defineTable({
    userId: v.id("users"),
    /** Short label from the first question. */
    preview: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_updated", ["userId", "updatedAt"]),

  /** Chuck: messages within a conversation (scoped to the owning user). */
  assistantConversationMessages: defineTable({
    conversationId: v.id("assistantConversations"),
    userId: v.optional(v.id("users")),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("error")),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_conversation_created", ["conversationId", "createdAt"])
    .index("by_user_created", ["userId", "createdAt"]),

  /** Social Media AI: one conversation thread per user (page-scoped). */
  socialMediaAiConversations: defineTable({
    userId: v.id("users"),
    preview: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_updated", ["userId", "updatedAt"]),

  /** Social Media AI: messages within a social media AI conversation. */
  socialMediaAiConversationMessages: defineTable({
    conversationId: v.id("socialMediaAiConversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("error")),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_conversation_created", ["conversationId", "createdAt"]),

  /** Per-subtrade contract tracking to-dos (shown on each subtrade contract page). */
  subtradeTodos: defineTable({
    projectId: v.id("projects"),
    subtradeId: v.id("projectSubtrades"),
    text: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("needs_attention"),
      v.literal("needs_review"),
      v.literal("completed"),
    ),
    createdAt: v.number(),
    order: v.number(),
  })
    .index("by_project_subtrade_status", ["projectId", "subtradeId", "status"])
    .index("by_project_subtrade", ["projectId", "subtradeId"]),

  /** Shared editable AI weekly update summary per week (UTC Monday weekStart). */
  weeklyUpdateSummaries: defineTable({
    weekStart: v.number(),
    summaryText: v.string(),
    aiGeneratedText: v.optional(v.string()),
    lastEditedByUserId: v.id("users"),
    aiGeneratedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_weekStart", ["weekStart"]),

  /** App-wide audit trail for admin review (user-driven actions; uploads logged when records are created). */
  appAuditLogs: defineTable({
    actorId: v.id("users"),
    actorLabel: v.string(),
    createdAt: v.number(),
    action: v.string(),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    summary: v.optional(v.string()),
  }).index("by_createdAt", ["createdAt"]),
});

export default schema;
