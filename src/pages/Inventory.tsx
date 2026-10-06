import type { CSSProperties } from "react";
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type ActiveCheckoutRow = Doc<"equipmentCheckouts"> & {
  kind: "fleet" | "rental" | "project";
  equipmentName: string;
  projectName: string;
  equipmentSerialNumber?: string;
  rentalVendor?: string;
  catalogMissing?: boolean;
};

function kindLabel(kind: ActiveCheckoutRow["kind"]) {
  switch (kind) {
    case "fleet":
      return "Fleet";
    case "rental":
      return "Rental";
    case "project":
      return "Project";
  }
}
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LogoMark } from "../components/LogoMark";
import { primaryButtonStyle } from "../theme";

const inputStyle: CSSProperties = {
  width: "100%",
  marginBottom: "0.75rem",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: "0.25rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--text-primary)",
};

const WHITE_CARD: CSSProperties = {
  borderRadius: "0.75rem",
  border: "3px solid #2f7d68",
  backgroundColor: "var(--surface-card)",
  padding: "0.85rem 1rem",
  boxShadow: "0 6px 12px -8px rgba(16,185,129,0.2)",
};

const TH: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.45rem",
  color: "var(--text-primary)",
  fontWeight: 600,
  fontSize: "0.75rem",
  borderBottom: "2px solid var(--border-strong)",
  whiteSpace: "nowrap",
  backgroundColor: "var(--surface-muted)",
};

const TD: CSSProperties = {
  padding: "0.45rem 0.45rem",
  fontSize: "0.75rem",
  color: "var(--text-primary)",
  borderBottom: "1px solid var(--border-strong)",
  verticalAlign: "top",
};

const FULL_GREEN_CARD: CSSProperties = {
  borderRadius: "0.75rem",
  backgroundColor: "#047857",
  color: "#ffffff",
  padding: "0.85rem 1rem",
  boxShadow: "0 8px 16px -8px rgba(16,185,129,0.35)",
};

const PROJECT_CARD: CSSProperties = {
  borderRadius: "0.75rem",
  border: "1px solid var(--border-strong)",
  backgroundColor: "var(--surface-card)",
  padding: "0.75rem 0.9rem",
  boxShadow: "var(--shadow-surface)",
};

function formatDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

function dash(v: string | number | undefined | null) {
  if (v === undefined || v === null || v === "") return "—";
  return String(v);
}

function buildSiteSummary(
  checkouts: Array<{ equipmentName: string; dateTaken: number }>
): string {
  if (checkouts.length === 0) return "Nothing checked out at this site.";
  const sorted = [...checkouts].sort((a, b) => b.dateTaken - a.dateTaken);
  const maxShow = 4;
  const names = sorted.map((c) => c.equipmentName);
  const head = names.slice(0, maxShow);
  const rest = names.length - maxShow;
  let text = head.join(", ");
  if (rest > 0) text += ` (+${rest} more)`;
  return text;
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1970;

export function Inventory() {
  const catalog = useQuery(api.safety.listEquipmentCatalog);
  const activeCheckouts = useQuery(api.safety.listActiveEquipmentCheckouts);
  const projects = useQuery(api.projects.listProjects, {});

  const addCatalogItem = useMutation(api.safety.addCatalogItem);
  const updateCatalogItem = useMutation(api.safety.updateCatalogItem);
  const removeCatalogItem = useMutation(api.safety.removeCatalogItem);
  const removeProjectEquipmentEntry = useMutation(api.safety.removeProjectEquipmentEntry);
  const returnCheckout = useMutation(api.safety.returnEquipmentCheckout);

  const [newName, setNewName] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newYearBought, setNewYearBought] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isCatalogFormOpen, setIsCatalogFormOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{
    equipmentId: Id<"equipmentCatalog">;
    name: string;
    hasActiveCheckout: boolean;
  } | null>(null);
  const [confirmRemoveRental, setConfirmRemoveRental] = useState<{
    checkoutId: Id<"equipmentCheckouts">;
    name: string;
    projectName: string;
  } | null>(null);

  const latestActiveByEquipmentId = useMemo(() => {
    const m = new Map<string, ActiveCheckoutRow>();
    if (!activeCheckouts) return m;
    for (const checkout of activeCheckouts) {
      if (!checkout.equipmentId) continue;
      const existing = m.get(checkout.equipmentId);
      if (!existing || checkout.dateTaken > existing.dateTaken) {
        m.set(checkout.equipmentId, checkout);
      }
    }
    return m;
  }, [activeCheckouts]);

  const nonFleetActive = useMemo(() => {
    if (!activeCheckouts) return undefined;
    return activeCheckouts.filter((c: ActiveCheckoutRow) => c.kind !== "fleet");
  }, [activeCheckouts]);

  const checkoutsByProjectId = useMemo(() => {
    const m = new Map<string, ActiveCheckoutRow[]>();
    if (!activeCheckouts) return m;
    for (const c of activeCheckouts) {
      const pid = c.projectId as string;
      const list = m.get(pid) ?? [];
      list.push(c);
      m.set(pid, list);
    }
    return m;
  }, [activeCheckouts]);

  async function handleAddCatalogItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    let yearBought: number | undefined;
    if (newYearBought.trim() !== "") {
      const y = parseInt(newYearBought.trim(), 10);
      if (!Number.isFinite(y) || y < MIN_YEAR || y > CURRENT_YEAR + 1) {
        window.alert(`Year bought must be a whole number between ${MIN_YEAR} and ${CURRENT_YEAR + 1}.`);
        return;
      }
      yearBought = y;
    }
    await addCatalogItem({
      name: newName.trim(),
      serialNumber: newSerial.trim() || undefined,
      notes: newNotes.trim() || undefined,
      yearBought,
    });
    setNewName("");
    setNewSerial("");
    setNewYearBought("");
    setNewNotes("");
  }

  const totalFleet =
    catalog === undefined
      ? undefined
      : catalog.filter((c: Doc<"equipmentCatalog">) => c.isActive !== false).length;

  const totalAtProjects = activeCheckouts === undefined ? undefined : activeCheckouts.length;

  const inHouseItems =
    catalog === undefined
      ? undefined
      : catalog.filter((item: Doc<"equipmentCatalog">) => !latestActiveByEquipmentId.has(item._id));

  const orphanedCheckouts = useMemo((): ActiveCheckoutRow[] | undefined => {
    if (!activeCheckouts) return undefined;
    return activeCheckouts.filter(
      (c: ActiveCheckoutRow) => c.equipmentId != null && c.catalogMissing,
    );
  }, [activeCheckouts]);

  const masterListLoading = catalog === undefined || activeCheckouts === undefined;
  const catalogItems = catalog ?? [];
  const orphanRows = orphanedCheckouts ?? [];
  const showMasterTable = !masterListLoading && (catalogItems.length > 0 || orphanRows.length > 0);

  function orphanDisplayName(row: ActiveCheckoutRow) {
    return row.equipmentName !== "—" ? row.equipmentName : "(Removed from catalog)";
  }

  function renderOrphanRows() {
    return orphanRows.map((row) => (
      <tr
        key={row._id}
        style={{
          borderLeft: "3px solid #f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.06)",
        }}
      >
        <td style={TD}>
          {orphanDisplayName(row)}
          <span style={{ display: "block", fontSize: "0.65rem", color: "var(--color-gray-500)", marginTop: "0.15rem" }}>
            Removed from catalog — mark returned to clear
          </span>
        </td>
        <td style={TD}>—</td>
        <td style={TD}>—</td>
        <td style={TD}>{row.projectName}</td>
        <td style={TD}>{formatDate(row.dateTaken)}</td>
        <td style={TD}>—</td>
        <td style={TD}>
          <button
            type="button"
            onClick={() => returnCheckout({ checkoutId: row._id })}
            style={{
              padding: "0.2rem 0.45rem",
              fontSize: "0.7rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--color-emerald-500)",
              color: "var(--color-emerald-500)",
              background: "none",
              cursor: "pointer",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            Mark returned
          </button>
        </td>
      </tr>
    ));
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 className="page-title" style={{ marginBottom: "0.5rem", color: "var(--text-primary)" }}>
        Inventory <LogoMark />
      </h1>
      <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
        Track all equipment with name, location (project), and date taken out.
      </p>
      <p style={{ color: "var(--color-gray-500)", fontSize: "0.8125rem", marginBottom: "1.25rem" }}>
        <Link to="/inventory-form" style={{ color: "var(--color-emerald-500)", fontWeight: 500 }}>
          Share form link
        </Link>{" "}
        — send to people without app access so they can submit equipment checkouts.
      </p>

      <div
        className="inventory-top-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(16rem, 22rem)",
          gap: "1rem",
          alignItems: "start",
          marginBottom: "1rem",
        }}
      >
        <style>{`
          @media (max-width: 960px) {
            .inventory-top-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>

        {/* Master list */}
        <div id="master-equipment-log" style={WHITE_CARD}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              marginBottom: "0.5rem",
            }}
          >
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
              Inventory master list
            </h2>
            <button
              type="button"
              onClick={() => setIsCatalogFormOpen((v) => !v)}
              aria-expanded={isCatalogFormOpen}
              aria-controls="catalog-add-form"
              style={{
                ...primaryButtonStyle,
                padding: "0.4rem 0.85rem",
                fontSize: "0.8125rem",
              }}
            >
              {isCatalogFormOpen ? "Close" : "Add"}
            </button>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--color-gray-500)", margin: "0 0 0.75rem" }}>
            Full catalog with current location and checkout date.
          </p>

          {isCatalogFormOpen && (
            <form
              id="catalog-add-form"
              onSubmit={handleAddCatalogItem}
              style={{ marginBottom: "1.25rem", maxWidth: "32rem", display: "grid", gap: "0.5rem" }}
            >
              <div>
                <label style={labelStyle}>Title (equipment name) *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ ...inputStyle, color: "var(--text-primary)", backgroundColor: "var(--surface-panel)" }}
                  placeholder="e.g. Forklift #3"
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Serial ID (optional)</label>
                <input
                  type="text"
                  value={newSerial}
                  onChange={(e) => setNewSerial(e.target.value)}
                  style={{ ...inputStyle, color: "var(--text-primary)", backgroundColor: "var(--surface-panel)" }}
                  placeholder="e.g. SN-12345"
                />
              </div>
              <div>
                <label style={labelStyle}>Year bought (optional)</label>
                <input
                  type="number"
                  min={MIN_YEAR}
                  max={CURRENT_YEAR + 1}
                  step={1}
                  value={newYearBought}
                  onChange={(e) => setNewYearBought(e.target.value)}
                  style={{ ...inputStyle, color: "var(--text-primary)", backgroundColor: "var(--surface-panel)" }}
                  placeholder={`e.g. ${CURRENT_YEAR - 2}`}
                />
              </div>
              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  style={{ ...inputStyle, color: "var(--text-primary)", backgroundColor: "var(--surface-panel)" }}
                  placeholder="e.g. Stored at yard"
                />
              </div>
              <div>
                <button type="submit" style={primaryButtonStyle}>
                  Add to catalog
                </button>
              </div>
            </form>
          )}

          {masterListLoading ? (
            <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem", margin: 0 }}>Loading catalog…</p>
          ) : !showMasterTable ? (
            <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem", margin: 0 }}>
              No catalog items yet. Use Add to create one.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Title</th>
                    <th style={TH}>Serial ID</th>
                    <th style={TH}>Year bought</th>
                    <th style={TH}>Location current</th>
                    <th style={TH}>Date taken out</th>
                    <th style={TH}>Active</th>
                    <th style={{ ...TH, minWidth: "9rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogItems.map((item: Doc<"equipmentCatalog">) => {
                    const activeCheckout = latestActiveByEquipmentId.get(item._id);
                    const isOut = Boolean(activeCheckout);
                    return (
                      <tr
                        key={item._id}
                        style={{
                          borderLeft: isOut ? "3px solid #f59e0b" : "3px solid transparent",
                        }}
                      >
                        <td style={TD}>{item.name}</td>
                        <td style={TD}>{dash(item.serialNumber)}</td>
                        <td style={TD}>{dash(item.yearBought)}</td>
                        <td style={TD}>{isOut ? activeCheckout!.projectName : "In house"}</td>
                        <td style={TD}>{isOut ? formatDate(activeCheckout!.dateTaken) : "—"}</td>
                        <td style={TD}>
                          <label
                            style={{
                              fontSize: "0.75rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={item.isActive !== false}
                              onChange={(e) =>
                                updateCatalogItem({
                                  equipmentId: item._id,
                                  isActive: e.target.checked,
                                })
                              }
                            />
                            <span>{item.isActive === false ? "Inactive" : "Active"}</span>
                          </label>
                        </td>
                        <td style={TD}>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "0.35rem",
                              justifyContent: "flex-start",
                            }}
                          >
                            {activeCheckout && (
                              <button
                                type="button"
                                onClick={() => returnCheckout({ checkoutId: activeCheckout._id })}
                                style={{
                                  padding: "0.2rem 0.45rem",
                                  fontSize: "0.7rem",
                                  borderRadius: "0.375rem",
                                  border: "1px solid var(--color-emerald-500)",
                                  color: "var(--color-emerald-500)",
                                  background: "none",
                                  cursor: "pointer",
                                  fontFamily: "Montserrat, sans-serif",
                                }}
                              >
                                Mark returned
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmRemove({
                                  equipmentId: item._id,
                                  name: item.name,
                                  hasActiveCheckout: latestActiveByEquipmentId.has(item._id),
                                })
                              }
                              style={{
                                padding: "0.2rem 0.45rem",
                                fontSize: "0.7rem",
                                borderRadius: "0.375rem",
                                border: "1px solid var(--color-red-600)",
                                color: "var(--color-red-600)",
                                background: "none",
                                cursor: "pointer",
                                fontFamily: "Montserrat, sans-serif",
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {renderOrphanRows()}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* In house */}
        <div style={WHITE_CARD}>
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.35rem", color: "var(--text-primary)" }}>
            In house equipment
          </h2>
          <p style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", margin: "0 0 0.65rem" }}>
            Not currently checked out to a job.
          </p>
          {inHouseItems === undefined ? (
            <p style={{ color: "var(--color-gray-500)", fontSize: "0.8rem", margin: 0 }}>Loading…</p>
          ) : inHouseItems.length === 0 ? (
            <p style={{ color: "var(--color-gray-500)", fontSize: "0.8rem", margin: 0 }}>
              No equipment in house (or catalog is empty).
            </p>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "min(70vh, 36rem)", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Title</th>
                    <th style={TH}>Serial ID</th>
                    <th style={TH}>Year bought</th>
                  </tr>
                </thead>
                <tbody>
                  {inHouseItems.map((item: Doc<"equipmentCatalog">) => (
                    <tr key={item._id}>
                      <td style={TD}>{item.name}</td>
                      <td style={TD}>{dash(item.serialNumber)}</td>
                      <td style={TD}>{dash(item.yearBought)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
        className="inventory-stats-grid"
      >
        <style>{`
          @media (max-width: 520px) {
            .inventory-stats-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
        <div style={FULL_GREEN_CARD}>
          <div style={{ fontWeight: 700, fontSize: "0.78rem", opacity: 0.95, marginBottom: "0.35rem" }}>
            Total equipment we have
          </div>
          <div style={{ fontWeight: 800, fontSize: "1.65rem", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            {totalFleet === undefined ? "—" : String(totalFleet)}
          </div>
        </div>
        <div style={FULL_GREEN_CARD}>
          <div style={{ fontWeight: 700, fontSize: "0.78rem", opacity: 0.95, marginBottom: "0.35rem" }}>
            Total equipment at projects
          </div>
          <div style={{ fontWeight: 800, fontSize: "1.65rem", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            {totalAtProjects === undefined ? "—" : String(totalAtProjects)}
          </div>
        </div>
      </div>

      <h2
        id="rentals-on-jobs"
        style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.65rem", color: "var(--text-primary)" }}
      >
        Rentals and project equipment on jobs
      </h2>
      {nonFleetActive === undefined ? (
        <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>Loading…</p>
      ) : nonFleetActive.length === 0 ? (
        <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
          No rentals or project-specific equipment currently on jobs.
        </p>
      ) : (
        <div style={{ ...WHITE_CARD, marginBottom: "1.5rem" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Name</th>
                  <th style={TH}>Type</th>
                  <th style={TH}>Project</th>
                  <th style={TH}>Vendor</th>
                  <th style={TH}>Date out</th>
                  <th style={{ ...TH, minWidth: "9rem" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {nonFleetActive.map((row: ActiveCheckoutRow) => (
                  <tr key={row._id}>
                    <td style={TD}>{row.equipmentName}</td>
                    <td style={TD}>{kindLabel(row.kind)}</td>
                    <td style={TD}>
                      <Link
                        to={`/projects/${row.projectId}/inventory`}
                        style={{ color: "var(--color-emerald-500)", fontWeight: 500 }}
                      >
                        {row.projectName}
                      </Link>
                    </td>
                    <td style={TD}>{row.rentalVendor?.trim() ? row.rentalVendor : "—"}</td>
                    <td style={TD}>{formatDate(row.dateTaken)}</td>
                    <td style={TD}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                        <button
                          type="button"
                          onClick={() => returnCheckout({ checkoutId: row._id })}
                          style={{
                            padding: "0.2rem 0.45rem",
                            fontSize: "0.7rem",
                            borderRadius: "0.375rem",
                            border: "1px solid var(--color-emerald-500)",
                            color: "var(--color-emerald-500)",
                            background: "none",
                            cursor: "pointer",
                            fontFamily: "Montserrat, sans-serif",
                          }}
                        >
                          Mark returned
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmRemoveRental({
                              checkoutId: row._id,
                              name: row.equipmentName,
                              projectName: row.projectName,
                            })
                          }
                          style={{
                            padding: "0.2rem 0.45rem",
                            fontSize: "0.7rem",
                            borderRadius: "0.375rem",
                            border: "1px solid var(--color-red-600)",
                            color: "var(--color-red-600)",
                            background: "none",
                            cursor: "pointer",
                            fontFamily: "Montserrat, sans-serif",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.65rem", color: "var(--text-primary)" }}>
        Equipment by project
      </h2>
      {projects === undefined ? (
        <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem" }}>Loading projects…</p>
      ) : projects.length === 0 ? (
        <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem" }}>No projects in your tracker.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))",
            gap: "0.75rem",
          }}
        >
          {projects.map((p: Doc<"projects">) => {
            const rows = checkoutsByProjectId.get(p._id as string) ?? [];
            const summary = buildSiteSummary(
              rows.map((r: ActiveCheckoutRow) => ({ equipmentName: r.equipmentName, dateTaken: r.dateTaken }))
            );
            return (
              <Link
                key={p._id}
                to={`/projects/${p._id}/inventory`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div style={PROJECT_CARD}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.35rem", color: "var(--text-primary)" }}>
                    {p.name}
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem", lineHeight: 1.45, color: "var(--color-gray-500)" }}>
                    {summary}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        confirmLabel="Yes, remove"
        message={
          confirmRemove ? (
            <>
              This will permanently remove{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{confirmRemove.name}</span> from the
              master catalog. This cannot be undone.
              {confirmRemove.hasActiveCheckout ? (
                <>
                  {" "}
                  Any active checkout for this item will be marked returned automatically.
                </>
              ) : null}
            </>
          ) : null
        }
        onCancel={() => setConfirmRemove(null)}
        onConfirm={async () => {
          if (!confirmRemove) return;
          const { equipmentId } = confirmRemove;
          setConfirmRemove(null);
          await removeCatalogItem({ equipmentId });
        }}
      />

      <ConfirmDialog
        open={confirmRemoveRental !== null}
        confirmLabel="Yes, delete"
        message={
          confirmRemoveRental ? (
            <>
              This will permanently delete{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{confirmRemoveRental.name}</span> from{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{confirmRemoveRental.projectName}</span>
              . This cannot be undone.
            </>
          ) : null
        }
        onCancel={() => setConfirmRemoveRental(null)}
        onConfirm={async () => {
          if (!confirmRemoveRental) return;
          const { checkoutId } = confirmRemoveRental;
          setConfirmRemoveRental(null);
          await removeProjectEquipmentEntry({ checkoutId });
        }}
      />
    </div>
  );
}
