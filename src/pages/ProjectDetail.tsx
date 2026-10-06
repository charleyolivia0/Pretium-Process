import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useParams, Link, useNavigate, useSearchParams, useLocation, Outlet, Navigate } from "react-router-dom";
import {
  LEGACY_TAB_QUERY_TO_PATH,
  parseProjectSection,
  parseSubtradesSubtradeId,
  projectIncidentReportHref,
  projectSectionHref,
} from "./projectDetail/projectSectionPaths";
import { ProjectChangesSection } from "./projectDetail/ProjectChangesSection";
import { ProjectSubtradesSection } from "./projectDetail/ProjectSubtradesSection";
import { ProjectScheduleSpreadsheetSection } from "./projectDetail/ProjectScheduleSpreadsheetSection";
import { ProjectBudgetSection } from "./projectDetail/ProjectBudgetSection";
import { ProjectInventorySection, type EquipmentLogRow } from "./projectDetail/ProjectInventorySection";
import { ProjectMiscellaneousSection } from "./projectDetail/ProjectMiscellaneousSection";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useOfflineContext } from "../offline/OfflineProvider";
import { putBlob } from "../offline/offlineQueue";
import { useOfflineCachedQuery } from "../offline/useOfflineCachedQuery";
import { cardStyle, innerWhiteCardStyle, primaryButtonStyle, secondaryButtonStyle } from "../theme";
import { ConfirmDialog } from "../components/ConfirmDialog";
import VoiceTranscriptionControl from "../components/VoiceTranscriptionControl";
import { FolderPlusIcon } from "../components/FolderPlusIcon";
import { FolderIcon } from "../components/FolderIcon";
import { DocumentPlusIcon } from "../components/DocumentPlusIcon";
import { PencilIcon } from "../components/PencilIcon";
import { CalendarPlusIcon } from "../components/CalendarPlusIcon";
import { CameraPlusIcon } from "../components/CameraPlusIcon";
import { MultiSelectDropdown } from "../components/MultiSelectDropdown";
import { SitePhotoImage } from "../components/SitePhotoImage";
import { isLikelyHeicFormat, normalizeImageFileForUpload } from "../utils/heicImage";
import { canMarkupSitePhoto } from "../lib/markup";
import { useIsMobile } from "../hooks/useIsMobile";
import { TASK_STATUS_SUMMARY_COLORS } from "../utils/taskStatusSummaryColors";
import { dateInputValueToTimestamp, timestampToDateInputValue } from "../utils/dateInput";
import { DAY_MS, getDayKeyCentral } from "../lib/centralTime";
import { currentWeekStart } from "../lib/weekUtils";
import { projectQueryArgs, asProjectId } from "../lib/projectQueryArgs";
import { formatReportType } from "../utils/safetyReportTypes";
import { DocumentVersionHistoryModal } from "../components/DocumentVersionHistoryModal";
import { useDocumentAutosave } from "../hooks/useDocumentAutosave";
import { DocumentSaveStatusChip } from "../components/DocumentSaveStatusChip";

const CHANGE_DOC_KINDS = ["RFI", "SI", "COR", "CO", "PCN"] as const;
type ChangeDocKind = (typeof CHANGE_DOC_KINDS)[number];

const TAB_STYLES = (active: boolean) => ({
  padding: "0.5rem 1rem",
  border: "none",
  borderRadius: "0.5rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer" as const,
  fontFamily: "Montserrat, sans-serif",
  backgroundColor: active ? "var(--surface-muted)" : "transparent",
  color: "#6b7280",
});

const DOC_TYPES = [
  { value: "CO", label: "CO" },
  { value: "RFI", label: "RFI" },
  { value: "SI", label: "SI" },
  { value: "COR", label: "COR" },
  { value: "safety_report", label: "Safety report" },
  { value: "schedule", label: "Schedule" },
  { value: "other", label: "Other" },
] as const;

const COMPLIANCE_CATEGORIES = [
  { value: "insurance", label: "Insurance" },
  { value: "wcb_wsib", label: "WCB/WSIB" },
  { value: "safety_certificate", label: "Safety certificate" },
  { value: "license", label: "License" },
  { value: "subtrade_compliance", label: "Subtrade compliance" },
  { value: "other", label: "Other compliance doc" },
] as const;

type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number]["value"];

const EMERALD_ICON_BTN = {
  padding: "0.4rem",
  minWidth: "2.35rem",
  minHeight: "2.35rem",
  borderRadius: "0.5rem",
  border: "none",
  backgroundColor: "#059669",
  color: "#ffffff",
  cursor: "pointer" as const,
  display: "inline-flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  lineHeight: 0,
  fontFamily: "Montserrat, sans-serif",
};

const EMERALD_ICON_BTN_SM = {
  ...EMERALD_ICON_BTN,
  padding: "0.35rem",
  minWidth: "2.1rem",
  minHeight: "2.1rem",
};

const SUBTLE_ICON_BTN = {
  width: "1.9rem",
  height: "1.9rem",
  borderRadius: "999px",
  border: "1px solid rgba(16,185,129,0.45)",
  backgroundColor: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer" as const,
  display: "inline-flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  padding: 0,
};

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

function complianceCategoryLabel(category?: string) {
  return COMPLIANCE_CATEGORIES.find((c) => c.value === category)?.label ?? "Compliance document";
}

function complianceExpiryStatus(expiryDate?: number) {
  if (expiryDate == null) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { label: "Expired", color: "#b91c1c", backgroundColor: "#fee2e2" };
  if (days === 0) return { label: "Expires today", color: "#b45309", backgroundColor: "#fef3c7" };
  if (days <= 30) return { label: `Expires in ${days} day${days === 1 ? "" : "s"}`, color: "#b45309", backgroundColor: "#fef3c7" };
  return { label: "Valid", color: "#047857", backgroundColor: "#d1fae5" };
}

function isLikelyImageFile(mimeType?: string, fileName?: string) {
  if (mimeType && mimeType.toLowerCase().startsWith("image/")) return true;
  const extension = fileExtensionFromName(fileName).toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "avif"].includes(extension);
}

function fileExtensionFromName(name?: string) {
  if (!name) return "";
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return "";
  return name.slice(lastDot + 1).toUpperCase();
}

function sitePhotoDisplayName(photo: Partial<Doc<"projectSitePhotos">>) {
  return photo.displayName?.trim() || photo.originalFileName?.trim() || photo.caption?.trim() || "Unnamed file";
}

const SITE_PHOTO_CATEGORIES = ["deficiency", "progress", "safety_issue", "close_out"] as const;
type SitePhotoCategory = (typeof SITE_PHOTO_CATEGORIES)[number];

const SITE_PHOTO_CATEGORY_LABELS: Record<SitePhotoCategory, string> = {
  deficiency: "Deficiency",
  progress: "Progress",
  safety_issue: "Safety issue",
  close_out: "Close out",
};

function sitePhotoCategoryLabel(cat?: SitePhotoCategory | null) {
  if (!cat) return "";
  return SITE_PHOTO_CATEGORY_LABELS[cat] ?? cat;
}

function sitePhotoMetaLines(
  photo: Doc<"projectSitePhotos">,
  subtradesList: Doc<"projectSubtrades">[] | undefined,
  fontSize = "0.68rem",
): ReactNode {
  const tradeName =
    photo.subtradeId && subtradesList?.length
      ? subtradesList.find((s) => s._id === photo.subtradeId)?.name
      : null;
  const rows: { label: string; value: string }[] = [];
  if (photo.areaOnSite?.trim()) rows.push({ label: "Area", value: photo.areaOnSite.trim() });
  if (tradeName) rows.push({ label: "Trade", value: tradeName });
  if (photo.taggedDate != null) rows.push({ label: "Date", value: formatDate(photo.taggedDate) });
  if (photo.photoCategory) rows.push({ label: "Category", value: sitePhotoCategoryLabel(photo.photoCategory) });
  if (photo.notes?.trim()) rows.push({ label: "Note", value: photo.notes.trim() });
  if (rows.length === 0) return null;
  return (
    <div style={{ fontSize, color: "var(--text-secondary)", marginTop: "0.15rem", lineHeight: 1.35 }}>
      {rows.map((r) => (
        <div key={r.label}>
          {r.label}: {r.value}
        </div>
      ))}
    </div>
  );
}

type SitePhotoCreateTags = {
  areaOnSite?: string;
  subtradeId?: Id<"projectSubtrades">;
  taggedDate?: number;
  photoCategory: SitePhotoCategory;
  notes?: string;
};

type SitePhotoPreviewState = {
  photoId: Id<"projectSitePhotos">;
  fileUrl: string;
  title: string;
  variant: "image" | "pdf" | "fallback";
  mimeType?: string;
  fileNameHint?: string;
  notes?: string;
};

function formatLastReportDate(ts: number) {
  const d = new Date(ts);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  const month = d.toLocaleDateString(undefined, { month: "short" });
  return {
    line1: `${weekday} ${day}${suffix} ${month}`,
    line2: String(d.getFullYear()),
  };
}

function toDateInputValue(ts?: number) {
  return timestampToDateInputValue(ts);
}

function describeWeatherCode(code: number) {
  if (code === 0) return "Clear";
  if (code === 1 || code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code === 96 || code === 99) return "Thunderstorm with hail";
  return "Weather unavailable";
}

function normalizeSummaryLinkUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function summaryLinkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "Open link";
  }
}

/** Sections shown in the project section dropdown. */
const PROJECT_SECTION_NAV_TABS = [
  "summary",
  "daily_reports",
  "subtrades",
  "schedule",
  "budget",
  "changes",
  "inventory",
  "site_photos",
  "miscellaneous",
] as const;
type ProjectSectionNavTab = (typeof PROJECT_SECTION_NAV_TABS)[number];

const SITE_SUPER_SECTION_NAV_TABS: ProjectSectionNavTab[] = [
  "summary",
  "daily_reports",
  "schedule",
  "changes",
  "inventory",
  "site_photos",
  "miscellaneous",
];

function projectTabLabel(t: ProjectSectionNavTab): string {
  switch (t) {
    case "summary":
      return "Project summary";
    case "daily_reports":
      return "Daily Reports";
    case "subtrades":
      return "Subtrades";
    case "inventory":
      return "Inventory";
    case "site_photos":
      return "Site Photos";
    case "schedule":
      return "Tasks";
    case "budget":
      return "Budget";
    case "changes":
      return "Changes";
    case "miscellaneous":
      return "Miscellaneous";
  }
}

function projectTabHref(projectId: string, t: ProjectSectionNavTab): string {
  if (t === "summary") return `/projects/${projectId}`;
  return projectSectionHref(projectId, t);
}

const SUBTRADE_CONTRACT_STATUSES = ["unsigned", "signed_by_subtrade", "signed_by_justin"] as const;
type SubtradeContractStatus = (typeof SUBTRADE_CONTRACT_STATUSES)[number];

/** Distinct green-themed colours for each subtrade contract status (very different so theyâ€™re easy to tell apart). */
function subtradeStatusStyle(status: SubtradeContractStatus): { backgroundColor: string; color: string } {
  switch (status) {
    case "unsigned":
      return { backgroundColor: "var(--surface-muted)", color: "#bbf7d0" }; // darker shell, light text in dark mode
    case "signed_by_subtrade":
      return { backgroundColor: "var(--surface-muted)", color: "#a7f3d0" };  // medium emerald text
    case "signed_by_justin":
      return { backgroundColor: "#14532d", color: "#d1fae5" }; // dark forest, light text
    default:
      return { backgroundColor: "var(--surface-muted)", color: "#a7f3d0" };
  }
}

const PROJECT_STATUSES = ["planning", "active", "substantial_completion", "closed"] as const;
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = asProjectId(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = useQuery(api.users.current);
  const myPathIds = useQuery(api.roleAccess.getMyPathIds);
  const canAccessWeekly = myPathIds?.includes("weekly") ?? false;
  const { isOffline, queueJob } = useOfflineContext();
  const isSiteSuper = user?.role === "site_superintendent";
  const isMobile = useIsMobile(768);
  const section = useMemo(
    () => parseProjectSection(location.pathname, id ?? undefined),
    [location.pathname, id],
  );

  const [selectedDrFolderId, setSelectedDrFolderId] = useState<"root" | Id<"documentFolders">>("root");
  const [selectedDrReportId, setSelectedDrReportId] = useState<Id<"projectTasks"> | null>(null);
  const [drSitePhotoFolderKey, setDrSitePhotoFolderKey] = useState<"unfiled" | Id<"sitePhotoFolders">>(
    "unfiled",
  );
  const [sitePhotosTabFolderKey, setSitePhotosTabFolderKey] = useState<"unfiled" | Id<"sitePhotoFolders">>(
    "unfiled",
  );
  const [newSitePhotoFolderModalOpen, setNewSitePhotoFolderModalOpen] = useState(false);
  const [newSitePhotoFolderName, setNewSitePhotoFolderName] = useState("");
  const [sitePhotoFolderCreating, setSitePhotoFolderCreating] = useState(false);

  const project = useOfflineCachedQuery(
    api.projects.getProjectById,
    projectQueryArgs(id),
    "projects.getProjectById"
  );
  const tasks = useOfflineCachedQuery(
    api.tasks.listTasksByProject,
    projectQueryArgs(id),
    "tasks.listTasksByProject"
  );
  const documents = useOfflineCachedQuery(
    api.documents.listDocumentsByProject,
    projectQueryArgs(id),
    "documents.listDocumentsByProject"
  );
  const documentFolders = useOfflineCachedQuery(
    api.documents.listDocumentFoldersByProject,
    projectQueryArgs(id),
    "documents.listDocumentFoldersByProject"
  );
  const accountingRecords = useOfflineCachedQuery(
    api.accounting.listAccountingRecordsByProject,
    projectQueryArgs(id),
    "accounting.listAccountingRecordsByProject"
  );
  const subtrades = useOfflineCachedQuery(
    api.subtrades.listByProject,
    projectQueryArgs(id),
    "subtrades.listByProject"
  );
  const equipmentLog = useOfflineCachedQuery(
    api.safety.listEquipmentLogByProject,
    projectQueryArgs(id),
    "safety.listEquipmentLogByProject"
  );
  const safetyIncidents = useOfflineCachedQuery(
    api.safety.listIncidentReportsByProject,
    projectQueryArgs(id),
    "safety.listIncidentReportsByProject"
  );
  const sitePhotoFolders = useOfflineCachedQuery(
    api.projectSitePhotos.listFoldersByProject,
    projectQueryArgs(id),
    "projectSitePhotos.listFoldersByProject"
  );

  const sitePhotosListArgs = useMemo(() => {
    if (!projectId) return "skip" as const;
    if (section !== "daily_reports" && section !== "site_photos") return "skip" as const;
    const key = section === "daily_reports" ? drSitePhotoFolderKey : sitePhotosTabFolderKey;
    if (key === "unfiled") return { projectId: projectId!, folderFilter: "unfiled" as const };
    return { projectId: projectId!, folderFilter: key };
  }, [projectId, section, drSitePhotoFolderKey, sitePhotosTabFolderKey]);

  const sitePhotos = useOfflineCachedQuery(
    api.projectSitePhotos.listByProject,
    sitePhotosListArgs,
    "projectSitePhotos.listByProject"
  );
  const todayBounds = useMemo(() => {
    const n = new Date();
    const start = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    const end = start + 24 * 60 * 60 * 1000 - 1;
    return { start, end };
  }, []);
  const personalEventsToday = useQuery(api.personalCalendar.listMyEvents, {
    startDate: todayBounds.start,
    endDate: todayBounds.end,
  });

  const currentWeekBounds = useMemo(() => {
    const weekStart = currentWeekStart();
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
    return { weekStart, weekEnd };
  }, []);
  const projectWeeklyReports = useOfflineCachedQuery(
    api.weeklyDigest.getProjectWeeklyReports,
    projectId
      ? { projectId: projectId!, weekStart: currentWeekBounds.weekStart, weekEnd: currentWeekBounds.weekEnd }
      : "skip",
    "weeklyDigest.getProjectWeeklyReports"
  );

  const onlyDailyReports = useMemo(
    () => (tasks ?? []).filter((t: Doc<"projectTasks">) => t.isDailyReport === true),
    [tasks]
  );

  /** Daily reports without a folder appear on the root list; filed reports show only inside their folder. */
  const rootDailyReports = useMemo(() => {
    if (tasks === undefined) return undefined;
    return onlyDailyReports.filter((t: Doc<"projectTasks">) => !t.dailyReportFolderId);
  }, [tasks, onlyDailyReports]);

  const latestReportUpdatedAt = useMemo(() => {
    if (!tasks?.length) return null;
    return Math.max(...tasks.map((t: Doc<"projectTasks">) => t.updatedAt));
  }, [tasks]);

  const reportsForSelectedDrFolder = useMemo(() => {
    if (tasks === undefined) return undefined;
    const list =
      selectedDrFolderId === "root"
        ? onlyDailyReports.filter((t: Doc<"projectTasks">) => !t.dailyReportFolderId)
        : onlyDailyReports.filter((t: Doc<"projectTasks">) => t.dailyReportFolderId === selectedDrFolderId);
    return list
      .slice()
      .sort((a: Doc<"projectTasks">, b: Doc<"projectTasks">) => (b.dueDate ?? 0) - (a.dueDate ?? 0));
  }, [tasks, selectedDrFolderId, onlyDailyReports]);

  const selectedDrReport = useMemo(() => {
    if (!selectedDrReportId || tasks === undefined) return null;
    return onlyDailyReports.find((t: Doc<"projectTasks">) => t._id === selectedDrReportId) ?? null;
  }, [tasks, selectedDrReportId, onlyDailyReports]);

  const complianceDocuments = useMemo(
    () =>
      (documents ?? [])
        .filter((d: Doc<"documents">) => d.complianceCategory)
        .slice()
        .sort((a: Doc<"documents">, b: Doc<"documents">) => {
          const aExpiry = a.expiryDate ?? Number.POSITIVE_INFINITY;
          const bExpiry = b.expiryDate ?? Number.POSITIVE_INFINITY;
          return aExpiry - bExpiry;
        }),
    [documents],
  );

  const updateTask = useMutation(api.tasks.updateTask);
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);
  const removeTask = useMutation(api.tasks.removeTask);

  const createTask = useMutation(api.tasks.createTask);
  const createDocument = useMutation(api.documents.createDocumentRecord);
  const createDocumentFolder = useMutation(api.documents.createDocumentFolder);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const generateSitePhotoUploadUrl = useMutation(api.projectSitePhotos.generateUploadUrl);
  const createSitePhoto = useMutation(api.projectSitePhotos.createSitePhoto);
  const deleteSitePhoto = useMutation(api.projectSitePhotos.deleteSitePhoto);
  const updateSitePhoto = useMutation(api.projectSitePhotos.updateSitePhoto);
  const createSitePhotoFolder = useMutation(api.projectSitePhotos.createSitePhotoFolder);
  const updateDocument = useMutation(api.documents.updateDocumentRecord);
  const deleteDocument = useMutation(api.documents.deleteDocumentRecord);
  const updateProject = useMutation(api.projects.updateProject);
  const promoteProjectToCloseOut = useMutation(api.projects.promoteProjectToCloseOut);
  const returnProjectToTracker = useMutation(api.projects.returnProjectToTracker);
  const setProjectSheet = useMutation(api.projects.setProjectSheet);
  const deleteProject = useMutation(api.projects.deleteProject);
  const updateSubtrade = useMutation(api.subtrades.update);
  const removeSubtrade = useMutation(api.subtrades.remove);
  const usersForAssignment = useOfflineCachedQuery(
    api.users.listUsersForAssignment,
    {},
    "users.listUsersForAssignment"
  );

  const [closeOutBusy, setCloseOutBusy] = useState(false);
  const [closeOutError, setCloseOutError] = useState<string | null>(null);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [newTaskWeather, setNewTaskWeather] = useState("");
  const [newTaskPhotoStorageIds, setNewTaskPhotoStorageIds] = useState<Id<"_storage">[]>([]);
  const [newTaskDocStorageIds, setNewTaskDocStorageIds] = useState<Id<"_storage">[]>([]);
  const [newTaskPhotoBlobIds, setNewTaskPhotoBlobIds] = useState<string[]>([]);
  const [newTaskDocBlobIds, setNewTaskDocBlobIds] = useState<string[]>([]);
  const [taskPhotoUploading, setTaskPhotoUploading] = useState(false);
  const [taskDocUploading, setTaskDocUploading] = useState(false);
  const [dailyReportFolderId, setDailyReportFolderId] = useState<Id<"documentFolders"> | "">("");
  const [editDailyReportFolderId, setEditDailyReportFolderId] = useState<Id<"documentFolders"> | "">("");
  const [taskWeatherLoading, setTaskWeatherLoading] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<Id<"projectTasks"> | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskDescription, setEditTaskDescription] = useState("");
  const [editTaskDate, setEditTaskDate] = useState("");
  const [editTaskWeather, setEditTaskWeather] = useState("");
  const [editTaskPhotoUrls, setEditTaskPhotoUrls] = useState<string[]>([]);
  const [editTaskDocumentUrls, setEditTaskDocumentUrls] = useState<string[]>([]);
  const [editTaskPhotoStorageIds, setEditTaskPhotoStorageIds] = useState<Id<"_storage">[]>([]);
  const [editTaskDocStorageIds, setEditTaskDocStorageIds] = useState<Id<"_storage">[]>([]);
  const [editTaskPhotoBlobIds, setEditTaskPhotoBlobIds] = useState<string[]>([]);
  const [editTaskDocBlobIds, setEditTaskDocBlobIds] = useState<string[]>([]);
  const [editTaskPhotoUploading, setEditTaskPhotoUploading] = useState(false);
  const [editTaskDocUploading, setEditTaskDocUploading] = useState(false);
  const [newSubtradeIdsOnSite, setNewSubtradeIdsOnSite] = useState<Id<"projectSubtrades">[]>([]);
  const [editSubtradeIdsOnSite, setEditSubtradeIdsOnSite] = useState<Id<"projectSubtrades">[]>([]);
  const [editTaskStartDate, setEditTaskStartDate] = useState("");
  const [editTaskStatus, setEditTaskStatus] = useState<"not_started" | "in_progress" | "blocked" | "done">("not_started");
  const [editTaskProgress, setEditTaskProgress] = useState("");
  const [editTaskPriority, setEditTaskPriority] = useState("");
  const [editTaskMaterial, setEditTaskMaterial] = useState("");
  const [editTaskCost, setEditTaskCost] = useState("");
  const [editTaskScheduleComment, setEditTaskScheduleComment] = useState("");
  const [showNewDailyReportModal, setShowNewDailyReportModal] = useState(false);
  const [documentsModal, setDocumentsModal] = useState<null | "add-document" | "new-folder">(null);
  const [drNestedModal, setDrNestedModal] = useState<null | "document">(null);
  const [drNestedModalIsEdit, setDrNestedModalIsEdit] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocType, setNewDocType] = useState("other");
  const [newDocUrl, setNewDocUrl] = useState("");
  const [newRfiTitle, setNewRfiTitle] = useState("");
  const [newRfiStatus, setNewRfiStatus] = useState<"paid" | "unpaid">("unpaid");
  const [newRfiDate, setNewRfiDate] = useState("");
  const [newRfiUrl, setNewRfiUrl] = useState("");
  const [newSiTitle, setNewSiTitle] = useState("");
  const [newSiStatus, setNewSiStatus] = useState<"paid" | "unpaid">("unpaid");
  const [newSiDate, setNewSiDate] = useState("");
  const [newSiUrl, setNewSiUrl] = useState("");
  const [newCorTitle, setNewCorTitle] = useState("");
  const [newCorStatus, setNewCorStatus] = useState<"paid" | "unpaid">("unpaid");
  const [newCorDate, setNewCorDate] = useState("");
  const [newCorUrl, setNewCorUrl] = useState("");
  const [newCoTitle, setNewCoTitle] = useState("");
  const [newCoStatus, setNewCoStatus] = useState<"paid" | "unpaid">("unpaid");
  const [newCoDate, setNewCoDate] = useState("");
  const [newCoUrl, setNewCoUrl] = useState("");
  const [newPcnTitle, setNewPcnTitle] = useState("");
  const [newPcnStatus, setNewPcnStatus] = useState<"paid" | "unpaid">("unpaid");
  const [newPcnDate, setNewPcnDate] = useState("");
  const [newPcnUrl, setNewPcnUrl] = useState("");
  const [newDocStorageId, setNewDocStorageId] = useState<Id<"_storage"> | null>(null);
  const [newDocFolderId, setNewDocFolderId] = useState<Id<"documentFolders"> | "">("");
  const [newDocComplianceCategory, setNewDocComplianceCategory] = useState<ComplianceCategory | "">("");
  const [newDocIssueDate, setNewDocIssueDate] = useState("");
  const [newDocExpiryDate, setNewDocExpiryDate] = useState("");
  const [newDocSubtradeId, setNewDocSubtradeId] = useState<Id<"projectSubtrades"> | "">("");
  const [newDocumentFolderName, setNewDocumentFolderName] = useState("");
  const [documentFolderCreating, setDocumentFolderCreating] = useState(false);
  const [newRfiStorageId, setNewRfiStorageId] = useState<Id<"_storage"> | null>(null);
  const [newSiStorageId, setNewSiStorageId] = useState<Id<"_storage"> | null>(null);
  const [newCorStorageId, setNewCorStorageId] = useState<Id<"_storage"> | null>(null);
  const [newCoStorageId, setNewCoStorageId] = useState<Id<"_storage"> | null>(null);
  const [newPcnStorageId, setNewPcnStorageId] = useState<Id<"_storage"> | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [changeUploading, setChangeUploading] = useState<ChangeDocKind | null>(null);
  const [editingChangeDocId, setEditingChangeDocId] = useState<Id<"documents"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<"paid" | "unpaid">("unpaid");
  const [editDate, setEditDate] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editStorageId, setEditStorageId] = useState<Id<"_storage"> | null>(null);
  const [editUploading, setEditUploading] = useState(false);
  const [editingComplianceDocId, setEditingComplianceDocId] = useState<Id<"documents"> | null>(null);
  const [editComplianceName, setEditComplianceName] = useState("");
  const [editComplianceCategory, setEditComplianceCategory] = useState<ComplianceCategory | "">("");
  const [editComplianceIssueDate, setEditComplianceIssueDate] = useState("");
  const [editComplianceExpiryDate, setEditComplianceExpiryDate] = useState("");
  const [editComplianceSubtradeId, setEditComplianceSubtradeId] = useState<Id<"projectSubtrades"> | "">("");
  const [editComplianceFileUrl, setEditComplianceFileUrl] = useState("");
  const [editComplianceStorageId, setEditComplianceStorageId] = useState<Id<"_storage"> | null>(null);
  const [editComplianceUploading, setEditComplianceUploading] = useState(false);
  const [historyDoc, setHistoryDoc] = useState<Doc<"documents"> | null>(null);
  type ConfirmAction =
    | { type: "delete-doc"; documentId: Id<"documents">; name?: string }
    | { type: "delete-project" }
    | { type: "remove-subtrade"; subtradeId: Id<"projectSubtrades">; name?: string }
    | { type: "delete-daily-report"; taskId: Id<"projectTasks">; title?: string }
    | { type: "delete-site-photo"; photoId: Id<"projectSitePhotos">; name?: string }
    | { type: "delete-schedule-task"; taskId: Id<"projectTasks">; title?: string };
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmRunning, setConfirmRunning] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const complianceEditPayload = useMemo(
    () => JSON.stringify({ name: editComplianceName }),
    [editComplianceName],
  );
  const complianceAutosave = useDocumentAutosave({
    documentId: editingComplianceDocId,
    enabled: !!editingComplianceDocId && !!editComplianceName.trim(),
    payload: complianceEditPayload,
    draft: { name: editComplianceName.trim() || undefined },
  });

  function confirmActionMessage(action: ConfirmAction): ReactNode {
    switch (action.type) {
      case "delete-doc":
        return (
          <>
            This will permanently remove{" "}
            <span style={{ fontWeight: 600, color: "#111827" }}>{action.name || "this document"}</span> from the
            project.
          </>
        );
      case "delete-project":
        return (
          <>
            This will permanently delete project{" "}
            <span style={{ fontWeight: 600, color: "#111827" }}>{project?.name}</span> and all of its related data.
            This cannot be undone.
          </>
        );
      case "remove-subtrade":
        return (
          <>
            This will remove subtrade{" "}
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{action.name || "this subtrade"}</span> from
            the project.
          </>
        );
      case "delete-daily-report":
      case "delete-schedule-task":
        return (
          <>
            This will permanently delete{" "}
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {action.title || (action.type === "delete-schedule-task" ? "this task" : "this report")}
            </span>
            . This cannot be undone.
          </>
        );
      case "delete-site-photo":
        return (
          <>
            This will permanently delete{" "}
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{action.name || "this file"}</span> from Site
            Photos.
          </>
        );
    }
  }

  async function runConfirmAction(action: ConfirmAction) {
    if (action.type === "delete-doc") {
      await deleteDocument({ documentId: action.documentId });
      if (editingChangeDocId === action.documentId) setEditingChangeDocId(null);
    } else if (action.type === "delete-project") {
      await deleteProject({ projectId: projectId! });
      navigate("/projects");
    } else if (action.type === "remove-subtrade") {
      await removeSubtrade({ subtradeId: action.subtradeId });
      if (editingSubtradeId === action.subtradeId) setEditingSubtradeId(null);
    } else if (action.type === "delete-daily-report" || action.type === "delete-schedule-task") {
      await removeTask({ taskId: action.taskId });
      if (editingTaskId === action.taskId) setEditingTaskId(null);
      if (action.type === "delete-daily-report" && selectedDrReportId === action.taskId) setSelectedDrReportId(null);
      if (action.type === "delete-schedule-task") {
        setEditDailyReportFolderId("");
        setDrNestedModal(null);
      }
    } else if (action.type === "delete-site-photo") {
      setSitePhotoDeletingId(action.photoId);
      try {
        await deleteSitePhoto({ photoId: action.photoId });
      } finally {
        setSitePhotoDeletingId(null);
      }
    }
  }
  const [editingSummary, setEditingSummary] = useState(false);
  const [showSummaryEditor, setShowSummaryEditor] = useState(false);
  const [showSummaryQuickEditor, setShowSummaryQuickEditor] = useState(false);
  const [summaryEditError, setSummaryEditError] = useState<string | null>(null);
  const [summaryEditSaving, setSummaryEditSaving] = useState(false);
  const [editLocation, setEditLocation] = useState("");
  const [editPrincipalId, setEditPrincipalId] = useState<Id<"users"> | "">("");
  const [editPmId, setEditPmId] = useState<Id<"users"> | "">("");
  const [editCoordinatorId, setEditCoordinatorId] = useState<Id<"users"> | "">("");
  const [editSiteSuperId, setEditSiteSuperId] = useState<Id<"users"> | "">("");
  const [editAccountsPayableId, setEditAccountsPayableId] = useState<Id<"users"> | "">("");
  const [editSafetyMemberId, setEditSafetyMemberId] = useState<Id<"users"> | "">("");
  const [editSiteSupersStr, setEditSiteSupersStr] = useState("");
  const [editBudgetDocumentUrl, setEditBudgetDocumentUrl] = useState("");
  const [editSafetyDocumentUrl, setEditSafetyDocumentUrl] = useState("");
  const [editProjectSheetUrl, setEditProjectSheetUrl] = useState("");
  const [editBudgetStorageId, setEditBudgetStorageId] = useState<Id<"_storage"> | null>(null);
  const [editSafetyStorageId, setEditSafetyStorageId] = useState<Id<"_storage"> | null>(null);
  const [editProjectSheetStorageId, setEditProjectSheetStorageId] = useState<Id<"_storage"> | null>(null);
  const [budgetUploading, setBudgetUploading] = useState(false);
  const [safetyUploading, setSafetyUploading] = useState(false);
  const [projectSheetUploading, setProjectSheetUploading] = useState(false);
  const [projectSheetUrlOverride, setProjectSheetUrlOverride] = useState<string | null>(null);
  const [projectSheetUploadError, setProjectSheetUploadError] = useState<string | null>(null);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [editProjectStatus, setEditProjectStatus] = useState<ProjectStatus>("active");
  const [editHealthStatus, setEditHealthStatus] = useState<"green" | "amber" | "red" | "">("");
  const [editHealthNotes, setEditHealthNotes] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editSummaryLinkUrl, setEditSummaryLinkUrl] = useState("");
  const [editSummaryLinkLabel, setEditSummaryLinkLabel] = useState("");
  const [editActualCost, setEditActualCost] = useState("");
  const [editBudgetAmount, setEditBudgetAmount] = useState("");
  const [editingBudgetNotes, setEditingBudgetNotes] = useState(false);
  const [editCashFlowNotes, setEditCashFlowNotes] = useState("");
  const [editForecastingNotes, setEditForecastingNotes] = useState("");
  const [editInsuranceAndBondsNotes, setEditInsuranceAndBondsNotes] = useState("");
  const [editPurchaseOrdersNotes, setEditPurchaseOrdersNotes] = useState("");
  const [editProgressClaimsNotes, setEditProgressClaimsNotes] = useState("");
  const [editQuotesNotes, setEditQuotesNotes] = useState("");
  const [editingSubtradeId, setEditingSubtradeId] = useState<Id<"projectSubtrades"> | null>(null);
  const [sitePhotoUploading, setSitePhotoUploading] = useState(false);
  const [sitePhotoUploadStatus, setSitePhotoUploadStatus] = useState<string | null>(null);
  const [sitePhotoDeletingId, setSitePhotoDeletingId] = useState<Id<"projectSitePhotos"> | null>(null);
  const [sitePhotoMenu, setSitePhotoMenu] = useState<{
    photoId: Id<"projectSitePhotos">;
    x: number;
    y: number;
  } | null>(null);
  const [moveSitePhotoId, setMoveSitePhotoId] = useState<Id<"projectSitePhotos"> | null>(null);
  const [moveSitePhotoFolderId, setMoveSitePhotoFolderId] = useState<Id<"sitePhotoFolders"> | "unfiled">("unfiled");
  const [movingSitePhoto, setMovingSitePhoto] = useState(false);
  const [moveSitePhotoError, setMoveSitePhotoError] = useState<string | null>(null);
  const [renameSitePhotoId, setRenameSitePhotoId] = useState<Id<"projectSitePhotos"> | null>(null);
  const [renameSitePhotoName, setRenameSitePhotoName] = useState("");
  const [renamingSitePhoto, setRenamingSitePhoto] = useState(false);
  const [renameSitePhotoError, setRenameSitePhotoError] = useState<string | null>(null);
  const [sitePhotoTagModal, setSitePhotoTagModal] = useState<
    | null
    | {
        mode: "upload";
        files: File[];
        sitePhotoFolderId?: Id<"sitePhotoFolders">;
      }
    | { mode: "edit"; photoId: Id<"projectSitePhotos"> }
  >(null);
  const [sitePhotoTagArea, setSitePhotoTagArea] = useState("");
  const [sitePhotoTagTradeId, setSitePhotoTagTradeId] = useState("");
  const [sitePhotoTagDate, setSitePhotoTagDate] = useState("");
  const [sitePhotoTagCategory, setSitePhotoTagCategory] = useState<SitePhotoCategory | "">("");
  const [sitePhotoTagNotes, setSitePhotoTagNotes] = useState("");
  const [sitePhotoTagError, setSitePhotoTagError] = useState<string | null>(null);
  const [savingSitePhotoTags, setSavingSitePhotoTags] = useState(false);
  const [sitePhotoPreview, setSitePhotoPreview] = useState<SitePhotoPreviewState | null>(null);
  const [sitePhotoPreviewLoadError, setSitePhotoPreviewLoadError] = useState(false);
  const [sitePhotoImgRetry, setSitePhotoImgRetry] = useState(0);
  const sitePhotoPreviewFileUrl = useMemo(
    () => (sitePhotoPreview?.fileUrl ?? "").trim(),
    [sitePhotoPreview?.fileUrl],
  );
  const [draggingTaskId, setDraggingTaskId] = useState<Id<"projectTasks"> | null>(null);
  const [dragStartDate, setDragStartDate] = useState<number | null>(null);
  const canDeleteProject = user?.role === "admin" || user?.role === "project_manager";

  useEffect(() => {
    let cancelled = false;
    const location = project?.location?.trim();
    if (!newTaskDate || !location) return;
    setTaskWeatherLoading(true);
    fetchDailyWeatherSummary(location, newTaskDate)
      .then((summary) => {
        if (!cancelled) setNewTaskWeather(summary);
      })
      .catch(() => {
        if (!cancelled) setNewTaskWeather("Weather unavailable");
      })
      .finally(() => {
        if (!cancelled) setTaskWeatherLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [newTaskDate, project?.location]);

  const tabQuery = searchParams.get("tab");
  const summaryEditRequested = searchParams.get("edit") === "summary";

  useEffect(() => {
    if (!summaryEditRequested || section !== "summary" || !project) return;
    startEditingSummary();
    navigate(`/projects/${id}`, { replace: true });
  }, [summaryEditRequested, section, project, navigate, id]);

  useEffect(() => {
    if (!sitePhotoPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSitePhotoPreview(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [sitePhotoPreview]);

  useEffect(() => {
    setSitePhotoPreviewLoadError(false);
  }, [sitePhotoPreview?.fileUrl, sitePhotoPreview?.variant, sitePhotoImgRetry]);

  useEffect(() => {
    if (!sitePhotoMenu) return;
    const onWindowClick = () => setSitePhotoMenu(null);
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSitePhotoMenu(null);
    };
    window.addEventListener("click", onWindowClick);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("click", onWindowClick);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [sitePhotoMenu]);

  if (id == null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>No project selected.</p>
      </div>
    );
  }
  if (tabQuery) {
    if (tabQuery === "documents") {
      return <Navigate to={`/projects/${id}`} replace />;
    }
    if (tabQuery === "safety") {
      return <Navigate to={`/safety/project/${id}`} replace />;
    }
    const mapped = LEGACY_TAB_QUERY_TO_PATH[tabQuery];
    if (mapped !== undefined) {
      const path = mapped ? `/projects/${id}/${mapped}` : `/projects/${id}`;
      return <Navigate to={path} replace />;
    }
  }

  if (section === "invalid") {
    return <Navigate to={`/projects/${id}`} replace />;
  }

  if (section === "safety") {
    return <Navigate to={`/safety/project/${id}`} replace />;
  }

  if (project === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Project not found.</p>
        <Link to="/projects" style={{ color: "#059669" }}>Back to projects</Link>
      </div>
    );
  }

  const activeProject = project;
  if (isSiteSuper && section === "subtrades" && parseSubtradesSubtradeId(location.pathname, id) === null) {
    return <Navigate to={`/projects/${id}`} replace />;
  }

  async function handleDeleteProject() {
    if (!id) return;
    setConfirmAction({ type: "delete-project" });
  }

  function resetNewDailyReportForm() {
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskDate("");
    setNewTaskWeather("");
    setNewTaskPhotoStorageIds([]);
    setNewTaskDocStorageIds([]);
    setNewTaskPhotoBlobIds([]);
    setNewTaskDocBlobIds([]);
    setDailyReportFolderId("");
    setNewSubtradeIdsOnSite([]);
    setDrNestedModal(null);
    setDrNestedModalIsEdit(false);
    setShowNewDailyReportModal(false);
  }

  function openNewDailyReportModal(preferredDailyFolder?: Id<"documentFolders">) {
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskDate("");
    setNewTaskWeather("");
    setNewTaskPhotoStorageIds([]);
    setNewTaskDocStorageIds([]);
    setNewTaskPhotoBlobIds([]);
    setNewTaskDocBlobIds([]);
    setDailyReportFolderId(preferredDailyFolder ?? "");
    setNewSubtradeIdsOnSite([]);
    setDrNestedModal(null);
    setDrNestedModalIsEdit(false);
    setShowNewDailyReportModal(true);
  }

  function openTaskEditor(task: Doc<"projectTasks">) {
    setEditTaskTitle(task.title);
    setEditTaskDescription(task.description ?? "");
    setEditTaskStartDate(timestampToDateInputValue(task.startDate));
    setEditTaskDate(timestampToDateInputValue(task.dueDate));
    setEditTaskStatus(task.status);
    setEditTaskProgress(task.progressPercent == null ? "" : String(task.progressPercent));
    setEditTaskPriority(task.priority ?? "");
    setEditTaskMaterial(task.material ?? "");
    setEditTaskCost(task.taskCost == null ? "" : String(task.taskCost));
    setEditTaskScheduleComment(task.scheduleComment ?? "");
    setEditTaskWeather(task.weatherSummary ?? "");
    setEditTaskPhotoUrls(task.photoUrls ?? []);
    setEditTaskDocumentUrls(task.documentUrls ?? []);
    setEditTaskPhotoStorageIds([]);
    setEditTaskDocStorageIds([]);
    setEditTaskPhotoBlobIds([]);
    setEditTaskDocBlobIds([]);
    setEditDailyReportFolderId(task.dailyReportFolderId ?? "");
    setEditSubtradeIdsOnSite(task.subtradeIdsOnSite ?? []);
    setEditingTaskId(task._id);
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskDate || !projectId) return;
    const reportDateMs = dateInputValueToTimestamp(newTaskDate);
    if (reportDateMs === undefined) return;
    if (isOffline) {
      await queueJob({
        type: "dailyReportCreate",
        payload: {
          projectId: id!,
          title: newTaskTitle.trim(),
          description: newTaskDescription.trim() || undefined,
          dueDate: reportDateMs,
          weatherSummary: newTaskWeather.trim() || undefined,
          subtradeIdsOnSite: newSubtradeIdsOnSite.length
            ? newSubtradeIdsOnSite.map((x) => String(x))
            : undefined,
          dailyReportFolderId: dailyReportFolderId ? String(dailyReportFolderId) : undefined,
          photoStorageIds: newTaskPhotoStorageIds.length
            ? newTaskPhotoStorageIds.map((x) => String(x))
            : undefined,
          docStorageIds: newTaskDocStorageIds.length
            ? newTaskDocStorageIds.map((x) => String(x))
            : undefined,
          photoBlobIds: newTaskPhotoBlobIds,
          docBlobIds: newTaskDocBlobIds,
        },
      });
      resetNewDailyReportForm();
      return;
    }
    await createTask({
      projectId: projectId!,
      title: newTaskTitle.trim(),
      description: newTaskDescription.trim() || undefined,
      dueDate: reportDateMs,
      weatherSummary: newTaskWeather.trim() || undefined,
      photoStorageIds: newTaskPhotoStorageIds.length ? newTaskPhotoStorageIds : undefined,
      documentStorageIds: newTaskDocStorageIds.length ? newTaskDocStorageIds : undefined,
      subtradeIdsOnSite: newSubtradeIdsOnSite.length ? newSubtradeIdsOnSite : undefined,
      ...(dailyReportFolderId ? { dailyReportFolderId } : {}),
      isDailyReport: true,
    });
    const titleTrim = newTaskTitle.trim();
    if (dailyReportFolderId && newTaskDocStorageIds.length) {
      for (let i = 0; i < newTaskDocStorageIds.length; i++) {
        await createDocument({
          projectId: projectId!,
          type: "other",
          name: `${titleTrim} - attachment ${i + 1}`,
          storageId: newTaskDocStorageIds[i],
          folderId: dailyReportFolderId,
          createdDate: reportDateMs,
        });
      }
    }
    resetNewDailyReportForm();
  }

  async function handleAddDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!newDocName.trim()) return;
    const hasFile = newDocStorageId || newDocUrl.trim();
    if (!hasFile) return;
    const issueMs = dateInputValueToTimestamp(newDocIssueDate);
    const expiryMs = dateInputValueToTimestamp(newDocExpiryDate);
    await createDocument({
      projectId: projectId!,
      name: newDocName.trim(),
      type: newDocType,
      ...(newDocFolderId ? { folderId: newDocFolderId } : {}),
      ...(newDocStorageId ? { storageId: newDocStorageId } : { fileUrl: newDocUrl.trim() }),
      ...(newDocComplianceCategory ? { complianceCategory: newDocComplianceCategory } : {}),
      ...(issueMs !== undefined ? { issueDate: issueMs } : {}),
      ...(expiryMs !== undefined ? { expiryDate: expiryMs } : {}),
      ...(newDocSubtradeId ? { subtradeId: newDocSubtradeId } : {}),
    });
    setNewDocName("");
    setNewDocType("other");
    setNewDocUrl("");
    setNewDocStorageId(null);
    setNewDocComplianceCategory("");
    setNewDocIssueDate("");
    setNewDocExpiryDate("");
    setNewDocSubtradeId("");
    setDocumentsModal(null);
  }

  async function handleCreateDocumentFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    const folderName = newDocumentFolderName.trim();
    if (!folderName) return;
    setDocumentFolderCreating(true);
    try {
      const createdFolderId = await createDocumentFolder({
        projectId: projectId!,
        name: folderName,
      });
      setNewDocumentFolderName("");
      setNewDocFolderId(createdFolderId);
    } finally {
      setDocumentFolderCreating(false);
      setDocumentsModal(null);
    }
  }

  async function handleCreateSitePhotoFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    const name = newSitePhotoFolderName.trim();
    if (!name) return;
    setSitePhotoFolderCreating(true);
    try {
      await createSitePhotoFolder({ projectId: projectId!, name });
      setNewSitePhotoFolderName("");
      setNewSitePhotoFolderModalOpen(false);
    } finally {
      setSitePhotoFolderCreating(false);
    }
  }

  async function handleAddChangeDocument(
    e: React.FormEvent,
    kind: ChangeDocKind
  ) {
    e.preventDefault();
    let title = "";
    let status: "paid" | "unpaid" = "unpaid";
    let dateStr = "";
    let url = "";
    let storageId: Id<"_storage"> | null = null;
    if (kind === "RFI") {
      title = newRfiTitle.trim();
      status = newRfiStatus;
      dateStr = newRfiDate;
      url = newRfiUrl.trim();
      storageId = newRfiStorageId;
    } else if (kind === "SI") {
      title = newSiTitle.trim();
      status = newSiStatus;
      dateStr = newSiDate;
      url = newSiUrl.trim();
      storageId = newSiStorageId;
    } else if (kind === "COR") {
      title = newCorTitle.trim();
      status = newCorStatus;
      dateStr = newCorDate;
      url = newCorUrl.trim();
      storageId = newCorStorageId;
    } else if (kind === "PCN") {
      title = newPcnTitle.trim();
      status = newPcnStatus;
      dateStr = newPcnDate;
      url = newPcnUrl.trim();
      storageId = newPcnStorageId;
    } else {
      title = newCoTitle.trim();
      status = newCoStatus;
      dateStr = newCoDate;
      url = newCoUrl.trim();
      storageId = newCoStorageId;
    }
    if (!title || !dateStr) return;
    if (!storageId && !url) return;
    const createdMs = dateInputValueToTimestamp(dateStr);
    if (createdMs === undefined) return;
    const docType = kind === "CO" ? "CO" : kind;
    await createDocument({
      projectId: projectId!,
      type: docType,
      name: title,
      ...(storageId ? { storageId } : { fileUrl: url }),
      status,
      createdDate: createdMs,
      ...(docType === "RFI" ? { workflowDueDate: createdMs } : {}),
    });
    if (kind === "RFI") {
      setNewRfiTitle("");
      setNewRfiStatus("unpaid");
      setNewRfiDate("");
      setNewRfiUrl("");
      setNewRfiStorageId(null);
    } else if (kind === "SI") {
      setNewSiTitle("");
      setNewSiStatus("unpaid");
      setNewSiDate("");
      setNewSiUrl("");
      setNewSiStorageId(null);
    } else if (kind === "COR") {
      setNewCorTitle("");
      setNewCorStatus("unpaid");
      setNewCorDate("");
      setNewCorUrl("");
      setNewCorStorageId(null);
    } else if (kind === "PCN") {
      setNewPcnTitle("");
      setNewPcnStatus("unpaid");
      setNewPcnDate("");
      setNewPcnUrl("");
      setNewPcnStorageId(null);
    } else {
      setNewCoTitle("");
      setNewCoStatus("unpaid");
      setNewCoDate("");
      setNewCoUrl("");
      setNewCoStorageId(null);
    }
  }

  async function handleFileUpload(
    file: File,
    setStorageId: (id: Id<"_storage"> | null) => void,
    onDone: () => void
  ) {
    try {
      setFileUploadError(null);
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      setStorageId(storageId);
    } catch (err) {
      setFileUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      onDone();
    }
  }

  async function uploadFiles(
    files: FileList,
    setUploading: (value: boolean) => void,
    onComplete: (ids: Id<"_storage">[]) => void
  ) {
    const allFiles = Array.from(files);
    if (allFiles.length === 0) return;
    setUploading(true);
    setFileUploadError(null);
    try {
      const uploadedIds: Id<"_storage">[] = [];
      for (const file of allFiles) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, { method: "POST", body: file });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = await res.json();
        uploadedIds.push(storageId);
      }
      onComplete(uploadedIds);
    } catch (err) {
      setFileUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleProjectSheetUpload(file: File) {
    setProjectSheetUploading(true);
    setEditProjectSheetStorageId(null);
    setProjectSheetUploadError(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Project sheet upload failed");
      const { storageId } = await res.json();
      setEditProjectSheetStorageId(storageId);
      const result = await setProjectSheet({
        projectId: projectId!,
        storageId,
      });
      setProjectSheetUrlOverride(result.projectSheetUrl);
    } catch (err) {
      setProjectSheetUploadError(err instanceof Error ? err.message : "Project sheet upload failed");
    } finally {
      setProjectSheetUploading(false);
    }
  }

  async function stageDailyReportFilesFromInput(
    files: FileList,
    which: "newPhoto" | "newDoc" | "editPhoto" | "editDoc"
  ) {
    const allFiles = Array.from(files);
    if (allFiles.length === 0) return;
    setFileUploadError(null);
    if (isOffline) {
      const setUploading =
        which === "newPhoto"
          ? setTaskPhotoUploading
          : which === "newDoc"
            ? setTaskDocUploading
            : which === "editPhoto"
              ? setEditTaskPhotoUploading
              : setEditTaskDocUploading;
      setUploading(true);
      try {
        for (const file of allFiles) {
          const buf = await file.arrayBuffer();
          const bid = await putBlob({
            arrayBuffer: buf,
            mimeType: file.type || "application/octet-stream",
            fileName: file.name || "file",
          });
          if (which === "newPhoto") setNewTaskPhotoBlobIds((prev) => [...prev, bid]);
          else if (which === "newDoc") setNewTaskDocBlobIds((prev) => [...prev, bid]);
          else if (which === "editPhoto") setEditTaskPhotoBlobIds((prev) => [...prev, bid]);
          else setEditTaskDocBlobIds((prev) => [...prev, bid]);
        }
      } catch (err) {
        setFileUploadError(err instanceof Error ? err.message : "Could not queue files for offline sync.");
      } finally {
        setUploading(false);
      }
      return;
    }
    if (which === "newPhoto") {
      await uploadFiles(files, setTaskPhotoUploading, (ids) =>
        setNewTaskPhotoStorageIds((prev) => [...prev, ...ids])
      );
    } else if (which === "newDoc") {
      await uploadFiles(files, setTaskDocUploading, (ids) =>
        setNewTaskDocStorageIds((prev) => [...prev, ...ids])
      );
    } else if (which === "editPhoto") {
      await uploadFiles(files, setEditTaskPhotoUploading, (ids) =>
        setEditTaskPhotoStorageIds((prev) => [...prev, ...ids])
      );
    } else {
      await uploadFiles(files, setEditTaskDocUploading, (ids) =>
        setEditTaskDocStorageIds((prev) => [...prev, ...ids])
      );
    }
  }

  async function uploadSitePhotos(
    files: FileList | File[],
    sitePhotoFolderId: Id<"sitePhotoFolders"> | undefined,
    tags: SitePhotoCreateTags,
  ) {
    if (!id) return;
    const allFiles = Array.isArray(files) ? files : Array.from(files);
    if (allFiles.length === 0) return;
    setFileUploadError(null);
    setSitePhotoUploadStatus(null);

    async function normalizeForUpload(file: File, index: number) {
      const heic = isLikelyHeicFormat(file.type, file.name);
      setSitePhotoUploadStatus(
        heic
          ? allFiles.length > 1
            ? `Converting photo ${index + 1} of ${allFiles.length}…`
            : "Converting HEIC photo…"
          : allFiles.length > 1
            ? `Preparing photo ${index + 1} of ${allFiles.length}…`
            : "Preparing photo…",
      );
      return normalizeImageFileForUpload(file);
    }

    if (isOffline) {
      setSitePhotoUploading(true);
      try {
        const fileBlobIds: string[] = [];
        const originalFileNames: (string | undefined)[] = [];
        const mimeTypes: (string | undefined)[] = [];
        for (let i = 0; i < allFiles.length; i++) {
          const file = allFiles[i];
          const normalized = await normalizeForUpload(file, i);
          const buf = await normalized.arrayBuffer();
          const bid = await putBlob({
            arrayBuffer: buf,
            mimeType: normalized.type || "application/octet-stream",
            fileName: normalized.name || "file",
          });
          fileBlobIds.push(bid);
          originalFileNames.push(file.name || undefined);
          mimeTypes.push(normalized.type || undefined);
        }
        await queueJob({
          type: "sitePhotosUpload",
          payload: {
            projectId: id!,
            fileBlobIds,
            originalFileNames,
            mimeTypes,
            ...(sitePhotoFolderId ? { sitePhotoFolderId: String(sitePhotoFolderId) } : {}),
            ...(tags.areaOnSite ? { areaOnSite: tags.areaOnSite } : {}),
            ...(tags.subtradeId ? { subtradeId: String(tags.subtradeId) } : {}),
            ...(tags.taggedDate !== undefined ? { taggedDate: tags.taggedDate } : {}),
            photoCategory: tags.photoCategory,
            ...(tags.notes ? { notes: tags.notes } : {}),
          },
        });
      } catch (err) {
        setFileUploadError(err instanceof Error ? err.message : "Could not queue site photos for offline sync.");
      } finally {
        setSitePhotoUploading(false);
        setSitePhotoUploadStatus(null);
      }
      return;
    }
    setSitePhotoUploading(true);
    try {
      const tagArgs = {
        ...(tags.areaOnSite ? { areaOnSite: tags.areaOnSite } : {}),
        ...(tags.subtradeId ? { subtradeId: tags.subtradeId } : {}),
        ...(tags.taggedDate !== undefined ? { taggedDate: tags.taggedDate } : {}),
        photoCategory: tags.photoCategory,
        ...(tags.notes ? { notes: tags.notes } : {}),
      };
      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        const normalized = await normalizeForUpload(file, i);
        setSitePhotoUploadStatus(
          allFiles.length > 1
            ? `Uploading photo ${i + 1} of ${allFiles.length}…`
            : "Uploading photo…",
        );
        const uploadUrl = await generateSitePhotoUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: normalized.type ? { "Content-Type": normalized.type } : undefined,
          body: normalized,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail.trim() || `Upload failed (${res.status})`);
        }
        const { storageId } = await res.json();
        const baseArgs = {
          projectId: projectId!,
          storageId,
          ...(sitePhotoFolderId ? { sitePhotoFolderId } : {}),
          ...tagArgs,
        };
        try {
          await createSitePhoto({
            ...baseArgs,
            displayName: normalized.name || undefined,
            originalFileName: file.name || undefined,
            mimeType: normalized.type || undefined,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const mayBeLegacyValidator =
            message.toLowerCase().includes("extra field") ||
            message.toLowerCase().includes("unexpected field") ||
            message.toLowerCase().includes("validator");
          if (!mayBeLegacyValidator) throw error;
          await createSitePhoto({
            ...baseArgs,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFileUploadError(
        message.trim()
          ? message
          : "Site photo upload failed. Please try again.",
      );
    } finally {
      setSitePhotoUploading(false);
      setSitePhotoUploadStatus(null);
    }
  }

  function resetSitePhotoTagFormToDefaults() {
    setSitePhotoTagArea("");
    setSitePhotoTagTradeId("");
    setSitePhotoTagDate(toDateInputValue(Date.now()));
    setSitePhotoTagCategory("");
    setSitePhotoTagNotes("");
    setSitePhotoTagError(null);
  }

  function openSitePhotoUploadTagModal(files: FileList | null, sitePhotoFolderId?: Id<"sitePhotoFolders">) {
    if (!files?.length) return;
    resetSitePhotoTagFormToDefaults();
    setSitePhotoTagModal({ mode: "upload", files: Array.from(files), sitePhotoFolderId });
  }

  function openSitePhotoEditTagsModal(photoId: Id<"projectSitePhotos">) {
    const photo = sitePhotos?.find((p: Doc<"projectSitePhotos">) => p._id === photoId);
    if (!photo) return;
    setSitePhotoTagArea(photo.areaOnSite ?? "");
    setSitePhotoTagTradeId(photo.subtradeId ? String(photo.subtradeId) : "");
    setSitePhotoTagDate(
      photo.taggedDate != null ? toDateInputValue(photo.taggedDate) : toDateInputValue(Date.now()),
    );
    setSitePhotoTagCategory((photo.photoCategory as SitePhotoCategory | undefined) ?? "");
    setSitePhotoTagNotes(photo.notes ?? "");
    setSitePhotoTagError(null);
    setSitePhotoTagModal({ mode: "edit", photoId });
  }

  function cancelSitePhotoTagModal() {
    setSitePhotoTagModal(null);
    setSitePhotoTagError(null);
  }

  async function confirmSitePhotoTagModal() {
    if (!sitePhotoTagModal) return;
    if (sitePhotoTagModal.mode === "upload") {
      if (!sitePhotoTagCategory) {
        setSitePhotoTagError("Choose a category.");
        return;
      }
      const taggedTs = dateInputValueToTimestamp(sitePhotoTagDate);
      const tags: SitePhotoCreateTags = {
        photoCategory: sitePhotoTagCategory,
        ...(sitePhotoTagArea.trim() ? { areaOnSite: sitePhotoTagArea.trim() } : {}),
        ...(sitePhotoTagTradeId ? { subtradeId: sitePhotoTagTradeId as Id<"projectSubtrades"> } : {}),
        ...(taggedTs != null ? { taggedDate: taggedTs } : {}),
        ...(sitePhotoTagNotes.trim() ? { notes: sitePhotoTagNotes.trim() } : {}),
      };
      const { files, sitePhotoFolderId } = sitePhotoTagModal;
      setSitePhotoTagModal(null);
      resetSitePhotoTagFormToDefaults();
      await uploadSitePhotos(files, sitePhotoFolderId, tags);
      return;
    }
    setSavingSitePhotoTags(true);
    setSitePhotoTagError(null);
    try {
      const taggedTs = dateInputValueToTimestamp(sitePhotoTagDate);
      await updateSitePhoto({
        photoId: sitePhotoTagModal.photoId,
        areaOnSite: sitePhotoTagArea.trim() ? sitePhotoTagArea.trim() : null,
        subtradeId: sitePhotoTagTradeId ? (sitePhotoTagTradeId as Id<"projectSubtrades">) : null,
        taggedDate: taggedTs != null ? taggedTs : null,
        photoCategory: sitePhotoTagCategory ? sitePhotoTagCategory : null,
        notes: sitePhotoTagNotes.trim() ? sitePhotoTagNotes.trim() : null,
      });
      setSitePhotoTagModal(null);
      resetSitePhotoTagFormToDefaults();
    } catch (e) {
      setSitePhotoTagError(e instanceof Error ? e.message : "Could not save tags.");
    } finally {
      setSavingSitePhotoTags(false);
    }
  }

  async function fetchDailyWeatherSummary(location: string, reportDate: string) {
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
    const geocodeRes = await fetch(geocodeUrl);
    if (!geocodeRes.ok) throw new Error("Unable to geocode project location");
    const geocodeJson = await geocodeRes.json();
    const first = geocodeJson?.results?.[0];
    if (first?.latitude == null || first?.longitude == null) throw new Error("Project location could not be found");
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max` +
      `&start_date=${reportDate}&end_date=${reportDate}&timezone=auto`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) throw new Error("Unable to fetch weather");
    const weatherJson = await weatherRes.json();
    const daily = weatherJson?.daily;
    if (!daily) throw new Error("No weather data returned");
    const code = Number(daily.weathercode?.[0] ?? -1);
    const max = daily.temperature_2m_max?.[0];
    const min = daily.temperature_2m_min?.[0];
    const rain = daily.precipitation_sum?.[0];
    const wind = daily.windspeed_10m_max?.[0];
    return `${describeWeatherCode(code)}; ${max ?? "?"}C/${min ?? "?"}C, rain ${rain ?? 0}mm, wind ${wind ?? "?"}km/h`;
  }

  function startEditingChangeDoc(doc: { _id: Id<"documents">; name: string; status?: string; createdDate?: number; uploadedAt: number }) {
    setEditingChangeDocId(doc._id);
    setEditName(doc.name);
    setEditStatus((doc.status === "paid" || doc.status === "closed" ? "paid" : "unpaid") as "paid" | "unpaid");
    setEditDate(toDateInputValue(doc.createdDate ?? doc.uploadedAt));
    setEditUrl("");
    setEditStorageId(null);
  }

  function cancelEditChangeDoc() {
    setEditingChangeDocId(null);
  }

  async function saveEditChangeDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!editingChangeDocId || !editName.trim() || !editDate) return;
    const createdMs = dateInputValueToTimestamp(editDate);
    if (createdMs === undefined) return;
    await updateDocument({
      documentId: editingChangeDocId,
      name: editName.trim(),
      status: editStatus,
      createdDate: createdMs,
      ...(editStorageId ? { storageId: editStorageId } : editUrl.trim() ? { fileUrl: editUrl.trim() } : {}),
    });
    setEditingChangeDocId(null);
  }

  function handleDeleteChangeDoc(docId: Id<"documents">, name?: string) {
    setConfirmAction({ type: "delete-doc", documentId: docId, name });
  }

  function startEditingComplianceDoc(doc: Doc<"documents">) {
    setEditingComplianceDocId(doc._id);
    setEditComplianceName(doc.name);
    setEditComplianceCategory((doc.complianceCategory as ComplianceCategory | undefined) ?? "");
    setEditComplianceIssueDate(toDateInputValue(doc.issueDate));
    setEditComplianceExpiryDate(toDateInputValue(doc.expiryDate));
    setEditComplianceSubtradeId(doc.subtradeId ?? "");
    setEditComplianceFileUrl("");
    setEditComplianceStorageId(null);
  }

  async function saveComplianceDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!editingComplianceDocId || !editComplianceName.trim()) return;
    const issueMs = dateInputValueToTimestamp(editComplianceIssueDate);
    const expiryMs = dateInputValueToTimestamp(editComplianceExpiryDate);
    await updateDocument({
      documentId: editingComplianceDocId,
      name: editComplianceName.trim(),
      complianceCategory: editComplianceCategory || null,
      issueDate: issueMs ?? null,
      expiryDate: expiryMs ?? null,
      subtradeId: editComplianceSubtradeId || null,
      ...(editComplianceStorageId
        ? { storageId: editComplianceStorageId }
        : editComplianceFileUrl.trim()
          ? { fileUrl: editComplianceFileUrl.trim() }
          : {}),
    });
    setEditingComplianceDocId(null);
  }

  async function handleDeleteSubtrade(subtradeId: Id<"projectSubtrades">, name?: string) {
    setConfirmAction({ type: "remove-subtrade", subtradeId, name });
  }

  async function handleDeleteSitePhoto(photoId: Id<"projectSitePhotos">) {
    const photo = sitePhotos?.find((p) => p._id === photoId);
    setConfirmAction({
      type: "delete-site-photo",
      photoId,
      name: sitePhotoDisplayName(photo ?? {}),
    });
  }

  function handleSitePhotoOpen(photo: Doc<"projectSitePhotos">) {
    setSitePhotoMenu(null);
    const nameHint = photo.displayName || photo.originalFileName;
    const ext = fileExtensionFromName(nameHint).toLowerCase();
    const title = sitePhotoDisplayName(photo);
    const notes = photo.notes?.trim() || undefined;
    const tagMeta = {
      mimeType: photo.mimeType,
      fileNameHint: nameHint,
      ...(notes ? { notes } : {}),
    };
    let next: SitePhotoPreviewState;
    if (isLikelyImageFile(photo.mimeType, nameHint)) {
      next = {
        photoId: photo._id,
        fileUrl: photo.fileUrl,
        title,
        variant: "image",
        ...tagMeta,
      };
    } else if (photo.mimeType?.toLowerCase().includes("pdf") || ext === "pdf") {
      next = {
        photoId: photo._id,
        fileUrl: photo.fileUrl,
        title,
        variant: "pdf",
        ...tagMeta,
      };
    } else {
      next = {
        photoId: photo._id,
        fileUrl: photo.fileUrl,
        title,
        variant: "fallback",
        ...tagMeta,
      };
    }
    window.setTimeout(() => {
      setSitePhotoPreviewLoadError(false);
      setSitePhotoImgRetry(0);
      setSitePhotoPreview(next);
    }, 0);
  }

  function openSitePhotoMarkup(photoId: Id<"projectSitePhotos">) {
    if (!id) return;
    const photo = sitePhotos?.find((p) => p._id === photoId);
    if (!photo) return;
    const nameHint = photo.displayName || photo.originalFileName;
    if (!canMarkupSitePhoto(photo.mimeType, nameHint)) return;
    setSitePhotoMenu(null);
    setSitePhotoPreview(null);
    navigate(`/projects/${id}/site-photos/${photoId}/markup`);
  }

  function openSitePhotoMenu(e: React.MouseEvent, photoId: Id<"projectSitePhotos">) {
    e.preventDefault();
    setSitePhotoMenu({ photoId, x: e.clientX, y: e.clientY });
  }

  async function handleRenameSitePhoto(photoId: Id<"projectSitePhotos">) {
    const photo = sitePhotos?.find((p) => p._id === photoId);
    if (!photo) return;
    setRenameSitePhotoName(sitePhotoDisplayName(photo));
    setRenameSitePhotoError(null);
    setRenameSitePhotoId(photoId);
  }

  async function saveRenameSitePhoto() {
    if (!renameSitePhotoId) return;
    const trimmed = renameSitePhotoName.trim();
    if (!trimmed) {
      setRenameSitePhotoError("Name is required.");
      return;
    }
    setRenamingSitePhoto(true);
    setRenameSitePhotoError(null);
    try {
      await updateSitePhoto({ photoId: renameSitePhotoId, displayName: trimmed });
      setRenameSitePhotoId(null);
      setRenameSitePhotoName("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to rename file.";
      setRenameSitePhotoError(message);
    } finally {
      setRenamingSitePhoto(false);
    }
  }

  function startMoveSitePhoto(photoId: Id<"projectSitePhotos">) {
    const photo = sitePhotos?.find((p) => p._id === photoId);
    setMoveSitePhotoFolderId(photo?.sitePhotoFolderId ?? "unfiled");
    setMoveSitePhotoError(null);
    setMoveSitePhotoId(photoId);
  }

  async function saveMoveSitePhoto() {
    if (!moveSitePhotoId) return;
    setMovingSitePhoto(true);
    setMoveSitePhotoError(null);
    try {
      await updateSitePhoto({
        photoId: moveSitePhotoId,
        sitePhotoFolderId: moveSitePhotoFolderId === "unfiled" ? null : moveSitePhotoFolderId,
      });
      setMoveSitePhotoId(null);
      setMoveSitePhotoError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to move file.";
      setMoveSitePhotoError(message);
    } finally {
      setMovingSitePhoto(false);
    }
  }

  function startEditingSummary() {
    setSummaryEditError(null);
    setEditLocation(activeProject.location ?? "");
    setEditPrincipalId(activeProject.principalId ?? "");
    setEditPmId(activeProject.pmId ?? "");
    setEditCoordinatorId(activeProject.coordinatorId ?? "");
    setEditSiteSuperId(activeProject.siteSuperId ?? "");
    setEditAccountsPayableId(activeProject.accountsPayableId ?? "");
    setEditSafetyMemberId(activeProject.safetyMemberId ?? "");
    setEditProjectStatus((activeProject.status as ProjectStatus) ?? "active");
    setEditStartDate(toDateInputValue(activeProject.startDate));
    setEditEndDate(toDateInputValue(activeProject.endDate));
    setEditSummaryLinkUrl(activeProject.summaryLinkUrl ?? "");
    setEditSummaryLinkLabel(activeProject.summaryLinkLabel ?? "");
    setShowSummaryQuickEditor(true);
  }

  async function saveSummaryEdits(e: React.FormEvent) {
    e.preventDefault();
    setSummaryEditError(null);
    const startDateMs =
      editStartDate.trim() === ""
        ? null
        : (() => {
            return dateInputValueToTimestamp(editStartDate) ?? null;
          })();
    const endDateMs =
      editEndDate.trim() === ""
        ? null
        : (() => {
            return dateInputValueToTimestamp(editEndDate) ?? null;
          })();
    if (startDateMs == null) {
      setSummaryEditError("Please choose a valid start date.");
      return;
    }
    if (endDateMs == null) {
      setSummaryEditError("Please choose a valid end date.");
      return;
    }
    const summaryLinkUrlTrimmed = editSummaryLinkUrl.trim();
    const summaryLinkLabelTrimmed = editSummaryLinkLabel.trim();
    if (!summaryLinkUrlTrimmed && summaryLinkLabelTrimmed) {
      setSummaryEditError("Add a link URL when setting a link label.");
      return;
    }
    const normalizedSummaryLinkUrl = summaryLinkUrlTrimmed
      ? normalizeSummaryLinkUrl(summaryLinkUrlTrimmed)
      : "";
    setSummaryEditSaving(true);
    try {
      await updateProject({
        projectId: projectId!,
        location: editLocation.trim() || undefined,
        status: editProjectStatus,
        principalId: editPrincipalId || undefined,
        pmId: editPmId || undefined,
        coordinatorId: editCoordinatorId || undefined,
        siteSuperId: editSiteSuperId || undefined,
        accountsPayableId: editAccountsPayableId || undefined,
        safetyMemberId: editSafetyMemberId || undefined,
        startDate: startDateMs,
        endDate: endDateMs,
        summaryLinkUrl: normalizedSummaryLinkUrl || null,
        summaryLinkLabel: summaryLinkLabelTrimmed || null,
      });
      setShowSummaryQuickEditor(false);
    } catch (err) {
      setSummaryEditError(err instanceof Error ? err.message : "Failed to save summary.");
    } finally {
      setSummaryEditSaving(false);
    }
  }

  function startEditingBudgetNotes() {
    setEditCashFlowNotes(activeProject.cashFlowNotes ?? "");
    setEditForecastingNotes(activeProject.forecastingNotes ?? "");
    setEditInsuranceAndBondsNotes(activeProject.insuranceAndBondsNotes ?? "");
    setEditPurchaseOrdersNotes(activeProject.purchaseOrdersNotes ?? "");
    setEditProgressClaimsNotes(activeProject.progressClaimsNotes ?? "");
    setEditQuotesNotes(activeProject.quotesNotes ?? "");
    setEditingBudgetNotes(true);
  }

  async function saveBudgetNotes(e: React.FormEvent) {
    e.preventDefault();
    await updateProject({
      projectId: projectId!,
      cashFlowNotes: editCashFlowNotes.trim(),
      forecastingNotes: editForecastingNotes.trim(),
      insuranceAndBondsNotes: editInsuranceAndBondsNotes.trim(),
      purchaseOrdersNotes: editPurchaseOrdersNotes.trim(),
      progressClaimsNotes: editProgressClaimsNotes.trim(),
      quotesNotes: editQuotesNotes.trim(),
    });
    setEditingBudgetNotes(false);
  }

  const pmName = activeProject.pmId && usersForAssignment ? usersForAssignment.find((u) => u._id === activeProject.pmId)?.name : null;
  const coordinatorName = activeProject.coordinatorId && usersForAssignment ? usersForAssignment.find((u) => u._id === activeProject.coordinatorId)?.name : null;
  const siteSuperName = activeProject.siteSuperId && usersForAssignment ? usersForAssignment.find((u) => u._id === activeProject.siteSuperId)?.name : null;
  const accountsPayableName =
    activeProject.accountsPayableId && usersForAssignment
      ? usersForAssignment.find((u) => u._id === activeProject.accountsPayableId)?.name
      : null;
  const safetyMemberName =
    activeProject.safetyMemberId && usersForAssignment
      ? usersForAssignment.find((u) => u._id === activeProject.safetyMemberId)?.name
      : null;

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", position: "relative" }}>
      <Link
        to="/projects"
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: "#059669",
          textDecoration: "none",
        }}
      >
        {"<-"} Back to projects
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          {activeProject.name}
        </h1>
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border-strong, #e5e7eb)",
          paddingTop: "0.65rem",
          marginTop: "0.65rem",
          marginBottom: "0.85rem",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <label
          htmlFor="project-section-select"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          Project section
        </label>
        <select
          id="project-section-select"
          value={section}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            const t = v as ProjectSectionNavTab;
            navigate(projectTabHref(id, t));
          }}
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "#059669",
            border: "1px solid rgba(5, 150, 105, 0.45)",
            borderRadius: "0.5rem",
            padding: "0.45rem 2rem 0.45rem 0.65rem",
            backgroundColor: "var(--surface-muted, #f9fafb)",
            cursor: "pointer",
            minWidth: "min(100%, 15rem)",
            maxWidth: "100%",
          }}
        >
          {(isSiteSuper ? SITE_SUPER_SECTION_NAV_TABS : PROJECT_SECTION_NAV_TABS).map((t) => (
            <option key={t} value={t}>
              {projectTabLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <Outlet />

      {section === "changes" && id ? <ProjectChangesSection projectId={id} /> : null}
      {section === "subtrades" && id ? <ProjectSubtradesSection projectId={id} /> : null}
      {section === "schedule" && projectId ? (
        <ProjectScheduleSpreadsheetSection
          projectId={projectId}
          tasks={tasks}
          subtrades={subtrades}
          usersForAssignment={usersForAssignment}
          onOpenTaskEditor={openTaskEditor}
        />
      ) : null}
      {section === "budget" && projectId ? <ProjectBudgetSection projectId={projectId} /> : null}
      {section === "inventory" && projectId ? (
        <ProjectInventorySection projectId={projectId} equipmentLog={equipmentLog as EquipmentLogRow[] | undefined} />
      ) : null}
      {section === "miscellaneous" && projectId ? (
        <ProjectMiscellaneousSection projectId={projectId} />
      ) : null}

      {section === "summary" && (
        <div style={{ marginBottom: "1.25rem" }}>
          {(() => {
            const nowMs = Date.now();
            const todayKey = getDayKeyCentral(nowMs);
            const sixWeekEnd = todayKey + 42 * DAY_MS;
            const now = new Date(nowMs);
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            const totalDays = monthEnd.getDate();
            const firstWeekday = monthStart.getDay();
            const safeTasks = tasks ?? [];
            const safeIncidents = safetyIncidents ?? [];
            const safeEquipment = (equipmentLog ?? []).filter((row: EquipmentLogRow) => row.returnedAt == null);
            const safeSitePhotos = sitePhotos ?? [];
            const principalName =
              (usersForAssignment ?? []).find((u) => activeProject.principalId && u._id === activeProject.principalId)?.name ?? "-";
            const teamDisplayNames = Array.from(
              new Set(
                [pmName, coordinatorName, siteSuperName, principalName, accountsPayableName, safetyMemberName]
                  .map((n) => (typeof n === "string" ? n.trim() : ""))
                  .filter((n) => n.length > 0 && n !== "—"),
              ),
            );
            const totalTasks = safeTasks.length;
            const overdueTasks = safeTasks.filter(
              (t) => t.dueDate != null && getDayKeyCentral(t.dueDate) < todayKey && t.status !== "done",
            ).length;
            const doneTasks = safeTasks.filter((t) => t.status === "done").length;
            // Use exclusive buckets for the pie so overdue is visible and not double-counted.
            const inProgressTasks = safeTasks.filter((t) => {
              if (t.status !== "in_progress" && t.status !== "blocked") return false;
              return !(t.dueDate != null && getDayKeyCentral(t.dueDate) < todayKey);
            }).length;
            const planningTasks = safeTasks.filter((t) => {
              if (t.status !== "not_started") return false;
              return !(t.dueDate != null && getDayKeyCentral(t.dueDate) < todayKey);
            }).length;
            const pieTotalTasks = doneTasks + inProgressTasks + planningTasks + overdueTasks;
            const progressPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
            const todayTasks = safeTasks.filter((t) => {
              if (!t.dueDate) return false;
              return getDayKeyCentral(t.dueDate) === todayKey;
            });
            const upcomingTasks = safeTasks
              .filter((t) => t.dueDate != null && getDayKeyCentral(t.dueDate) > todayKey && getDayKeyCentral(t.dueDate) <= todayKey + 7 * DAY_MS)
              .slice(0, 8);
            const lookAheadTasks = safeTasks
              .filter(
                (t) =>
                  t.dueDate != null &&
                  getDayKeyCentral(t.dueDate) > todayKey + 7 * DAY_MS &&
                  getDayKeyCentral(t.dueDate) <= sixWeekEnd
              )
              .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))
              .slice(0, 20);
            const todayDone = todayTasks.filter((t) => t.status === "done").length;
            const priorityBars = { low: 0, medium: 0, high: 0 };
            for (const task of safeTasks) {
              const normalizedPriority = typeof task.priority === "string" ? task.priority.trim().toLowerCase() : "";
              if (normalizedPriority === "low") priorityBars.low += 1;
              else if (normalizedPriority === "medium") priorityBars.medium += 1;
              else if (normalizedPriority === "high") priorityBars.high += 1;
            }
            const maxPriority = Math.max(1, priorityBars.low, priorityBars.medium, priorityBars.high);
            const tradeCounts = new Map<string, number>();
            for (const task of safeTasks) {
              for (const sid of task.subtradeIdsOnSite ?? []) {
                tradeCounts.set(String(sid), (tradeCounts.get(String(sid)) ?? 0) + 1);
              }
            }
            const tradeEntries = Array.from(tradeCounts.entries())
              .map(([sid, count]) => ({
                name: (subtrades ?? []).find((s) => String(s._id) === sid)?.name ?? "Unassigned",
                count,
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 5);
            const tradeTotal = tradeEntries.reduce((s, t) => s + t.count, 0) || 1;
            let tradeAcc = 0;
            const tradeColors = ["#2f7d68", "#5a9c7a", "#7fb3a1", "#b8d8cd", "#1a5c48"];
            const tradeConic =
              tradeEntries.length > 0
                ? `conic-gradient(${tradeEntries
                    .map((t, i) => {
                      const start = (tradeAcc / tradeTotal) * 360;
                      tradeAcc += t.count;
                      const end = (tradeAcc / tradeTotal) * 360;
                      return `${tradeColors[i % tradeColors.length]} ${start}deg ${end}deg`;
                    })
                    .join(", ")})`
                : "#e5e7eb";
            const folderPhotoMap = new Map<string, { name: string; count: number }>();
            for (const f of documentFolders ?? []) folderPhotoMap.set(String(f._id), { name: f.name, count: 0 });
            for (const t of safeTasks) {
              if (t.dailyReportFolderId && t.photoUrls?.length) {
                const ent = folderPhotoMap.get(String(t.dailyReportFolderId));
                if (ent) ent.count += t.photoUrls.length;
              }
            }
            const dashCard: React.CSSProperties = {
              border: "4px solid #2f7d68",
              borderRadius: "8px",
              background: "var(--surface-card)",
              boxSizing: "border-box",
            };

            const summaryGreenShell: React.CSSProperties = {
              border: "4px solid #14532d",
              borderRadius: "8px",
              background: "#1a5c48",
              color: "#ffffff",
              boxSizing: "border-box",
            };

            return (
              <div style={{ backgroundColor: "var(--surface-page)", borderRadius: "10px", overflow: "hidden" }}>
                <div
                  style={{
                    padding: "0.65rem 0.7rem",
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "minmax(0, 1fr)"
                      : "minmax(10.5rem, 11.5%) minmax(0, 1fr) minmax(10.25rem, 12.5%)",
                    gap: "0.55rem",
                    alignItems: "stretch",
                    alignContent: "stretch",
                    background: "var(--surface-page)",
                    minHeight: isMobile ? undefined : "min(78vh, 52rem)",
                    minWidth: 0,
                  }}
                >
                  {/* —— Left sidebar —— */}
                  <aside
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      minWidth: 0,
                      minHeight: 0,
                      height: "100%",
                    }}
                  >
                    <div style={{ display: "flex", gap: "0.35rem", alignItems: "stretch" }}>
                      {[
                        now.toLocaleDateString(undefined, { month: "short" }),
                        String(now.getDate()),
                        String(now.getFullYear()),
                      ].map((cell, idx) => (
                        <div
                          key={idx}
                          style={{
                            ...dashCard,
                            padding: "0.35rem 0.4rem",
                            flex: 1,
                            minWidth: 0,
                            textAlign: "center",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                          }}
                        >
                          {cell}
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        ...dashCard,
                        padding: "0.35rem 0.45rem",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "0.35rem",
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{ borderRight: "1px solid #d1d5db", paddingRight: "0.3rem" }}>
                        <div style={{ fontSize: "0.58rem", color: "#6b7280" }}>Due today</div>
                        <div style={{ fontWeight: 800, fontSize: "0.85rem" }}>{todayTasks.length}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.58rem", color: "#6b7280" }}>Done today</div>
                        <div style={{ fontWeight: 800, fontSize: "0.85rem" }}>{todayDone}</div>
                      </div>
                    </div>

                    <div style={{ ...summaryGreenShell, padding: "0.55rem 0.6rem" }}>
                      <div style={{ fontWeight: 800, fontSize: "0.72rem", color: "rgba(255,255,255,0.85)", marginBottom: "0.35rem" }}>
                        PROJECT
                      </div>
                      <div style={{ fontWeight: 700, fontSize: "0.82rem", lineHeight: 1.25, color: "#ffffff" }}>{activeProject.name}</div>
                      {activeProject.clientName ? (
                        <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.9)", marginTop: "0.2rem" }}>{activeProject.clientName}</div>
                      ) : null}
                      <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.78)", marginTop: "0.35rem" }}>
                        {activeProject.location ?? "—"}
                      </div>
                    </div>

                    <div
                      style={{
                        ...summaryGreenShell,
                        padding: "0.55rem 0.6rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.2rem",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: "0.72rem", color: "rgba(255,255,255,0.85)" }}>
                        Team members
                      </div>
                      {teamDisplayNames.length === 0 ? (
                        <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.78)" }}>—</div>
                      ) : (
                        teamDisplayNames.map((name) => (
                          <div key={name} style={{ fontSize: "0.82rem", lineHeight: 1.3, color: "#ffffff" }}>
                            {name}
                          </div>
                        ))
                      )}
                    </div>

                    <div style={{ ...summaryGreenShell, padding: "0.5rem 0.55rem", display: "grid", gap: "0.35rem" }}>
                      <div>
                        <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "rgba(255,255,255,0.78)" }}>Start</div>
                        <div style={{ fontSize: "0.72rem", color: "#ffffff" }}>
                          {activeProject.startDate
                            ? new Date(activeProject.startDate).toLocaleDateString(undefined, {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "rgba(255,255,255,0.78)" }}>End</div>
                        <div style={{ fontSize: "0.72rem", color: "#ffffff" }}>
                          {activeProject.endDate
                            ? new Date(activeProject.endDate).toLocaleDateString(undefined, {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.15rem" }}>
                        <span
                          style={{
                            width: "0.45rem",
                            height: "0.45rem",
                            borderRadius: "999px",
                            background: activeProject.status === "active" ? "#4ade80" : "rgba(255,255,255,0.45)",
                            boxShadow: activeProject.status === "active" ? "0 0 0 1px rgba(255,255,255,0.35)" : "none",
                          }}
                        />
                        <span style={{ fontSize: "0.7rem", textTransform: "capitalize", color: "#ffffff" }}>
                          {activeProject.status ?? "—"}
                        </span>
                      </div>
                    </div>

                    <Link
                      to={`/projects/${id}/site-contact-sheet`}
                      style={{
                        ...summaryGreenShell,
                        padding: "0.55rem 0.65rem",
                        textDecoration: "none",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "0.78rem",
                        textAlign: "center",
                      }}
                    >
                      Site contact sheet
                    </Link>

                    {activeProject.summaryLinkUrl ? (
                      <a
                        href={activeProject.summaryLinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...summaryGreenShell,
                          padding: "0.55rem 0.65rem",
                          textDecoration: "none",
                          color: "#ffffff",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: "0.2rem",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "0.78rem", textAlign: "left" }}>
                          {activeProject.summaryLinkLabel?.trim() || "Project link"}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.82)" }}>
                          {summaryLinkHostname(activeProject.summaryLinkUrl)}
                        </div>
                      </a>
                    ) : (
                      <div
                        style={{
                          ...summaryGreenShell,
                          padding: "0.55rem 0.65rem",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: "0.2rem",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "0.78rem", color: "#ffffff" }}>Project link</div>
                        <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.72)" }}>Not set</div>
                      </div>
                    )}

                    <Link
                      to={projectSectionHref(id, "schedule")}
                      style={{
                        ...summaryGreenShell,
                        padding: "0.5rem 0.5rem",
                        textDecoration: "none",
                        color: "#ffffff",
                        display: "block",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: "0.72rem", marginBottom: "0.35rem", color: "#ffffff" }}>
                        Task calendar
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.18rem" }}>
                        {Array.from({ length: firstWeekday }).map((_, i) => (
                          <div key={`e-${i}`} />
                        ))}
                        {Array.from({ length: totalDays }).map((_, i) => {
                          const day = i + 1;
                          const dayTs = new Date(now.getFullYear(), now.getMonth(), day).getTime();
                          const dayTaskList = safeTasks.filter((t) => {
                            if (!t.dueDate) return false;
                            const d = new Date(t.dueDate);
                            return (
                              d.getFullYear() === now.getFullYear() &&
                              d.getMonth() === now.getMonth() &&
                              d.getDate() === day
                            );
                          });
                          const overdue = dayTaskList.some((t) => (t.dueDate ?? 0) < todayKey && t.status !== "done");
                          const hasTasks = dayTaskList.length > 0;
                          const boxBg = overdue ? "#b91c1c" : hasTasks ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)";
                          const boxBorder = overdue
                            ? "1px solid rgba(255,255,255,0.55)"
                            : hasTasks
                              ? "1px solid rgba(255,255,255,0.55)"
                              : "1px solid rgba(255,255,255,0.42)";
                          return (
                            <div
                              key={dayTs}
                              style={{
                                textAlign: "center",
                                fontSize: "0.62rem",
                                color: "#ffffff",
                                padding: "0.18rem 0",
                                borderRadius: "4px",
                                border: boxBorder,
                                background: boxBg,
                                minHeight: "1.2rem",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxSizing: "border-box",
                                fontWeight: 600,
                              }}
                            >
                              {day}
                            </div>
                          );
                        })}
                      </div>
                    </Link>

                    <Link
                      to="/personal-calendar"
                      style={{
                        ...summaryGreenShell,
                        padding: "0.5rem 0.55rem",
                        textDecoration: "none",
                        color: "#ffffff",
                        display: "flex",
                        flexDirection: "column",
                        flex: "1 1 0",
                        minHeight: "4.5rem",
                        overflow: "auto",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: "0.72rem", marginBottom: "0.3rem", color: "#ffffff" }}>
                        Today&apos;s meetings
                      </div>
                      {(personalEventsToday ?? []).length === 0 ? (
                        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.8)" }}>No meetings today.</div>
                      ) : (
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: "1rem",
                            fontSize: "0.68rem",
                            color: "#ffffff",
                            listStyleType: "disc",
                          }}
                        >
                          {(personalEventsToday ?? []).slice(0, 4).map((ev) => (
                            <li key={ev._id} style={{ marginBottom: "0.15rem" }}>
                              {ev.title}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Link>
                  </aside>

                  {/* —— Center —— */}
                  <section
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.55rem",
                      minWidth: 0,
                      minHeight: 0,
                      height: "100%",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        display: "grid",
                        gridTemplateColumns: isMobile
                          ? "minmax(0, 1fr)"
                          : `repeat(${canAccessWeekly ? 6 : 5}, minmax(0, 1fr))`,
                        gap: "0.45rem",
                        alignItems: "stretch",
                        flexShrink: 0,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ ...dashCard, padding: "0.45rem 0.55rem", minWidth: 0 }}>
                        <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#1a5c48", marginBottom: "0.25rem" }}>Status</div>
                        <div style={{ fontSize: "0.72rem", textTransform: "capitalize" }}>{activeProject.status ?? "—"}</div>
                        <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: "0.35rem" }}>
                          Overdue {overdueTasks}
                        </div>
                      </div>

                      <Link
                        to={projectSectionHref(id, "schedule")}
                        style={{
                          ...dashCard,
                          padding: "0.35rem 0.45rem",
                          minWidth: 0,
                          boxSizing: "border-box",
                          textDecoration: "none",
                          color: "inherit",
                          display: "block",
                        }}
                      >
                        <div style={{ fontSize: "0.6rem", fontWeight: 800, color: "#1a5c48" }}>Total tasks</div>
                        <div style={{ fontSize: "0.88rem", fontWeight: 800, margin: "0.08rem 0 0.12rem" }}>{totalTasks}</div>
                        <div style={{ height: "0.3rem", background: "#e5e7eb", borderRadius: "999px", overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${progressPct}%`,
                              background: "#2f7d68",
                              borderRadius: "999px",
                            }}
                          />
                        </div>
                        <div style={{ fontSize: "0.58rem", color: "#6b7280", marginTop: "0.12rem", lineHeight: 1.2 }}>
                          {progressPct}% done
                        </div>
                      </Link>

                      <Link
                        to={projectSectionHref(id, "daily_reports")}
                        style={{ ...dashCard, padding: "0.45rem 0.45rem", minWidth: 0, textDecoration: "none", color: "inherit", display: "block" }}
                      >
                        <div style={{ fontWeight: 800, fontSize: "0.7rem" }}>Daily reports</div>
                        <div style={{ fontSize: "0.68rem", color: "#4b5563", marginTop: "0.2rem" }}>
                          {rootDailyReports?.length ?? 0}
                        </div>
                      </Link>

                      <Link
                        to={`/safety/project/${id}`}
                        style={{ ...dashCard, padding: "0.45rem 0.45rem", minWidth: 0, textDecoration: "none", color: "inherit", display: "block" }}
                      >
                        <div style={{ fontWeight: 800, fontSize: "0.7rem" }}>Safety</div>
                        <div style={{ fontSize: "0.68rem", color: "#4b5563", marginTop: "0.2rem" }}>{safeIncidents.length}</div>
                      </Link>

                      <Link
                        to={projectSectionHref(id, "site_photos")}
                        style={{ ...dashCard, padding: "0.45rem 0.45rem", minWidth: 0, textDecoration: "none", color: "inherit", display: "block" }}
                      >
                        <div style={{ fontWeight: 800, fontSize: "0.7rem" }}>Site photos</div>
                        <div style={{ fontSize: "0.68rem", color: "#4b5563", marginTop: "0.2rem" }}>{safeSitePhotos.length}</div>
                      </Link>

                      {canAccessWeekly ? (
                        <Link
                          to={`/weekly?projectId=${id}`}
                          style={{ ...dashCard, padding: "0.45rem 0.45rem", minWidth: 0, textDecoration: "none", color: "inherit", display: "block" }}
                        >
                          <div style={{ fontWeight: 800, fontSize: "0.7rem" }}>Weekly updates</div>
                          <div style={{ fontSize: "0.68rem", color: "#4b5563", marginTop: "0.2rem" }}>
                            {projectWeeklyReports === undefined ? "…" : projectWeeklyReports.length}
                          </div>
                        </Link>
                      ) : null}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1fr 1fr",
                        gridTemplateRows: isMobile ? undefined : "1fr 1fr",
                        gap: "0.5rem",
                        flex: "1 1 auto",
                        minHeight: isMobile ? undefined : "22rem",
                        minWidth: 0,
                      }}
                    >
                      <Link
                        to={projectSectionHref(id, "schedule")}
                        style={{
                          ...dashCard,
                          padding: "0.45rem 0.5rem",
                          textDecoration: "none",
                          color: "inherit",
                          display: "flex",
                          flexDirection: "column",
                          minHeight: "100%",
                          height: "100%",
                          minWidth: 0,
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: "0.74rem", borderBottom: "2px solid #2f7d68", paddingBottom: "0.25rem", marginBottom: "0.3rem" }}>
                          Today&apos;s tasks
                        </div>
                        <div style={{ overflow: "auto", flex: 1 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
                            <thead>
                              <tr style={{ color: "#6b7280", textAlign: "left" }}>
                                <th style={{ fontWeight: 600, padding: "0.15rem 0" }}>Task</th>
                                <th style={{ fontWeight: 600, padding: "0.15rem 0", width: "2.5rem" }}>St</th>
                              </tr>
                            </thead>
                            <tbody>
                              {todayTasks.slice(0, 8).map((t) => (
                                <tr key={t._id}>
                                  <td style={{ padding: "0.18rem 0", borderBottom: "1px solid #e5e7eb", wordBreak: "break-word" }}>
                                    {t.title}
                                  </td>
                                  <td style={{ padding: "0.18rem 0", borderBottom: "1px solid #e5e7eb", textTransform: "capitalize" }}>
                                    {(t.status ?? "").replace("_", " ")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {todayTasks.length === 0 ? (
                            <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "0.25rem" }}>None due today.</div>
                          ) : null}
                        </div>
                      </Link>

                      <Link
                        to={projectSectionHref(id, "schedule")}
                        style={{
                          ...dashCard,
                          padding: "0.45rem 0.5rem",
                          display: "flex",
                          flexDirection: "column",
                          minHeight: "100%",
                          height: "100%",
                          textDecoration: "none",
                          color: "inherit",
                          minWidth: 0,
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: "0.74rem", borderBottom: "2px solid #2f7d68", paddingBottom: "0.25rem", marginBottom: "0.3rem" }}>
                          Upcoming tasks
                        </div>
                        <div style={{ overflow: "auto", flex: 1 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
                            <thead>
                              <tr style={{ color: "#6b7280", textAlign: "left" }}>
                                <th style={{ fontWeight: 600, padding: "0.15rem 0" }}>Task</th>
                                <th style={{ fontWeight: 600, padding: "0.15rem 0", width: "3.2rem" }}>Due</th>
                              </tr>
                            </thead>
                            <tbody>
                              {upcomingTasks.map((t) => (
                                <tr key={t._id}>
                                  <td style={{ padding: "0.18rem 0", borderBottom: "1px solid #e5e7eb", wordBreak: "break-word" }}>
                                    {t.title}
                                  </td>
                                  <td style={{ padding: "0.18rem 0", borderBottom: "1px solid #e5e7eb", fontSize: "0.65rem" }}>
                                    {t.dueDate
                                      ? new Date(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                                      : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {upcomingTasks.length === 0 ? (
                            <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "0.25rem" }}>Nothing in the next week.</div>
                          ) : null}
                        </div>
                      </Link>

                      <Link
                        to={projectSectionHref(id, "schedule")}
                        style={{
                          ...dashCard,
                          padding: "0.45rem 0.5rem",
                          display: "flex",
                          flexDirection: "column",
                          minHeight: "100%",
                          height: "100%",
                          textDecoration: "none",
                          color: "inherit",
                          minWidth: 0,
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: "0.74rem", borderBottom: "2px solid #2f7d68", paddingBottom: "0.25rem", marginBottom: "0.3rem" }}>
                          6 week look ahead
                        </div>
                        <div style={{ overflow: "auto", flex: 1 }}>
                          {lookAheadTasks.map((t) => (
                            <div
                              key={t._id}
                              style={{
                                fontSize: "0.7rem",
                                borderBottom: "1px solid #e5e7eb",
                                padding: "0.22rem 0",
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "0.35rem",
                              }}
                            >
                              <span style={{ wordBreak: "break-word" }}>{t.title}</span>
                              <span style={{ flexShrink: 0, fontSize: "0.65rem", color: "#6b7280" }}>
                                {t.dueDate
                                  ? new Date(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                                  : ""}
                              </span>
                            </div>
                          ))}
                          {lookAheadTasks.length === 0 ? (
                            <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>No tasks scheduled in weeks 2–6.</div>
                          ) : null}
                        </div>
                      </Link>

                      <div
                        style={{
                          ...dashCard,
                          padding: "0.4rem 0.45rem",
                          minHeight: "100%",
                          height: "100%",
                          overflow: "auto",
                          display: "flex",
                          flexDirection: "column",
                          minWidth: 0,
                        }}
                      >
                        <Link
                          to="/inventory#master-equipment-log"
                          style={{
                            fontWeight: 800,
                            fontSize: "0.7rem",
                            marginBottom: "0.3rem",
                            display: "inline-block",
                            textDecoration: "none",
                            color: "#1a5c48",
                            borderBottom: "2px solid #2f7d68",
                            paddingBottom: "0.25rem",
                          }}
                        >
                          Equipment on site
                        </Link>
                        <div style={{ overflow: "auto", flex: 1 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.65rem" }}>
                            <thead>
                              <tr style={{ color: "#6b7280", textAlign: "left", borderBottom: "1px solid #2f7d68" }}>
                                <th style={{ fontWeight: 600, padding: "0.12rem 0" }}>Name</th>
                                <th style={{ fontWeight: 600, padding: "0.12rem 0" }}>Out</th>
                              </tr>
                            </thead>
                            <tbody>
                              {safeEquipment.slice(0, 6).map((row) => (
                                <tr key={row._id}>
                                  <td style={{ padding: "0.14rem 0", borderBottom: "1px solid #eee", wordBreak: "break-word" }}>
                                    {row.equipmentName}
                                  </td>
                                  <td style={{ padding: "0.14rem 0", borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                                    {row.dateTaken
                                      ? new Date(row.dateTaken).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })
                                      : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {safeEquipment.length === 0 ? (
                            <div style={{ fontSize: "0.68rem", color: "#6b7280" }}>No active checkouts.</div>
                          ) : null}
                        </div>
                        {Array.from(folderPhotoMap.values()).some((x) => x.count > 0) ? (
                          <div style={{ marginTop: "0.5rem", paddingTop: "0.45rem", borderTop: "1px solid #e5e7eb", fontSize: "0.68rem", color: "#4b5563" }}>
                            <div style={{ fontWeight: 800, fontSize: "0.7rem", color: "#111827", marginBottom: "0.25rem" }}>
                              Photos by folder
                            </div>
                            {Array.from(folderPhotoMap.values())
                              .filter((x) => x.count > 0)
                              .slice(0, 4)
                              .map((f) => (
                                <div key={f.name} style={{ display: "flex", justifyContent: "space-between", gap: "0.35rem" }}>
                                  <span style={{ wordBreak: "break-word" }}>{f.name}</span>
                                  <span style={{ flexShrink: 0 }}>{f.count}</span>
                                </div>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                  </section>

                  {/* —— Right: charts only —— */}
                  <aside
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      minWidth: 0,
                      minHeight: 0,
                      height: "100%",
                    }}
                  >
                    <Link
                      to={projectSectionHref(id, "schedule")}
                      style={{
                        ...dashCard,
                        padding: "0.5rem 0.55rem",
                        flexShrink: 0,
                        textDecoration: "none",
                        color: "inherit",
                        display: "block",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: "0.74rem", marginBottom: "0.35rem" }}>Task status</div>
                      {(() => {
                        const doneColor = TASK_STATUS_SUMMARY_COLORS.done;
                        const inProgressColor = TASK_STATUS_SUMMARY_COLORS.inProgress;
                        const planningColor = TASK_STATUS_SUMMARY_COLORS.planning;
                        const overdueColor = TASK_STATUS_SUMMARY_COLORS.overdue;
                        return (
                          <>
                            <div
                              style={{
                                width: "6.5rem",
                                height: "6.5rem",
                                margin: "0 auto",
                                borderRadius: "999px",
                                background: `conic-gradient(${doneColor} 0 ${(doneTasks / Math.max(pieTotalTasks, 1)) * 360}deg, ${inProgressColor} ${(doneTasks / Math.max(pieTotalTasks, 1)) * 360}deg ${((doneTasks + inProgressTasks) / Math.max(pieTotalTasks, 1)) * 360}deg, ${planningColor} ${((doneTasks + inProgressTasks) / Math.max(pieTotalTasks, 1)) * 360}deg ${((doneTasks + inProgressTasks + planningTasks) / Math.max(pieTotalTasks, 1)) * 360}deg, ${overdueColor} ${((doneTasks + inProgressTasks + planningTasks) / Math.max(pieTotalTasks, 1)) * 360}deg 360deg)`,
                              }}
                            />
                            <div style={{ fontSize: "0.65rem", color: "#4b5563", marginTop: "0.4rem", lineHeight: 1.35 }}>
                              <div><span style={{ color: doneColor, fontWeight: 800 }}>●</span> Done {doneTasks}</div>
                              <div><span style={{ color: inProgressColor, fontWeight: 800 }}>●</span> In progress {inProgressTasks}</div>
                              <div><span style={{ color: planningColor, fontWeight: 800 }}>●</span> Planning {planningTasks}</div>
                              <div><span style={{ color: overdueColor, fontWeight: 800 }}>●</span> Overdue {overdueTasks}</div>
                            </div>
                          </>
                        );
                      })()}
                    </Link>

                    <div
                      style={{
                        ...dashCard,
                        padding: "0.5rem 0.55rem",
                        flex: "1 1 0",
                        minHeight: "6rem",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        alignSelf: "stretch",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: "0.74rem", flexShrink: 0 }}>Task priority</div>
                      <div
                        style={{
                          marginTop: "auto",
                          width: "100%",
                          paddingTop: "0.4rem",
                        }}
                      >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "flex-end",
                          justifyContent: "space-between",
                          gap: "0.35rem",
                        }}
                      >
                        {(["low", "medium", "high"] as const).map((k) => {
                          const n = priorityBars[k] ?? 0;
                          const pct = maxPriority ? (n / maxPriority) * 100 : 0;
                          const fillColor = k === "high" ? "#14532d" : k === "medium" ? "#2f7d68" : "#7fb3a1";
                          return (
                            <div
                              key={k}
                              style={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: "0.2rem",
                                minWidth: 0,
                              }}
                            >
                              <div
                                style={{
                                  height: "4.75rem",
                                  width: "100%",
                                  maxWidth: "2.25rem",
                                  margin: "0 auto",
                                  background: "#d7e9e1",
                                  borderRadius: "6px",
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "flex-end",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    height: `${pct}%`,
                                    minHeight: n > 0 ? 3 : 0,
                                    width: "100%",
                                    background: fillColor,
                                    borderRadius: "6px 6px 0 0",
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: "0.68rem", textTransform: "uppercase", fontWeight: 700 }}>{k}</span>
                              <span style={{ fontSize: "0.65rem", color: "#4b5563" }}>{n}</span>
                            </div>
                          );
                        })}
                      </div>
                      </div>
                    </div>

                    <div style={{ ...dashCard, padding: "0.5rem 0.55rem", flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: "0.74rem", marginBottom: "0.35rem" }}>Task type analysis</div>
                      <div
                        style={{
                          width: "6.5rem",
                          height: "6.5rem",
                          margin: "0 auto 0.35rem auto",
                          borderRadius: "999px",
                          background: tradeConic,
                        }}
                      />
                      {tradeEntries.length === 0 ? (
                        <div style={{ fontSize: "0.68rem", color: "#6b7280" }}>No trades on tasks.</div>
                      ) : (
                        tradeEntries.map((t, i) => (
                          <div key={t.name} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.65rem", marginBottom: "0.12rem" }}>
                            <span
                              style={{
                                width: "0.45rem",
                                height: "0.45rem",
                                borderRadius: "2px",
                                background: tradeColors[i % tradeColors.length],
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ flex: 1, wordBreak: "break-word" }}>{t.name}</span>
                            <span style={{ flexShrink: 0 }}>{t.count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </aside>
                </div>
              </div>
            );
          })()}
          {activeProject.inProjectTracker !== false && (activeProject.inCloseOut || !isSiteSuper) && (
            <div
              style={{
                marginTop: "1rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-strong, #e5e7eb)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              {activeProject.inCloseOut ? (
                <>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textAlign: "center" }}>
                    This job is listed under the Close Out workspace.
                  </div>
                  <Link
                    to={`/close-out/project/${activeProject._id}`}
                    style={{
                      padding: "0.45rem 0.85rem",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      borderRadius: "0.5rem",
                      border: "none",
                      backgroundColor: "#059669",
                      color: "#fff",
                      textDecoration: "none",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    Open Close Out
                  </Link>
                  {!isSiteSuper && (
                    <button
                      type="button"
                      disabled={closeOutBusy}
                      onClick={async () => {
                        if (!id) return;
                        setCloseOutBusy(true);
                        try {
                          await returnProjectToTracker({ projectId: projectId! });
                          navigate(`/projects/${id}`);
                        } finally {
                          setCloseOutBusy(false);
                        }
                      }}
                      style={{
                        padding: "0.35rem 0.65rem",
                        fontSize: "0.75rem",
                        borderRadius: "0.375rem",
                        border: "1px solid rgba(220,38,38,0.5)",
                        color: "#dc2626",
                        background: "transparent",
                        cursor: closeOutBusy ? "not-allowed" : "pointer",
                        fontFamily: "Montserrat, sans-serif",
                      }}
                    >
                      Move back to Tracker
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={closeOutBusy}
                    onClick={async () => {
                      if (!id) return;
                      setCloseOutError(null);
                      setCloseOutBusy(true);
                      try {
                        await promoteProjectToCloseOut({ projectId: projectId! });
                        navigate(`/close-out/project/${id}`);
                      } catch (e) {
                        setCloseOutError(e instanceof Error ? e.message : "Could not move to Close Out");
                      } finally {
                        setCloseOutBusy(false);
                      }
                    }}
                    style={{
                      padding: "0.5rem 1rem",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      borderRadius: "0.5rem",
                      border: "none",
                      backgroundColor: "#059669",
                      color: "#fff",
                      cursor: closeOutBusy ? "not-allowed" : "pointer",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    {closeOutBusy ? "Moving…" : "Move to Close Out"}
                  </button>
                  {closeOutError && (
                    <div style={{ fontSize: "0.75rem", color: "#dc2626" }}>{closeOutError}</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {false && section === "summary" && showSummaryEditor && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            ...cardStyle,
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(92vw, 56rem)",
            maxHeight: "86vh",
            overflowY: "auto",
            zIndex: 56,
            boxShadow: "0 20px 40px rgba(2, 6, 23, 0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 className="section-header" style={{ margin: 0 }}>
              Summary
            </h2>
            {!editingSummary ? (
              <button
                type="button"
                onClick={startEditingSummary}
                aria-label="Edit team and documents"
                title="Edit team and documents"
                style={SUBTLE_ICON_BTN}
              >
                <PencilIcon size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingSummary(false);
                  setShowSummaryEditor(false);
                }}
                aria-label="Cancel team and documents edit"
                title="Cancel"
                style={SUBTLE_ICON_BTN}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>

          {editingSummary ? (
            <form onSubmit={saveSummaryEdits} style={{ display: "grid", gap: "0.75rem", fontSize: "0.875rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Project manager</label>
                <select value={editPmId} onChange={(e) => setEditPmId(e.target.value as Id<"users"> | "")} style={{ width: "100%" }}>
                  <option value="">- Select -</option>
                  {(usersForAssignment ?? []).filter((u) => u.role === "project_manager" || u.role === "admin" || u.role === "principal").map((u) => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Coordinator</label>
                <select value={editCoordinatorId} onChange={(e) => setEditCoordinatorId(e.target.value as Id<"users"> | "")} style={{ width: "100%" }}>
                  <option value="">- Select -</option>
                  {(usersForAssignment ?? []).filter((u) => u.role === "coordinator" || u.role === "admin").map((u) => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Site superintendent</label>
                <select value={editSiteSuperId} onChange={(e) => setEditSiteSuperId(e.target.value as Id<"users"> | "")} style={{ width: "100%" }}>
                  <option value="">- Select -</option>
                  {(usersForAssignment ?? []).filter((u) => u.role === "site_superintendent" || u.role === "admin").map((u) => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Budget document (optional)</label>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.8125rem",
                    color: "#374151",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="file"
                    disabled={budgetUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setBudgetUploading(true);
                      setEditBudgetDocumentUrl("");
                      await handleFileUpload(file, setEditBudgetStorageId, () => setBudgetUploading(false));
                      e.target.value = "";
                    }}
                  />
                  {budgetUploading
                    ? "Uploading budget document..."
                    : editBudgetStorageId
                      ? "OK New budget file ready"
                      : "Upload from computer"}
                </label>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Safety document</label>
                <input
                  type="url"
                  value={editSafetyDocumentUrl}
                  onChange={(e) => {
                    setEditSafetyDocumentUrl(e.target.value);
                    setEditSafetyStorageId(null);
                  }}
                  style={{ width: "100%", marginBottom: "0.35rem" }}
                  placeholder="Paste link (optional)"
                />
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.8125rem",
                    color: "#374151",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="file"
                    disabled={safetyUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setSafetyUploading(true);
                      setEditSafetyDocumentUrl("");
                      await handleFileUpload(file, setEditSafetyStorageId, () => setSafetyUploading(false));
                      e.target.value = "";
                    }}
                  />
                  {safetyUploading
                    ? "Uploading safety document..."
                    : editSafetyStorageId
                      ? "OK New safety file ready"
                      : "Or upload from computer"}
                </label>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Project sheet</label>
                {editProjectSheetUrl.trim() ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <a
                      href={editProjectSheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        color: "#047857",
                        textDecoration: "none",
                        backgroundColor: "rgba(16,185,129,0.18)",
                        border: "1px solid rgba(16,185,129,0.45)",
                        borderRadius: "9999px",
                        padding: "0.18rem 0.6rem",
                      }}
                    >
                      View current project sheet
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setEditProjectSheetUrl("");
                        setEditProjectSheetStorageId(null);
                        setProjectSheetUrlOverride(null);
                      }}
                      style={{
                        padding: "0.2rem 0.55rem",
                        fontSize: "0.75rem",
                        borderRadius: "0.375rem",
                        border: "1px solid #dc2626",
                        color: "#dc2626",
                        background: "transparent",
                        cursor: "pointer",
                        fontFamily: "Montserrat, sans-serif",
                      }}
                    >
                      Delete project sheet
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: "0.8125rem", color: "#6b7280" }}>No project sheet uploaded.</div>
                )}
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Project status</label>
                <select
                  value={editProjectStatus}
                  onChange={(e) => setEditProjectStatus(e.target.value as ProjectStatus)}
                  style={{ width: "100%" }}
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Health</label>
                <select
                  value={editHealthStatus}
                  onChange={(e) => setEditHealthStatus(e.target.value as "green" | "amber" | "red" | "")}
                  style={{ width: "100%" }}
                >
                  <option value="">- Not set -</option>
                  <option value="green">Green</option>
                  <option value="amber">Amber</option>
                  <option value="red">Red</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Health notes (optional)</label>
                <input
                  type="text"
                  value={editHealthNotes}
                  onChange={(e) => setEditHealthNotes(e.target.value)}
                  style={{ width: "100%" }}
                  placeholder="Notes about project health"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Start date</label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>End date</label>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Actual cost ($)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editActualCost}
                  onChange={(e) => setEditActualCost(e.target.value)}
                  style={{ width: "100%" }}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Budget ($)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editBudgetAmount}
                  onChange={(e) => setEditBudgetAmount(e.target.value)}
                  style={{ width: "100%" }}
                  placeholder="0.00"
                />
              </div>
              <button type="submit" style={{ padding: "0.5rem 1rem", borderRadius: "0.5rem", fontWeight: 600, backgroundColor: "#059669", color: "#fff", border: "none", cursor: "pointer", fontFamily: "Montserrat, sans-serif" }}>
                Save
              </button>
            </form>
          ) : (
            (() => {
              const budgetValue = activeProject.budget ?? null;
              const actualCostValue = activeProject.actualCost ?? null;
              const hasBudget = budgetValue != null;
              const hasActual = actualCostValue != null;

              const recs = accountingRecords ?? [];
              const invoicedTotal = recs
                .filter((r) => r.type === "invoice")
                .reduce((s, r) => s + r.amount, 0);
              const paidTotal = recs
                .filter((r) => r.type === "payment")
                .reduce((s, r) => s + r.amount, 0);
              const hasCashFlow = recs.some(
                (r) => r.type === "invoice" || r.type === "payment"
              );
              const netCashFlow = invoicedTotal - paidTotal;

              const nowMonth = new Date();
              const lastDayOfMonth = new Date(
                nowMonth.getFullYear(),
                nowMonth.getMonth() + 1,
                0
              ).getDate();
              const monthProgressPct = Math.min(
                100,
                Math.round((nowMonth.getDate() / lastDayOfMonth) * 100)
              );

              const latestCo = (documents ?? [])
                .filter((d) => d.type.toUpperCase() === "CO")
                .slice()
                .sort(
                  (a, b) =>
                    (b.createdDate ?? b.uploadedAt ?? 0) -
                    (a.createdDate ?? a.uploadedAt ?? 0)
                )[0];

              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    flexWrap: isMobile ? "wrap" : "nowrap",
                    gap: "1.25rem",
                    fontSize: "0.875rem",
                    alignItems: isMobile ? "stretch" : "flex-start",
                  }}
                >
                  {/* Left column: 33% width */}
                  <div
                    style={{
                      flex: isMobile ? "1 1 auto" : "0 0 33%",
                      minWidth: isMobile ? 0 : "260px",
                      maxWidth: "100%",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.9rem",
                    }}
                  >
                    {/* Team card */}
                    <div
                      style={{
                        borderRadius: "0.9rem",
                        border: "1px solid var(--color-emerald-800)",
                        padding: "1.1rem 1.15rem",
                        backgroundColor: "var(--surface-muted)",
                        boxShadow: "0 8px 16px -8px rgba(16,185,129,0.2)",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          marginBottom: "0.3rem",
                          fontSize: "0.95rem",
                        }}
                      >
                        Team
                      </div>
                      <div style={{ color: "var(--text-primary)" }}>
                        <div>
                          <span style={{ color: "var(--text-secondary)" }}>PM: </span>
                          <span style={{ color: "var(--text-primary)" }}>{pmName ?? (activeProject.pmId ? "-" : "-")}</span>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-secondary)" }}>Coordinator: </span>
                          <span style={{ color: "var(--text-primary)" }}>{coordinatorName ?? (activeProject.coordinatorId ? "-" : "-")}</span>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-secondary)" }}>Site super: </span>
                          <span style={{ color: "var(--text-primary)" }}>
                            {siteSuperName ??
                              ((activeProject.siteSupers?.length ?? 0) > 0
                                ? activeProject.siteSupers!.join(", ")
                                : "-")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: "0.9rem",
                        border: "1px solid var(--color-emerald-800)",
                        padding: "0.85rem 1rem",
                        backgroundColor: "var(--surface-muted)",
                        boxShadow: "0 6px 12px -8px rgba(16,185,129,0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.65rem",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "var(--text-primary)",
                            marginBottom: "0.25rem",
                            fontSize: "0.9rem",
                          }}
                        >
                          Project sheet
                        </div>
                        {(projectSheetUrlOverride ?? activeProject.projectSheetUrl) ? (
                          <a
                            href={projectSheetUrlOverride ?? activeProject.projectSheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              color: "#047857",
                              textDecoration: "none",
                              backgroundColor: "rgba(16,185,129,0.18)",
                              border: "1px solid rgba(16,185,129,0.45)",
                              borderRadius: "9999px",
                              padding: "0.18rem 0.6rem",
                            }}
                          >
                            Project Sheet
                          </a>
                        ) : (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            No sheet uploaded yet
                          </div>
                        )}
                        {projectSheetUploadError && (
                          <div style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "0.3rem" }}>
                            {projectSheetUploadError}
                          </div>
                        )}
                      </div>
                      <label
                        title="Upload project sheet"
                        style={{
                          width: "2rem",
                          height: "2rem",
                          borderRadius: "999px",
                          border: "1px solid rgba(16,185,129,0.45)",
                          backgroundColor: "transparent",
                          color: "var(--text-secondary)",
                          cursor: projectSheetUploading ? "not-allowed" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: projectSheetUploading ? 0.65 : 0.95,
                        }}
                      >
                        <input
                          type="file"
                          disabled={projectSheetUploading}
                          style={{ display: "none" }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            await handleProjectSheetUpload(file);
                            e.target.value = "";
                          }}
                        />
                        <DocumentPlusIcon size={14} />
                      </label>
                    </div>

                    {/* Status card (smaller height) */}
                    <div
                      style={{
                        borderRadius: "0.9rem",
                        border: "1px solid var(--color-emerald-800)",
                        padding: "0.85rem 1rem",
                        backgroundColor: "var(--surface-muted)",
                        boxShadow: "0 6px 12px -8px rgba(16,185,129,0.2)",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          marginBottom: "0.25rem",
                          fontSize: "0.9rem",
                        }}
                      >
                        Status
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          color: "#047857",
                          marginBottom: activeProject.healthNotes ? "0.25rem" : 0,
                        }}
                      >
                        {activeProject.healthStatus && (
                          <span
                            style={{
                              width: "0.5rem",
                              height: "0.5rem",
                              borderRadius: "999px",
                              backgroundColor:
                                activeProject.healthStatus === "red"
                                  ? "#dc2626"
                                  : activeProject.healthStatus === "amber"
                                    ? "#d97706"
                                    : "#059669",
                            }}
                          />
                        )}
                        <span style={{ color: "var(--text-primary)" }}>{activeProject.status.replace(/_/g, " ")}</span>
                      </div>
                      {activeProject.healthNotes && (
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                          {activeProject.healthNotes}
                        </div>
                      )}
                    </div>

                    {(activeProject.inProjectTracker !== false && (activeProject.inCloseOut || !isSiteSuper)) && (
                      <div
                        style={{
                          borderRadius: "0.9rem",
                          border: "1px solid var(--color-emerald-800)",
                          padding: "0.85rem 1rem",
                          backgroundColor: "var(--surface-muted)",
                          boxShadow: "0 6px 12px -8px rgba(16,185,129,0.2)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            color: "var(--text-primary)",
                            marginBottom: "0.35rem",
                            fontSize: "0.9rem",
                          }}
                        >
                          Close Out
                        </div>
                        {activeProject.inCloseOut ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                              This job is listed under the Close Out workspace.
                            </div>
                            <Link
                              to={`/close-out/project/${activeProject._id}`}
                              style={{
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                color: "#047857",
                                textDecoration: "none",
                              }}
                            >
                              Open Close Out for this project →
                            </Link>
                            {!isSiteSuper && (
                              <button
                                type="button"
                                disabled={closeOutBusy}
                                onClick={async () => {
                                  if (!id) return;
                                  setCloseOutBusy(true);
                                  try {
                                    await returnProjectToTracker({ projectId: projectId! });
                                    navigate(`/projects/${id}`);
                                  } finally {
                                    setCloseOutBusy(false);
                                  }
                                }}
                                style={{
                                  alignSelf: "flex-start",
                                  marginTop: "0.15rem",
                                  padding: "0.35rem 0.65rem",
                                  fontSize: "0.75rem",
                                  borderRadius: "0.375rem",
                                  border: "1px solid rgba(220,38,38,0.5)",
                                  color: "#dc2626",
                                  background: "transparent",
                                  cursor: closeOutBusy ? "not-allowed" : "pointer",
                                  fontFamily: "Montserrat, sans-serif",
                                }}
                              >
                                Move back to Tracker
                              </button>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>
                              When the job is wrapping up, add it here so it appears on the Close Out page (As Built,
                              O&amp;M, warranty, etc.). Typical when status is substantial completion or closed.
                            </p>
                            <button
                              type="button"
                              disabled={closeOutBusy}
                              onClick={async () => {
                                if (!id) return;
                                setCloseOutError(null);
                                setCloseOutBusy(true);
                                try {
                                  await promoteProjectToCloseOut({ projectId: projectId! });
                                  navigate(`/close-out/project/${id}`);
                                } catch (e) {
                                  setCloseOutError(e instanceof Error ? e.message : "Could not move to Close Out");
                                } finally {
                                  setCloseOutBusy(false);
                                }
                              }}
                              style={{
                                alignSelf: "flex-start",
                                padding: "0.45rem 0.85rem",
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                borderRadius: "0.5rem",
                                border: "none",
                                backgroundColor: "#059669",
                                color: "#fff",
                                cursor: closeOutBusy ? "not-allowed" : "pointer",
                                fontFamily: "Montserrat, sans-serif",
                              }}
                            >
                              {closeOutBusy ? "Moving…" : "Move to Close Out"}
                            </button>
                            {closeOutError && (
                              <div style={{ fontSize: "0.75rem", color: "#dc2626" }}>{closeOutError}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dates card under status, same width */}
                    <div
                      style={{
                        borderRadius: "0.9rem",
                        border: "1px solid var(--color-emerald-800)",
                        padding: "0.9rem 1rem",
                        backgroundColor: "var(--surface-muted)",
                        boxShadow: "0 6px 12px -8px rgba(16,185,129,0.2)",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          marginBottom: "0.4rem",
                          fontSize: "0.9rem",
                        }}
                      >
                        Dates
                      </div>
                      <div style={{ marginBottom: "0.3rem" }}>
                        <div style={{ color: "var(--text-secondary)" }}>Start</div>
                        <div style={{ color: "var(--text-primary)" }}>{formatDate(activeProject.startDate)}</div>
                      </div>
                      <div>
                        <div style={{ color: "var(--text-secondary)" }}>End</div>
                        <div style={{ color: "var(--text-primary)" }}>{formatDate(activeProject.endDate)}</div>
                      </div>
                    </div>

                    {/* Weekly update: this project's daily reports for the current week */}
                    <div
                      style={{
                        borderRadius: "0.9rem",
                        border: "1px solid var(--color-emerald-800)",
                        padding: "0.9rem 1rem",
                        backgroundColor: "var(--surface-muted)",
                        boxShadow: "0 6px 12px -8px rgba(16,185,129,0.2)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.4rem",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          marginBottom: "0.2rem",
                          fontSize: "0.9rem",
                        }}
                      >
                        Weekly update
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>
                        Daily reports for this project this week.
                      </p>
                      {projectWeeklyReports === undefined ? (
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Loading...</div>
                      ) : (projectWeeklyReports ?? []).length === 0 ? (
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No daily reports this week.</div>
                      ) : (
                        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          {(projectWeeklyReports ?? []).map((report) => (
                            <li key={report._id}>
                              <Link
                                to={`/projects/${id}/daily-report/${report._id}`}
                              style={{
                                display: "block",
                                fontSize: "0.8rem",
                                color: "var(--text-primary)",
                                textDecoration: "none",
                                padding: "0.25rem 0",
                                borderBottom: "1px solid var(--color-emerald-800)",
                              }}
                              >
                                <span style={{ color: "var(--text-secondary)", marginRight: "0.5rem" }}>{formatDate(report.dueDate)}</span>
                                {report.title}
                                {report.description && (
                                  <span style={{ color: "var(--text-secondary)", opacity: 0.9 }}> - {report.description.length > 80 ? report.description.slice(0, 77) + "..." : report.description}</span>
                                )}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Right column: 66% width */}
                  <div
                    style={{
                      flex: isMobile ? "1 1 auto" : "0 0 66%",
                      minWidth: isMobile ? 0 : "280px",
                      maxWidth: "100%",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.9rem",
                    }}
                  >
                    {/* Budget vs actual */}
                    <div
                      style={{
                        borderRadius: "0.9rem",
                        border: "1px solid var(--color-emerald-800)",
                        padding: "1.1rem 1.15rem",
                        backgroundColor: "var(--surface-muted)",
                        boxShadow: "0 8px 16px -8px rgba(16,185,129,0.2)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "0.75rem",
                          marginBottom: "0.55rem",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            color: "var(--text-primary)",
                            fontSize: "0.95rem",
                          }}
                        >
                          Budget
                        </div>
                        {!editingBudgetNotes ? (
                          <button
                            type="button"
                            onClick={startEditingBudgetNotes}
                            aria-label="Edit budget inputs"
                            title="Edit budget inputs"
                            style={SUBTLE_ICON_BTN}
                          >
                            <PencilIcon size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingBudgetNotes(false)}
                            aria-label="Cancel budget edit"
                            title="Cancel"
                            style={SUBTLE_ICON_BTN}
                          >
                            <CloseIcon size={14} />
                          </button>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                        <div style={{ marginBottom: "0.35rem" }}>
                          <div style={{ color: "var(--text-secondary)" }}>Budgeted</div>
                          <div style={{ color: "var(--text-primary)" }}>
                            {hasBudget ? `$${budgetValue!.toLocaleString()}` : "-"}
                          </div>
                        </div>
                        <div style={{ marginBottom: "0.35rem" }}>
                          <div style={{ color: "var(--text-secondary)" }}>Actual cost</div>
                          <div style={{ color: "var(--text-primary)" }}>
                            {hasActual ? `$${actualCostValue!.toLocaleString()}` : "-"}
                          </div>
                        </div>
                        <div style={{ marginBottom: "0.35rem" }}>
                          <div style={{ color: "var(--text-secondary)" }}>Cash flow (net)</div>
                          <div
                            style={{ color: "var(--text-primary)", fontWeight: 600 }}
                            title="Invoiced âˆ’ paid (from accounting records)"
                          >
                            {hasCashFlow
                              ? `${netCashFlow < 0 ? "âˆ’" : ""}$${Math.abs(netCashFlow).toLocaleString()}`
                              : "-"}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: "0.65rem", marginBottom: "0.35rem" }}>
                        <div
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: "0.8rem",
                            marginBottom: "0.35rem",
                          }}
                        >
                          Month progress
                        </div>
                        <div
                          style={{
                            marginBottom: "0.25rem",
                            height: "0.45rem",
                            borderRadius: "999px",
                            backgroundColor: "rgba(16, 185, 129, 0.2)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${monthProgressPct}%`,
                              backgroundColor: "#059669",
                              borderRadius: "999px",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            marginBottom: "0.45rem",
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {nowMonth.toLocaleDateString(undefined, {
                            month: "long",
                            year: "numeric",
                          })}
                          {" · "}
                          {monthProgressPct}% through month
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          <Link
                            to={`/accounting?project=${id}`}
                            style={{
                              fontSize: "0.8125rem",
                              color: "#047857",
                              fontWeight: 600,
                              textDecoration: "none",
                            }}
                          >
                            Accounting change orders {"->"}
                          </Link>
                          {latestCo?.fileUrl && (
                            <a
                              href={latestCo.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: "0.8125rem",
                                color: "#047857",
                                textDecoration: "none",
                              }}
                            >
                              Open latest change order PDF
                            </a>
                          )}
                        </div>
                      </div>
                      {hasBudget && hasActual ? (
                        <div style={{ marginTop: "0.75rem" }}>
                          <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                            Budget vs actual
                          </div>
                          {(() => {
                            const pct =
                              budgetValue! > 0
                                ? Math.min(200, Math.round((actualCostValue! / budgetValue!) * 100))
                                : 0;
                            const clampedPct = Math.max(0, pct);
                            const withinBudgetWidth = Math.min(clampedPct, 100);
                            const overBudgetWidth = clampedPct > 100 ? clampedPct - 100 : 0;
                            return (
                              <div>
                                <div
                                  style={{
                                    position: "relative",
                                    height: "20px",
                                    borderRadius: "9999px",
                                    backgroundColor: "rgba(16, 185, 129, 0.2)",
                                    overflow: "hidden",
                                    boxShadow: "inset 0 0 0 1px rgba(16,185,129,0.25)",
                                  }}
                                >
                                  {/* Budget baseline label */}
                                  <div
                                    style={{
                                      position: "absolute",
                                      inset: 0,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      padding: "0 0.5rem",
                                    fontSize: "0.7rem",
                                    color: "var(--text-secondary)",
                                      pointerEvents: "none",
                                    }}
                                  >
                                    <span>0</span>
                                    <span>Budget</span>
                                  </div>
                                  {/* Actual within budget */}
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${withinBudgetWidth}%`,
                                      maxWidth: "100%",
                                      borderRadius: "9999px",
                                      backgroundColor: "#059669",
                                      boxShadow: "0 4px 8px -4px rgba(16,185,129,0.6)",
                                      transition: "width 0.6s ease-out",
                                    }}
                                  />
                                  {/* Over budget section */}
                                  {overBudgetWidth > 0 && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        top: 0,
                                        left: "100%",
                                        height: "100%",
                                        width: `${overBudgetWidth}%`,
                                        borderRadius: "0 9999px 9999px 0",
                                        backgroundColor: "#dc2626",
                                        boxShadow: "0 4px 8px -4px rgba(220,38,38,0.6)",
                                        transition: "width 0.6s ease-out",
                                      }}
                                    />
                                  )}
                                </div>
                                <div
                                  style={{
                                    marginTop: "0.35rem",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: "0.8rem",
                                    color: "#047857",
                                  }}
                                >
                                  <span>Actual: ${actualCostValue!.toLocaleString()}</span>
                                  <span>
                                    {pct <= 100
                                      ? `${pct}% of budget`
                                      : `${pct}% of budget · over by $${(actualCostValue! - budgetValue!).toLocaleString()}`}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          Add both budget and actual cost to see comparison.
                        </div>
                      )}
                      <div
                        style={{
                          marginTop: "0.9rem",
                          paddingTop: "0.75rem",
                          borderTop: "1px solid var(--color-emerald-800)",
                        }}
                      >
                        <div
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: "0.8rem",
                            marginBottom: "0.45rem",
                            fontWeight: 600,
                          }}
                        >
                          Budget inputs
                        </div>
                        {editingBudgetNotes ? (
                          <form onSubmit={saveBudgetNotes} style={{ display: "grid", gap: "0.45rem" }}>
                            <textarea
                              value={editCashFlowNotes}
                              onChange={(e) => setEditCashFlowNotes(e.target.value)}
                              placeholder="Cash flow"
                              rows={2}
                            />
                            <textarea
                              value={editForecastingNotes}
                              onChange={(e) => setEditForecastingNotes(e.target.value)}
                              placeholder="Forecasting"
                              rows={2}
                            />
                            <textarea
                              value={editInsuranceAndBondsNotes}
                              onChange={(e) => setEditInsuranceAndBondsNotes(e.target.value)}
                              placeholder="Insurance & Bonds"
                              rows={2}
                            />
                            <textarea
                              value={editPurchaseOrdersNotes}
                              onChange={(e) => setEditPurchaseOrdersNotes(e.target.value)}
                              placeholder="Purchase Orders"
                              rows={2}
                            />
                            <textarea
                              value={editProgressClaimsNotes}
                              onChange={(e) => setEditProgressClaimsNotes(e.target.value)}
                              placeholder="Progress Claims"
                              rows={2}
                            />
                            <textarea
                              value={editQuotesNotes}
                              onChange={(e) => setEditQuotesNotes(e.target.value)}
                              placeholder="Quotes"
                              rows={2}
                            />
                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                              <button
                                type="submit"
                                style={{
                                  padding: "0.45rem 0.75rem",
                                  border: "none",
                                  borderRadius: "0.45rem",
                                  backgroundColor: "#059669",
                                  color: "#fff",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontFamily: "Montserrat, sans-serif",
                                }}
                              >
                                Save inputs
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingBudgetNotes(false)}
                                style={{
                                  padding: "0.45rem 0.75rem",
                                  border: "1px solid #6b7280",
                                  borderRadius: "0.45rem",
                                  backgroundColor: "transparent",
                                  color: "#6b7280",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  fontFamily: "Montserrat, sans-serif",
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.82rem" }}>
                            {(() => {
                              const budgetNotesProject = activeProject;
                              const rows: Array<{ label: string; value: string | undefined }> = [
                                { label: "Cash flow", value: budgetNotesProject.cashFlowNotes },
                                { label: "Forecasting", value: budgetNotesProject.forecastingNotes },
                                { label: "Insurance & Bonds", value: budgetNotesProject.insuranceAndBondsNotes },
                                { label: "Purchase Orders", value: budgetNotesProject.purchaseOrdersNotes },
                                { label: "Progress Claims", value: budgetNotesProject.progressClaimsNotes },
                                { label: "Quotes", value: budgetNotesProject.quotesNotes },
                              ];
                              return rows.map((row) => (
                                <div key={row.label} style={{ color: "var(--text-primary)" }}>
                                  <span style={{ color: "var(--text-secondary)", marginRight: "0.35rem" }}>
                                    {row.label}:
                                  </span>
                                  {row.value?.trim() ? row.value : "-"}
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Project documents + subtrades, 66% width under budget */}
                    <div
                      style={{
                        borderRadius: "0.9rem",
                        border: "1px solid var(--color-emerald-800)",
                        padding: "1.1rem 1.15rem",
                        backgroundColor: "var(--surface-muted)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.55rem",
                        boxShadow: "0 8px 16px -8px rgba(16,185,129,0.2)",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem" }}>Project documents</div>
                      <div>
                        <div style={{ color: "var(--text-secondary)", marginBottom: "0.1rem" }}>Budget document</div>
                        <div>
                          {activeProject.budgetDocumentUrl ? (
                            <a
                              href={activeProject.budgetDocumentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#047857", textDecoration: "none" }}
                            >
                              Open budget document
                            </a>
                          ) : (
                            <span style={{ color: "var(--text-secondary)" }}>-</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "var(--text-secondary)", marginBottom: "0.1rem" }}>Safety document</div>
                        <div>
                          {activeProject.safetyDocumentUrl ? (
                            <a
                              href={activeProject.safetyDocumentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#047857", textDecoration: "none" }}
                            >
                              Open safety document
                            </a>
                          ) : (
                            <span style={{ color: "var(--text-secondary)" }}>-</span>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: "0.6rem",
                          paddingTop: "0.6rem",
                          borderTop: "1px solid var(--color-emerald-800)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                            marginBottom: "0.35rem",
                          }}
                        >
                          <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", fontWeight: 600 }}>
                            Compliance documents
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setNewDocName("");
                              setNewDocType("other");
                              setNewDocUrl("");
                              setNewDocStorageId(null);
                              setNewDocFolderId("");
                              setNewDocComplianceCategory("insurance");
                              setNewDocIssueDate("");
                              setNewDocExpiryDate("");
                              setNewDocSubtradeId("");
                              setDocumentsModal("add-document");
                            }}
                            style={{ ...EMERALD_ICON_BTN_SM, minWidth: "1.8rem", minHeight: "1.8rem" }}
                            title="Add compliance document"
                            aria-label="Add compliance document"
                          >
                            <DocumentPlusIcon size={16} />
                          </button>
                        </div>
                        {documents === undefined ? (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Loading…</div>
                        ) : complianceDocuments.length === 0 ? (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            No expiry-tracked documents yet.
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            {complianceDocuments.slice(0, 5).map((doc: Doc<"documents">) => {
                              const status = complianceExpiryStatus(doc.expiryDate);
                              const subtradeName = doc.subtradeId
                                ? subtrades?.find((s: Doc<"projectSubtrades">) => s._id === doc.subtradeId)?.name
                                : undefined;
                              return (
                                <div
                                  key={doc._id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: "0.5rem",
                                    alignItems: "center",
                                    padding: "0.45rem 0.55rem",
                                    borderRadius: "0.45rem",
                                    border: "1px solid var(--border-strong)",
                                    backgroundColor: "var(--surface-card)",
                                    color: "inherit",
                                  }}
                                >
                                  <span style={{ minWidth: 0 }}>
                                    <span style={{ display: "block", fontWeight: 600, color: "var(--text-primary)", fontSize: "0.82rem" }}>
                                      {doc.name}
                                    </span>
                                    <span style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.72rem" }}>
                                      {complianceCategoryLabel(doc.complianceCategory)}
                                      {subtradeName ? ` · ${subtradeName}` : ""}
                                      {doc.expiryDate ? ` · Expires ${formatDate(doc.expiryDate)}` : ""}
                                    </span>
                                  </span>
                                  <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                                    {status ? (
                                      <span
                                        style={{
                                          borderRadius: "999px",
                                          padding: "0.15rem 0.45rem",
                                          fontSize: "0.68rem",
                                          fontWeight: 700,
                                          whiteSpace: "nowrap",
                                          color: status.color,
                                          backgroundColor: status.backgroundColor,
                                        }}
                                      >
                                        {status.label}
                                      </span>
                                    ) : null}
                                    <a
                                      href={doc.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ color: "#047857", fontSize: "0.72rem", fontWeight: 700, textDecoration: "none" }}
                                    >
                                      Open
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => setHistoryDoc(doc)}
                                      style={{
                                        border: "none",
                                        background: "none",
                                        color: "#6b7280",
                                        cursor: "pointer",
                                        fontFamily: "Montserrat, sans-serif",
                                        fontSize: "0.72rem",
                                        fontWeight: 700,
                                        padding: 0,
                                      }}
                                    >
                                      History
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => startEditingComplianceDoc(doc)}
                                      style={{
                                        border: "none",
                                        background: "none",
                                        color: "#047857",
                                        cursor: "pointer",
                                        fontFamily: "Montserrat, sans-serif",
                                        fontSize: "0.72rem",
                                        fontWeight: 700,
                                        padding: 0,
                                      }}
                                    >
                                      Edit
                                    </button>
                                  </span>
                                </div>
                              );
                            })}
                            {complianceDocuments.length > 5 ? (
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                +{complianceDocuments.length - 5} more tracked document(s)
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                        <div
                          style={{
                            marginTop: "0.6rem",
                            paddingTop: "0.6rem",
                            borderTop: "1px solid var(--color-emerald-800)",
                          }}
                        >
                        <div
                            style={{
                              color: "var(--text-secondary)",
                              marginBottom: "0.1rem",
                              fontSize: "0.8rem",
                              fontWeight: 600,
                            }}
                        >
                          Subtrade list
                        </div>
                        <div style={{ color: "var(--text-primary)" }}>
                          {(subtrades ?? []).length
                            ? (subtrades ?? [])
                                .slice()
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((s) => s.name)
                                .join(", ")
                            : "-"}
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {section === "daily_reports" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontFamily: "Montserrat, sans-serif" }}>
          <h2 className="section-header" style={{ margin: 0 }}>
            Daily Reports
          </h2>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "stretch",
            }}
          >
            <aside
              style={{
                flex: "0 0 260px",
                maxWidth: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  borderRadius: "0.75rem",
                  border: "2px solid var(--color-emerald-800)",
                  backgroundColor: "var(--color-emerald-800)",
                  color: "#fff",
                  padding: "0.85rem 1rem",
                  textAlign: "center",
                }}
              >
                {tasks === undefined ? (
                  <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>Loading…</div>
                ) : latestReportUpdatedAt == null ? (
                  <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>No reports yet</div>
                ) : (
                  <>
                    <div style={{ fontSize: "0.72rem", opacity: 0.9, marginBottom: "0.35rem" }}>Latest update</div>
                    <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>
                      {formatLastReportDate(latestReportUpdatedAt).line1}
                    </div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                      {formatLastReportDate(latestReportUpdatedAt).line2}
                    </div>
                  </>
                )}
              </div>

              <div
                style={{
                  borderRadius: "0.75rem",
                  border: "2px solid var(--color-emerald-800)",
                  overflow: "hidden",
                  backgroundColor: "var(--surface-card)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    backgroundColor: "var(--color-emerald-800)",
                    color: "#fff",
                    padding: "0.45rem 0.6rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>Folders</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNewDocumentFolderName("");
                      setDocumentsModal("new-folder");
                    }}
                    title="New folder"
                    aria-label="New folder"
                    style={{ ...EMERALD_ICON_BTN_SM, backgroundColor: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.45)" }}
                  >
                    <FolderPlusIcon size={18} />
                  </button>
                </div>
                <div style={{ padding: "0.5rem 0.6rem", backgroundColor: "var(--surface-muted)", fontSize: "0.82rem" }}>
                  {documentFolders === undefined ? (
                    <div style={{ color: "var(--text-secondary)" }}>Loading…</div>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDrFolderId("root");
                            setSelectedDrReportId(null);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "0.35rem 0.45rem",
                            borderRadius: "0.4rem",
                            border: selectedDrFolderId === "root" ? "2px solid var(--color-emerald-600)" : "1px solid var(--border-strong)",
                            backgroundColor: selectedDrFolderId === "root" ? "var(--surface-card)" : "transparent",
                            cursor: "pointer",
                            fontFamily: "Montserrat, sans-serif",
                            fontSize: "0.82rem",
                            color: "var(--text-primary)",
                          }}
                        >
                          All / Unfiled
                        </button>
                      </li>
                      {[...documentFolders]
                        .sort((a: Doc<"documentFolders">, b: Doc<"documentFolders">) => a.name.localeCompare(b.name))
                        .map((folder: Doc<"documentFolders">) => (
                          <li key={folder._id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDrFolderId(folder._id);
                                setSelectedDrReportId(null);
                              }}
                              style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "0.35rem 0.45rem",
                                borderRadius: "0.4rem",
                                border:
                                  selectedDrFolderId === folder._id
                                    ? "2px solid var(--color-emerald-600)"
                                    : "1px solid var(--border-strong)",
                                backgroundColor: selectedDrFolderId === folder._id ? "var(--surface-card)" : "transparent",
                                cursor: "pointer",
                                fontFamily: "Montserrat, sans-serif",
                                fontSize: "0.82rem",
                                color: "var(--text-primary)",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.35rem",
                              }}
                            >
                              <FolderIcon size={16} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>

              <div
                aria-label="Site photos"
                style={{
                  borderRadius: "0.75rem",
                  border: "2px solid var(--color-emerald-800)",
                  overflow: "hidden",
                  backgroundColor: "var(--surface-card)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    backgroundColor: "var(--color-emerald-800)",
                    color: "#fff",
                    padding: "0.45rem 0.6rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                    minHeight: "2.25rem",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>Site photos</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setNewSitePhotoFolderName("");
                        setNewSitePhotoFolderModalOpen(true);
                      }}
                      title="New site photo folder"
                      aria-label="New site photo folder"
                      style={{ ...EMERALD_ICON_BTN_SM, backgroundColor: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.45)" }}
                    >
                      <FolderPlusIcon size={18} />
                    </button>
                    <label
                      title="Upload site photos"
                      style={{
                        ...EMERALD_ICON_BTN_SM,
                        backgroundColor: "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.45)",
                        cursor: sitePhotoUploading ? "not-allowed" : "pointer",
                      }}
                    >
                      <input
                        type="file"
                        multiple
                        accept="image/*,.heic,.heif,image/heic,image/heif"
                        disabled={sitePhotoUploading}
                        onChange={async (e) => {
                          const files = e.target.files;
                          if (!files?.length) return;
                          openSitePhotoUploadTagModal(
                            files,
                            drSitePhotoFolderKey === "unfiled" ? undefined : drSitePhotoFolderKey,
                          );
                          e.target.value = "";
                        }}
                        style={{ display: "none" }}
                      />
                      <CameraPlusIcon size={16} />
                    </label>
                  </div>
                </div>
                <div style={{ padding: "0.5rem 0.6rem", backgroundColor: "var(--surface-muted)", fontSize: "0.82rem" }}>
                  {sitePhotoFolders === undefined ? (
                    <div style={{ color: "var(--text-secondary)" }}>Loading…</div>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      <li>
                        <button
                          type="button"
                          onClick={() => setDrSitePhotoFolderKey("unfiled")}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "0.35rem 0.45rem",
                            borderRadius: "0.4rem",
                            border: drSitePhotoFolderKey === "unfiled" ? "2px solid var(--color-emerald-600)" : "1px solid var(--border-strong)",
                            backgroundColor: drSitePhotoFolderKey === "unfiled" ? "var(--surface-card)" : "transparent",
                            cursor: "pointer",
                            fontFamily: "Montserrat, sans-serif",
                            fontSize: "0.82rem",
                          }}
                        >
                          Unfiled
                        </button>
                      </li>
                      {sitePhotoFolders.map((f: Doc<"sitePhotoFolders">) => (
                        <li key={f._id}>
                          <button
                            type="button"
                            onClick={() => setDrSitePhotoFolderKey(f._id)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "0.35rem 0.45rem",
                              borderRadius: "0.4rem",
                              border:
                                drSitePhotoFolderKey === f._id
                                  ? "2px solid var(--color-emerald-600)"
                                  : "1px solid var(--border-strong)",
                              backgroundColor: drSitePhotoFolderKey === f._id ? "var(--surface-card)" : "transparent",
                              cursor: "pointer",
                              fontFamily: "Montserrat, sans-serif",
                              fontSize: "0.82rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {f.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div
                  aria-hidden
                  style={{
                    height: "0.65rem",
                    flexShrink: 0,
                    backgroundColor: "var(--surface-card)",
                    borderTop: "1px solid rgba(6, 95, 70, 0.2)",
                  }}
                />
                <div
                  style={{
                    padding: "0.5rem",
                    backgroundColor: "var(--surface-muted)",
                    maxHeight: "140px",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.45rem",
                  }}
                >
                  {sitePhotos === undefined ? (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Loading…</div>
                  ) : sitePhotos.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No photos in this folder.</div>
                  ) : (
                    sitePhotos.map((photo: Doc<"projectSitePhotos"> & { uploaderName?: string }) => (
                      <article
                        key={photo._id}
                        onContextMenu={(e) => openSitePhotoMenu(e, photo._id)}
                        style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSitePhotoOpen(photo);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            margin: 0,
                            padding: 0,
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            textAlign: "inherit",
                            color: "inherit",
                            font: "inherit",
                            textDecoration: "none",
                          }}
                        >
                          {isLikelyImageFile(photo.mimeType, photo.originalFileName || photo.displayName) ? (
                            <SitePhotoImage
                              src={photo.fileUrl}
                              mimeType={photo.mimeType}
                              fileName={photo.displayName || photo.originalFileName}
                              alt={sitePhotoDisplayName(photo)}
                              style={{
                                width: "100%",
                                aspectRatio: "4 / 3",
                                objectFit: "cover",
                                borderRadius: "0.45rem",
                                border: "1px solid var(--border-strong)",
                                backgroundColor: "var(--surface-card)",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                aspectRatio: "4 / 3",
                                borderRadius: "0.45rem",
                                border: "1px solid var(--border-strong)",
                                backgroundColor: "var(--surface-muted)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "1rem",
                                fontWeight: 700,
                                color: "var(--text-secondary)",
                              }}
                            >
                              {fileExtensionFromName(photo.originalFileName || photo.caption || "") || "FILE"}
                            </div>
                          )}
                          <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                            {sitePhotoDisplayName(photo)} ·{" "}
                            {formatDate(photo.uploadedAt)}
                          </div>
                          {sitePhotoMetaLines(photo, subtrades)}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSitePhoto(photo._id)}
                          disabled={sitePhotoDeletingId === photo._id}
                          style={{
                            border: "none",
                            background: "none",
                            color: "#dc2626",
                            cursor: sitePhotoDeletingId === photo._id ? "not-allowed" : "pointer",
                            fontFamily: "Montserrat, sans-serif",
                            fontSize: "0.7rem",
                            textAlign: "left",
                            padding: 0,
                          }}
                        >
                          {sitePhotoDeletingId === photo._id ? "Deleting..." : "Delete"}
                        </button>
                      </article>
                    ))
                  )}
                </div>
              </div>

              <div
                style={{
                  borderRadius: "0.75rem",
                  border: "2px solid var(--color-emerald-800)",
                  overflow: "hidden",
                  backgroundColor: "var(--surface-card)",
                }}
              >
                <div
                  style={{
                    backgroundColor: "var(--color-emerald-800)",
                    color: "#fff",
                    padding: "0.45rem 0.6rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                  }}
                >
                  Weekly summary
                </div>
                <div
                  style={{
                    padding: "0.5rem 0.6rem",
                    backgroundColor: "var(--surface-muted)",
                    fontSize: "0.82rem",
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    alignItems: "flex-start",
                  }}
                >
                  <Link
                    to={`/weekly?projectId=${id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      padding: "0.35rem 0.65rem",
                      borderRadius: "0.4rem",
                      border: "1px solid #059669",
                      backgroundColor: "transparent",
                      color: "#059669",
                      textDecoration: "none",
                      fontFamily: "Montserrat, sans-serif",
                      fontWeight: 700,
                      fontSize: "0.82rem",
                      cursor: "pointer",
                    }}
                  >
                    Open weekly summary →
                  </Link>
                </div>
              </div>
            </aside>

            <div style={{ flex: "1 1 320px", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div
                style={{
                  borderRadius: "0.75rem",
                  border: "2px solid var(--color-emerald-800)",
                  backgroundColor: "var(--surface-card)",
                  minHeight: "280px",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  flex: "1 1 auto",
                }}
              >
                <div
                  style={{
                    padding: "0.5rem 0.65rem",
                    borderBottom: "1px solid var(--border-strong)",
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      openNewDailyReportModal(selectedDrFolderId === "root" ? undefined : selectedDrFolderId)
                    }
                    title="New daily report"
                    aria-label="New daily report"
                    style={EMERALD_ICON_BTN_SM}
                  >
                    <CalendarPlusIcon size={20} />
                  </button>
                </div>
                <div style={{ flex: 1, overflow: "auto", padding: "0.65rem" }}>
                    {selectedDrReportId && selectedDrReport ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.875rem" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => setSelectedDrReportId(null)}
                          style={{
                            padding: "0.35rem 0.65rem",
                            fontSize: "0.8rem",
                            borderRadius: "0.4rem",
                            border: "1px solid var(--border-strong)",
                            backgroundColor: "var(--surface-panel)",
                            cursor: "pointer",
                            fontFamily: "Montserrat, sans-serif",
                          }}
                        >
                          ← Back to list
                        </button>
                        <Link
                          to={`/projects/${id}/daily-report/${selectedDrReport._id}`}
                          style={{ fontSize: "0.8rem", color: "#047857" }}
                        >
                          Open full page
                        </Link>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              type: "delete-daily-report",
                              taskId: selectedDrReport._id,
                              title: selectedDrReport.title,
                            })
                          }
                          style={{
                            padding: "0.35rem 0.65rem",
                            fontSize: "0.8rem",
                            borderRadius: "0.4rem",
                            border: "1px solid #dc2626",
                            backgroundColor: "transparent",
                            color: "#dc2626",
                            cursor: "pointer",
                            fontFamily: "Montserrat, sans-serif",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                        {selectedDrReport.title}
                      </div>
                      <div style={{ color: "var(--text-secondary)" }}>{formatDate(selectedDrReport.dueDate)}</div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: "0.25rem", color: "var(--text-primary)" }}>Description</div>
                        <div style={{ whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>
                          {selectedDrReport.description?.trim() ? selectedDrReport.description : "No details were added."}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Trades on site</div>
                        <div style={{ color: "var(--text-primary)" }}>
                          {(subtrades ?? [])
                            .filter((s: Doc<"projectSubtrades">) => selectedDrReport.subtradeIdsOnSite?.includes(s._id))
                            .map((s: Doc<"projectSubtrades">) => s.name)
                            .join(", ") || "—"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Weather</div>
                        <div style={{ color: "var(--text-primary)" }}>{selectedDrReport.weatherSummary?.trim() || "—"}</div>
                      </div>
                      {(selectedDrReport.photoUrls?.length ?? 0) > 0 ? (
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Photos</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                            {(selectedDrReport.photoUrls ?? []).map((url: string, i: number) => (
                              <a key={`${url}-${i}`} href={url} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={url}
                                  alt=""
                                  style={{ width: "120px", height: "90px", objectFit: "cover", borderRadius: "0.4rem", border: "1px solid var(--border-strong)" }}
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {(selectedDrReport.documentUrls?.length ?? 0) > 0 ? (
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Documents</div>
                          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                            {(selectedDrReport.documentUrls ?? []).map((url: string, i: number) => (
                              <li key={`${url}-${i}`}>
                                <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#047857" }}>
                                  Attachment {i + 1}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    ) : tasks === undefined || reportsForSelectedDrFolder === undefined ? (
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading…</p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                      {selectedDrFolderId !== "root" && id ? (
                        <div style={{ marginBottom: "0.65rem" }}>
                          <Link to={`/projects/${id}/folders/${selectedDrFolderId}`} style={{ fontSize: "0.8rem", color: "#047857" }}>
                            Browse folder documents →
                          </Link>
                        </div>
                      ) : null}
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid var(--color-emerald-800)", textAlign: "left", color: "var(--text-secondary)" }}>
                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Date</th>
                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Title</th>
                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Description</th>
                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Trades on-site</th>
                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Weather</th>
                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Photos</th>
                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }} />
                          </tr>
                        </thead>
                        <tbody>
                          {reportsForSelectedDrFolder.length === 0 ? (
                            <tr>
                              <td colSpan={7} style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>
                                No daily reports in this folder.
                              </td>
                            </tr>
                          ) : (
                            reportsForSelectedDrFolder.map((t: Doc<"projectTasks">) => (
                              <tr key={t._id} style={{ borderBottom: "1px solid var(--border-strong)", verticalAlign: "top" }}>
                                <td style={{ padding: "0.45rem 0.35rem", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                                  {formatDate(t.dueDate)}
                                </td>
                                <td style={{ padding: "0.45rem 0.35rem" }}>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedDrReportId(t._id)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      padding: 0,
                                      cursor: "pointer",
                                      fontWeight: 600,
                                      color: "#047857",
                                      textDecoration: "underline",
                                      fontFamily: "Montserrat, sans-serif",
                                      fontSize: "0.8rem",
                                      textAlign: "left",
                                    }}
                                  >
                                    {t.title}
                                  </button>
                                </td>
                                <td style={{ padding: "0.45rem 0.35rem", maxWidth: "12rem", color: "var(--text-primary)" }}>
                                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {t.description?.trim() ? (t.description.length > 120 ? `${t.description.slice(0, 117)}…` : t.description) : "—"}
                                  </span>
                                </td>
                                <td style={{ padding: "0.45rem 0.35rem", fontSize: "0.75rem" }}>
                                  {(subtrades ?? [])
                                    .filter((s: Doc<"projectSubtrades">) => t.subtradeIdsOnSite?.includes(s._id))
                                    .map((s: Doc<"projectSubtrades">) => s.name)
                                    .join(", ") || "—"}
                                </td>
                                <td style={{ padding: "0.45rem 0.35rem", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                                  {t.weatherSummary?.trim() ? "Saved" : "—"}
                                </td>
                                <td style={{ padding: "0.45rem 0.35rem", fontSize: "0.72rem", whiteSpace: "nowrap" }}>
                                  {t.photoUrls?.length ? `${t.photoUrls.length} photo(s)` : "—"}
                                </td>
                                <td style={{ padding: "0.45rem 0.35rem", whiteSpace: "nowrap" }}>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmAction({ type: "delete-daily-report", taskId: t._id, title: t.title })}
                                    style={{
                                      padding: "0.2rem 0.45rem",
                                      fontSize: "0.72rem",
                                      borderRadius: "0.35rem",
                                      border: "1px solid #dc2626",
                                      backgroundColor: "transparent",
                                      color: "#dc2626",
                                      cursor: "pointer",
                                      fontFamily: "Montserrat, sans-serif",
                                    }}
                                  >
                                    Del
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                      </div>
                    )}
                </div>
              </div>

              <div
                style={{
                  borderRadius: "0.75rem",
                  border: "2px solid var(--color-emerald-800)",
                  backgroundColor: "var(--surface-card)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    backgroundColor: "var(--color-emerald-800)",
                    color: "#fff",
                    padding: "0.45rem 0.65rem",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>Safety reports</span>
                  <Link
                    to={id ? `/safety/project/${id}/incidents` : "#"}
                    title="Add incident"
                    aria-label="Add incident"
                    style={{
                      ...EMERALD_ICON_BTN_SM,
                      textDecoration: "none",
                      backgroundColor: "rgba(255,255,255,0.2)",
                      border: "1px solid rgba(255,255,255,0.45)",
                    }}
                  >
                    <CalendarPlusIcon size={18} />
                  </Link>
                </div>
                <div style={{ padding: "0.65rem", overflowX: "auto" }}>
                  {safetyIncidents === undefined ? (
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>Loading…</p>
                  ) : safetyIncidents.length === 0 ? (
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>No incident reports yet.</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-strong)", textAlign: "left", color: "var(--text-secondary)" }}>
                          <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Title</th>
                          <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Trade name</th>
                          <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Type</th>
                          <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Date</th>
                          <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Time</th>
                          <th style={{ padding: "0.4rem 0.35rem", fontWeight: 700 }}>Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {safetyIncidents.map((r: Doc<"incidentReports">) => (
                          <tr key={r._id} style={{ borderBottom: "1px solid var(--border-strong)", verticalAlign: "top" }}>
                            <td style={{ padding: "0.45rem 0.35rem" }}>
                              {id ? (
                                <Link
                                  to={projectIncidentReportHref(id, String(r._id))}
                                  style={{ fontWeight: 600, color: "#047857", textDecoration: "underline", fontSize: "0.8rem" }}
                                >
                                  {r.title}
                                </Link>
                              ) : (
                                r.title
                              )}
                            </td>
                            <td style={{ padding: "0.45rem 0.35rem", color: "var(--text-secondary)" }}>—</td>
                            <td style={{ padding: "0.45rem 0.35rem" }}>{formatReportType(r.reportType)}</td>
                            <td style={{ padding: "0.45rem 0.35rem", whiteSpace: "nowrap" }}>{formatDate(r.date)}</td>
                            <td style={{ padding: "0.45rem 0.35rem", whiteSpace: "nowrap" }}>
                              {new Date(r.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td style={{ padding: "0.45rem 0.35rem" }}>{r.status ?? "open"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>

          {showNewDailyReportModal && (
            <div
              role="presentation"
              onClick={() => resetNewDailyReportForm()}
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(15, 23, 42, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 50,
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                style={{
                  ...cardStyle,
                  maxWidth: "28rem",
                  width: "94%",
                  maxHeight: "92vh",
                  overflow: "auto",
                }}
              >
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--text-primary)" }}>New daily report</h3>
                <form onSubmit={handleAddTask} style={{ display: "grid", gap: "0.5rem", fontSize: "0.875rem" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Report date</label>
                    <input
                      type="date"
                      value={newTaskDate}
                      onChange={(e) => setNewTaskDate(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Report title</label>
                    <input
                      type="text"
                      placeholder="Summary of the day"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Details (optional)</label>
                    <textarea
                      rows={3}
                      placeholder="Notes, issues, progress, etc."
                      value={newTaskDescription}
                      onChange={(e) => setNewTaskDescription(e.target.value)}
                      style={{ width: "100%", resize: "vertical" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Trades on site</label>
                    <MultiSelectDropdown
                      options={[...(subtrades ?? [])]
                        .slice()
                        .sort((a: Doc<"projectSubtrades">, b: Doc<"projectSubtrades">) => a.name.localeCompare(b.name))
                        .map((s: Doc<"projectSubtrades">) => ({ id: s._id, label: s.name }))}
                      selectedIds={newSubtradeIdsOnSite}
                      onChange={setNewSubtradeIdsOnSite}
                      placeholder="Select trades on site"
                      emptyMessage="Add subtrades in Subtrades first."
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Weather (auto)</label>
                    <input
                      type="text"
                      value={newTaskWeather}
                      onChange={(e) => setNewTaskWeather(e.target.value)}
                      placeholder={taskWeatherLoading ? "Loading weather..." : "Weather summary"}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDrNestedModalIsEdit(false);
                      setDrNestedModal("document");
                    }}
                    title="Attach photos or documents"
                    aria-label="Attach photos or documents"
                    style={EMERALD_ICON_BTN_SM}
                  >
                    <DocumentPlusIcon size={20} />
                  </button>
                  <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                    {newTaskPhotoStorageIds.length + newTaskPhotoBlobIds.length
                      ? `OK ${newTaskPhotoStorageIds.length + newTaskPhotoBlobIds.length} photo(s) staged`
                      : ""}
                    {(newTaskPhotoStorageIds.length + newTaskPhotoBlobIds.length > 0) &&
                    (newTaskDocStorageIds.length + newTaskDocBlobIds.length > 0)
                      ? " · "
                      : ""}
                    {newTaskDocStorageIds.length + newTaskDocBlobIds.length
                      ? `OK ${newTaskDocStorageIds.length + newTaskDocBlobIds.length} doc(s) staged`
                      : ""}
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Folder for this report (optional)</label>
                    <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", color: "#9ca3af" }}>
                      If you pick a folder, this report appears only there—not on the main list. Uploaded docs go into the same folder.
                    </p>
                    <select
                      value={dailyReportFolderId}
                      onChange={(e) => setDailyReportFolderId((e.target.value as Id<"documentFolders">) || "")}
                      style={{ width: "100%", padding: "0.35rem 0.5rem", borderRadius: "0.375rem", border: "1px solid #e5e7eb", fontFamily: "Montserrat, sans-serif" }}
                    >
                      <option value="">No folder (show on main list)</option>
                      {(documentFolders ?? []).map((folder: Doc<"documentFolders">) => (
                        <option key={folder._id} value={folder._id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <VoiceTranscriptionControl onTranscript={(text) => setNewTaskDescription(text)} />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                    <button
                      type="button"
                      onClick={() => resetNewDailyReportForm()}
                      style={{
                        padding: "0.45rem 0.9rem",
                        borderRadius: "0.5rem",
                        border: "1px solid #e5e7eb",
                        backgroundColor: "var(--surface-panel)",
                        color: "var(--text-primary)",
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        fontFamily: "Montserrat, sans-serif",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: "0.45rem 0.9rem",
                        borderRadius: "0.5rem",
                        fontWeight: 600,
                        backgroundColor: "#059669",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "Montserrat, sans-serif",
                      }}
                    >
                      Add daily report
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {editingTaskId && (
            <div
              role="presentation"
              onClick={() => {
                setEditingTaskId(null);
                setEditDailyReportFolderId("");
                setDrNestedModal(null);
              }}
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(15, 23, 42, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 50,
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                style={{
                  ...cardStyle,
                  maxWidth: "28rem",
                  width: "94%",
                  maxHeight: "92vh",
                  overflow: "auto",
                }}
              >
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--text-primary)" }}>Edit task</h3>
                {(() => {
                  const t = (tasks ?? []).find((x: Doc<"projectTasks">) => x._id === editingTaskId);
                  if (!t) return <p style={{ color: "#6b7280" }}>Task not found.</p>;
                  return (
                    <div style={{ display: "grid", gap: "0.5rem", fontSize: "0.875rem" }}>
                      <div>
                        <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Due date</label>
                        <input
                          type="date"
                          value={editTaskDate}
                          onChange={(e) => setEditTaskDate(e.target.value)}
                          style={{ width: "100%" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Title</label>
                        <input
                          type="text"
                          value={editTaskTitle}
                          onChange={(e) => setEditTaskTitle(e.target.value)}
                          style={{ width: "100%" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Details (optional)</label>
                        <textarea
                          rows={2}
                          value={editTaskDescription}
                          onChange={(e) => setEditTaskDescription(e.target.value)}
                          style={{ width: "100%", resize: "vertical" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Trades on site</label>
                        <MultiSelectDropdown
                          options={[...(subtrades ?? [])]
                            .slice()
                            .sort((a: Doc<"projectSubtrades">, b: Doc<"projectSubtrades">) => a.name.localeCompare(b.name))
                            .map((s: Doc<"projectSubtrades">) => ({ id: s._id, label: s.name }))}
                          selectedIds={editSubtradeIdsOnSite}
                          onChange={setEditSubtradeIdsOnSite}
                          placeholder="Select trades on site"
                          emptyMessage="No subtrades on this activeProject."
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Weather</label>
                        <input
                          type="text"
                          value={editTaskWeather}
                          onChange={(e) => setEditTaskWeather(e.target.value)}
                          style={{ width: "100%" }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDrNestedModalIsEdit(true);
                          setDrNestedModal("document");
                        }}
                        title="Add document"
                        aria-label="Add document"
                        style={EMERALD_ICON_BTN_SM}
                      >
                        <DocumentPlusIcon size={20} />
                      </button>
                      <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                        {editTaskPhotoStorageIds.length + editTaskPhotoBlobIds.length
                          ? `+${editTaskPhotoStorageIds.length + editTaskPhotoBlobIds.length} new photo(s)`
                          : ""}
                        {(editTaskPhotoStorageIds.length + editTaskPhotoBlobIds.length > 0) &&
                        (editTaskDocStorageIds.length + editTaskDocBlobIds.length > 0)
                          ? " · "
                          : ""}
                        {editTaskDocStorageIds.length + editTaskDocBlobIds.length
                          ? `+${editTaskDocStorageIds.length + editTaskDocBlobIds.length} new doc(s)`
                          : ""}
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Folder for this report (optional)</label>
                        <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", color: "#9ca3af" }}>
                          With a folder, the report is listed only inside that folder. New uploads are filed there too.
                        </p>
                        <select
                          value={editDailyReportFolderId}
                          onChange={(e) => setEditDailyReportFolderId((e.target.value as Id<"documentFolders">) || "")}
                          style={{ width: "100%", padding: "0.35rem 0.5rem", borderRadius: "0.375rem", border: "1px solid #e5e7eb", fontFamily: "Montserrat, sans-serif" }}
                        >
                          <option value="">No folder (show on main list)</option>
                          {(documentFolders ?? []).map((folder: Doc<"documentFolders">) => (
                            <option key={folder._id} value={folder._id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTaskId(null);
                            setEditDailyReportFolderId("");
                            setDrNestedModal(null);
                          }}
                          style={{
                            padding: "0.45rem 0.9rem",
                            borderRadius: "0.5rem",
                            border: "1px solid #e5e7eb",
                            backgroundColor: "var(--surface-panel)",
                            color: "var(--text-primary)",
                            fontSize: "0.85rem",
                            cursor: "pointer",
                            fontFamily: "Montserrat, sans-serif",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!t) return;
                            const dueMs = dateInputValueToTimestamp(editTaskDate);
                            if (isOffline) {
                              await queueJob({
                                type: "dailyReportUpdate",
                                payload: {
                                  taskId: String(t._id),
                                  projectId: id!,
                                  title: editTaskTitle,
                                  description: editTaskDescription || undefined,
                                  dueDate: dueMs,
                                  weatherSummary: editTaskWeather || undefined,
                                  subtradeIdsOnSite: editSubtradeIdsOnSite.map((x) => String(x)),
                                  photoUrls: editTaskPhotoUrls,
                                  documentUrls: editTaskDocumentUrls,
                                  newPhotoBlobIds: editTaskPhotoBlobIds,
                                  newDocBlobIds: editTaskDocBlobIds,
                                  newPhotoStorageIds: editTaskPhotoStorageIds.length
                                    ? editTaskPhotoStorageIds.map((x) => String(x))
                                    : undefined,
                                  newDocStorageIds: editTaskDocStorageIds.length
                                    ? editTaskDocStorageIds.map((x) => String(x))
                                    : undefined,
                                  editDailyReportFolderId: editDailyReportFolderId
                                    ? String(editDailyReportFolderId)
                                    : null,
                                },
                              });
                              setEditingTaskId(null);
                              setEditDailyReportFolderId("");
                              setEditTaskPhotoBlobIds([]);
                              setEditTaskDocBlobIds([]);
                              setDrNestedModal(null);
                              return;
                            }
                            await updateTask({
                              taskId: t._id,
                              title: editTaskTitle,
                              description: editTaskDescription || undefined,
                              dueDate: dueMs,
                              weatherSummary: editTaskWeather || undefined,
                              photoUrls: editTaskPhotoUrls,
                              documentUrls: editTaskDocumentUrls,
                              photoStorageIds: editTaskPhotoStorageIds.length ? editTaskPhotoStorageIds : undefined,
                              documentStorageIds: editTaskDocStorageIds.length ? editTaskDocStorageIds : undefined,
                              subtradeIdsOnSite: editSubtradeIdsOnSite,
                              dailyReportFolderId: editDailyReportFolderId || null,
                            });
                            if (id && editDailyReportFolderId && editTaskDocStorageIds.length) {
                              const ms = dueMs ?? Date.now();
                              const ttitle = editTaskTitle.trim();
                              for (let i = 0; i < editTaskDocStorageIds.length; i++) {
                                await createDocument({
                                  projectId: projectId!,
                                  type: "other",
                                  name: `${ttitle} - attachment ${i + 1}`,
                                  storageId: editTaskDocStorageIds[i],
                                  folderId: editDailyReportFolderId,
                                  createdDate: ms,
                                });
                              }
                            }
                            setEditingTaskId(null);
                            setEditDailyReportFolderId("");
                            setDrNestedModal(null);
                          }}
                          style={{
                            padding: "0.45rem 0.9rem",
                            borderRadius: "0.5rem",
                            fontWeight: 600,
                            backgroundColor: "#059669",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "Montserrat, sans-serif",
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {drNestedModal === "document" && (editingTaskId || showNewDailyReportModal) && (
            <div
              role="presentation"
              onClick={() => setDrNestedModal(null)}
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(15, 23, 42, 0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 60,
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                style={{
                  ...cardStyle,
                  maxWidth: "24rem",
                  width: "92%",
                }}
              >
                <h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.65rem", color: "var(--text-primary)" }}>Attach files</h4>
                {fileUploadError ? (
                  <p style={{ margin: "0 0 0.65rem", color: "#b91c1c", fontSize: "0.8rem" }}>
                    {fileUploadError}
                  </p>
                ) : null}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", fontSize: "0.85rem" }}>
                  <div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#6b7280", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                      Photos
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          disabled={drNestedModalIsEdit ? editTaskPhotoUploading : taskPhotoUploading}
                          onChange={async (e) => {
                            const files = e.target.files;
                            if (!files) return;
                            if (drNestedModalIsEdit) {
                              await stageDailyReportFilesFromInput(files, "editPhoto");
                            } else {
                              await stageDailyReportFilesFromInput(files, "newPhoto");
                            }
                            e.target.value = "";
                          }}
                        />
                        {drNestedModalIsEdit
                          ? editTaskPhotoUploading
                            ? "Taking photo…"
                            : "Take photo"
                          : taskPhotoUploading
                            ? "Taking photo…"
                            : "Take photo"}
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={drNestedModalIsEdit ? editTaskPhotoUploading : taskPhotoUploading}
                          onChange={async (e) => {
                            const files = e.target.files;
                            if (!files) return;
                            if (drNestedModalIsEdit) {
                              await stageDailyReportFilesFromInput(files, "editPhoto");
                            } else {
                              await stageDailyReportFilesFromInput(files, "newPhoto");
                            }
                            e.target.value = "";
                          }}
                        />
                        {drNestedModalIsEdit
                          ? editTaskPhotoUploading
                            ? "Uploading photos…"
                            : "Upload from device"
                          : taskPhotoUploading
                            ? "Uploading photos…"
                            : "Upload from device"}
                      </label>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#6b7280", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                      Documents
                    </div>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
                      <input
                        type="file"
                        multiple
                        disabled={drNestedModalIsEdit ? editTaskDocUploading : taskDocUploading}
                        onChange={async (e) => {
                          const files = e.target.files;
                          if (!files) return;
                          if (drNestedModalIsEdit) {
                            await stageDailyReportFilesFromInput(files, "editDoc");
                          } else {
                            await stageDailyReportFilesFromInput(files, "newDoc");
                          }
                          e.target.value = "";
                        }}
                      />
                      {drNestedModalIsEdit
                        ? editTaskDocUploading
                          ? "Uploading docs…"
                          : "Add documents"
                        : taskDocUploading
                          ? "Uploading docs…"
                          : "Add documents"}
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrNestedModal(null)}
                  style={{
                    marginTop: "0.85rem",
                    padding: "0.35rem 0.75rem",
                    fontSize: "0.85rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "var(--surface-panel)",
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

      {section === "site_photos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontFamily: "Montserrat, sans-serif" }}>
          <h2 className="section-header" style={{ margin: 0 }}>
            Site Photos
          </h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "stretch",
            }}
          >
            <aside
              style={{
                flex: "0 0 260px",
                maxWidth: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div
                aria-label="Site photo folders"
                style={{
                  borderRadius: "0.75rem",
                  border: "2px solid var(--color-emerald-800)",
                  overflow: "hidden",
                  backgroundColor: "var(--surface-card)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    backgroundColor: "var(--color-emerald-800)",
                    color: "#fff",
                    padding: "0.45rem 0.6rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                    minHeight: "2.25rem",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>Folders</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setNewSitePhotoFolderName("");
                        setNewSitePhotoFolderModalOpen(true);
                      }}
                      title="New site photo folder"
                      aria-label="New site photo folder"
                      style={{
                        ...EMERALD_ICON_BTN_SM,
                        backgroundColor: "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.45)",
                      }}
                    >
                      <FolderPlusIcon size={18} />
                    </button>
                    <label
                      title="Upload site photos"
                      style={{
                        ...EMERALD_ICON_BTN_SM,
                        backgroundColor: "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.45)",
                        cursor: sitePhotoUploading ? "not-allowed" : "pointer",
                      }}
                    >
                      <input
                        type="file"
                        multiple
                        accept="image/*,.heic,.heif,image/heic,image/heif"
                        disabled={sitePhotoUploading}
                        onChange={async (e) => {
                          const files = e.target.files;
                          if (!files?.length) return;
                          openSitePhotoUploadTagModal(
                            files,
                            sitePhotosTabFolderKey === "unfiled" ? undefined : sitePhotosTabFolderKey,
                          );
                          e.target.value = "";
                        }}
                        style={{ display: "none" }}
                      />
                      <CameraPlusIcon size={16} />
                    </label>
                  </div>
                </div>
                <div style={{ padding: "0.5rem 0.6rem", backgroundColor: "var(--surface-muted)", fontSize: "0.82rem" }}>
                  {sitePhotoFolders === undefined ? (
                    <div style={{ color: "var(--text-secondary)" }}>Loading…</div>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      <li>
                        <button
                          type="button"
                          onClick={() => setSitePhotosTabFolderKey("unfiled")}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "0.35rem 0.45rem",
                            borderRadius: "0.4rem",
                            border:
                              sitePhotosTabFolderKey === "unfiled"
                                ? "2px solid var(--color-emerald-600)"
                                : "1px solid var(--border-strong)",
                            backgroundColor:
                              sitePhotosTabFolderKey === "unfiled" ? "var(--surface-card)" : "transparent",
                            cursor: "pointer",
                            fontFamily: "Montserrat, sans-serif",
                            fontSize: "0.82rem",
                          }}
                        >
                          Unfiled
                        </button>
                      </li>
                      {sitePhotoFolders.map((f: Doc<"sitePhotoFolders">) => (
                        <li key={f._id}>
                          <button
                            type="button"
                            onClick={() => setSitePhotosTabFolderKey(f._id)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "0.35rem 0.45rem",
                              borderRadius: "0.4rem",
                              border:
                                sitePhotosTabFolderKey === f._id
                                  ? "2px solid var(--color-emerald-600)"
                                  : "1px solid var(--border-strong)",
                              backgroundColor:
                                sitePhotosTabFolderKey === f._id ? "var(--surface-card)" : "transparent",
                              cursor: "pointer",
                              fontFamily: "Montserrat, sans-serif",
                              fontSize: "0.82rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {f.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </aside>

            <div
              style={{
                flex: "1 1 320px",
                minWidth: 0,
                borderRadius: "0.75rem",
                border: "2px solid var(--color-emerald-800)",
                backgroundColor: "var(--surface-card)",
                padding: "0.85rem",
              }}
            >
              {sitePhotos === undefined ? (
                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Loading…</div>
              ) : sitePhotos.length === 0 ? (
                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>No photos in this folder.</div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))",
                    gap: "0.75rem",
                  }}
                >
                  {sitePhotos.map((photo: Doc<"projectSitePhotos"> & { uploaderName?: string }) => (
                    <article
                      key={photo._id}
                      onContextMenu={(e) => openSitePhotoMenu(e, photo._id)}
                      style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSitePhotoOpen(photo);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          margin: 0,
                          padding: 0,
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          textAlign: "inherit",
                          color: "inherit",
                          font: "inherit",
                        }}
                      >
                        {isLikelyImageFile(photo.mimeType, photo.originalFileName || photo.displayName) ? (
                          <SitePhotoImage
                            src={photo.fileUrl}
                            mimeType={photo.mimeType}
                            fileName={photo.displayName || photo.originalFileName}
                            alt={sitePhotoDisplayName(photo)}
                            style={{
                              width: "100%",
                              aspectRatio: "4 / 3",
                              objectFit: "cover",
                              borderRadius: "0.45rem",
                              border: "1px solid var(--border-strong)",
                              backgroundColor: "var(--surface-muted)",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              aspectRatio: "4 / 3",
                              borderRadius: "0.45rem",
                              border: "1px solid var(--border-strong)",
                              backgroundColor: "var(--surface-muted)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "1rem",
                              fontWeight: 700,
                              color: "var(--text-secondary)",
                            }}
                          >
                            {fileExtensionFromName(photo.originalFileName || photo.caption || "") || "FILE"}
                          </div>
                        )}
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                          {sitePhotoDisplayName(photo)} · {formatDate(photo.uploadedAt)}
                        </div>
                        {sitePhotoMetaLines(photo, subtrades)}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSitePhoto(photo._id)}
                        disabled={sitePhotoDeletingId === photo._id}
                        style={{
                          border: "none",
                          background: "none",
                          color: "#dc2626",
                          cursor: sitePhotoDeletingId === photo._id ? "not-allowed" : "pointer",
                          fontFamily: "Montserrat, sans-serif",
                          fontSize: "0.75rem",
                          textAlign: "left",
                          padding: 0,
                        }}
                      >
                        {sitePhotoDeletingId === photo._id ? "Deleting..." : "Delete"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {documentsModal === "add-document" && (
        <div
          role="presentation"
          onClick={() => setDocumentsModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 55,
            padding: "1rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="documents-add-doc-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--surface-panel)",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
              maxWidth: "28rem",
              width: "100%",
              maxHeight: "92vh",
              overflow: "auto",
            }}
          >
            <h2
              id="documents-add-doc-title"
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: "1rem",
              }}
            >
              New document
            </h2>
            <form
              onSubmit={handleAddDocument}
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              <input
                type="text"
                placeholder="Document name"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                style={{ width: "100%" }}
              />
              <select
                value={newDocType}
                onChange={(e) => setNewDocType(e.target.value)}
                style={{ width: "100%" }}
              >
                {DOC_TYPES.map((ty) => (
                  <option key={ty.value} value={ty.value}>{ty.label}</option>
                ))}
              </select>
              <select
                value={newDocFolderId}
                onChange={(e) => setNewDocFolderId((e.target.value as Id<"documentFolders">) || "")}
                style={{ width: "100%" }}
              >
                <option value="">No folder</option>
                {(documentFolders ?? []).map((folder: Doc<"documentFolders">) => (
                  <option key={folder._id} value={folder._id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <fieldset
                style={{
                  border: "1px solid var(--border-strong)",
                  borderRadius: "0.5rem",
                  padding: "0.75rem",
                  display: "grid",
                  gap: "0.55rem",
                }}
              >
                <legend style={{ padding: "0 0.25rem", color: "var(--text-secondary)", fontSize: "0.82rem", fontWeight: 600 }}>
                  Compliance / expiry tracking
                </legend>
                <select
                  value={newDocComplianceCategory}
                  onChange={(e) => setNewDocComplianceCategory(e.target.value as ComplianceCategory | "")}
                  style={{ width: "100%" }}
                >
                  <option value="">Do not track expiry</option>
                  {COMPLIANCE_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
                <select
                  value={newDocSubtradeId}
                  onChange={(e) => setNewDocSubtradeId((e.target.value as Id<"projectSubtrades">) || "")}
                  style={{ width: "100%" }}
                >
                  <option value="">No subtrade association</option>
                  {(subtrades ?? [])
                    .slice()
                    .sort((a: Doc<"projectSubtrades">, b: Doc<"projectSubtrades">) => a.name.localeCompare(b.name))
                    .map((subtrade: Doc<"projectSubtrades">) => (
                      <option key={subtrade._id} value={subtrade._id}>
                        {subtrade.name}
                      </option>
                    ))}
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    Issue date
                    <input
                      type="date"
                      value={newDocIssueDate}
                      onChange={(e) => setNewDocIssueDate(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    Expiry date
                    <input
                      type="date"
                      value={newDocExpiryDate}
                      onChange={(e) => setNewDocExpiryDate(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </label>
                </div>
              </fieldset>
              <input
                type="url"
                placeholder="File URL (link)"
                value={newDocUrl}
                onChange={(e) => {
                  setNewDocUrl(e.target.value);
                  setNewDocStorageId(null);
                }}
                style={{ width: "100%" }}
              />
              {fileUploadError ? (
                <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.8rem" }}>{fileUploadError}</p>
              ) : null}
              <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>or upload a file</span>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  flexWrap: "wrap",
                  rowGap: "0.25rem",
                  maxWidth: "100%",
                }}
              >
                <input
                  type="file"
                  disabled={docUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setDocUploading(true);
                    setNewDocUrl("");
                    await handleFileUpload(file, setNewDocStorageId, () => setDocUploading(false));
                    e.target.value = "";
                  }}
                  style={{ fontFamily: "Montserrat, sans-serif" }}
                />
                {docUploading ? "Uploading..." : newDocStorageId ? "OK File ready" : "Upload from computer"}
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => setDocumentsModal(null)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "var(--surface-panel)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    fontFamily: "Montserrat, sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    backgroundColor: "#059669",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editingComplianceDocId && (
        <div
          role="presentation"
          onClick={() => setEditingComplianceDocId(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 55,
            padding: "1rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="documents-edit-compliance-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--surface-panel)",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
              maxWidth: "28rem",
              width: "100%",
              maxHeight: "92vh",
              overflow: "auto",
            }}
          >
            <h2
              id="documents-edit-compliance-title"
              style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem" }}
            >
              Edit compliance tracking
              <DocumentSaveStatusChip
                saveStatus={complianceAutosave.saveStatus}
                lastSavedAt={complianceAutosave.lastSavedAt}
                error={complianceAutosave.error}
              />
            </h2>
            <form onSubmit={saveComplianceDoc} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <input
                type="text"
                placeholder="Document name"
                value={editComplianceName}
                onChange={(e) => setEditComplianceName(e.target.value)}
                style={{ width: "100%" }}
              />
              <select
                value={editComplianceCategory}
                onChange={(e) => setEditComplianceCategory(e.target.value as ComplianceCategory | "")}
                style={{ width: "100%" }}
              >
                <option value="">Do not track expiry</option>
                {COMPLIANCE_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
              <select
                value={editComplianceSubtradeId}
                onChange={(e) => setEditComplianceSubtradeId((e.target.value as Id<"projectSubtrades">) || "")}
                style={{ width: "100%" }}
              >
                <option value="">No subtrade association</option>
                {(subtrades ?? [])
                  .slice()
                  .sort((a: Doc<"projectSubtrades">, b: Doc<"projectSubtrades">) => a.name.localeCompare(b.name))
                  .map((subtrade: Doc<"projectSubtrades">) => (
                    <option key={subtrade._id} value={subtrade._id}>
                      {subtrade.name}
                    </option>
                  ))}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Issue date
                  <input
                    type="date"
                    value={editComplianceIssueDate}
                    onChange={(e) => setEditComplianceIssueDate(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Expiry date
                  <input
                    type="date"
                    value={editComplianceExpiryDate}
                    onChange={(e) => setEditComplianceExpiryDate(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </label>
              </div>
              <input
                type="url"
                placeholder="New file URL (optional)"
                value={editComplianceFileUrl}
                onChange={(e) => {
                  setEditComplianceFileUrl(e.target.value);
                  setEditComplianceStorageId(null);
                }}
                style={{ width: "100%" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.875rem", flexWrap: "wrap" }}>
                <input
                  type="file"
                  disabled={editComplianceUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setEditComplianceUploading(true);
                    setEditComplianceFileUrl("");
                    await handleFileUpload(file, setEditComplianceStorageId, () => setEditComplianceUploading(false));
                    e.target.value = "";
                  }}
                  style={{ fontFamily: "Montserrat, sans-serif" }}
                />
                {editComplianceUploading ? "Uploading..." : editComplianceStorageId ? "OK File ready" : "Replace file from computer"}
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => setEditingComplianceDocId(null)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "var(--surface-panel)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    fontFamily: "Montserrat, sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    backgroundColor: "#059669",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {documentsModal === "new-folder" && (
        <div
          role="presentation"
          onClick={() => setDocumentsModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 55,
            padding: "1rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="documents-new-folder-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--surface-panel)",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
              maxWidth: "24rem",
              width: "100%",
            }}
          >
            <h2
              id="documents-new-folder-title"
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: "1rem",
              }}
            >
              New folder
            </h2>
            <form onSubmit={handleCreateDocumentFolder} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <input
                type="text"
                placeholder="Folder name"
                value={newDocumentFolderName}
                onChange={(e) => setNewDocumentFolderName(e.target.value)}
                disabled={documentFolderCreating}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setDocumentsModal(null)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "var(--surface-panel)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    fontFamily: "Montserrat, sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={documentFolderCreating || !newDocumentFolderName.trim()}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    backgroundColor: "#0f766e",
                    color: "#fff",
                    border: "none",
                    cursor: documentFolderCreating ? "not-allowed" : "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  {documentFolderCreating ? "Creating…" : "Create folder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sitePhotoTagModal && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 56,
          }}
          onClick={cancelSitePhotoTagModal}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancelSitePhotoTagModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-photo-tag-modal-title"
            style={{
              backgroundColor: "var(--surface-panel)",
              borderRadius: "0.75rem",
              padding: "1rem",
              width: "100%",
              maxWidth: "24rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
              margin: "0.75rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="site-photo-tag-modal-title" style={{ margin: 0, fontSize: "1rem", color: "var(--text-primary)" }}>
              {sitePhotoTagModal.mode === "upload" ? "Tag site photos" : "Edit photo tags"}
            </h3>
            {sitePhotoTagModal.mode === "upload" ? (
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                {sitePhotoTagModal.files.length} file{sitePhotoTagModal.files.length === 1 ? "" : "s"} selected. Tags apply
                to each photo.
              </p>
            ) : null}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Area on site
              <input
                value={sitePhotoTagArea}
                onChange={(e) => setSitePhotoTagArea(e.target.value)}
                placeholder="e.g. Level 2 east corridor"
                style={{
                  borderRadius: "0.45rem",
                  border: "1px solid var(--border-strong)",
                  padding: "0.45rem 0.55rem",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "0.875rem",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Trade
              <select
                value={sitePhotoTagTradeId}
                onChange={(e) => setSitePhotoTagTradeId(e.target.value)}
                style={{
                  borderRadius: "0.45rem",
                  border: "1px solid var(--border-strong)",
                  padding: "0.45rem 0.55rem",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "0.875rem",
                }}
              >
                <option value="">—</option>
                {(subtrades ?? []).map((s: Doc<"projectSubtrades">) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Date
              <input
                type="date"
                value={sitePhotoTagDate}
                onChange={(e) => setSitePhotoTagDate(e.target.value)}
                style={{
                  borderRadius: "0.45rem",
                  border: "1px solid var(--border-strong)",
                  padding: "0.45rem 0.55rem",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "0.875rem",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Category
              <select
                value={sitePhotoTagCategory}
                onChange={(e) => setSitePhotoTagCategory(e.target.value as SitePhotoCategory | "")}
                style={{
                  borderRadius: "0.45rem",
                  border: "1px solid var(--border-strong)",
                  padding: "0.45rem 0.55rem",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "0.875rem",
                }}
              >
                {sitePhotoTagModal.mode === "upload" ? <option value="">Select…</option> : <option value="">— None —</option>}
                {SITE_PHOTO_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {SITE_PHOTO_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            {sitePhotoTagModal.mode === "upload" ? (
              <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)" }}>Category is required to upload.</p>
            ) : null}
            {sitePhotoTagError ? <div style={{ color: "#b91c1c", fontSize: "0.82rem" }}>{sitePhotoTagError}</div> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
              <button
                type="button"
                onClick={cancelSitePhotoTagModal}
                disabled={savingSitePhotoTags}
                style={{
                  padding: "0.4rem 0.85rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "var(--surface-panel)",
                  fontSize: "0.85rem",
                  fontFamily: "Montserrat, sans-serif",
                  cursor: savingSitePhotoTags ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmSitePhotoTagModal()}
                disabled={savingSitePhotoTags}
                style={{
                  padding: "0.4rem 0.85rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #047857",
                  backgroundColor: "#059669",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  fontFamily: "Montserrat, sans-serif",
                  cursor: savingSitePhotoTags ? "not-allowed" : "pointer",
                }}
              >
                {savingSitePhotoTags
                  ? "Saving…"
                  : sitePhotoTagModal.mode === "upload"
                    ? "Upload"
                    : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {newSitePhotoFolderModalOpen && (
        <div
          role="presentation"
          onClick={() => setNewSitePhotoFolderModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 56,
            padding: "1rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--surface-panel)",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              maxWidth: "24rem",
              width: "100%",
              border: "1px solid var(--border-strong)",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "1rem", color: "var(--text-primary)" }}>
              New site photo folder
            </h2>
            <form onSubmit={handleCreateSitePhotoFolder} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <input
                type="text"
                placeholder="Folder name"
                value={newSitePhotoFolderName}
                onChange={(e) => setNewSitePhotoFolderName(e.target.value)}
                disabled={sitePhotoFolderCreating}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setNewSitePhotoFolderModalOpen(false)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border-strong)",
                    backgroundColor: "var(--surface-panel)",
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sitePhotoFolderCreating}
                  style={{
                    padding: "0.45rem 0.9rem",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    backgroundColor: "#059669",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sitePhotoPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={sitePhotoPreview.title}
          onClick={() => setSitePhotoPreview(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 15000,
            minHeight: "100vh",
            backgroundColor: "rgba(15, 23, 42, 0.88)",
            display: "flex",
            flexDirection: "column",
            padding: "0.5rem",
            boxSizing: "border-box",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexShrink: 0,
              padding: "0.35rem 0.25rem 0.5rem",
            }}
          >
            <div
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#f8fafc",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {sitePhotoPreview.title}
            </div>
            <button
              type="button"
              onClick={() => setSitePhotoPreview(null)}
              aria-label="Close preview"
              style={{
                flexShrink: 0,
                border: "1px solid rgba(248, 250, 252, 0.35)",
                backgroundColor: "rgba(30, 41, 59, 0.6)",
                color: "#f8fafc",
                borderRadius: "0.5rem",
                padding: "0.35rem 0.75rem",
                fontFamily: "Montserrat, sans-serif",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.5rem",
              overflow: "hidden",
              backgroundColor: "rgba(0,0,0,0.25)",
            }}
          >
            {sitePhotoPreview.variant === "image" ? (
              sitePhotoPreviewLoadError ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    maxWidth: "24rem",
                    padding: "1.25rem",
                    backgroundColor: "var(--surface-panel)",
                    borderRadius: "0.75rem",
                    border: "1px solid var(--border-strong)",
                    fontFamily: "Montserrat, sans-serif",
                    color: "var(--text-primary)",
                  }}
                >
                  <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                    This photo could not be displayed. Check your connection, reload the project page for a fresh link,
                    or try again.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSitePhotoPreviewLoadError(false);
                        setSitePhotoImgRetry((k) => k + 1);
                      }}
                      style={{ ...primaryButtonStyle, fontSize: "0.85rem" }}
                    >
                      Try again
                    </button>
                    <button
                      type="button"
                      onClick={() => setSitePhotoPreview(null)}
                      style={{ ...secondaryButtonStyle, fontSize: "0.85rem" }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <img
                  key={`${sitePhotoPreview.fileUrl}-${sitePhotoImgRetry}`}
                  src={sitePhotoPreview.fileUrl}
                  alt={sitePhotoPreview.title}
                  draggable={false}
                  onClick={(e) => e.stopPropagation()}
                  onError={() => setSitePhotoPreviewLoadError(true)}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "calc(100vh - 5rem)",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                  }}
                />
              )
            ) : sitePhotoPreview.variant === "pdf" ? (
              <iframe
                title={sitePhotoPreview.title}
                src={sitePhotoPreview.fileUrl}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: "min(70vh, 640px)",
                  border: "none",
                  backgroundColor: "#fff",
                }}
              />
            ) : (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "24rem",
                  padding: "1.25rem",
                  backgroundColor: "var(--surface-panel)",
                  borderRadius: "0.75rem",
                  border: "1px solid var(--border-strong)",
                  fontFamily: "Montserrat, sans-serif",
                  color: "var(--text-primary)",
                }}
              >
                <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                  This file type cannot be previewed in the app.
                </p>
                <button
                  type="button"
                  onClick={() => setSitePhotoPreview(null)}
                  style={{ ...primaryButtonStyle, fontSize: "0.85rem" }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
          <p
            style={{
              margin: 0,
              padding: "0.35rem 0.25rem 0",
              fontSize: "0.72rem",
              color: "rgba(248, 250, 252, 0.65)",
              fontFamily: "Montserrat, sans-serif",
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            Press Escape or click outside to close
          </p>
        </div>
      )}

      <DocumentVersionHistoryModal
        open={historyDoc != null}
        document={historyDoc}
        onClose={() => setHistoryDoc(null)}
      />
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.type === "delete-project" ? "Delete project?" : "Are you sure?"}
        confirmLabel={confirmAction?.type === "delete-project" ? "Delete project" : "Yes, continue"}
        loading={confirmRunning}
        message={
          confirmAction ? (
            <>
              {confirmActionMessage(confirmAction)}
              {confirmError ? (
                <div style={{ marginTop: "0.65rem", color: "#b91c1c", fontWeight: 600 }}>{confirmError}</div>
              ) : null}
            </>
          ) : null
        }
        onCancel={() => {
          if (confirmRunning) return;
          setConfirmAction(null);
          setConfirmError(null);
        }}
        onConfirm={async () => {
          const action = confirmAction;
          if (!action || confirmRunning) return;
          setConfirmRunning(true);
          setConfirmError(null);
          try {
            await runConfirmAction(action);
            setConfirmAction(null);
            setConfirmError(null);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Could not complete this action.";
            setConfirmError(msg);
            console.error("Confirm action failed:", err);
          } finally {
            setConfirmRunning(false);
          }
        }}
      />
    </div>
  );
}
