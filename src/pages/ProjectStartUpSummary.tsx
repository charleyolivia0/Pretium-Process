import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { StartUpDashboardLayout } from "../components/StartUpDashboardLayout";
import { secondaryButtonStyle } from "../theme";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LogoMark } from "../components/LogoMark";

const inputStyle = {
  width: "100%" as const,
  marginBottom: "0.75rem",
};

const labelStyle = {
  display: "block" as const,
  marginBottom: "0.25rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--text-secondary)",
};

function formatProjectDate(ts?: number | null): string {
  if (ts == null) return "Not set";
  return new Date(ts).toLocaleDateString();
}

const statusOptions = ["planning", "active", "substantial_completion", "closed"] as const;

function toDateInputValue(ts?: number | null): string {
  if (ts == null) return "";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(value: string): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d).getTime();
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function fmtBudgetAmount(n: number | null | undefined): string {
  return n != null && Number.isFinite(n) ? `$${n.toLocaleString()}` : "Not set";
}

function fmtQuoteAmount(n: number | null | undefined): string {
  return n != null && Number.isFinite(n) ? `$${n.toLocaleString()}` : "—";
}

function parseQuoteInput(raw: string): number | undefined {
  const trimmed = raw.trim().replace(/[$,]/g, "");
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function isDedicatedDocType(type: string): boolean {
  return ["PRIME_CONTRACT", "PERMIT"].includes(type.toUpperCase());
}

function expiryStatusLabel(expiryDate?: number): string {
  if (expiryDate == null) return "Not set";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days <= 30) return `Expires in ${days} day${days === 1 ? "" : "s"}`;
  return "Valid";
}

function formatContractStatus(status: string): string {
  if (status === "signed_by_subtrade") return "Signed by trade";
  if (status === "signed_by_justin") return "Signed by PPL";
  return "Unsigned";
}

const contractStatusOptions = ["unsigned", "signed_by_subtrade", "signed_by_justin"] as const;

const addPlusButtonStyle = {
  width: "1.6rem",
  height: "1.6rem",
  borderRadius: "0.4rem",
  border: "1px solid rgba(5, 150, 105, 0.3)",
  backgroundColor: "var(--surface-panel)",
  color: "var(--text-primary)",
  fontWeight: 700,
  lineHeight: 1,
  cursor: "pointer",
  display: "inline-flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  padding: 0,
};

export function ProjectStartUpSummary() {
  const navigate = useNavigate();
  const { id } = useParams();
  const projectId = id as Id<"projects"> | undefined;
  const project = useQuery(api.projects.getProjectById, projectId ? { projectId } : "skip");
  const usersForAssignment = useQuery(api.users.listUsersForAssignment);
  const updateProject = useMutation(api.projects.updateProject);
  const createDocumentRecord = useMutation(api.documents.createDocumentRecord);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const deleteProject = useMutation(api.projects.deleteProject);
  const subtrades = useQuery(api.subtrades.listByProject, projectId ? { projectId } : "skip");
  const projectDocuments = useQuery(
    api.documents.listDocumentsByProject,
    projectId ? { projectId } : "skip"
  );
  const createSubtrade = useMutation(api.subtrades.create);
  const updateSubtrade = useMutation(api.subtrades.update);

  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeMode, setTradeMode] = useState<"existing" | "new">("existing");
  const [existingTradeName, setExistingTradeName] = useState("");
  const [newTradeName, setNewTradeName] = useState("");
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [addingTrade, setAddingTrade] = useState(false);
  const [showEditSummaryModal, setShowEditSummaryModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [showAddStartUpDocModal, setShowAddStartUpDocModal] = useState(false);
  const [startupDocType, setStartupDocType] = useState("START_UP_DOC");
  const [startupDocFile, setStartupDocFile] = useState<File | null>(null);
  const [addingStartUpDoc, setAddingStartUpDoc] = useState(false);
  const [startupDocError, setStartupDocError] = useState<string | null>(null);
  const [showAddPrimeContractModal, setShowAddPrimeContractModal] = useState(false);
  const [primeContractName, setPrimeContractName] = useState("");
  const [primeContractFile, setPrimeContractFile] = useState<File | null>(null);
  const [addingPrimeContract, setAddingPrimeContract] = useState(false);
  const [primeContractError, setPrimeContractError] = useState<string | null>(null);
  const [showAddPermitModal, setShowAddPermitModal] = useState(false);
  const [permitName, setPermitName] = useState("");
  const [permitFile, setPermitFile] = useState<File | null>(null);
  const [addingPermit, setAddingPermit] = useState(false);
  const [permitError, setPermitError] = useState<string | null>(null);
  const [showEditTradeModal, setShowEditTradeModal] = useState(false);
  const [editingTradeId, setEditingTradeId] = useState<Id<"projectSubtrades"> | null>(null);
  const [editTradeQuote, setEditTradeQuote] = useState("");
  const [editTradeContractStatus, setEditTradeContractStatus] =
    useState<(typeof contractStatusOptions)[number]>("unsigned");
  const [editTradeSubcontractFile, setEditTradeSubcontractFile] = useState<File | null>(null);
  const [editTradeSubcontractUploading, setEditTradeSubcontractUploading] = useState(false);
  const [editTradeSubcontractStorageId, setEditTradeSubcontractStorageId] = useState<Id<"_storage"> | null>(null);
  const [editTradeInsuranceFile, setEditTradeInsuranceFile] = useState<File | null>(null);
  const [editTradeInsuranceExpiry, setEditTradeInsuranceExpiry] = useState("");
  const [tradeEditError, setTradeEditError] = useState<string | null>(null);
  const [savingTradeEdit, setSavingTradeEdit] = useState(false);
  const [showBudgetPlaceholderModal, setShowBudgetPlaceholderModal] = useState(false);
  const [editLocation, setEditLocation] = useState("");
  const [editPmId, setEditPmId] = useState<Id<"users"> | "">("");
  const [editCoordinatorId, setEditCoordinatorId] = useState<Id<"users"> | "">("");
  const [editSiteSuperId, setEditSiteSuperId] = useState<Id<"users"> | "">("");
  const [editPrincipalId, setEditPrincipalId] = useState<Id<"users"> | "">("");
  const [editAccountsPayableId, setEditAccountsPayableId] = useState<Id<"users"> | "">("");
  const [editSafetyMemberId, setEditSafetyMemberId] = useState<Id<"users"> | "">("");
  const [editStatus, setEditStatus] = useState<(typeof statusOptions)[number]>("planning");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const formReady = useMemo(() => {
    if (!project) return false;
    return true;
  }, [project]);
  const userNameById = useMemo(() => {
    const map = new Map<Id<"users">, string>();
    (usersForAssignment ?? []).forEach((u) => {
      map.set(u._id, u.name);
    });
    return map;
  }, [usersForAssignment]);
  const projectTradeNames = useMemo(
    () => (subtrades ?? []).map((s) => s.name).filter(Boolean),
    [subtrades]
  );
  const tradeTemplates = useMemo(() => {
    const fromLocal = (() => {
      try {
        const raw = window.localStorage.getItem("pretium.startupTradeTemplates");
        if (!raw) return [] as string[];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [] as string[];
        return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      } catch {
        return [] as string[];
      }
    })();
    const unique = new Set<string>([...fromLocal, ...projectTradeNames]);
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [projectTradeNames]);

  const startupDocsOnly = useMemo(
    () =>
      (projectDocuments ?? []).filter((d) => !isDedicatedDocType(d.type) && !d.complianceCategory),
    [projectDocuments]
  );

  const primeContractDocs = useMemo(
    () =>
      (projectDocuments ?? [])
        .filter((d) => d.type.toUpperCase() === "PRIME_CONTRACT")
        .sort((a, b) => b.uploadedAt - a.uploadedAt),
    [projectDocuments]
  );

  const permitDocs = useMemo(
    () =>
      (projectDocuments ?? [])
        .filter((d) => d.type.toUpperCase() === "PERMIT")
        .sort((a, b) => b.uploadedAt - a.uploadedAt),
    [projectDocuments]
  );

  const insuranceBySubtrade = useMemo(() => {
    const map = new Map<Id<"projectSubtrades">, Doc<"documents">>();
    for (const doc of projectDocuments ?? []) {
      if (doc.subtradeId && doc.complianceCategory === "insurance") {
        const existing = map.get(doc.subtradeId);
        if (!existing || doc.uploadedAt > existing.uploadedAt) {
          map.set(doc.subtradeId, doc);
        }
      }
    }
    return map;
  }, [projectDocuments]);

  useEffect(() => {
    if (!project || formReady === false || showEditSummaryModal) return;
    setEditLocation(project.location ?? "");
    setEditPmId(project.pmId ?? "");
    setEditCoordinatorId(project.coordinatorId ?? "");
    setEditSiteSuperId(project.siteSuperId ?? "");
    setEditPrincipalId(project.principalId ?? "");
    setEditAccountsPayableId(project.accountsPayableId ?? "");
    setEditSafetyMemberId(project.safetyMemberId ?? "");
    setEditStatus(project.status);
    setEditStartDate(toDateInputValue(project.startDate));
    setEditEndDate(toDateInputValue(project.endDate));
  }, [project, formReady, showEditSummaryModal]);

  function openEditSummaryModal() {
    if (!project) return;
    setEditError(null);
    setEditLocation(project.location ?? "");
    setEditPmId(project.pmId ?? "");
    setEditCoordinatorId(project.coordinatorId ?? "");
    setEditSiteSuperId(project.siteSuperId ?? "");
    setEditPrincipalId(project.principalId ?? "");
    setEditAccountsPayableId(project.accountsPayableId ?? "");
    setEditSafetyMemberId(project.safetyMemberId ?? "");
    setEditStatus(project.status);
    setEditStartDate(toDateInputValue(project.startDate));
    setEditEndDate(toDateInputValue(project.endDate));
    setShowEditSummaryModal(true);
  }

  function closeEditSummaryModal() {
    if (editSaving) return;
    setShowEditSummaryModal(false);
    setEditError(null);
  }

  async function handleSaveSummaryEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setEditError(null);
    setError(null);
    setSaveNotice(null);
    const parsedStartDate = fromDateInputValue(editStartDate);
    const parsedEndDate = fromDateInputValue(editEndDate);
    if (parsedStartDate === undefined) {
      setEditError("Please choose a valid start date.");
      return;
    }
    if (parsedEndDate === undefined) {
      setEditError("Please choose a valid end date.");
      return;
    }
    if (!statusOptions.includes(editStatus)) {
      setEditError("Please choose a valid status.");
      return;
    }
    const locationValue = editLocation.trim();
    const startupSummaryComplete =
      locationValue.length > 0 &&
      !!editPmId &&
      !!editCoordinatorId &&
      !!editSiteSuperId &&
      !!editPrincipalId &&
      !!editAccountsPayableId &&
      !!editSafetyMemberId;
    setEditSaving(true);
    try {
      await updateProject({
        projectId,
        location: locationValue || undefined,
        pmId: editPmId || null,
        coordinatorId: editCoordinatorId || null,
        siteSuperId: editSiteSuperId || null,
        principalId: editPrincipalId || null,
        accountsPayableId: editAccountsPayableId || null,
        safetyMemberId: editSafetyMemberId || null,
        status: editStatus,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        startupSummaryComplete,
      });
      setSaveNotice(
        startupSummaryComplete
          ? "Summary saved. This project appears under Startup queue on Project Start Up until you send it to Project Tracker."
          : "Draft saved. Add location, PM, PC, Site Super, Principal, Accounts payable, and Safety to complete the summary and list this project in the startup queue."
      );
      setShowEditSummaryModal(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save summary");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAddTrade(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setTradeError(null);
    const selectedName = (tradeMode === "existing" ? existingTradeName : newTradeName).trim();
    if (!selectedName) {
      setTradeError("Please choose a trade or enter a new trade name.");
      return;
    }
    if (projectTradeNames.some((name) => name.toLowerCase() === selectedName.toLowerCase())) {
      setTradeError("That trade is already in this project list.");
      return;
    }
    setAddingTrade(true);
    try {
      await createSubtrade({
        projectId,
        name: selectedName,
        contractStatus: "unsigned",
      });
      const updatedTemplates = Array.from(new Set([...tradeTemplates, selectedName])).sort((a, b) =>
        a.localeCompare(b)
      );
      window.localStorage.setItem("pretium.startupTradeTemplates", JSON.stringify(updatedTemplates));
      setExistingTradeName("");
      setNewTradeName("");
      setShowTradeModal(false);
    } catch (err) {
      setTradeError(err instanceof Error ? err.message : "Failed to add trade");
    } finally {
      setAddingTrade(false);
    }
  }

  function handleDeleteProject() {
    if (!projectId || !project || deleting) return;
    setConfirmDeleteProject(true);
  }

  async function confirmDeleteProjectAction() {
    if (!projectId || !project) return;
    setConfirmDeleteProject(false);
    setError(null);
    setDeleting(true);
    try {
      await deleteProject({ projectId });
      navigate("/project-start-up");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
      setDeleting(false);
    }
  }

  async function uploadFileToStorage(file: File): Promise<Id<"_storage">> {
    const uploadUrl = await generateUploadUrl();
    const res = await fetch(uploadUrl, { method: "POST", body: file });
    if (!res.ok) throw new Error("Upload failed");
    const body = (await res.json()) as { storageId?: string };
    if (!body.storageId) throw new Error("Upload failed");
    return body.storageId as Id<"_storage">;
  }

  async function handleCreatePrimeContract(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || addingPrimeContract) return;
    if (!primeContractFile) {
      setPrimeContractError("Please choose a file to upload.");
      return;
    }
    setPrimeContractError(null);
    setAddingPrimeContract(true);
    try {
      const storageId = await uploadFileToStorage(primeContractFile);
      await createDocumentRecord({
        projectId,
        type: "PRIME_CONTRACT",
        name: primeContractName.trim() || primeContractFile.name,
        storageId,
      });
      setShowAddPrimeContractModal(false);
      setPrimeContractName("");
      setPrimeContractFile(null);
    } catch (err) {
      setPrimeContractError(err instanceof Error ? err.message : "Failed to upload prime contract");
    } finally {
      setAddingPrimeContract(false);
    }
  }

  async function handleCreatePermit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || addingPermit) return;
    if (!permitFile) {
      setPermitError("Please choose a file to upload.");
      return;
    }
    setPermitError(null);
    setAddingPermit(true);
    try {
      const storageId = await uploadFileToStorage(permitFile);
      await createDocumentRecord({
        projectId,
        type: "PERMIT",
        name: permitName.trim() || permitFile.name,
        storageId,
      });
      setShowAddPermitModal(false);
      setPermitName("");
      setPermitFile(null);
    } catch (err) {
      setPermitError(err instanceof Error ? err.message : "Failed to upload permit");
    } finally {
      setAddingPermit(false);
    }
  }

  function openEditTradeModal(trade: Doc<"projectSubtrades">) {
    const insuranceDoc = insuranceBySubtrade.get(trade._id);
    setTradeEditError(null);
    setEditingTradeId(trade._id);
    setEditTradeQuote(trade.budget != null ? String(trade.budget) : "");
    setEditTradeContractStatus(trade.contractStatus);
    setEditTradeSubcontractFile(null);
    setEditTradeSubcontractStorageId(null);
    setEditTradeSubcontractUploading(false);
    setEditTradeInsuranceFile(null);
    setEditTradeInsuranceExpiry(insuranceDoc?.expiryDate ? toDateInputValue(insuranceDoc.expiryDate) : "");
    setShowEditTradeModal(true);
  }

  function closeEditTradeModal() {
    if (savingTradeEdit) return;
    setShowEditTradeModal(false);
    setEditingTradeId(null);
    setTradeEditError(null);
  }

  async function handleSaveTradeEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !editingTradeId || savingTradeEdit) return;
    setTradeEditError(null);

    if (editTradeQuote.trim()) {
      const parsed = parseQuoteInput(editTradeQuote);
      if (parsed === undefined) {
        setTradeEditError("Quote must be a valid number.");
        return;
      }
    }
    if (editTradeSubcontractUploading) {
      setTradeEditError("Please wait for file uploads to finish.");
      return;
    }
    if (editTradeInsuranceFile && !editTradeInsuranceExpiry) {
      setTradeEditError("Insurance expiry date is required when uploading insurance.");
      return;
    }
    const insuranceExpiryMs = fromDateInputValue(editTradeInsuranceExpiry);
    if (editTradeInsuranceFile && insuranceExpiryMs === undefined) {
      setTradeEditError("Please choose a valid insurance expiry date.");
      return;
    }

    setSavingTradeEdit(true);
    try {
      await updateSubtrade({
        subtradeId: editingTradeId,
        budget: parseQuoteInput(editTradeQuote),
        contractStatus: editTradeContractStatus,
        ...(editTradeSubcontractStorageId ? { storageId: editTradeSubcontractStorageId } : {}),
      });

      if (editTradeInsuranceFile && insuranceExpiryMs !== undefined) {
        const storageId = await uploadFileToStorage(editTradeInsuranceFile);
        const trade = subtrades?.find((s) => s._id === editingTradeId);
        await createDocumentRecord({
          projectId,
          type: "INSURANCE",
          name: `Insurance · ${trade?.name ?? "Trade"}`,
          storageId,
          complianceCategory: "insurance",
          subtradeId: editingTradeId,
          expiryDate: insuranceExpiryMs,
        });
      }

      setShowEditTradeModal(false);
      setEditingTradeId(null);
    } catch (err) {
      setTradeEditError(err instanceof Error ? err.message : "Failed to save trade");
    } finally {
      setSavingTradeEdit(false);
    }
  }

  async function handleEditTradeSubcontractUpload(file: File) {
    setEditTradeSubcontractUploading(true);
    setTradeEditError(null);
    try {
      const storageId = await uploadFileToStorage(file);
      setEditTradeSubcontractStorageId(storageId);
    } catch (err) {
      setTradeEditError(err instanceof Error ? err.message : "Subcontract upload failed");
      setEditTradeSubcontractStorageId(null);
    } finally {
      setEditTradeSubcontractUploading(false);
    }
  }

  async function handleCreateStartUpDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || addingStartUpDoc) return;
    const docType = startupDocType.trim();
    if (!docType) {
      setStartupDocError("Folder / type is required.");
      return;
    }
    if (!startupDocFile) {
      setStartupDocError("Please choose a file to upload.");
      return;
    }
    setStartupDocError(null);
    setAddingStartUpDoc(true);
    try {
      const storageId = await uploadFileToStorage(startupDocFile);
      await createDocumentRecord({
        projectId,
        type: docType,
        name: startupDocFile.name,
        storageId,
      });
      setShowAddStartUpDocModal(false);
      setStartupDocType("START_UP_DOC");
      setStartupDocFile(null);
    } catch (err) {
      setStartupDocError(err instanceof Error ? err.message : "Failed to add start up doc");
    } finally {
      setAddingStartUpDoc(false);
    }
  }

  if (!projectId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>Invalid project ID.</p>
        <Link to="/project-start-up" style={{ color: "#059669" }}>
          Back to Project Start Up
        </Link>
      </div>
    );
  }

  if (project === undefined || usersForAssignment === undefined || subtrades === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>Project not found.</p>
        <Link to="/project-start-up" style={{ color: "#059669" }}>
          Back to Project Start Up
        </Link>
      </div>
    );
  }

  const startUpContent = (
    <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
      <div style={{ marginBottom: "0.35rem" }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Title: </span>
        {project.name}
      </div>
      <div style={{ marginBottom: "0.35rem" }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Client: </span>
        {project.clientName}
      </div>
      <div>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Location: </span>
        <span>{project.location?.trim() ? project.location : "Not set"}</span>
      </div>
    </div>
  );
  const teamContent = (
    <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
      <div style={{ marginBottom: "0.35rem" }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Project manager: </span>
        <span>{project.pmId ? userNameById.get(project.pmId) ?? "Not set" : "Not set"}</span>
      </div>
      <div style={{ marginBottom: "0.35rem" }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Project coordinator: </span>
        <span>{project.coordinatorId ? userNameById.get(project.coordinatorId) ?? "Not set" : "Not set"}</span>
      </div>
      <div style={{ marginBottom: "0.35rem" }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Site super: </span>
        <span>{project.siteSuperId ? userNameById.get(project.siteSuperId) ?? "Not set" : "Not set"}</span>
      </div>
      <div style={{ marginBottom: "0.35rem" }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Principal: </span>
        <span>{project.principalId ? userNameById.get(project.principalId) ?? "Not set" : "Not set"}</span>
      </div>
      <div style={{ marginBottom: "0.35rem" }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Accounts payable: </span>
        <span>{project.accountsPayableId ? userNameById.get(project.accountsPayableId) ?? "Not set" : "Not set"}</span>
      </div>
      <div>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Safety: </span>
        <span>{project.safetyMemberId ? userNameById.get(project.safetyMemberId) ?? "Not set" : "Not set"}</span>
      </div>
    </div>
  );

  const datesContent = (
    <>
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: "0.5rem",
          padding: "0.5rem",
          textAlign: "left",
          background: "transparent",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.8125rem" }}>Start date: </span>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>{formatProjectDate(project.startDate)}</span>
      </div>
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: "0.5rem",
          padding: "0.5rem",
          textAlign: "left",
          background: "transparent",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.8125rem" }}>End date: </span>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>{formatProjectDate(project.endDate)}</span>
      </div>
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: "0.5rem",
          padding: "0.5rem",
          textAlign: "left",
          background: "transparent",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.8125rem" }}>Status: </span>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem", textTransform: "capitalize" }}>
          {formatStatus(project.status)}
        </span>
      </div>
    </>
  );

  const budgetContent = (
    <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
      <div style={{ marginBottom: "0.35rem" }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Amount: </span>
        <span>{fmtBudgetAmount(project.budget)}</span>
      </div>
      <div>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Document: </span>
        {project.budgetDocumentUrl ? (
          <a
            href={project.budgetDocumentUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-primary, #059669)" }}
          >
            View budget file
          </a>
        ) : (
          <span>Not uploaded</span>
        )}
      </div>
    </div>
  );

  const primeContractContent = (
    <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
      {primeContractDocs.length === 0 ? (
        <span>No prime contract uploaded.</span>
      ) : (
        <>
          <div style={{ marginBottom: "0.35rem" }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>File: </span>
            <span>{primeContractDocs[0].name}</span>
          </div>
          <div style={{ marginBottom: "0.35rem" }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Uploaded: </span>
            <span>{formatProjectDate(primeContractDocs[0].uploadedAt)}</span>
          </div>
          <a
            href={primeContractDocs[0].fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-primary, #059669)" }}
          >
            View prime contract
          </a>
        </>
      )}
    </div>
  );

  const permitsContent = (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "0.5rem",
        overflow: "hidden",
        fontSize: "0.8125rem",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          padding: "0.45rem 0.6rem",
          backgroundColor: "var(--surface-panel)",
          borderBottom: "1px solid var(--border-subtle)",
          fontWeight: 600,
          color: "var(--text-primary)",
          gap: "0.5rem",
        }}
      >
        <span>Permit</span>
        <span>Uploaded</span>
        <span>File</span>
      </div>
      <div style={{ maxHeight: "210px", overflowY: "auto" }}>
        {permitDocs.length === 0 ? (
          <div style={{ padding: "0.6rem", color: "var(--text-secondary)" }}>No permits yet.</div>
        ) : (
          permitDocs.map((doc) => (
            <div
              key={doc._id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr",
                gap: "0.5rem",
                padding: "0.5rem 0.6rem",
                borderTop: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
                alignItems: "center",
              }}
            >
              <span style={{ color: "var(--text-primary)" }}>{doc.name}</span>
              <span>{formatProjectDate(doc.uploadedAt)}</span>
              <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-emerald-500)" }}>
                Open
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const startUpDocsContent = (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "0.5rem",
        overflow: "hidden",
        fontSize: "0.8125rem",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          padding: "0.45rem 0.6rem",
          backgroundColor: "var(--surface-panel)",
          borderBottom: "1px solid var(--border-subtle)",
          fontWeight: 600,
          color: "var(--text-primary)",
          gap: "0.5rem",
        }}
      >
        <span>Folder / type</span>
        <span>File</span>
      </div>
      <div style={{ maxHeight: "210px", overflowY: "auto" }}>
        {startupDocsOnly.length === 0 ? (
          <div style={{ padding: "0.6rem", color: "var(--text-secondary)" }}>No start up docs yet.</div>
        ) : (
          startupDocsOnly
            .slice()
            .sort((a, b) => b.uploadedAt - a.uploadedAt)
            .map((doc) => (
              <div
                key={doc._id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr",
                  gap: "0.5rem",
                  padding: "0.5rem 0.6rem",
                  borderTop: "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "var(--text-primary)" }}>{doc.type}</span>
                <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-emerald-500)" }}>
                  {doc.name || "Open"}
                </a>
              </div>
            ))
        )}
      </div>
    </div>
  );

  const addPrimeContractButton = (
    <button
      type="button"
      aria-label="Upload prime contract"
      title="Upload prime contract"
      onClick={() => {
        setPrimeContractError(null);
        setPrimeContractName("");
        setPrimeContractFile(null);
        setShowAddPrimeContractModal(true);
      }}
      style={addPlusButtonStyle}
    >
      +
    </button>
  );

  const addPermitButton = (
    <button
      type="button"
      aria-label="Add permit"
      title="Add permit"
      onClick={() => {
        setPermitError(null);
        setPermitName("");
        setPermitFile(null);
        setShowAddPermitModal(true);
      }}
      style={addPlusButtonStyle}
    >
      +
    </button>
  );

  const addStartUpDocButton = (
    <button
      type="button"
      aria-label="Add start up document"
      title="Add start up document"
      onClick={() => {
        setStartupDocError(null);
        setStartupDocType("START_UP_DOC");
        setStartupDocFile(null);
        setShowAddStartUpDocModal(true);
      }}
      style={addPlusButtonStyle}
    >
      +
    </button>
  );

  const addBudgetButton = (
    <button
      type="button"
      aria-label="Add budget item"
      title="Add budget item"
      onClick={() => setShowBudgetPlaceholderModal(true)}
      style={addPlusButtonStyle}
    >
      +
    </button>
  );

  const tradesListContent = (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "0.5rem",
        overflow: "hidden",
        fontSize: "0.8125rem",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr 0.9fr 1.4fr 4rem",
          padding: "0.45rem 0.6rem",
          backgroundColor: "var(--surface-panel)",
          borderBottom: "1px solid var(--border-subtle)",
          fontWeight: 600,
          color: "var(--text-primary)",
          gap: "0.5rem",
        }}
      >
        <span>Trade</span>
        <span>Insurance</span>
        <span>Quote</span>
        <span>Subcontract</span>
        <span />
      </div>
      <div style={{ maxHeight: "18rem", overflowY: "auto" }}>
        {subtrades.length === 0 ? (
          <div style={{ padding: "0.6rem", color: "var(--text-secondary)" }}>No trades yet.</div>
        ) : (
          subtrades
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((trade) => {
              const insuranceDoc = insuranceBySubtrade.get(trade._id);
              return (
                <div
                  key={trade._id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 1fr 0.9fr 1.4fr 4rem",
                    gap: "0.5rem",
                    padding: "0.5rem 0.6rem",
                    borderTop: "1px solid var(--border-subtle)",
                    color: "var(--text-secondary)",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{trade.name}</span>
                  <span>{expiryStatusLabel(insuranceDoc?.expiryDate)}</span>
                  <span>{fmtQuoteAmount(trade.budget)}</span>
                  <span>
                    {formatContractStatus(trade.contractStatus)}
                    {trade.fileUrl ? (
                      <>
                        {" · "}
                        <a
                          href={trade.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--color-emerald-500)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          File
                        </a>
                      </>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => openEditTradeModal(trade)}
                    style={{
                      ...secondaryButtonStyle,
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.45rem",
                    }}
                  >
                    Edit
                  </button>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
  const addTradeButton = (
    <button
      type="button"
      aria-label="Add trade"
      title="Add trade"
      onClick={() => {
        setTradeError(null);
        setTradeMode("existing");
        setShowTradeModal(true);
      }}
      style={addPlusButtonStyle}
    >
      +
    </button>
  );

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <div
        style={{
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="page-title">
            Project Start Up <LogoMark />
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
            {project.name} - {project.clientName}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <Link
            to="/project-start-up"
            style={{
              ...secondaryButtonStyle,
              textDecoration: "none",
              textAlign: "center",
              fontSize: "0.8125rem",
            }}
          >
            Back to Project Start Up
          </Link>
          <Link
            to={`/projects/${projectId}`}
            style={{
              ...secondaryButtonStyle,
              textDecoration: "none",
              textAlign: "center",
              fontSize: "0.8125rem",
            }}
          >
            Open in Project Tracker
          </Link>
          <button
            type="button"
            onClick={openEditSummaryModal}
            style={{
              ...secondaryButtonStyle,
              fontSize: "0.8125rem",
            }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDeleteProject}
            disabled={deleting}
            style={{
              ...secondaryButtonStyle,
              fontSize: "0.8125rem",
              backgroundColor: "#dc2626",
              color: "#fff",
              borderColor: "#991b1b",
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.75 : 1,
            }}
          >
            {deleting ? "Deleting..." : "Delete project"}
          </button>
        </div>
      </div>
      {error && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            marginBottom: "1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#fef2f2",
            color: "#b91c1c",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}
      {saveNotice && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            marginBottom: "1rem",
            borderRadius: "0.5rem",
            backgroundColor: saveNotice.includes("Draft saved") ? "#fffbeb" : "#ecfdf5",
            color: saveNotice.includes("Draft saved") ? "#92400e" : "#065f46",
            fontSize: "0.875rem",
          }}
        >
          {saveNotice}
        </div>
      )}

      <StartUpDashboardLayout
        startUpContent={startUpContent}
        teamContent={teamContent}
        primeContractContent={primeContractContent}
        primeContractHeaderAction={addPrimeContractButton}
        permitsContent={permitsContent}
        permitsHeaderAction={addPermitButton}
        startupDocsContent={startUpDocsContent}
        startupDocsHeaderAction={addStartUpDocButton}
        budgetHeaderAction={addBudgetButton}
        budgetContent={budgetContent}
        datesContent={datesContent}
        tradesHeaderAction={addTradeButton}
        tradesContent={tradesListContent}
        tradesMinHeight="22rem"
      />
      {showBudgetPlaceholderModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowBudgetPlaceholderModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "28rem",
              backgroundColor: "var(--surface-card)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-surface)",
              padding: "1rem",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: "0.75rem", fontSize: "1rem", color: "var(--text-primary)" }}>
              Budget form coming soon
            </h3>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
              The Budget card add flow is now wired up. Once you decide the fields you want here, I can convert this
              popup into the full form and save logic.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.9rem" }}>
              <button
                type="button"
                onClick={() => setShowBudgetPlaceholderModal(false)}
                style={secondaryButtonStyle}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddPrimeContractModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !addingPrimeContract && setShowAddPrimeContractModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <form
            onSubmit={handleCreatePrimeContract}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "28rem",
              backgroundColor: "var(--surface-card)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-surface)",
              padding: "1rem",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: "0.75rem", fontSize: "1rem", color: "var(--text-primary)" }}>
              Upload prime contract
            </h3>
            <label style={labelStyle} htmlFor="startup-prime-contract-name">
              Display name (optional)
            </label>
            <input
              id="startup-prime-contract-name"
              type="text"
              value={primeContractName}
              onChange={(e) => setPrimeContractName(e.target.value)}
              placeholder="Defaults to file name"
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            />
            <label style={labelStyle} htmlFor="startup-prime-contract-file">
              File
            </label>
            <input
              id="startup-prime-contract-file"
              type="file"
              onChange={(e) => setPrimeContractFile(e.target.files?.[0] ?? null)}
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            />
            {primeContractError && (
              <p style={{ margin: "0 0 0.75rem 0", color: "#b91c1c", fontSize: "0.8125rem" }}>{primeContractError}</p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setShowAddPrimeContractModal(false)}
                disabled={addingPrimeContract}
                style={{
                  ...secondaryButtonStyle,
                  cursor: addingPrimeContract ? "not-allowed" : "pointer",
                  opacity: addingPrimeContract ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingPrimeContract}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.75rem",
                  fontWeight: 600,
                  fontFamily: "Montserrat, sans-serif",
                  backgroundColor: "var(--color-emerald-500)",
                  color: "#fff",
                  border: "1px solid rgba(2, 44, 34, 0.5)",
                  boxShadow: "0 4px 14px rgba(2, 44, 34, 0.35)",
                  cursor: addingPrimeContract ? "not-allowed" : "pointer",
                  opacity: addingPrimeContract ? 0.7 : 1,
                }}
              >
                {addingPrimeContract ? "Uploading..." : "Upload"}
              </button>
            </div>
          </form>
        </div>
      )}
      {showAddPermitModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !addingPermit && setShowAddPermitModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <form
            onSubmit={handleCreatePermit}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "28rem",
              backgroundColor: "var(--surface-card)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-surface)",
              padding: "1rem",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: "0.75rem", fontSize: "1rem", color: "var(--text-primary)" }}>
              Add permit
            </h3>
            <label style={labelStyle} htmlFor="startup-permit-name">
              Permit name (optional)
            </label>
            <input
              id="startup-permit-name"
              type="text"
              value={permitName}
              onChange={(e) => setPermitName(e.target.value)}
              placeholder="e.g. Building permit"
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            />
            <label style={labelStyle} htmlFor="startup-permit-file">
              File
            </label>
            <input
              id="startup-permit-file"
              type="file"
              onChange={(e) => setPermitFile(e.target.files?.[0] ?? null)}
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            />
            {permitError && (
              <p style={{ margin: "0 0 0.75rem 0", color: "#b91c1c", fontSize: "0.8125rem" }}>{permitError}</p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setShowAddPermitModal(false)}
                disabled={addingPermit}
                style={{
                  ...secondaryButtonStyle,
                  cursor: addingPermit ? "not-allowed" : "pointer",
                  opacity: addingPermit ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingPermit}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.75rem",
                  fontWeight: 600,
                  fontFamily: "Montserrat, sans-serif",
                  backgroundColor: "var(--color-emerald-500)",
                  color: "#fff",
                  border: "1px solid rgba(2, 44, 34, 0.5)",
                  boxShadow: "0 4px 14px rgba(2, 44, 34, 0.35)",
                  cursor: addingPermit ? "not-allowed" : "pointer",
                  opacity: addingPermit ? 0.7 : 1,
                }}
              >
                {addingPermit ? "Uploading..." : "Add permit"}
              </button>
            </div>
          </form>
        </div>
      )}
      {showAddStartUpDocModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !addingStartUpDoc && setShowAddStartUpDocModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <form
            onSubmit={handleCreateStartUpDoc}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "28rem",
              backgroundColor: "var(--surface-card)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-surface)",
              padding: "1rem",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: "0.75rem", fontSize: "1rem", color: "var(--text-primary)" }}>
              Add start up document
            </h3>
            <label style={labelStyle} htmlFor="startup-doc-type">
              Folder / type
            </label>
            <input
              id="startup-doc-type"
              type="text"
              value={startupDocType}
              onChange={(e) => setStartupDocType(e.target.value)}
              placeholder="e.g. START_UP_DOC"
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            />
            <label style={labelStyle} htmlFor="startup-doc-file">
              File
            </label>
            <input
              id="startup-doc-file"
              type="file"
              onChange={(e) => setStartupDocFile(e.target.files?.[0] ?? null)}
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            />
            {startupDocError && (
              <p style={{ margin: "0 0 0.75rem 0", color: "#b91c1c", fontSize: "0.8125rem" }}>{startupDocError}</p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setShowAddStartUpDocModal(false)}
                disabled={addingStartUpDoc}
                style={{
                  ...secondaryButtonStyle,
                  cursor: addingStartUpDoc ? "not-allowed" : "pointer",
                  opacity: addingStartUpDoc ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingStartUpDoc}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.75rem",
                  fontWeight: 600,
                  fontFamily: "Montserrat, sans-serif",
                  backgroundColor: "var(--color-emerald-500)",
                  color: "#fff",
                  border: "1px solid rgba(2, 44, 34, 0.5)",
                  boxShadow: "0 4px 14px rgba(2, 44, 34, 0.35)",
                  cursor: addingStartUpDoc ? "not-allowed" : "pointer",
                  opacity: addingStartUpDoc ? 0.7 : 1,
                }}
              >
                {addingStartUpDoc ? "Uploading..." : "Add document"}
              </button>
            </div>
          </form>
        </div>
      )}
      {showEditSummaryModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeEditSummaryModal}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 45,
          }}
        >
          <form
            onSubmit={handleSaveSummaryEdit}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "28rem",
              backgroundColor: "var(--surface-card)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-surface)",
              padding: "1rem",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: "0.75rem", fontSize: "1rem", color: "var(--text-primary)" }}>Edit project summary</h3>
            <label style={labelStyle} htmlFor="edit-summary-location">Location</label>
            <input id="edit-summary-location" autoFocus type="text" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} style={{ ...inputStyle, marginBottom: "0.75rem" }} placeholder="e.g. Downtown" />
            <label style={labelStyle} htmlFor="edit-summary-status">Status</label>
            <select id="edit-summary-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value as (typeof statusOptions)[number])} style={{ ...inputStyle, marginBottom: "0.75rem" }}>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="edit-summary-pm">PM</label>
            <select id="edit-summary-pm" value={editPmId} onChange={(e) => setEditPmId(e.target.value as Id<"users"> | "")} style={{ ...inputStyle, marginBottom: "0.75rem" }}>
              <option value="">- Select -</option>
              {usersForAssignment.filter((u) => u.role === "project_manager" || u.role === "admin" || u.role === "principal").map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                </option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="edit-summary-pc">PC</label>
            <select id="edit-summary-pc" value={editCoordinatorId} onChange={(e) => setEditCoordinatorId(e.target.value as Id<"users"> | "")} style={{ ...inputStyle, marginBottom: "0.75rem" }}>
              <option value="">- Select -</option>
              {usersForAssignment.filter((u) => u.role === "coordinator" || u.role === "admin").map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                </option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="edit-summary-site-super">Site Super</label>
            <select id="edit-summary-site-super" value={editSiteSuperId} onChange={(e) => setEditSiteSuperId(e.target.value as Id<"users"> | "")} style={{ ...inputStyle, marginBottom: "0.75rem" }}>
              <option value="">- Select -</option>
              {usersForAssignment.filter((u) => u.role === "site_superintendent").map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                </option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="edit-summary-principal">Principal</label>
            <select id="edit-summary-principal" value={editPrincipalId} onChange={(e) => setEditPrincipalId(e.target.value as Id<"users"> | "")} style={{ ...inputStyle, marginBottom: "0.75rem" }}>
              <option value="">- Select -</option>
              {usersForAssignment.filter((u) => u.role === "admin").map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                </option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="edit-summary-accounts-payable">Accounts payable</label>
            <select id="edit-summary-accounts-payable" value={editAccountsPayableId} onChange={(e) => setEditAccountsPayableId(e.target.value as Id<"users"> | "")} style={{ ...inputStyle, marginBottom: "0.75rem" }}>
              <option value="">- Select -</option>
              {usersForAssignment.filter((u) => u.role === "accounting").map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                </option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="edit-summary-safety">Safety</label>
            <select id="edit-summary-safety" value={editSafetyMemberId} onChange={(e) => setEditSafetyMemberId(e.target.value as Id<"users"> | "")} style={{ ...inputStyle, marginBottom: "0.75rem" }}>
              <option value="">- Select -</option>
              {usersForAssignment.filter((u) => u.role === "safety").map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                </option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="edit-summary-start-date">Start date</label>
            <input id="edit-summary-start-date" type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} style={{ ...inputStyle, marginBottom: "0.75rem" }} />
            <label style={labelStyle} htmlFor="edit-summary-end-date">End date</label>
            <input id="edit-summary-end-date" type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} style={{ ...inputStyle, marginBottom: "0.75rem" }} />
            {editError && <p style={{ margin: "0 0 0.75rem 0", color: "#b91c1c", fontSize: "0.8125rem" }}>{editError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={closeEditSummaryModal}
                disabled={editSaving}
                style={{
                  ...secondaryButtonStyle,
                  cursor: editSaving ? "not-allowed" : "pointer",
                  opacity: editSaving ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.75rem",
                  fontWeight: 600,
                  fontFamily: "Montserrat, sans-serif",
                  backgroundColor: "var(--color-emerald-500)",
                  color: "#fff",
                  border: "1px solid rgba(2, 44, 34, 0.5)",
                  boxShadow: "0 4px 14px rgba(2, 44, 34, 0.35)",
                  cursor: editSaving ? "not-allowed" : "pointer",
                  opacity: editSaving ? 0.7 : 1,
                }}
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
      {showEditTradeModal && editingTradeId && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeEditTradeModal}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <form
            onSubmit={handleSaveTradeEdit}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "28rem",
              backgroundColor: "var(--surface-card)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-surface)",
              padding: "1rem",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: "0.75rem", fontSize: "1rem", color: "var(--text-primary)" }}>
              Edit trade
            </h3>
            <label style={labelStyle} htmlFor="edit-trade-quote">
              Quote ($)
            </label>
            <input
              id="edit-trade-quote"
              type="text"
              value={editTradeQuote}
              onChange={(e) => setEditTradeQuote(e.target.value)}
              placeholder="e.g. 50000"
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            />
            <label style={labelStyle} htmlFor="edit-trade-contract-status">
              Subcontract status
            </label>
            <select
              id="edit-trade-contract-status"
              value={editTradeContractStatus}
              onChange={(e) =>
                setEditTradeContractStatus(e.target.value as (typeof contractStatusOptions)[number])
              }
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            >
              {contractStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatContractStatus(status)}
                </option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="edit-trade-subcontract-file">
              Subcontract file (optional)
            </label>
            <input
              id="edit-trade-subcontract-file"
              type="file"
              disabled={editTradeSubcontractUploading || savingTradeEdit}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setEditTradeSubcontractFile(file ?? null);
                if (file) {
                  await handleEditTradeSubcontractUpload(file);
                } else {
                  setEditTradeSubcontractStorageId(null);
                }
                e.target.value = "";
              }}
              style={{ ...inputStyle, marginBottom: "0.5rem" }}
            />
            <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              {editTradeSubcontractUploading
                ? "Uploading subcontract file..."
                : editTradeSubcontractStorageId
                  ? "✓ Subcontract file ready"
                  : editTradeSubcontractFile
                    ? "Subcontract file selected"
                    : "No new subcontract file"}
            </p>
            <label style={labelStyle} htmlFor="edit-trade-insurance-file">
              Insurance document (optional)
            </label>
            <input
              id="edit-trade-insurance-file"
              type="file"
              disabled={savingTradeEdit}
              onChange={(e) => setEditTradeInsuranceFile(e.target.files?.[0] ?? null)}
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            />
            <label style={labelStyle} htmlFor="edit-trade-insurance-expiry">
              Insurance expiry date
            </label>
            <input
              id="edit-trade-insurance-expiry"
              type="date"
              value={editTradeInsuranceExpiry}
              onChange={(e) => setEditTradeInsuranceExpiry(e.target.value)}
              style={{ ...inputStyle, marginBottom: "0.75rem" }}
            />
            {tradeEditError && (
              <p style={{ margin: "0 0 0.75rem 0", color: "#b91c1c", fontSize: "0.8125rem" }}>{tradeEditError}</p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={closeEditTradeModal}
                disabled={savingTradeEdit || editTradeSubcontractUploading}
                style={{
                  ...secondaryButtonStyle,
                  cursor: savingTradeEdit || editTradeSubcontractUploading ? "not-allowed" : "pointer",
                  opacity: savingTradeEdit || editTradeSubcontractUploading ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingTradeEdit || editTradeSubcontractUploading}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.75rem",
                  fontWeight: 600,
                  fontFamily: "Montserrat, sans-serif",
                  backgroundColor: "var(--color-emerald-500)",
                  color: "#fff",
                  border: "1px solid rgba(2, 44, 34, 0.5)",
                  boxShadow: "0 4px 14px rgba(2, 44, 34, 0.35)",
                  cursor: savingTradeEdit || editTradeSubcontractUploading ? "not-allowed" : "pointer",
                  opacity: savingTradeEdit || editTradeSubcontractUploading ? 0.7 : 1,
                }}
              >
                {savingTradeEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
      {showTradeModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 40,
          }}
          onClick={() => !addingTrade && setShowTradeModal(false)}
        >
          <form
            onSubmit={handleAddTrade}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "28rem",
              backgroundColor: "var(--surface-card)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-surface)",
              padding: "1rem",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: "0.75rem", fontSize: "1rem", color: "var(--text-primary)" }}>
              Add trade
            </h3>
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.875rem" }}>
                <input
                  type="radio"
                  name="trade-mode"
                  checked={tradeMode === "existing"}
                  onChange={() => setTradeMode("existing")}
                />
                Use previously uploaded trade
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.875rem" }}>
                <input
                  type="radio"
                  name="trade-mode"
                  checked={tradeMode === "new"}
                  onChange={() => setTradeMode("new")}
                />
                Create new trade
              </label>
            </div>
            {tradeMode === "existing" ? (
              <select
                value={existingTradeName}
                onChange={(e) => setExistingTradeName(e.target.value)}
                style={{ ...inputStyle, marginBottom: "0.75rem" }}
              >
                <option value="">- Select trade -</option>
                {tradeTemplates.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={newTradeName}
                onChange={(e) => setNewTradeName(e.target.value)}
                placeholder="e.g. Electrical"
                style={{ ...inputStyle, marginBottom: "0.75rem" }}
              />
            )}
            {tradeError && (
              <p style={{ margin: "0 0 0.75rem 0", color: "#b91c1c", fontSize: "0.8125rem" }}>{tradeError}</p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setShowTradeModal(false)}
                disabled={addingTrade}
                style={{
                  ...secondaryButtonStyle,
                  cursor: addingTrade ? "not-allowed" : "pointer",
                  opacity: addingTrade ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingTrade}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.75rem",
                  fontWeight: 600,
                  fontFamily: "Montserrat, sans-serif",
                  backgroundColor: "var(--color-emerald-500)",
                  color: "#fff",
                  border: "1px solid rgba(2, 44, 34, 0.5)",
                  boxShadow: "0 4px 14px rgba(2, 44, 34, 0.35)",
                  cursor: addingTrade ? "not-allowed" : "pointer",
                  opacity: addingTrade ? 0.7 : 1,
                }}
              >
                {addingTrade ? "Adding..." : "Add trade"}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteProject}
        confirmLabel="Delete project"
        loading={deleting}
        message={
          project ? (
            <>
              This will permanently delete project{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{project.name}</span>. This cannot be
              undone and will remove related startup and project records.
            </>
          ) : null
        }
        onCancel={() => setConfirmDeleteProject(false)}
        onConfirm={() => void confirmDeleteProjectAction()}
      />
    </div>
  );
}
