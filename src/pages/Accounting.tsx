import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const cardStyle = {
  padding: "1.25rem",
  borderRadius: "0.75rem",
  backgroundColor: "#ffffff",
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.04)",
};

const RECORD_TYPES = ["invoice", "payment", "change_order", "cost_code_entry"] as const;

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString();
}

export function Accounting() {
  const user = useQuery(api.users.current);
  const projects = useQuery(api.projects.listProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | "">("");

  const records = useQuery(
    api.accounting.listAccountingRecordsByProject,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  );
  const project = projects?.find((p) => p._id === selectedProjectId);

  const createRecord = useMutation(api.accounting.createAccountingRecord);

  const [newType, setNewType] = useState<(typeof RECORD_TYPES)[number]>("invoice");
  const [newAmount, setNewAmount] = useState("");
  const [newStatus, setNewStatus] = useState("pending");
  const [newNotes, setNewNotes] = useState("");

  const canEdit = user?.role === "accounting" || user?.role === "admin";

  function handleAddRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId || newAmount === "" || Number.isNaN(Number(newAmount))) return;
    const amount = Number(newAmount);
    if (amount < 0) return;
    createRecord({
      projectId: selectedProjectId,
      type: newType,
      amount,
      status: newStatus,
      date: Date.now(),
      notes: newNotes || undefined,
    });
    setNewAmount("");
    setNewStatus("pending");
    setNewNotes("");
  }

  const pendingTotal =
    records?.filter((r) => r.status === "pending" || r.status === "overdue").reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#022c22", marginBottom: "0.5rem" }}>
        Accounting
      </h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Project financials and accounting records. Select a project to view and add records.
      </p>

      <div style={{ marginBottom: "1.5rem" }}>
        <label
          htmlFor="accounting-project"
          style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#374151" }}
        >
          Project
        </label>
        <select
          id="accounting-project"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #e5e7eb",
            fontFamily: "Montserrat, sans-serif",
            minWidth: "16rem",
          }}
        >
          <option value="">Select a project</option>
          {projects?.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {selectedProjectId && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <div style={cardStyle}>
              <div style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                Budget
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#022c22" }}>
                {project?.budget != null ? `$${project.budget.toLocaleString()}` : "—"}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                Actual cost
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#022c22" }}>
                {project?.actualCost != null ? `$${project.actualCost.toLocaleString()}` : "—"}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                Pending / overdue
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: pendingTotal > 0 ? "#dc2626" : "#022c22" }}>
                ${pendingTotal.toLocaleString()}
              </div>
            </div>
          </div>

          {canEdit && (
            <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#111827", marginBottom: "0.75rem" }}>
                Add record
              </h2>
              <form onSubmit={handleAddRecord} style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as (typeof RECORD_TYPES)[number])}
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #e5e7eb",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    {RECORD_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>Amount</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="0"
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #e5e7eb",
                      fontFamily: "Montserrat, sans-serif",
                      width: "7rem",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>Status</label>
                  <input
                    type="text"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    placeholder="pending"
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #e5e7eb",
                      fontFamily: "Montserrat, sans-serif",
                      width: "6rem",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>Notes</label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Optional"
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #e5e7eb",
                      fontFamily: "Montserrat, sans-serif",
                      minWidth: "10rem",
                    }}
                  />
                </div>
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
                  Add record
                </button>
              </form>
            </div>
          )}

          <div style={cardStyle}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#111827", marginBottom: "0.75rem" }}>
              Records
            </h2>
            {records === undefined ? (
              <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading…</p>
            ) : records.length === 0 ? (
              <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No accounting records yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Date</th>
                      <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Type</th>
                      <th style={{ textAlign: "right", padding: "0.5rem", color: "#6b7280" }}>Amount</th>
                      <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Status</th>
                      <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "0.5rem", color: "#374151" }}>{formatDate(r.date)}</td>
                        <td style={{ padding: "0.5rem" }}>{r.type.replace(/_/g, " ")}</td>
                        <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 500 }}>${r.amount.toLocaleString()}</td>
                        <td style={{ padding: "0.5rem", color: "#6b7280" }}>{r.status}</td>
                        <td style={{ padding: "0.5rem", color: "#6b7280" }}>{r.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
