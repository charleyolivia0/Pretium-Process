import { useState, useMemo, Fragment, useEffect } from "react";
import { projectQueryArgs, asProjectId } from "../lib/projectQueryArgs";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CorFormModal } from "../components/CorFormModal";
import { CoFormModal } from "../components/CoFormModal";
import { RfiFormModal } from "../components/RfiFormModal";
import { PcnFormModal } from "../components/PcnFormModal";
import { GenericChangeFormModal } from "../components/GenericChangeFormModal";
import type { ChangeFormType } from "../lib/changeFormTemplate";
import { FolderPlusIcon } from "../components/FolderPlusIcon";
import { projectSectionHref } from "./projectDetail/projectSectionPaths";
import { dateInputValueToTimestamp, timestampToDateInputValue } from "../utils/dateInput";
import { isPcnCorApproved } from "../lib/changeDocStatus";
import { buildCoFormFromChangeDoc } from "../lib/coFromChangeDoc";
import type { CoFormData } from "../lib/coPdf";
import { DocumentVersionHistoryModal } from "../components/DocumentVersionHistoryModal";
import { useDocumentAutosave } from "../hooks/useDocumentAutosave";
import { DocumentSaveStatusChip } from "../components/DocumentSaveStatusChip";

const SLUG_TO_TYPE: Record<string, "RFI" | "SI" | "COR" | "CO" | "PCN" | "SUBMITTAL" | "PO"> = {
  rfi: "RFI",
  submittal: "SUBMITTAL",
  co: "CO",
  pcn: "PCN",
  si: "SI",
  cor: "COR",
  po: "PO",
};

const TYPE_LABELS: Record<string, string> = {
  RFI: "RFI",
  SUBMITTAL: "Submittal",
  CO: "Change order",
  PCN: "PCN",
  SI: "Site Instruction",
  COR: "COR",
  PO: "Purchase Order",
};

const REMINDER_OPTIONS = [
  { value: "", label: "None" },
  { value: "3", label: "3 days" },
  { value: "5", label: "5 days" },
  { value: "7", label: "1 week" },
  { value: "14", label: "2 weeks" },
] as const;

function workflowStatusDisplay(d: Doc<"documents">): string {
  const ws = d.workflowStatus;
  if (ws === "draft") return "Draft";
  if (ws === "open" || (ws == null && d.status === "unpaid")) return "Open";
  if (ws === "closed") return "Closed";
  if (ws === "approved") return "Approved";
  if (ws === "approved_as_noted") return "Approved as noted";
  if (ws === "rejected") return "Rejected";
  if (d.status === "paid") return "Paid";
  return ws ?? d.status ?? "—";
}

function managerNames(
  d: Doc<"documents">,
  usersForAssignment: { _id: Id<"users">; name?: string | null }[] | undefined,
): string {
  const ids = (d.ballInCourtUserIds?.length ? d.ballInCourtUserIds : d.assigneeUserIds) ?? [];
  if (ids.length === 0) return "—";
  return ids
    .map((uid) => usersForAssignment?.find((u) => u._id === uid)?.name ?? "Unknown")
    .join(", ");
}

function descriptionCell(d: Doc<"documents">): string {
  const desc = d.description?.trim();
  if (desc) return desc;
  const trade = d.tradeName?.trim();
  if (trade) return trade;
  return "—";
}

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

function folderLabelPill(
  folderId: Id<"documentFolders"> | undefined,
  folders: Doc<"documentFolders">[] | undefined,
) {
  if (!folderId) return null;
  const name = folders?.find((f) => f._id === folderId)?.name ?? "Folder";
  return (
    <span
      style={{
        color: "#374151",
        fontSize: "0.75rem",
        background: "#f3f4f6",
        padding: "0.1rem 0.4rem",
        borderRadius: "999px",
      }}
    >
      {name}
    </span>
  );
}

export type ProjectChangesKindWorkspaceProps = { projectId: string; kindSlug: string };

export function ProjectChangesKindWorkspace({ projectId, kindSlug }: ProjectChangesKindWorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const docType = kindSlug ? SLUG_TO_TYPE[kindSlug.toLowerCase()] : undefined;
  const label = docType ? TYPE_LABELS[docType] ?? docType : "";

  const project = useQuery(api.projects.getProjectById, projectQueryArgs(projectId));
  const subtrades = useQuery(api.subtrades.listByProject, projectQueryArgs(projectId));
  const documents = useQuery(api.documents.listDocumentsByProject, projectQueryArgs(projectId));
  const me = useQuery(api.users.current, {});
  const usersForAssignment = useQuery(api.users.listUsersForAssignment);
  const documentFolders = useQuery(
    api.documents.listDocumentFoldersByProject,
    projectQueryArgs(projectId),
  );
  const createDocument = useMutation(api.documents.createDocumentRecord);
  const createDocumentFolder = useMutation(api.documents.createDocumentFolder);
  const updateDocument = useMutation(api.documents.updateDocumentRecord);
  const deleteDocument = useMutation(api.documents.deleteDocumentRecord);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const submitRfiResponse = useMutation(api.documents.submitRfiResponse);
  const submitSubmittalResponse = useMutation(api.documents.submitSubmittalResponse);
  const personalReminders = useQuery(
    api.notifications.listPersonalRemindersForProject,
    projectId && me ? { projectId: projectId as Id<"projects"> } : "skip",
  );
  const setDocumentPersonalReminder = useMutation(api.notifications.setDocumentPersonalReminder);

  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newTradeName, setNewTradeName] = useState("");
  const [newStatus, setNewStatus] = useState<"paid" | "unpaid">("unpaid");
  const [newDate, setNewDate] = useState("");
  const [newAssigneeUserIds, setNewAssigneeUserIds] = useState<Id<"users">[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newStorageId, setNewStorageId] = useState<Id<"_storage"> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newDocFolderId, setNewDocFolderId] = useState<Id<"documentFolders"> | "">("");
  const [newDocumentFolderName, setNewDocumentFolderName] = useState("");
  const [documentFolderCreating, setDocumentFolderCreating] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [activeDocId, setActiveDocId] = useState<Id<"documents"> | null>(null);
  const [rfiResponseComment, setRfiResponseComment] = useState("");
  const [rfiResponseUrl, setRfiResponseUrl] = useState("");
  const [submittalResponseOption, setSubmittalResponseOption] = useState<"approved" | "approved_as_noted" | "revise_and_resubmit" | "rejected">("approved");
  const [submittalResponseComment, setSubmittalResponseComment] = useState("");
  const [submittalResponseUrl, setSubmittalResponseUrl] = useState("");
  const [submittingResponse, setSubmittingResponse] = useState(false);

  const [editingDocId, setEditingDocId] = useState<Id<"documents"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editTradeName, setEditTradeName] = useState("");
  const [editStatus, setEditStatus] = useState<"paid" | "unpaid">("unpaid");
  const [editDate, setEditDate] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editStorageId, setEditStorageId] = useState<Id<"_storage"> | null>(null);
  const [editUploading, setEditUploading] = useState(false);
  const [editFolderId, setEditFolderId] = useState<Id<"documentFolders"> | "">("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<"documents"> | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string>("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [corModalOpen, setCorModalOpen] = useState(false);
  const [corModalEditDoc, setCorModalEditDoc] = useState<Doc<"documents"> | null>(null);
  const [coModalOpen, setCoModalOpen] = useState(false);
  const [coModalEditDoc, setCoModalEditDoc] = useState<Doc<"documents"> | null>(null);
  const [coModalInitialForm, setCoModalInitialForm] = useState<CoFormData | null>(null);
  const [coModalMandatory, setCoModalMandatory] = useState(false);
  const [coModalSourceDocumentId, setCoModalSourceDocumentId] = useState<Id<"documents"> | null>(null);
  const [rfiModalOpen, setRfiModalOpen] = useState(false);
  const [rfiModalEditDoc, setRfiModalEditDoc] = useState<Doc<"documents"> | null>(null);
  const [pcnModalOpen, setPcnModalOpen] = useState(false);
  const [pcnModalEditDoc, setPcnModalEditDoc] = useState<Doc<"documents"> | null>(null);
  const [genericModalOpen, setGenericModalOpen] = useState(false);
  const [genericModalEditDoc, setGenericModalEditDoc] = useState<Doc<"documents"> | null>(null);
  const [historyDoc, setHistoryDoc] = useState<Doc<"documents"> | null>(null);
  /** Per-document notes while editing inline (cleared on blur after save). */
  const [notesLocal, setNotesLocal] = useState<Record<string, string>>({});
  /** Optimistic reminder dropdown values while saving / before query refreshes. */
  const [reminderLocal, setReminderLocal] = useState<Record<string, string>>({});
  const [reminderSavingId, setReminderSavingId] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  /** Optimistic status dropdown values while saving / before query refreshes. */
  const [statusLocal, setStatusLocal] = useState<Record<string, "paid" | "unpaid">>({});
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const isCorPage = docType === "COR";
  const isCoPage = docType === "CO";
  const isRfiPage = docType === "RFI";
  const isPcnPage = docType === "PCN";
  const isSiPage = docType === "SI";
  const isSubmittalPage = docType === "SUBMITTAL";
  const isPoPage = docType === "PO";
  const isGenericKind = isSiPage || isSubmittalPage || isPoPage;
  const isPcnOrCorPage = isPcnPage || isCorPage;
  const genericKindType: Extract<ChangeFormType, "si" | "submittal" | "po"> | null = isSiPage
    ? "si"
    : isSubmittalPage
      ? "submittal"
      : isPoPage
        ? "po"
        : null;

  function resetCoModalExtras() {
    setCoModalInitialForm(null);
    setCoModalMandatory(false);
    setCoModalSourceDocumentId(null);
  }

  function openCoModalManual(editDoc: Doc<"documents"> | null = null) {
    setCoModalEditDoc(editDoc);
    resetCoModalExtras();
    setCoModalOpen(true);
  }

  function openCoModalForApproval(priorDoc: Doc<"documents">) {
    const linkedCo =
      (documents ?? []).find(
        (doc) => doc.sourceDocumentId === priorDoc._id && doc.type.toUpperCase() === "CO",
      ) ?? null;
    setCoModalEditDoc(linkedCo);
    setCoModalInitialForm(linkedCo ? null : buildCoFormFromChangeDoc(priorDoc, project?.name ?? ""));
    setCoModalMandatory(true);
    setCoModalSourceDocumentId(priorDoc._id);
    setCoModalOpen(true);
  }

  function openAddForKind() {
    if (isCorPage) {
      setCorModalEditDoc(null);
      setCorModalOpen(true);
    } else if (isCoPage) {
      openCoModalManual(null);
    } else if (isRfiPage) {
      setRfiModalEditDoc(null);
      setRfiModalOpen(true);
    } else if (isPcnPage) {
      setPcnModalEditDoc(null);
      setPcnModalOpen(true);
    } else if (isGenericKind) {
      setGenericModalEditDoc(null);
      setGenericModalOpen(true);
    } else {
      setAddModalOpen(true);
    }
  }

  useEffect(() => {
    if (searchParams.get("openAdd") !== "1") return;
    openAddForKind();
    const next = new URLSearchParams(searchParams);
    next.delete("openAdd");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, isCorPage, isCoPage, isRfiPage, isPcnPage, isGenericKind]);

  const workflowResponses = useQuery(
    api.documents.listDocumentWorkflowResponses,
    activeDocId ? { documentId: activeDocId } : "skip"
  );

  const tradeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const s of subtrades ?? []) {
      const n = s.name.trim();
      if (n) names.add(n);
    }
    for (const raw of project?.subtradeList ?? []) {
      const n = raw.trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [subtrades, project]);

  const remindersByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const reminder of personalReminders ?? []) {
      map.set(String(reminder.documentId), reminder.intervalDays);
    }
    return map;
  }, [personalReminders]);

  useEffect(() => {
    setReminderLocal((local) => {
      if (Object.keys(local).length === 0) return local;
      const next = { ...local };
      let changed = false;
      for (const id of Object.keys(next)) {
        const server = remindersByDocId.get(id);
        const serverStr = server != null ? String(server) : "";
        if (next[id] === serverStr) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : local;
    });
  }, [remindersByDocId]);

  const items = useMemo(() => {
    if (!docType) return [] as Doc<"documents">[];
    return (documents ?? []).filter((d) => d.type.toUpperCase() === docType);
  }, [documents, docType]);

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          (b.workflowDueDate ?? b.createdDate ?? b.uploadedAt) -
          (a.workflowDueDate ?? a.createdDate ?? a.uploadedAt),
      ),
    [items],
  );

  useEffect(() => {
    setStatusLocal((local) => {
      if (Object.keys(local).length === 0) return local;
      const next = { ...local };
      let changed = false;
      for (const id of Object.keys(next)) {
        const doc = items.find((d) => String(d._id) === id);
        if (!doc) continue;
        const serverStatus = doc.status === "paid" || doc.workflowStatus === "closed" ? "paid" : "unpaid";
        if (next[id] === serverStatus) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : local;
    });
  }, [items]);

  if (!projectId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>No project selected.</p>
      </div>
    );
  }

  const convexProjectId = projectId as Id<"projects">;

  if (!docType) {
    return null;
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Project not found.</p>
        <Link to="/projects" style={{ color: "#059669" }}>Back to projects</Link>
      </div>
    );
  }

  const isWorkflowDoc = docType === "RFI" || docType === "SUBMITTAL";

  const draftItems = isWorkflowDoc ? items.filter((d) => d.workflowStatus === "draft") : [];
  const openItems = isWorkflowDoc
    ? items.filter((d) => d.workflowStatus === "open" || (d.workflowStatus == null && d.status === "unpaid"))
    : [];
  const closedItems = isWorkflowDoc
    ? items.filter(
        (d) =>
          d.workflowStatus === "closed" ||
          d.workflowStatus === "approved" ||
          d.workflowStatus === "approved_as_noted" ||
          d.workflowStatus === "rejected" ||
          d.status === "paid",
      )
    : [];

  const unpaidItems = !isWorkflowDoc
    ? items.filter((d) => {
        const s = d.status as string | undefined;
        return s === "unpaid" || s === "open" || s == null;
      })
    : [];
  const paidItems = !isWorkflowDoc
    ? items.filter((d) => {
        const s = d.status as string | undefined;
        return s === "paid" || s === "closed";
      })
    : [];
  const showEditForm = editingDocId != null && items.some((d) => d._id === editingDocId);

  const inlineEditPayload = useMemo(
    () => JSON.stringify({ name: editName, tradeName: editTradeName }),
    [editName, editTradeName],
  );
  const inlineAutosave = useDocumentAutosave({
    documentId: editingDocId,
    enabled: !!editingDocId && !!editName.trim(),
    payload: inlineEditPayload,
    draft: {
      name: editName.trim() || undefined,
      tradeName: editTradeName.trim() || undefined,
    },
  });

  const totalApprovedCount = isWorkflowDoc ? closedItems.length : paidItems.length;
  const totalPendingCount = isWorkflowDoc ? draftItems.length + openItems.length : unpaidItems.length;

  const myUserId = me?._id as Id<"users"> | undefined;

  function reminderSelectValue(rowId: string): string {
    if (rowId in reminderLocal) return reminderLocal[rowId];
    const server = remindersByDocId.get(rowId);
    return server != null ? String(server) : "";
  }

  function rowStatusValue(d: Doc<"documents">): "paid" | "unpaid" {
    const rowId = String(d._id);
    if (rowId in statusLocal) return statusLocal[rowId];
    return d.status === "paid" || d.workflowStatus?.toLowerCase() === "closed" ? "paid" : "unpaid";
  }

  async function handleInlineStatusChange(doc: Doc<"documents">, newStatus: "paid" | "unpaid") {
    const rowId = String(doc._id);
    const previous = rowStatusValue(doc);
    if (newStatus === previous) return;

    setStatusError(null);
    setStatusLocal((m) => ({ ...m, [rowId]: newStatus }));
    setStatusSavingId(rowId);
    const wasPending = isPcnOrCorPage && !isPcnCorApproved(doc.status);
    const nowApproved = newStatus === "paid";

    try {
      await updateDocument({
        documentId: doc._id,
        status: newStatus,
      });
      if (isPcnOrCorPage && wasPending && nowApproved) {
        openCoModalForApproval(doc);
      }
    } catch (err) {
      setStatusLocal((m) => ({ ...m, [rowId]: previous }));
      setStatusError(err instanceof Error ? err.message : "Failed to save status");
    } finally {
      setStatusSavingId((current) => (current === rowId ? null : current));
    }
  }

  async function handleReminderChange(documentId: Id<"documents">, value: string) {
    const rowId = String(documentId);
    const previous = reminderSelectValue(rowId);
    setReminderError(null);
    setReminderLocal((m) => ({ ...m, [rowId]: value }));
    setReminderSavingId(rowId);
    const intervalDays =
      value === "3"
        ? 3
        : value === "5"
          ? 5
          : value === "7"
            ? 7
            : value === "14"
              ? 14
              : null;
    try {
      await setDocumentPersonalReminder({
        documentId,
        intervalDays: intervalDays as 3 | 5 | 7 | 14 | null,
      });
    } catch (err) {
      setReminderLocal((m) => ({ ...m, [rowId]: previous }));
      setReminderError(err instanceof Error ? err.message : "Failed to save reminder");
    } finally {
      setReminderSavingId((current) => (current === rowId ? null : current));
    }
  }

  async function handleCreateDocumentFolder(e: React.FormEvent) {
    e.preventDefault();
    const folderName = newDocumentFolderName.trim();
    if (!folderName) return;
    setDocumentFolderCreating(true);
    try {
      const createdFolderId = await createDocumentFolder({
        projectId: convexProjectId,
        name: folderName,
      });
      setNewDocumentFolderName("");
      setNewDocFolderId(createdFolderId);
    } finally {
      setDocumentFolderCreating(false);
    }
  }

  async function handleFileUpload(
    file: File,
    setStorageId: (id: Id<"_storage"> | null) => void,
    onDone: () => void
  ) {
    try {
      setUploadError(null);
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      setStorageId(storageId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      onDone();
    }
  }

  async function saveDocNotesBlur(d: Doc<"documents">, value: string) {
    const id = String(d._id);
    const server = d.description?.trim() ?? "";
    if (value.trim() !== server) {
      await updateDocument({
        documentId: d._id,
        description: value.trim(),
      });
    }
    setNotesLocal((m) => {
      if (m[id] === undefined) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  function resetAddFormFields() {
    setNewTitle("");
    setNewNotes("");
    setNewTradeName("");
    setNewDate("");
    setNewUrl("");
    setNewStorageId(null);
    setNewAssigneeUserIds([]);
    setNewStatus("unpaid");
    setNewDocFolderId("");
    setNewDocumentFolderName("");
  }

  function closeAddModal() {
    setAddModalOpen(false);
    resetAddFormFields();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!docType || !newTitle.trim() || !newDate) return;
    if (!newStorageId && !newUrl.trim()) return;

    if (docType === "SUBMITTAL" && newAssigneeUserIds.length === 0) return;
    const createdMs = dateInputValueToTimestamp(newDate);
    if (createdMs === undefined) return;

    const tradePatch = newTradeName.trim() ? { tradeName: newTradeName.trim() } : {};
    const notesPatch = newNotes.trim() ? { description: newNotes.trim() } : {};

    if (isWorkflowDoc) {
      const workflowAssignees: Id<"users">[] =
        docType === "SUBMITTAL"
          ? newAssigneeUserIds
          : (() => {
              const fallback = (project?.pmId ?? project?.coordinatorId ?? me?._id) as Id<"users"> | undefined;
              return fallback ? [fallback] : [];
            })();

      await createDocument({
        projectId: convexProjectId,
        type: docType,
        name: newTitle.trim(),
        ...(newDocFolderId ? { folderId: newDocFolderId } : {}),
        ...(newStorageId ? { storageId: newStorageId } : { fileUrl: newUrl.trim() }),
        status: "unpaid",
        createdDate: createdMs,
        workflowStatus: "open",
        workflowDueDate: createdMs,
        assigneeUserIds: workflowAssignees,
        ballInCourtUserIds: workflowAssignees,
        ...tradePatch,
        ...notesPatch,
      });
    } else {
      await createDocument({
        projectId: convexProjectId,
        type: docType,
        name: newTitle.trim(),
        ...(newDocFolderId ? { folderId: newDocFolderId } : {}),
        ...(newStorageId ? { storageId: newStorageId } : { fileUrl: newUrl.trim() }),
        status: newStatus,
        createdDate: createdMs,
        ...tradePatch,
        ...notesPatch,
      });
    }
    setAddModalOpen(false);
    resetAddFormFields();
  }

  function startEdit(doc: {
    _id: Id<"documents">;
    name: string;
    status?: string;
    createdDate?: number;
    uploadedAt: number;
    tradeName?: string | null;
    folderId?: Id<"documentFolders">;
    workflowStatus?: string;
    workflowDueDate?: number;
  }) {
    setEditingDocId(doc._id);
    setEditName(doc.name);
    setEditTradeName(doc.tradeName?.trim() ?? "");
    setEditFolderId(doc.folderId ?? "");

    if (isWorkflowDoc) {
      const ws = doc.workflowStatus;
      setEditStatus((ws === "closed" ? "paid" : "unpaid") as "paid" | "unpaid");
    } else {
      setEditStatus((doc.status === "paid" || doc.status === "closed" ? "paid" : "unpaid") as "paid" | "unpaid");
    }

    setEditDate(timestampToDateInputValue(doc.workflowDueDate ?? doc.createdDate ?? doc.uploadedAt));
    setEditUrl("");
    setEditStorageId(null);
  }

  function cancelEdit() {
    setEditingDocId(null);
    setEditTradeName("");
    setEditFolderId("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDocId || !editName.trim() || !editDate) return;
    const createdMs = dateInputValueToTimestamp(editDate);
    if (createdMs === undefined) return;

    const priorDoc = items.find((d) => d._id === editingDocId);
    const wasPending = isPcnOrCorPage && priorDoc != null && !isPcnCorApproved(priorDoc.status);
    const nowApproved = editStatus === "paid";

    await updateDocument({
      documentId: editingDocId,
      name: editName.trim(),
      status: editStatus,
      createdDate: createdMs,
      tradeName: editTradeName.trim() || "",
      ...(isWorkflowDoc ? { workflowDueDate: createdMs, workflowStatus: editStatus === "paid" ? "closed" : "open" } : {}),
      ...(editStorageId ? { storageId: editStorageId } : editUrl.trim() ? { fileUrl: editUrl.trim() } : {}),
      ...(!isWorkflowDoc ? { folderId: editFolderId ? editFolderId : null } : {}),
    });
    setEditingDocId(null);
    setEditTradeName("");
    setEditFolderId("");

    if (isPcnOrCorPage && wasPending && nowApproved && priorDoc) {
      openCoModalForApproval(priorDoc);
    }
  }

  function handleDelete(docId: Id<"documents">, name?: string) {
    setConfirmDeleteId(docId);
    setConfirmDeleteName(name ?? "");
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "0 0 0.75rem 0" }}>
        {project?.name ?? "Loading…"} · {label}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
        <div
          style={{
            flex: "1 1 140px",
            minWidth: "120px",
            borderRadius: "0.75rem",
            backgroundColor: "var(--color-emerald-800)",
            color: "#fff",
            padding: "0.85rem 1rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "0.72rem", opacity: 0.95, marginBottom: "0.25rem" }}>Total Changes</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>{items.length}</div>
          <div style={{ fontSize: "0.7rem", opacity: 0.85, marginTop: "0.2rem" }} aria-hidden>★</div>
        </div>
        <div
          style={{
            flex: "1 1 140px",
            minWidth: "120px",
            borderRadius: "0.75rem",
            backgroundColor: "var(--color-emerald-800)",
            color: "#fff",
            padding: "0.85rem 1rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "0.72rem", opacity: 0.95, marginBottom: "0.25rem" }}>Total Approved</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>{totalApprovedCount}</div>
          <div style={{ fontSize: "0.7rem", opacity: 0.85, marginTop: "0.2rem" }} aria-hidden>★</div>
        </div>
        <div
          style={{
            flex: "1 1 140px",
            minWidth: "120px",
            borderRadius: "0.75rem",
            backgroundColor: "var(--color-emerald-800)",
            color: "#fff",
            padding: "0.85rem 1rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "0.72rem", opacity: 0.95, marginBottom: "0.25rem" }}>Total Pending</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>{totalPendingCount}</div>
          <div style={{ fontSize: "0.7rem", opacity: 0.85, marginTop: "0.2rem" }} aria-hidden>★</div>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          borderRadius: "0.75rem",
          border: "2px solid var(--color-emerald-800)",
          backgroundColor: "var(--surface-card)",
          padding: "1rem",
          paddingTop: "2.75rem",
        }}
      >
        <button
          type="button"
          onClick={openAddForKind}
          title={`Add ${label}`}
          aria-label={`Add ${label}`}
          style={{
            position: "absolute",
            top: "0.75rem",
            right: "0.75rem",
            width: "2.35rem",
            height: "2.35rem",
            borderRadius: "0.5rem",
            border: "none",
            backgroundColor: "#059669",
            color: "#fff",
            fontWeight: 700,
            fontSize: "1.25rem",
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          +
        </button>

        <div
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "var(--text-secondary)",
            marginBottom: "0.65rem",
            letterSpacing: "0.02em",
          }}
        >
          Change · Date · Manager · Status · Amount · Description{docType === "RFI" ? " · Notes" : ""}
        </div>

        {documents === undefined ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>Loading...</p>
        ) : (
          <>
            {showEditForm && (
              <form onSubmit={saveEdit} style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "var(--surface-muted)", borderRadius: "0.5rem", display: "grid", gap: "0.35rem", fontSize: "0.8125rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>Edit document</span>
                  <DocumentSaveStatusChip
                    saveStatus={inlineAutosave.saveStatus}
                    lastSavedAt={inlineAutosave.lastSavedAt}
                    error={inlineAutosave.error}
                  />
                </div>
                <input type="text" placeholder="Title" value={editName} onChange={(e) => setEditName(e.target.value)} />
                <div>
                  <label style={{ display: "block", marginBottom: "0.2rem", color: "#6b7280", fontSize: "0.75rem" }}>
                    Trade (optional)
                  </label>
                  <select
                    value={editTradeName}
                    onChange={(e) => setEditTradeName(e.target.value)}
                    disabled={tradeOptions.length === 0}
                    style={{
                      width: "100%",
                      padding: "0.35rem 0.5rem",
                      borderRadius: "0.4rem",
                      border: "1px solid #e5e7eb",
                      fontFamily: "Montserrat, sans-serif",
                      opacity: tradeOptions.length === 0 ? 0.7 : 1,
                      cursor: tradeOptions.length === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    <option value="">- Select trade (optional) -</option>
                    {editTradeName.trim() && !tradeOptions.includes(editTradeName.trim()) ? (
                      <option value={editTradeName.trim()}>{editTradeName.trim()}</option>
                    ) : null}
                    {tradeOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.2rem", color: "#6b7280", fontSize: "0.75rem" }}>
                    Folder (optional)
                  </label>
                  <select
                    value={editFolderId}
                    onChange={(e) => setEditFolderId((e.target.value as Id<"documentFolders">) || "")}
                    style={{
                      width: "100%",
                      padding: "0.35rem 0.5rem",
                      borderRadius: "0.4rem",
                      border: "1px solid #e5e7eb",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    <option value="">No folder</option>
                    {(documentFolders ?? []).map((folder: Doc<"documentFolders">) => (
                      <option key={folder._id} value={folder._id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as "paid" | "unpaid")} style={{ flex: 1 }}>
                    {isPcnOrCorPage ? (
                      <>
                        <option value="unpaid">Pending</option>
                        <option value="paid">Approved</option>
                      </>
                    ) : (
                      <>
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                      </>
                    )}
                  </select>
                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={{ flex: 1 }} />
                </div>
                <input type="url" placeholder="New file URL (optional)" value={editUrl} onChange={(e) => { setEditUrl(e.target.value); setEditStorageId(null); }} />
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    cursor: "pointer",
                    flexWrap: "wrap",
                    rowGap: "0.25rem",
                    maxWidth: "100%",
                  }}
                >
                  <input
                    type="file"
                    disabled={editUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setEditUploading(true);
                      setEditUrl("");
                    setUploadError(null);
                      await handleFileUpload(file, setEditStorageId, () => setEditUploading(false));
                      e.target.value = "";
                    }}
                  />
                  {editUploading ? "Uploading..." : editStorageId ? "✓ New file ready" : "Or upload new file"}
                </label>
                {uploadError ? (
                  <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.78rem" }}>{uploadError}</p>
                ) : null}
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button type="submit" style={{ padding: "0.4rem 0.75rem", borderRadius: "0.4rem", border: "none", backgroundColor: "#059669", color: "#fff", fontWeight: 600, fontSize: "0.8125rem", cursor: "pointer", fontFamily: "Montserrat, sans-serif" }}>Save</button>
                  <button type="button" onClick={cancelEdit} style={{ padding: "0.4rem 0.75rem", borderRadius: "0.4rem", border: "1px solid #6b7280", color: "#6b7280", background: "none", fontSize: "0.8125rem", cursor: "pointer", fontFamily: "Montserrat, sans-serif" }}>Cancel</button>
                </div>
              </form>
            )}
            {sortedItems.length === 0 ? (
              <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>None yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                {reminderError ? (
                  <p style={{ color: "#dc2626", fontSize: "0.75rem", margin: "0 0 0.5rem" }}>{reminderError}</p>
                ) : null}
                {statusError ? (
                  <p style={{ color: "#dc2626", fontSize: "0.75rem", margin: "0 0 0.5rem" }}>{statusError}</p>
                ) : null}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-strong)" }}>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Change</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Date</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Manager</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Status</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Amount</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Description</th>
                      {docType === "RFI" ? <th style={{ padding: "0.35rem 0.5rem" }}>Notes</th> : null}
                      <th style={{ padding: "0.35rem 0.5rem" }}>Reminder</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((d) => {
                      const rowId = String(d._id);
                      const notesValue = notesLocal[rowId] ?? d.description ?? "";
                      const isBallInCourt = myUserId != null && (d.ballInCourtUserIds ?? []).some((uid: Id<"users">) => uid === myUserId);
                      const dateMs = d.workflowDueDate ?? d.createdDate ?? d.uploadedAt;
                      const btnBase = {
                        padding: "0.2rem 0.45rem",
                        fontSize: "0.7rem",
                        borderRadius: "0.25rem",
                        cursor: "pointer" as const,
                        fontFamily: "Montserrat, sans-serif" as const,
                      };
                      return (
                        <Fragment key={d._id}>
                          <tr style={{ borderBottom: "1px solid var(--border-strong)", verticalAlign: "top" }}>
                            <td style={{ padding: "0.45rem 0.5rem" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
                                <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#059669", textDecoration: "none", fontWeight: 600 }}>
                                  {d.name}
                                </a>
                                {folderLabelPill(d.folderId, documentFolders ?? [])}
                              </div>
                            </td>
                            <td style={{ padding: "0.45rem 0.5rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(dateMs)}</td>
                            <td style={{ padding: "0.45rem 0.5rem" }}>{managerNames(d, usersForAssignment)}</td>
                            <td
                              style={{ padding: "0.35rem 0.5rem", verticalAlign: "top", minWidth: "6.5rem" }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              {isWorkflowDoc ? (
                                workflowStatusDisplay(d)
                              ) : (
                                <select
                                  value={rowStatusValue(d)}
                                  disabled={
                                    statusSavingId === rowId ||
                                    (coModalMandatory && coModalSourceDocumentId === d._id)
                                  }
                                  onChange={(e) =>
                                    void handleInlineStatusChange(d, e.target.value as "paid" | "unpaid")
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  style={{
                                    width: "100%",
                                    minWidth: "6rem",
                                    boxSizing: "border-box",
                                    borderRadius: "0.45rem",
                                    border: "1px solid var(--border-subtle)",
                                    padding: "0.35rem 0.4rem",
                                    fontSize: "0.75rem",
                                    fontFamily: "Montserrat, sans-serif",
                                    color: "var(--text-primary)",
                                    backgroundColor: "var(--surface-panel)",
                                    cursor:
                                      statusSavingId === rowId ||
                                      (coModalMandatory && coModalSourceDocumentId === d._id)
                                        ? "not-allowed"
                                        : "pointer",
                                    opacity: statusSavingId === rowId ? 0.7 : 1,
                                  }}
                                >
                                  {isPcnOrCorPage ? (
                                    <>
                                      <option value="unpaid">Pending</option>
                                      <option value="paid">Approved</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="unpaid">Unpaid</option>
                                      <option value="paid">Paid</option>
                                    </>
                                  )}
                                </select>
                              )}
                            </td>
                            <td style={{ padding: "0.45rem 0.5rem", color: "var(--text-secondary)" }}>—</td>
                            <td style={{ padding: "0.45rem 0.5rem", color: "var(--text-secondary)", maxWidth: "14rem", wordBreak: "break-word" }}>
                              {docType === "RFI" ? (d.tradeName?.trim() || "—") : descriptionCell(d)}
                            </td>
                            {docType === "RFI" ? (
                              <td
                                style={{ padding: "0.35rem 0.5rem", verticalAlign: "top", minWidth: "10rem" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <textarea
                                  value={notesValue}
                                  onChange={(e) =>
                                    setNotesLocal((m) => ({ ...m, [rowId]: e.target.value }))
                                  }
                                  onBlur={(e) => void saveDocNotesBlur(d, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  placeholder="Notes…"
                                  rows={2}
                                  style={{
                                    width: "100%",
                                    minWidth: "8rem",
                                    boxSizing: "border-box",
                                    borderRadius: "0.45rem",
                                    border: "1px solid var(--border-subtle)",
                                    padding: "0.4rem",
                                    fontSize: "0.75rem",
                                    fontFamily: "Montserrat, sans-serif",
                                    color: "var(--text-primary)",
                                    backgroundColor: "var(--surface-panel)",
                                    resize: "vertical",
                                  }}
                                />
                              </td>
                            ) : null}
                            <td
                              style={{ padding: "0.35rem 0.5rem", verticalAlign: "top", minWidth: "6.5rem" }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <select
                                value={reminderSelectValue(rowId)}
                                disabled={!me || reminderSavingId === rowId}
                                onChange={(e) => void handleReminderChange(d._id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                style={{
                                  width: "100%",
                                  minWidth: "6rem",
                                  boxSizing: "border-box",
                                  borderRadius: "0.45rem",
                                  border: "1px solid var(--border-subtle)",
                                  padding: "0.35rem 0.4rem",
                                  fontSize: "0.75rem",
                                  fontFamily: "Montserrat, sans-serif",
                                  color: "var(--text-primary)",
                                  backgroundColor: "var(--surface-panel)",
                                  cursor: !me || reminderSavingId === rowId ? "not-allowed" : "pointer",
                                  opacity: reminderSavingId === rowId ? 0.7 : 1,
                                }}
                              >
                                {REMINDER_OPTIONS.map((option) => (
                                  <option key={option.value || "none"} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: "0.45rem 0.5rem" }}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", alignItems: "center" }}>
                                {isRfiPage ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRfiModalEditDoc(d);
                                        setRfiModalOpen(true);
                                      }}
                                      style={{ ...btnBase, border: "1px solid #059669", color: "#059669", background: "none" }}
                                    >
                                      Edit form
                                    </button>
                                    <button type="button" onClick={() => setHistoryDoc(d)} style={{ ...btnBase, border: "1px solid #6b7280", color: "#6b7280", background: "none" }}>
                                      History
                                    </button>
                                    <button type="button" onClick={() => handleDelete(d._id, d.name)} style={{ ...btnBase, border: "1px solid #dc2626", color: "#dc2626", background: "none" }}>
                                      Delete
                                    </button>
                                  </>
                                ) : isWorkflowDoc ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDocId(d._id);
                                        setRfiResponseComment("");
                                        setRfiResponseUrl("");
                                        setSubmittalResponseComment("");
                                        setSubmittalResponseUrl("");
                                        setSubmittalResponseOption("approved");
                                      }}
                                      style={{ ...btnBase, border: "1px solid #059669", color: "#059669", background: "none" }}
                                    >
                                      Responses
                                    </button>
                                    {isBallInCourt ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveDocId(d._id);
                                          setRfiResponseComment("");
                                          setRfiResponseUrl("");
                                          setSubmittalResponseComment("");
                                          setSubmittalResponseUrl("");
                                          setSubmittalResponseOption("approved");
                                        }}
                                        style={{ ...btnBase, border: "none", color: "#fff", backgroundColor: "#059669" }}
                                      >
                                        Respond
                                      </button>
                                    ) : null}
                                    <button type="button" onClick={() => setHistoryDoc(d)} style={{ ...btnBase, border: "1px solid #6b7280", color: "#6b7280", background: "none" }}>
                                      History
                                    </button>
                                    <button type="button" onClick={() => handleDelete(d._id, d.name)} style={{ ...btnBase, border: "1px solid #dc2626", color: "#dc2626", background: "none" }}>
                                      Delete
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {isCorPage ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCorModalEditDoc(d);
                                          setCorModalOpen(true);
                                        }}
                                        style={{ ...btnBase, border: "1px solid #059669", color: "#059669", background: "none" }}
                                      >
                                        Edit form
                                      </button>
                                    ) : null}
                                    {isCoPage ? (
                                      <button
                                        type="button"
                                        onClick={() => openCoModalManual(d)}
                                        style={{ ...btnBase, border: "1px solid #059669", color: "#059669", background: "none" }}
                                      >
                                        Edit form
                                      </button>
                                    ) : null}
                                    {isPcnPage ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPcnModalEditDoc(d);
                                          setPcnModalOpen(true);
                                        }}
                                        style={{ ...btnBase, border: "1px solid #059669", color: "#059669", background: "none" }}
                                      >
                                        Edit form
                                      </button>
                                    ) : null}
                                    {isGenericKind && d.formData ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setGenericModalEditDoc(d);
                                          setGenericModalOpen(true);
                                        }}
                                        style={{ ...btnBase, border: "1px solid #059669", color: "#059669", background: "none" }}
                                      >
                                        Edit form
                                      </button>
                                    ) : null}
                                    <button type="button" onClick={() => startEdit(d)} style={{ ...btnBase, border: "1px solid #059669", color: "#059669", background: "none" }}>
                                      Edit
                                    </button>
                                    <button type="button" onClick={() => setHistoryDoc(d)} style={{ ...btnBase, border: "1px solid #6b7280", color: "#6b7280", background: "none" }}>
                                      History
                                    </button>
                                    <button type="button" onClick={() => handleDelete(d._id, d.name)} style={{ ...btnBase, border: "1px solid #dc2626", color: "#dc2626", background: "none" }}>
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          {activeDocId === d._id && isWorkflowDoc ? (
                            <tr>
                              <td colSpan={docType === "RFI" ? 9 : 8} style={{ padding: "0.65rem 0.5rem", background: "var(--surface-muted)" }}>
                                {isBallInCourt && docType === "RFI" ? (
                                  <form
                                    onSubmit={async (e) => {
                                      e.preventDefault();
                                      if (!activeDocId) return;
                                      if (submittingResponse) return;
                                      setSubmittingResponse(true);
                                      try {
                                        await submitRfiResponse({
                                          documentId: activeDocId,
                                          comment: rfiResponseComment.trim() || undefined,
                                          responseUrl: rfiResponseUrl.trim() || undefined,
                                        });
                                        setActiveDocId(null);
                                      } finally {
                                        setSubmittingResponse(false);
                                      }
                                    }}
                                    style={{ marginBottom: "0.5rem", padding: "0.5rem", background: "var(--surface-card)", borderRadius: "0.5rem", display: "grid", gap: "0.35rem" }}
                                  >
                                    <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 600 }}>Submit RFI response</div>
                                    <textarea
                                      placeholder="Response notes (optional)"
                                      value={rfiResponseComment}
                                      onChange={(e) => setRfiResponseComment(e.target.value)}
                                      style={{ width: "100%", minHeight: "3rem", resize: "vertical", fontFamily: "Montserrat, sans-serif", borderRadius: "0.4rem", border: "1px solid #e5e7eb", padding: "0.4rem 0.6rem" }}
                                    />
                                    <input
                                      type="url"
                                      placeholder="Response URL (optional)"
                                      value={rfiResponseUrl}
                                      onChange={(e) => setRfiResponseUrl(e.target.value)}
                                      style={{ width: "100%", borderRadius: "0.4rem", border: "1px solid #e5e7eb", padding: "0.4rem 0.6rem", fontFamily: "Montserrat, sans-serif" }}
                                    />
                                    <button type="submit" disabled={submittingResponse} style={{ padding: "0.4rem 0.75rem", borderRadius: "0.4rem", border: "none", backgroundColor: "#059669", color: "#fff", fontWeight: 600, fontSize: "0.8125rem", cursor: "pointer", fontFamily: "Montserrat, sans-serif" }}>
                                      {submittingResponse ? "Submitting..." : "Submit response"}
                                    </button>
                                  </form>
                                ) : null}

                                {isBallInCourt && docType === "SUBMITTAL" ? (
                                  <form
                                    onSubmit={async (e) => {
                                      e.preventDefault();
                                      if (!activeDocId) return;
                                      if (submittingResponse) return;
                                      setSubmittingResponse(true);
                                      try {
                                        await submitSubmittalResponse({
                                          documentId: activeDocId,
                                          responseOption: submittalResponseOption,
                                          comment: submittalResponseComment.trim() || undefined,
                                          responseUrl: submittalResponseUrl.trim() || undefined,
                                        });
                                        setActiveDocId(null);
                                      } finally {
                                        setSubmittingResponse(false);
                                      }
                                    }}
                                    style={{ marginBottom: "0.5rem", padding: "0.5rem", background: "var(--surface-card)", borderRadius: "0.5rem", display: "grid", gap: "0.35rem" }}
                                  >
                                    <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 600 }}>Submit submittal response</div>
                                    <select
                                      value={submittalResponseOption}
                                      onChange={(e) => setSubmittalResponseOption(e.target.value as "approved" | "approved_as_noted" | "revise_and_resubmit" | "rejected")}
                                      style={{ width: "100%", borderRadius: "0.4rem", border: "1px solid #e5e7eb", padding: "0.4rem 0.6rem", fontFamily: "Montserrat, sans-serif" }}
                                    >
                                      <option value="approved">Approved</option>
                                      <option value="approved_as_noted">Approved as noted</option>
                                      <option value="revise_and_resubmit">Revise and resubmit</option>
                                      <option value="rejected">Rejected</option>
                                    </select>
                                    <textarea
                                      placeholder="Response notes (optional)"
                                      value={submittalResponseComment}
                                      onChange={(e) => setSubmittalResponseComment(e.target.value)}
                                      style={{ width: "100%", minHeight: "3rem", resize: "vertical", fontFamily: "Montserrat, sans-serif", borderRadius: "0.4rem", border: "1px solid #e5e7eb", padding: "0.4rem 0.6rem" }}
                                    />
                                    <input
                                      type="url"
                                      placeholder="Response URL (optional)"
                                      value={submittalResponseUrl}
                                      onChange={(e) => setSubmittalResponseUrl(e.target.value)}
                                      style={{ width: "100%", borderRadius: "0.4rem", border: "1px solid #e5e7eb", padding: "0.4rem 0.6rem", fontFamily: "Montserrat, sans-serif" }}
                                    />
                                    <button type="submit" disabled={submittingResponse} style={{ padding: "0.4rem 0.75rem", borderRadius: "0.4rem", border: "none", backgroundColor: "#059669", color: "#fff", fontWeight: 600, fontSize: "0.8125rem", cursor: "pointer", fontFamily: "Montserrat, sans-serif" }}>
                                      {submittingResponse ? "Submitting..." : "Submit response"}
                                    </button>
                                  </form>
                                ) : null}

                                <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 600, marginBottom: "0.25rem" }}>Response history</div>
                                {workflowResponses ? (
                                  workflowResponses.length === 0 ? (
                                    <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: 0 }}>No responses yet.</p>
                                  ) : (
                                    <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                                      {workflowResponses.map((r: any) => (
                                        <li key={r._id} style={{ marginBottom: "0.35rem", color: "var(--text-primary)" }}>
                                          <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                                            {r.responseOption === "rfi_responded"
                                              ? "Responded"
                                              : r.responseOption === "approved"
                                                ? "Approved"
                                                : r.responseOption === "approved_as_noted"
                                                  ? "Approved as noted"
                                                  : r.responseOption === "revise_and_resubmit"
                                                    ? "Revise and resubmit"
                                                    : r.responseOption === "rejected"
                                                      ? "Rejected"
                                                      : r.responseOption}
                                            {" "}
                                            <span style={{ fontWeight: 500, color: "#6b7280" }}>· {r.responderName ?? "Unknown"}</span>
                                          </div>
                                          {r.comment ? <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>{r.comment}</div> : null}
                                        </li>
                                      ))}
                                    </ul>
                                  )
                                ) : (
                                  <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: 0 }}>Loading...</p>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <CorFormModal
        open={corModalOpen}
        projectId={projectId as Id<"projects">}
        projectName={project?.name ?? ""}
        existingDoc={corModalEditDoc}
        onClose={() => {
          setCorModalOpen(false);
          setCorModalEditDoc(null);
        }}
        onSaved={() => {
          setCorModalOpen(false);
          setCorModalEditDoc(null);
        }}
      />

      <CoFormModal
        open={coModalOpen}
        projectId={projectId as Id<"projects">}
        projectName={project?.name ?? ""}
        existingDoc={coModalEditDoc}
        initialForm={coModalInitialForm}
        sourceDocumentId={coModalSourceDocumentId}
        mandatory={coModalMandatory}
        onClose={() => {
          setCoModalOpen(false);
          setCoModalEditDoc(null);
          resetCoModalExtras();
        }}
        onSaved={() => {
          setCoModalOpen(false);
          setCoModalEditDoc(null);
          resetCoModalExtras();
        }}
      />

      <RfiFormModal
        open={rfiModalOpen}
        projectId={projectId as Id<"projects">}
        projectName={project?.name ?? ""}
        existingDoc={rfiModalEditDoc}
        onClose={() => {
          setRfiModalOpen(false);
          setRfiModalEditDoc(null);
        }}
        onSaved={() => {
          setRfiModalOpen(false);
          setRfiModalEditDoc(null);
        }}
      />

      <PcnFormModal
        open={pcnModalOpen}
        projectId={projectId as Id<"projects">}
        projectName={project?.name ?? ""}
        existingDoc={pcnModalEditDoc}
        onClose={() => {
          setPcnModalOpen(false);
          setPcnModalEditDoc(null);
        }}
        onSaved={() => {
          setPcnModalOpen(false);
          setPcnModalEditDoc(null);
        }}
      />

      {genericKindType ? (
        <GenericChangeFormModal
          open={genericModalOpen}
          type={genericKindType}
          projectId={projectId as Id<"projects">}
          projectName={project?.name ?? ""}
          existingDoc={genericModalEditDoc}
          templatesHref={`/projects/${projectId}/changes/templates`}
          onClose={() => {
            setGenericModalOpen(false);
            setGenericModalEditDoc(null);
          }}
          onSaved={() => {
            setGenericModalOpen(false);
            setGenericModalEditDoc(null);
          }}
        />
      ) : null}

      {addModalOpen && !isCorPage && !isCoPage && !isRfiPage && !isPcnPage && !isGenericKind && (
        <div
          role="presentation"
          onClick={closeAddModal}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "1rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-doc-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--surface-panel)",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
              maxWidth: "30rem",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <h2
                id="add-doc-modal-title"
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                Add {label}
              </h2>
              <button
                type="button"
                onClick={closeAddModal}
                style={{
                  padding: "0.25rem 0.5rem",
                  borderRadius: "0.375rem",
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
            </div>
            <form onSubmit={handleAdd} style={{ marginBottom: "1rem", display: "grid", gap: "0.35rem", fontSize: "0.8125rem" }}>
              <input
                type="text"
                placeholder="Title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={{ padding: "0.4rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e5e7eb", fontFamily: "Montserrat, sans-serif" }}
              />
              <div>
                <label style={{ display: "block", marginBottom: "0.2rem", color: "#6b7280", fontSize: "0.75rem" }}>
                  Trade (optional)
                </label>
                <select
                  value={newTradeName}
                  onChange={(e) => setNewTradeName(e.target.value)}
                  disabled={tradeOptions.length === 0}
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "0.4rem",
                    border: "1px solid #e5e7eb",
                    fontFamily: "Montserrat, sans-serif",
                    opacity: tradeOptions.length === 0 ? 0.7 : 1,
                    cursor: tradeOptions.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  <option value="">- Select trade (optional) -</option>
                  {tradeOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {tradeOptions.length === 0 ? (
                  <p style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem", marginBottom: 0 }}>
                    No trades on this project yet. Add them on the{" "}
                    <Link to={projectSectionHref(projectId, "subtrades")} style={{ color: "#059669" }}>
                      Subtrades
                    </Link>{" "}
                    tab to pick from this list.
                  </p>
                ) : null}
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.2rem", color: "#6b7280", fontSize: "0.75rem" }}>
                  Folder (optional)
                </label>
                <select
                  value={newDocFolderId}
                  onChange={(e) => setNewDocFolderId((e.target.value as Id<"documentFolders">) || "")}
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "0.4rem",
                    border: "1px solid #e5e7eb",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  <option value="">No folder</option>
                  {(documentFolders ?? []).map((folder: Doc<"documentFolders">) => (
                    <option key={folder._id} value={folder._id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>
              {isWorkflowDoc ? (
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e5e7eb", fontFamily: "Montserrat, sans-serif" }}
                  />
                  {docType === "SUBMITTAL" ? (
                    <select
                      multiple
                      value={newAssigneeUserIds as unknown as string[]}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((o) => o.value as Id<"users">);
                        setNewAssigneeUserIds(selected);
                      }}
                      style={{ width: "100%", minHeight: "7rem", padding: "0.4rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e5e7eb", fontFamily: "Montserrat, sans-serif" }}
                    >
                      {(usersForAssignment ?? []).map((u: { _id: Id<"users">; name?: string | null }) => (
                        <option key={u._id} value={u._id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ) : (
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as "paid" | "unpaid")}
                    style={{ flex: 1, padding: "0.4rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e5e7eb", fontFamily: "Montserrat, sans-serif" }}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    style={{ flex: 1, padding: "0.4rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e5e7eb", fontFamily: "Montserrat, sans-serif" }}
                  />
                </div>
              )}
              <input
                type="url"
                placeholder="File URL (link)"
                value={newUrl}
                onChange={(e) => { setNewUrl(e.target.value); setNewStorageId(null); }}
                style={{ padding: "0.4rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e5e7eb", fontFamily: "Montserrat, sans-serif" }}
              />
              <label
                style={{
                  fontSize: "0.8125rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  cursor: "pointer",
                  flexWrap: "wrap",
                  rowGap: "0.25rem",
                  maxWidth: "100%",
                }}
              >
                <input
                  type="file"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    setNewUrl("");
                    setUploadError(null);
                    await handleFileUpload(file, setNewStorageId, () => setUploading(false));
                    e.target.value = "";
                  }}
                />
                {uploading ? "Uploading..." : newStorageId ? "✓ File ready" : "Or upload from computer"}
              </label>
              {uploadError ? (
                <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.78rem" }}>{uploadError}</p>
              ) : null}
              <button
                type="submit"
                style={{ alignSelf: "flex-start", marginTop: "0.25rem", padding: "0.4rem 0.75rem", borderRadius: "0.4rem", border: "none", backgroundColor: "#059669", color: "#fff", fontWeight: 600, fontSize: "0.8125rem", cursor: "pointer", fontFamily: "Montserrat, sans-serif" }}
              >
                Add {label}
              </button>
            </form>
            <form onSubmit={handleCreateDocumentFolder} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="New folder name"
                value={newDocumentFolderName}
                onChange={(e) => setNewDocumentFolderName(e.target.value)}
                disabled={documentFolderCreating}
                style={{ flex: "1 1 12rem", minWidth: "8rem", padding: "0.4rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e5e7eb", fontFamily: "Montserrat, sans-serif" }}
              />
              <button
                type="submit"
                aria-label={documentFolderCreating ? "Creating folder" : "Create folder"}
                title={documentFolderCreating ? "Creating folder" : "Create folder"}
                disabled={documentFolderCreating || !newDocumentFolderName.trim()}
                style={{
                  padding: "0.45rem",
                  minWidth: "2.35rem",
                  minHeight: "2.35rem",
                  borderRadius: "0.4rem",
                  fontWeight: 600,
                  backgroundColor: "#0f766e",
                  color: "#fff",
                  border: "none",
                  cursor: documentFolderCreating ? "not-allowed" : "pointer",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "0.8125rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ display: "inline-flex", opacity: documentFolderCreating ? 0.65 : 1 }}>
                  <FolderPlusIcon size={20} />
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
      <DocumentVersionHistoryModal
        open={historyDoc != null}
        document={historyDoc}
        onClose={() => setHistoryDoc(null)}
      />
      <ConfirmDialog
        open={confirmDeleteId !== null}
        confirmLabel="Yes, delete"
        message={
          <>
            This will permanently remove{" "}
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {confirmDeleteName || "this document"}
            </span>{" "}
            from the project.
          </>
        }
        onCancel={() => {
          setConfirmDeleteId(null);
          setConfirmDeleteName("");
        }}
        onConfirm={async () => {
          const idToDelete = confirmDeleteId;
          setConfirmDeleteId(null);
          setConfirmDeleteName("");
          if (!idToDelete) return;
          await deleteDocument({ documentId: idToDelete });
          if (editingDocId === idToDelete) setEditingDocId(null);
        }}
      />

    </div>
  );
}
