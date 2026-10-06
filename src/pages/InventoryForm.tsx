import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchableSelect } from "../components/SearchableSelect";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

import { cardStyle } from "../theme";
import { useOfflineContext } from "../offline/OfflineProvider";
import { useOfflineCachedQuery } from "../offline/useOfflineCachedQuery";
import { dateInputValueToTimestamp } from "../utils/dateInput";

const inputStyle = {
  width: "100%" as const,
  marginBottom: "0.75rem",
};

const labelStyle = {
  display: "block" as const,
  marginBottom: "0.25rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#374151",
};

export function InventoryForm() {
  const [searchParams] = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId");
  const { isOffline, queueJob } = useOfflineContext();
  const projects = useOfflineCachedQuery(api.projects.listProjectNamesForForm, {}, "projects.listProjectNamesForForm");
  const catalog = useOfflineCachedQuery(api.safety.listEquipmentCatalog, {}, "safety.listEquipmentCatalog");
  const addCheckout = useMutation(api.safety.addEquipmentCheckoutFromForm);
  const [equipmentId, setEquipmentId] = useState<Id<"equipmentCatalog"> | "">("");
  const [projectId, setProjectId] = useState<Id<"projects"> | "">("");
  const [takenOutByName, setTakenOutByName] = useState("");
  const [dateTaken, setDateTaken] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!projectIdFromUrl) return;
    const match = projects?.some((p) => p._id === projectIdFromUrl);
    if (match) setProjectId(projectIdFromUrl as Id<"projects">);
  }, [projectIdFromUrl, projects]);

  const equipmentOptions = useMemo(
    () =>
      (catalog ?? [])
        .filter((item: Doc<"equipmentCatalog">) => item.isActive !== false)
        .map((item: Doc<"equipmentCatalog">) => ({
          id: item._id,
          label: `${item.name}${item.serialNumber ? ` (${item.serialNumber})` : ""}`,
        })),
    [catalog]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!equipmentId || !projectId) return;

    setStatus("submitting");
    setErrorMessage("");

    try {
      if (isOffline) {
        await queueJob({
          type: "inventoryCheckout",
          payload: {
            equipmentId: String(equipmentId),
            projectId: String(projectId),
            takenOutByName: takenOutByName.trim() || undefined,
            dateTaken: dateInputValueToTimestamp(dateTaken.trim()),
          },
        });
        setStatus("success");
        setEquipmentId("");
        setProjectId("");
        setTakenOutByName("");
        setDateTaken("");
        return;
      }
      await addCheckout({
        equipmentId,
        projectId,
        takenOutByName: takenOutByName.trim() || undefined,
        dateTaken: dateInputValueToTimestamp(dateTaken.trim()),
      });
      setStatus("success");
      setEquipmentId("");
      setProjectId("");
      setTakenOutByName("");
      setDateTaken("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Submission failed. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "Montserrat, sans-serif",
        backgroundColor: "#065f46",
        padding: "2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: "28rem",
          width: "100%",
          padding: "2.25rem 2rem",
          borderRadius: "1.25rem",
          boxShadow:
            "0 18px 45px rgba(0, 0, 0, 0.38)," +
            "0 10px 26px rgba(15, 118, 110, 0.45)," +
            "0 0 0 1px rgba(5, 150, 105, 0.22)," +
            "0 2px 0 0 rgba(255, 255, 255, 0.12) inset",
          backgroundColor: "var(--surface-panel)",
          border: "1px solid rgba(5, 150, 105, 0.25)",
          transform: "translateY(-4px)",
        }}
      >
        {/* Brand hint - match login screen */}
        <p
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "#047857",
            marginBottom: "0.5rem",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          Pretium Projects
          <span style={{ letterSpacing: "-0.05em", opacity: 0.9, textTransform: "none" }}>❯❯❯❯</span>
        </p>
        <h1 className="page-title" style={{ marginBottom: "0.25rem" }}>
          Equipment checkout
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#065f46", marginBottom: "1.5rem" }}>
          Submit equipment you’re taking out. This will be added to the taken-out equipment list.
        </p>

          {status === "success" && (
            <p
              style={{
                padding: "0.75rem",
                marginBottom: "1rem",
                borderRadius: "0.5rem",
                backgroundColor: "#d1fae5",
                color: "#065f46",
                fontSize: "0.875rem",
              }}
            >
              {isOffline ? "Queued offline — will sync when you’re back online." : "Submitted. Thank you."}
            </p>
          )}
          {status === "error" && errorMessage && (
            <p
              style={{
                padding: "0.75rem",
                marginBottom: "1rem",
                borderRadius: "0.5rem",
                backgroundColor: "#fee2e2",
                color: "#991b1b",
                fontSize: "0.875rem",
              }}
            >
              {errorMessage}
            </p>
          )}

          <form onSubmit={handleSubmit}>
            <label style={labelStyle}>Equipment *</label>
            <SearchableSelect
              options={equipmentOptions}
              value={equipmentId}
              onChange={(id) => setEquipmentId(id)}
              placeholder={catalog === undefined ? "Loading equipment..." : "Select equipment"}
              searchPlaceholder="Search equipment..."
              emptyMessage="No equipment available."
              noResultsMessage="No equipment matches your search."
              disabled={status === "submitting" || catalog === undefined}
            />

            <label style={labelStyle}>Location (project) *</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value as Id<"projects"> | "")}
              style={inputStyle}
              required
              disabled={status === "submitting" || projects === undefined}
            >
              <option value="">
                {projects === undefined ? "Loading..." : "Select a project"}
              </option>
              {projects?.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>

            <label style={labelStyle}>Taken out by</label>
            <input
              type="text"
              value={takenOutByName}
              onChange={(e) => setTakenOutByName(e.target.value)}
              style={inputStyle}
              placeholder="Your name"
              disabled={status === "submitting"}
            />

            <label style={labelStyle}>Date taken (optional)</label>
            <input
              type="date"
              value={dateTaken}
              onChange={(e) => setDateTaken(e.target.value)}
              style={inputStyle}
              disabled={status === "submitting"}
            />

            <button
              type="submit"
              disabled={status === "submitting" || !equipmentId || !projectId}
              style={{
                width: "100%",
                padding: "0.625rem 1rem",
                borderRadius: "0.5rem",
                fontWeight: 600,
                backgroundColor: status === "submitting" ? "#9ca3af" : "#059669",
                color: "#fff",
                border: "none",
                cursor: status === "submitting" ? "not-allowed" : "pointer",
                fontFamily: "Montserrat, sans-serif",
                fontSize: "0.875rem",
              }}
            >
              {status === "submitting" ? "Submitting..." : "Submit"}
            </button>
          </form>
        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#6b7280", marginTop: "1.25rem" }}>
          Pretium Projects · Inventory form
        </p>
      </div>
    </div>
  );
}
