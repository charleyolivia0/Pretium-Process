import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SearchableSelect } from "../../components/SearchableSelect";
import { primaryButtonStyle } from "../../theme";
import { dateInputValueToTimestamp, todayDateInputValue } from "../../utils/dateInput";

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

const WHITE_CARD: CSSProperties = {
  borderRadius: "0.75rem",
  border: "3px solid #2f7d68",
  backgroundColor: "var(--surface-panel)",
  padding: "0.85rem 1rem",
  boxShadow: "0 6px 12px -8px rgba(16,185,129,0.2)",
};

const FULL_GREEN_CARD: CSSProperties = {
  borderRadius: "0.75rem",
  backgroundColor: "#047857",
  color: "#ffffff",
  padding: "0.85rem 1rem",
  boxShadow: "0 8px 16px -8px rgba(16,185,129,0.35)",
};

const LINK_CARD: CSSProperties = {
  borderRadius: "0.75rem",
  border: "1px solid #2f7d68",
  backgroundColor: "var(--surface-panel)",
  padding: "0.65rem 0.75rem",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: "0.25rem",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "var(--text-primary)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  marginBottom: "0.65rem",
  padding: "0.4rem 0.5rem",
  borderRadius: "0.375rem",
  border: "1px solid var(--border-strong)",
  fontSize: "0.8125rem",
  fontFamily: "Montserrat, sans-serif",
};

function formatDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

function kindLabel(kind: "fleet" | "rental" | "project") {
  switch (kind) {
    case "fleet":
      return "Fleet";
    case "rental":
      return "Rental";
    case "project":
      return "Project";
  }
}

function serialOrVendor(row: EquipmentLogRow) {
  if (row.kind === "fleet") {
    return row.equipmentSerialNumber?.trim() ? row.equipmentSerialNumber : "—";
  }
  return row.rentalVendor?.trim() ? row.rentalVendor : "—";
}

export type EquipmentLogRow = Doc<"equipmentCheckouts"> & {
  kind: "fleet" | "rental" | "project";
  equipmentName: string;
  equipmentSerialNumber?: string;
  catalogMissing?: boolean;
};

type Props = {
  projectId: Id<"projects">;
  equipmentLog: EquipmentLogRow[] | undefined;
};

export function ProjectInventorySection({ projectId, equipmentLog }: Props) {
  const catalog = useQuery(api.safety.listEquipmentCatalog);
  const addFleetCheckout = useMutation(api.safety.addFleetCheckoutToProject);
  const addProjectEntry = useMutation(api.safety.addProjectEquipmentEntry);
  const returnCheckout = useMutation(api.safety.returnEquipmentCheckout);
  const removeEntry = useMutation(api.safety.removeProjectEquipmentEntry);

  const [copyLabel, setCopyLabel] = useState<"Copy link" | "Copied!" | "Could not copy">("Copy link");
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [addMode, setAddMode] = useState<"fleet" | "rental">("fleet");

  const [fleetEquipmentId, setFleetEquipmentId] = useState<Id<"equipmentCatalog"> | "">("");
  const [fleetTakenOutBy, setFleetTakenOutBy] = useState("");
  const [fleetDateTaken, setFleetDateTaken] = useState(todayDateInputValue());
  const [fleetSubmitting, setFleetSubmitting] = useState(false);

  const [rentalName, setRentalName] = useState("");
  const [rentalVendor, setRentalVendor] = useState("");
  const [rentalNotes, setRentalNotes] = useState("");
  const [rentalKind, setRentalKind] = useState<"rental" | "project">("rental");
  const [rentalTakenOutBy, setRentalTakenOutBy] = useState("");
  const [rentalDateTaken, setRentalDateTaken] = useState(todayDateInputValue());
  const [rentalSubmitting, setRentalSubmitting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{
    checkoutId: Id<"equipmentCheckouts">;
    name: string;
  } | null>(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  const signOutLink = `/inventory-form?projectId=${projectId}`;

  const activeRows = useMemo(
    () => (equipmentLog ?? []).filter((r) => r.returnedAt == null),
    [equipmentLog],
  );
  const historyRows = useMemo(
    () => (equipmentLog ?? []).filter((r) => r.returnedAt != null),
    [equipmentLog],
  );

  const equipmentOptions = useMemo(
    () =>
      (catalog ?? [])
        .filter((item: Doc<"equipmentCatalog">) => item.isActive !== false)
        .map((item: Doc<"equipmentCatalog">) => ({
          id: item._id,
          label: `${item.name}${item.serialNumber ? ` (${item.serialNumber})` : ""}`,
        })),
    [catalog],
  );

  async function handleCopyLink() {
    try {
      const textToCopy =
        typeof window !== "undefined" ? `${window.location.origin}${signOutLink}` : signOutLink;
      await navigator.clipboard.writeText(textToCopy);
      setCopyLabel("Copied!");
    } catch {
      setCopyLabel("Could not copy");
    }
    window.setTimeout(() => setCopyLabel("Copy link"), 1800);
  }

  async function handleFleetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fleetEquipmentId) return;
    setFleetSubmitting(true);
    try {
      await addFleetCheckout({
        projectId,
        equipmentId: fleetEquipmentId,
        takenOutByName: fleetTakenOutBy.trim() || undefined,
        dateTaken: dateInputValueToTimestamp(fleetDateTaken.trim()),
      });
      setFleetEquipmentId("");
      setFleetTakenOutBy("");
      setFleetDateTaken(todayDateInputValue());
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not add fleet checkout");
    } finally {
      setFleetSubmitting(false);
    }
  }

  async function handleRentalSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rentalName.trim()) return;
    setRentalSubmitting(true);
    try {
      await addProjectEntry({
        projectId,
        kind: rentalKind,
        displayName: rentalName.trim(),
        rentalVendor: rentalVendor.trim() || undefined,
        notes: rentalNotes.trim() || undefined,
        takenOutByName: rentalTakenOutBy.trim() || undefined,
        dateTaken: dateInputValueToTimestamp(rentalDateTaken.trim()),
      });
      setRentalName("");
      setRentalVendor("");
      setRentalNotes("");
      setRentalTakenOutBy("");
      setRentalDateTaken(todayDateInputValue());
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not add equipment");
    } finally {
      setRentalSubmitting(false);
    }
  }

  const countDisplay = equipmentLog === undefined ? "—" : String(activeRows.length);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 14rem) minmax(0, 1fr)",
          gap: "1rem",
          alignItems: "stretch",
        }}
        className="project-inventory-grid"
      >
        <style>{`
          @media (max-width: 1100px) {
            .project-inventory-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>

        <div style={{ display: "grid", gap: "0.65rem", alignSelf: "start" }}>
          <div style={FULL_GREEN_CARD}>
            <div style={{ fontWeight: 700, fontSize: "0.78rem", opacity: 0.95, marginBottom: "0.35rem" }}>
              Total equipment on site
            </div>
            <div style={{ fontWeight: 800, fontSize: "1.65rem", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              {countDisplay}
            </div>
          </div>
          <div style={LINK_CARD}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#065f46", marginBottom: "0.4rem" }}>
              Equipment sign-out form
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <Link to={signOutLink} style={{ color: "#059669", fontWeight: 600, fontSize: "0.78rem" }}>
                Open form
              </Link>
              <button
                type="button"
                onClick={handleCopyLink}
                style={{
                  border: "1px solid #10b981",
                  color: "#047857",
                  backgroundColor: "#ecfdf5",
                  borderRadius: "0.375rem",
                  padding: "0.15rem 0.45rem",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                {copyLabel}
              </button>
            </div>
          </div>
          <div style={LINK_CARD}>
            <Link
              to="/inventory#master-equipment-log"
              style={{ color: "#059669", fontWeight: 600, fontSize: "0.78rem" }}
            >
              Open master equipment log
            </Link>
          </div>
        </div>

        <div style={{ display: "grid", gap: "1rem" }}>
          <div style={WHITE_CARD}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
                marginBottom: "0.5rem",
              }}
            >
              <h2 className="section-header" style={{ margin: 0 }}>
                Project inventory log
              </h2>
              <button
                type="button"
                onClick={() => setAddPanelOpen((v) => !v)}
                style={{ ...primaryButtonStyle, padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
              >
                {addPanelOpen ? "Close" : "Add equipment"}
              </button>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: "0 0 0.75rem" }}>
              Fleet, rentals, and project-specific equipment on this job. Entries roll up to the{" "}
              <Link to="/inventory#master-equipment-log" style={{ color: "#059669", fontWeight: 600 }}>
                master inventory log
              </Link>
              .
            </p>

            {addPanelOpen && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border-strong)",
                  backgroundColor: "var(--surface-muted)",
                }}
              >
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setAddMode("fleet")}
                    style={{
                      padding: "0.25rem 0.6rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      borderRadius: "0.375rem",
                      border: addMode === "fleet" ? "2px solid #047857" : "1px solid var(--border-strong)",
                      backgroundColor: addMode === "fleet" ? "#ecfdf5" : "var(--surface-panel)",
                      cursor: "pointer",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    Fleet checkout
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode("rental")}
                    style={{
                      padding: "0.25rem 0.6rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      borderRadius: "0.375rem",
                      border: addMode === "rental" ? "2px solid #047857" : "1px solid var(--border-strong)",
                      backgroundColor: addMode === "rental" ? "#ecfdf5" : "var(--surface-panel)",
                      cursor: "pointer",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    Rental / project equipment
                  </button>
                </div>

                {addMode === "fleet" ? (
                  <form onSubmit={handleFleetSubmit}>
                    <label style={labelStyle}>Fleet equipment *</label>
                    <SearchableSelect
                      options={equipmentOptions}
                      value={fleetEquipmentId}
                      onChange={(id) => setFleetEquipmentId(id)}
                      placeholder={catalog === undefined ? "Loading…" : "Select equipment"}
                      searchPlaceholder="Search equipment…"
                      emptyMessage="No equipment in catalog."
                      noResultsMessage="No matches."
                      disabled={fleetSubmitting || catalog === undefined}
                    />
                    <label style={labelStyle}>Taken out by</label>
                    <input
                      type="text"
                      value={fleetTakenOutBy}
                      onChange={(e) => setFleetTakenOutBy(e.target.value)}
                      style={inputStyle}
                      disabled={fleetSubmitting}
                    />
                    <label style={labelStyle}>Date taken out</label>
                    <input
                      type="date"
                      value={fleetDateTaken}
                      onChange={(e) => setFleetDateTaken(e.target.value)}
                      style={inputStyle}
                      disabled={fleetSubmitting}
                    />
                    <button
                      type="submit"
                      disabled={fleetSubmitting || !fleetEquipmentId}
                      style={{ ...primaryButtonStyle, fontSize: "0.8125rem" }}
                    >
                      {fleetSubmitting ? "Adding…" : "Check out to this job"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRentalSubmit}>
                    <label style={labelStyle}>Type</label>
                    <select
                      value={rentalKind}
                      onChange={(e) => setRentalKind(e.target.value as "rental" | "project")}
                      style={inputStyle}
                      disabled={rentalSubmitting}
                    >
                      <option value="rental">Rental</option>
                      <option value="project">Project-specific</option>
                    </select>
                    <label style={labelStyle}>Name *</label>
                    <input
                      type="text"
                      value={rentalName}
                      onChange={(e) => setRentalName(e.target.value)}
                      style={inputStyle}
                      placeholder="e.g. 60' boom lift"
                      required
                      disabled={rentalSubmitting}
                    />
                    <label style={labelStyle}>Vendor (optional)</label>
                    <input
                      type="text"
                      value={rentalVendor}
                      onChange={(e) => setRentalVendor(e.target.value)}
                      style={inputStyle}
                      placeholder="Rental company"
                      disabled={rentalSubmitting}
                    />
                    <label style={labelStyle}>Notes (optional)</label>
                    <input
                      type="text"
                      value={rentalNotes}
                      onChange={(e) => setRentalNotes(e.target.value)}
                      style={inputStyle}
                      disabled={rentalSubmitting}
                    />
                    <label style={labelStyle}>Taken out by</label>
                    <input
                      type="text"
                      value={rentalTakenOutBy}
                      onChange={(e) => setRentalTakenOutBy(e.target.value)}
                      style={inputStyle}
                      disabled={rentalSubmitting}
                    />
                    <label style={labelStyle}>Date on site</label>
                    <input
                      type="date"
                      value={rentalDateTaken}
                      onChange={(e) => setRentalDateTaken(e.target.value)}
                      style={inputStyle}
                      disabled={rentalSubmitting}
                    />
                    <button
                      type="submit"
                      disabled={rentalSubmitting || !rentalName.trim()}
                      style={{ ...primaryButtonStyle, fontSize: "0.8125rem" }}
                    >
                      {rentalSubmitting ? "Adding…" : "Add to project log"}
                    </button>
                  </form>
                )}
              </div>
            )}

            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.5rem" }}>On site</h3>
            {equipmentLog === undefined ? (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>Loading…</p>
            ) : activeRows.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "0 0 1rem" }}>
                No equipment on site for this job yet.
              </p>
            ) : (
              <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH}>Type</th>
                      <th style={TH}>Name</th>
                      <th style={TH}>Serial / vendor</th>
                      <th style={TH}>Date out</th>
                      <th style={TH}>Taken by</th>
                      <th style={TH}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.map((row) => (
                      <tr key={row._id}>
                        <td style={TD}>{kindLabel(row.kind)}</td>
                        <td style={TD}>{row.equipmentName}</td>
                        <td style={{ ...TD, color: "#4b5563" }}>{serialOrVendor(row)}</td>
                        <td style={{ ...TD, color: "#4b5563" }}>{formatDate(row.dateTaken)}</td>
                        <td style={{ ...TD, color: "#4b5563" }}>{row.takenOutByName?.trim() || "—"}</td>
                        <td style={TD}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                            <button
                              type="button"
                              onClick={() => returnCheckout({ checkoutId: row._id })}
                              style={{
                                padding: "0.2rem 0.45rem",
                                fontSize: "0.7rem",
                                borderRadius: "0.375rem",
                                border: "1px solid #10b981",
                                color: "#047857",
                                background: "none",
                                cursor: "pointer",
                                fontFamily: "Montserrat, sans-serif",
                              }}
                            >
                              Mark returned
                            </button>
                            {row.kind !== "fleet" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmRemove({ checkoutId: row._id, name: row.equipmentName })
                                }
                                style={{
                                  padding: "0.2rem 0.45rem",
                                  fontSize: "0.7rem",
                                  borderRadius: "0.375rem",
                                  border: "1px solid #dc2626",
                                  color: "#dc2626",
                                  background: "none",
                                  cursor: "pointer",
                                  fontFamily: "Montserrat, sans-serif",
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.5rem" }}>History</h3>
            {equipmentLog === undefined ? (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>Loading…</p>
            ) : historyRows.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
                No returned equipment history yet.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH}>Type</th>
                      <th style={TH}>Name</th>
                      <th style={TH}>Date out</th>
                      <th style={TH}>Date returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr key={row._id}>
                        <td style={TD}>{kindLabel(row.kind)}</td>
                        <td style={TD}>{row.equipmentName}</td>
                        <td style={{ ...TD, color: "#4b5563" }}>{formatDate(row.dateTaken)}</td>
                        <td style={{ ...TD, color: "#4b5563" }}>{formatDate(row.returnedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove !== null}
        loading={removeSubmitting}
        confirmLabel="Yes, delete"
        message={
          confirmRemove ? (
            <>
              This will permanently delete{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{confirmRemove.name}</span> from this
              project&apos;s inventory log. This cannot be undone.
            </>
          ) : null
        }
        onCancel={() => {
          if (!removeSubmitting) setConfirmRemove(null);
        }}
        onConfirm={async () => {
          if (!confirmRemove) return;
          setRemoveSubmitting(true);
          try {
            await removeEntry({ checkoutId: confirmRemove.checkoutId });
            setConfirmRemove(null);
          } catch (err) {
            window.alert(err instanceof Error ? err.message : "Could not delete entry");
          } finally {
            setRemoveSubmitting(false);
          }
        }}
      />
    </div>
  );
}
