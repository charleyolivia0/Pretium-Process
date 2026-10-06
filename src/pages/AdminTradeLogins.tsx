import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { cardStyle, primaryButtonStyle, shellCardStyle, secondaryButtonStyle } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";

type AssignmentRow = {
  assignmentId: Id<"tradePortalAssignments">;
  projectId: Id<"projects">;
  projectName: string;
  subtradeId: Id<"projectSubtrades">;
  subtradeName: string;
};

type PortalAccountRow = {
  _id: Id<"tradePortalAccounts">;
  tradeName: string;
  isActive: boolean;
  assignments: AssignmentRow[];
  uniqueAssignedProjectCount?: number;
};

type PendingTradeAssignmentRow = {
  tradeName: string;
  tradeNameNormalized: string;
  uniquePendingProjectCount: number;
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function AdminTradeLogins() {
  const isMobile = useIsMobile(768);
  const user = useQuery(api.users.current);
  const accounts = useQuery(api.tradePortal.adminListPortalAccounts);
  const missingTradeLogins = useQuery(api.tradePortal.adminListMissingTradeLogins);
  const pendingTradeAssignments = useQuery(api.tradePortal.adminListPendingTradeAssignments);
  const projects = useQuery(api.projects.listProjects, { limit: 200 });

  const upsertPortalAccount = useMutation(api.tradePortal.adminUpsertPortalAccount);
  const setAssignments = useMutation(api.tradePortal.adminSetAssignments);
  const createSubtrade = useMutation(api.subtrades.create);
  const deletePortalAccount = useMutation(api.tradePortal.adminDeletePortalAccount);
  const deleteOrphanTrade = useMutation(api.tradePortal.adminDeleteOrphanTradeByName);

  const [tradeName, setTradeName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<Id<"tradePortalAccounts"> | "">("");
  const [assignmentProjectId, setAssignmentProjectId] = useState<Id<"projects"> | "">("");
  const [assignmentTradeName, setAssignmentTradeName] = useState("");
  const [draftAssignments, setDraftAssignments] = useState<Array<{ projectId: Id<"projects">; tradeName: string }>>([]);
  const [projectSubtradesCache, setProjectSubtradesCache] = useState<
    Record<string, Array<{ _id: Id<"projectSubtrades">; name: string }>>
  >({});
  const [assignmentsDirty, setAssignmentsDirty] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<Id<"tradePortalAccounts"> | null>(null);
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState<PortalAccountRow | null>(null);
  const [pendingRemoveAssignment, setPendingRemoveAssignment] = useState<{
    projectId: Id<"projects">;
    tradeName: string;
  } | null>(null);
  const [pendingDeleteOrphanTrade, setPendingDeleteOrphanTrade] = useState<string | null>(null);
  const [deletingOrphanTrade, setDeletingOrphanTrade] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState<string>("");
  const tradeNameInputRef = useRef<HTMLInputElement | null>(null);

  const selectedAccount = useMemo(() => {
    if (!accounts || !selectedAccountId) return null;
    return (accounts as PortalAccountRow[]).find((row) => row._id === selectedAccountId) ?? null;
  }, [accounts, selectedAccountId]);

  const subtradesForProject = useQuery(
    api.subtrades.listByProject,
    assignmentProjectId ? { projectId: assignmentProjectId } : "skip",
  );

  useEffect(() => {
    if (!selectedAccount) {
      setDraftAssignments([]);
      setAssignmentTradeName("");
      setAssignmentsDirty(false);
      return;
    }
    if (assignmentsDirty) return;
    setDraftAssignments(
      selectedAccount.assignments.map((row) => ({
        projectId: row.projectId,
        tradeName: row.subtradeName,
      })),
    );
    setAssignmentTradeName(selectedAccount.tradeName);
    setTradeName(selectedAccount.tradeName);
    setIsActive(selectedAccount.isActive);
    setPasscode("");
  }, [selectedAccount, assignmentsDirty]);

  useEffect(() => {
    if (!assignmentProjectId || !subtradesForProject) return;
    setProjectSubtradesCache((prev) => ({
      ...prev,
      [assignmentProjectId]: subtradesForProject.map((row) => ({ _id: row._id, name: row.name })),
    }));
  }, [assignmentProjectId, subtradesForProject]);

  useEffect(() => {
    if (!selectedAccountId) {
      setAssignmentProjectId("");
      return;
    }
    if (!assignmentProjectId && (projects?.length ?? 0) > 0) {
      setAssignmentProjectId(projects![0]._id);
    }
  }, [selectedAccountId, assignmentProjectId, projects]);

  if (
    user === undefined ||
    accounts === undefined ||
    projects === undefined ||
    missingTradeLogins === undefined ||
    pendingTradeAssignments === undefined
  ) {
    return <div style={{ fontFamily: "Montserrat, sans-serif" }}>Loading...</div>;
  }
  if (user?.role !== "admin") {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <h1 className="page-title">Trade Logins</h1>
        <div style={cardStyle}>You need admin access to manage trade logins.</div>
      </div>
    );
  }

  async function handleCreateOrUpdateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");
    setBusy("saveAccount");
    try {
      if (!tradeName.trim()) throw new Error("Trade name is required");
      if (!passcode.trim() && !selectedAccountId) {
        throw new Error("Passcode is required when creating a new trade login");
      }
      const accountId = await upsertPortalAccount({
        tradeName: tradeName.trim(),
        passcode: passcode.trim() || undefined,
        isActive,
      });
      setSelectedAccountId(accountId);
      setAssignmentsDirty(false);
      setPasscode("");
      setStatus("Trade login saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save trade login");
    } finally {
      setBusy("");
    }
  }

  async function handleSaveAssignments() {
    if (!selectedAccountId) return;
    setError("");
    setStatus("");
    setBusy("saveAssignments");
    try {
      const resolvedAssignments: Array<{ projectId: Id<"projects">; subtradeId: Id<"projectSubtrades"> }> = [];
      const nextCache: Record<string, Array<{ _id: Id<"projectSubtrades">; name: string }>> = {
        ...projectSubtradesCache,
      };
      for (const row of draftAssignments) {
        const normalizedTradeName = normalizeLabel(row.tradeName);
        if (!normalizedTradeName) continue;
        const cacheKey = row.projectId as string;
        const knownSubtrades = nextCache[cacheKey] ?? [];
        const existing = knownSubtrades.find(
          (entry) => normalizeLabel(entry.name) === normalizedTradeName,
        );
        if (existing) {
          resolvedAssignments.push({ projectId: row.projectId, subtradeId: existing._id });
          continue;
        }
        const createdSubtradeId = await createSubtrade({
          projectId: row.projectId,
          name: row.tradeName.trim(),
          contractStatus: "unsigned",
        });
        nextCache[cacheKey] = [...knownSubtrades, { _id: createdSubtradeId, name: row.tradeName.trim() }];
        resolvedAssignments.push({ projectId: row.projectId, subtradeId: createdSubtradeId });
      }
      await setAssignments({
        portalAccountId: selectedAccountId,
        assignments: resolvedAssignments,
      });
      setProjectSubtradesCache(nextCache);
      setAssignmentsDirty(false);
      setStatus("Assigned jobs updated. Missing project subtrades were added automatically.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save assignments");
    } finally {
      setBusy("");
    }
  }

  function addDraftAssignment() {
    if (!assignmentProjectId || !assignmentTradeName.trim()) return;
    setError("");
    setStatus("");
    const normalizedTradeName = normalizeLabel(assignmentTradeName);
    const exists = draftAssignments.some(
      (row) =>
        row.projectId === assignmentProjectId &&
        normalizeLabel(row.tradeName) === normalizedTradeName,
    );
    if (exists) {
      setStatus("That job/trade assignment is already in the list.");
      return;
    }
    setAssignmentsDirty(true);
    setDraftAssignments((prev) => [
      ...prev,
      { projectId: assignmentProjectId, tradeName: assignmentTradeName.trim() },
    ]);
  }

  function removeDraftAssignment(projectId: Id<"projects">, tradeName: string) {
    const normalizedTradeName = normalizeLabel(tradeName);
    setAssignmentsDirty(true);
    setDraftAssignments((prev) =>
      prev.filter(
        (row) =>
          !(
            row.projectId === projectId &&
            normalizeLabel(row.tradeName) === normalizedTradeName
          ),
      ),
    );
  }

  function keyForDraft(row: { projectId: Id<"projects">; tradeName: string }) {
    return `${row.projectId}-${normalizeLabel(row.tradeName)}`;
  }

  function labelForDraft(row: { projectId: Id<"projects">; tradeName: string }) {
    const project = projects?.find((p) => p._id === row.projectId);
    return `${project?.name ?? "Unknown project"} - ${row.tradeName || "Unknown trade"}`;
  }

  function requestDeletePortalAccount(account: PortalAccountRow) {
    setPendingDeleteAccount(account);
  }

  async function confirmDeletePortalAccount() {
    const account = pendingDeleteAccount;
    if (!account) return;
    setError("");
    setStatus("");
    setDeletingAccountId(account._id);
    try {
      const result = await deletePortalAccount({ portalAccountId: account._id });
      if (selectedAccountId === account._id) {
        setSelectedAccountId("");
        setDraftAssignments([]);
        setAssignmentsDirty(false);
      }
      setPendingDeleteAccount(null);
      const pendingNote =
        result.deletedPendingCount > 0 ? ` Cleared ${result.deletedPendingCount} pending assignment(s).` : "";
      setStatus(
        `Deleted "${account.tradeName}". Removed ${result.deletedAssignmentCount} assignment(s) and ${result.deletedSubtradeCount} project subtrade row(s).${pendingNote}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete trade login");
    } finally {
      setDeletingAccountId(null);
    }
  }

  function prefillTradeNameFromMissingList(nextTradeName: string) {
    setError("");
    setStatus(`Ready to create trade login for "${nextTradeName}".`);
    setAssignmentsDirty(false);
    setSelectedAccountId("");
    setTradeName(nextTradeName);
    setPasscode("");
    setIsActive(true);
    requestAnimationFrame(() => {
      tradeNameInputRef.current?.focus();
      tradeNameInputRef.current?.select();
    });
  }

  async function confirmDeleteOrphanTrade() {
    const tradeName = pendingDeleteOrphanTrade;
    if (!tradeName) return;
    setError("");
    setStatus("");
    setDeletingOrphanTrade(true);
    try {
      const result = await deleteOrphanTrade({ tradeName });
      setPendingDeleteOrphanTrade(null);
      setStatus(
        `Deleted "${tradeName}" from project subtrade lists. Removed ${result.deletedSubtradeCount} subtrade row(s) and ${result.deletedPendingCount} pending assignment(s).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete trade");
    } finally {
      setDeletingOrphanTrade(false);
    }
  }

  function assignedJobCount(account: PortalAccountRow) {
    return account.uniqueAssignedProjectCount ?? new Set(account.assignments.map((row) => row.projectId)).size;
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", display: "grid", gap: "1rem", paddingBottom: "8rem" }}>
      <h1 className="page-title">Trade Portal Logins</h1>
      <p style={{ marginTop: "-0.5rem", marginBottom: "0.2rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
        Create trade passcodes and assign which jobs each trade can access in the portal.
      </p>
      <p style={{ marginTop: 0, marginBottom: "0.2rem", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
        A single trade login can be assigned to multiple jobs/trades.
      </p>

      {error ? (
        <div style={{ ...cardStyle, borderColor: "#ef4444", color: "#991b1b" }}>{error}</div>
      ) : null}
      {status ? (
        <div style={{ ...cardStyle, borderColor: "#10b981", color: "#065f46" }}>{status}</div>
      ) : null}

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1.1fr 1.4fr", minWidth: 0 }}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Existing Trade Logins</h2>
          <div style={{ display: "grid", gap: "0.5rem", maxHeight: "28rem", overflow: "auto" }}>
            {(accounts as PortalAccountRow[]).length === 0 ? (
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>No trade logins yet.</p>
            ) : (
              (accounts as PortalAccountRow[]).map((account) => (
                <div
                  key={account._id}
                  onClick={() => {
                    setAssignmentsDirty(false);
                    setSelectedAccountId(account._id);
                  }}
                  style={{
                    ...secondaryButtonStyle,
                    textAlign: "left",
                    borderColor: selectedAccountId === account._id ? "#059669" : "rgba(5,150,105,0.3)",
                    backgroundColor: selectedAccountId === account._id ? "#ecfdf5" : "var(--surface-panel)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <div style={{ fontWeight: 700 }}>{account.tradeName}</div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDeletePortalAccount(account);
                      }}
                      disabled={deletingAccountId === account._id}
                      style={{
                        ...secondaryButtonStyle,
                        padding: "0.18rem 0.38rem",
                        fontSize: "0.7rem",
                        borderColor: "rgba(239,68,68,0.35)",
                        color: "#991b1b",
                        backgroundColor: "#fff",
                      }}
                      title="Delete trade login"
                    >
                      {deletingAccountId === account._id ? "..." : "Delete"}
                    </button>
                  </div>
                  <div style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>
                    {account.isActive ? "Active" : "Inactive"} • {assignedJobCount(account)} unique job(s) assigned
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: "1rem" }}>
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Trades Missing Login</h2>
            <p style={{ marginTop: 0, marginBottom: "0.55rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Click a trade to prefill the create form, or delete it from all project subtrade lists.
            </p>
            <div style={{ display: "grid", gap: "0.45rem", maxHeight: "12rem", overflow: "auto" }}>
              {missingTradeLogins.length === 0 ? (
                <p style={{ margin: 0, color: "var(--text-secondary)" }}>All trades have logins.</p>
              ) : (
                missingTradeLogins.map((missingTrade) => (
                  <div
                    key={missingTrade}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => prefillTradeNameFromMissingList(missingTrade)}
                      style={{ ...secondaryButtonStyle, textAlign: "left", flex: 1 }}
                    >
                      {missingTrade}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteOrphanTrade(missingTrade)}
                      style={{
                        ...secondaryButtonStyle,
                        padding: "0.18rem 0.38rem",
                        fontSize: "0.7rem",
                        borderColor: "rgba(239,68,68,0.35)",
                        color: "#991b1b",
                        backgroundColor: "#fff",
                        flexShrink: 0,
                      }}
                      title="Delete trade"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
            {(pendingTradeAssignments as PendingTradeAssignmentRow[]).length > 0 ? (
              <div style={{ marginTop: "0.7rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.6rem" }}>
                <p style={{ margin: "0 0 0.45rem 0", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                  Pending unique job assignments (waiting for login):
                </p>
                <div style={{ display: "grid", gap: "0.35rem", maxHeight: "8rem", overflow: "auto" }}>
                  {(pendingTradeAssignments as PendingTradeAssignmentRow[]).map((row) => (
                    <div
                      key={row.tradeNameNormalized}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "0.45rem",
                        padding: "0.35rem 0.5rem",
                        fontSize: "0.8rem",
                      }}
                    >
                      <span>
                        <strong>{row.tradeName}</strong> • {row.uniquePendingProjectCount} unique job(s) pending
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteOrphanTrade(row.tradeName)}
                        style={{
                          ...secondaryButtonStyle,
                          padding: "0.18rem 0.38rem",
                          fontSize: "0.7rem",
                          borderColor: "rgba(239,68,68,0.35)",
                          color: "#991b1b",
                          backgroundColor: "#fff",
                          flexShrink: 0,
                        }}
                        title="Delete trade"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleCreateOrUpdateAccount} style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>{selectedAccountId ? "Edit Trade Login" : "Create Trade Login"}</h2>
            <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Trade name</label>
            <input
              ref={tradeNameInputRef}
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              required
              style={{ width: "100%", marginBottom: "0.6rem" }}
            />
            <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>
              {selectedAccountId ? "New passcode (leave blank to keep current)" : "Passcode"}
            </label>
            <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} style={{ width: "100%", marginBottom: "0.6rem" }} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.8rem" }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active login
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <button type="submit" style={primaryButtonStyle} disabled={busy === "saveAccount"}>
                {busy === "saveAccount" ? "Saving..." : "Save trade login"}
              </button>
              {selectedAccountId && selectedAccount ? (
                <button
                  type="button"
                  onClick={() => requestDeletePortalAccount(selectedAccount)}
                  disabled={deletingAccountId === selectedAccount._id}
                  style={{
                    ...secondaryButtonStyle,
                    borderColor: "rgba(239,68,68,0.35)",
                    color: "#991b1b",
                  }}
                >
                  {deletingAccountId === selectedAccount._id ? "Deleting..." : "Delete trade login"}
                </button>
              ) : null}
            </div>
          </form>

          <div style={shellCardStyle}>
            <h2 style={{ marginTop: 0, color: "#fff" }}>Assigned Jobs</h2>
            {!selectedAccountId ? (
              <p style={{ margin: 0, color: "#d1fae5" }}>Select or create a trade login first.</p>
            ) : (
              <>
                <p style={{ marginTop: 0, marginBottom: "0.55rem", color: "#d1fae5", fontSize: "0.85rem" }}>
                  Select a project and choose a trade from existing trade logins. If that trade is missing on the project subtrade list, it will be created when you save assignments.
                </p>
                <div style={{ display: "grid", gap: "0.45rem", gridTemplateColumns: "1fr 1fr auto", marginBottom: "0.7rem" }}>
                  <select
                    value={assignmentProjectId}
                    onChange={(e) => setAssignmentProjectId(e.target.value as Id<"projects">)}
                    style={{ backgroundColor: "var(--surface-panel)" }}
                  >
                    <option value="">Select project</option>
                    {projects.map((project) => (
                      <option key={project._id} value={project._id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignmentTradeName}
                    onChange={(e) => setAssignmentTradeName(e.target.value)}
                    style={{ backgroundColor: "var(--surface-panel)" }}
                    disabled={(accounts as PortalAccountRow[]).length === 0}
                  >
                    <option value="">Select trade</option>
                    {(accounts as PortalAccountRow[]).map((account) => (
                      <option key={account._id} value={account.tradeName}>
                        {account.tradeName}
                      </option>
                    ))}
                  </select>
                  <button type="button" style={secondaryButtonStyle} onClick={addDraftAssignment}>
                    Add project
                  </button>
                </div>

                <div style={{ display: "grid", gap: "0.45rem", marginBottom: "0.75rem", maxHeight: "12rem", overflow: "auto" }}>
                  {draftAssignments.length === 0 ? (
                    <p style={{ margin: 0, color: "#d1fae5" }}>No assignments selected.</p>
                  ) : (
                    draftAssignments.map((row) => (
                      <div
                        key={keyForDraft(row)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.4rem 0.55rem",
                          borderRadius: "0.45rem",
                          backgroundColor: "rgba(255,255,255,0.12)",
                          color: "#fff",
                        }}
                      >
                        <span style={{ fontSize: "0.85rem" }}>{labelForDraft(row)}</span>
                        <button
                          type="button"
                          style={{
                            ...secondaryButtonStyle,
                            padding: "0.2rem 0.45rem",
                            fontSize: "0.75rem",
                            borderColor: "rgba(239,68,68,0.35)",
                            color: "#991b1b",
                          }}
                          onClick={() => setPendingRemoveAssignment(row)}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSaveAssignments}
                  disabled={busy === "saveAssignments"}
                  style={{
                    ...primaryButtonStyle,
                    backgroundColor: "var(--surface-panel)",
                    color: "#065f46",
                    borderColor: "#bbf7d0",
                  }}
                >
                  {busy === "saveAssignments" ? "Saving..." : "Save assignments"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteAccount !== null}
        confirmLabel="Yes, delete"
        loading={deletingAccountId !== null}
        message={
          pendingDeleteAccount ? (
            assignedJobCount(pendingDeleteAccount) === 0 ? (
              <>
                This will permanently delete trade login{" "}
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {pendingDeleteAccount.tradeName}
                </span>
                . It is not assigned to any jobs. This cannot be undone.
              </>
            ) : (
              <>
                This will permanently delete trade login{" "}
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {pendingDeleteAccount.tradeName}
                </span>
                . This removes the login, its {assignedJobCount(pendingDeleteAccount)} job assignment(s), and linked
                project subtrade rows from job pages. This cannot be undone.
              </>
            )
          ) : null
        }
        onCancel={() => {
          if (deletingAccountId === null) setPendingDeleteAccount(null);
        }}
        onConfirm={() => void confirmDeletePortalAccount()}
      />

      <ConfirmDialog
        open={pendingRemoveAssignment !== null}
        confirmLabel="Yes, remove"
        message={
          pendingRemoveAssignment ? (
            <>
              Remove{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {labelForDraft(pendingRemoveAssignment)}
              </span>{" "}
              from this trade&apos;s assignments? Click Save assignments to apply the change.
            </>
          ) : null
        }
        onCancel={() => setPendingRemoveAssignment(null)}
        onConfirm={async () => {
          if (!pendingRemoveAssignment) return;
          removeDraftAssignment(pendingRemoveAssignment.projectId, pendingRemoveAssignment.tradeName);
          setPendingRemoveAssignment(null);
        }}
      />

      <ConfirmDialog
        open={pendingDeleteOrphanTrade !== null}
        confirmLabel="Yes, delete"
        loading={deletingOrphanTrade}
        message={
          pendingDeleteOrphanTrade ? (
            <>
              This will permanently delete trade{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{pendingDeleteOrphanTrade}</span> from
              all project subtrade lists and clear any pending portal assignments. This trade does not have a portal
              login yet. This cannot be undone.
            </>
          ) : null
        }
        onCancel={() => {
          if (!deletingOrphanTrade) setPendingDeleteOrphanTrade(null);
        }}
        onConfirm={() => void confirmDeleteOrphanTrade()}
      />
    </div>
  );
}
