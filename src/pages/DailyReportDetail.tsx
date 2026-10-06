import { useEffect, useState, useRef, type CSSProperties } from "react";
import { projectQueryArgs } from "../lib/projectQueryArgs";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import VoiceTranscriptionControl from "../components/VoiceTranscriptionControl";
import { MultiSelectDropdown } from "../components/MultiSelectDropdown";
import { useOfflineContext } from "../offline/OfflineProvider";
import { useOfflineCachedQuery } from "../offline/useOfflineCachedQuery";
import { projectSectionHref } from "./projectDetail/projectSectionPaths";
import { dateInputValueToTimestamp, timestampToDateInputValue } from "../utils/dateInput";

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

function describeWeatherCode(code: number) {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Weather unavailable";
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

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function DailyReportDetail() {
  const { projectId, reportId } = useParams<{ projectId: string; reportId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromFolderId = searchParams.get("fromFolder")?.trim() || null;

  const { isOffline, queueJob } = useOfflineContext();
  const project = useOfflineCachedQuery(
    api.projects.getProjectById,
    projectQueryArgs(projectId),
    "projects.getProjectById"
  );
  const tasks = useOfflineCachedQuery(
    api.tasks.listTasksByProject,
    projectQueryArgs(projectId),
    "tasks.listTasksByProject"
  );
  const subtrades = useOfflineCachedQuery(
    api.subtrades.listByProject,
    projectQueryArgs(projectId),
    "subtrades.listByProject"
  );
  const projectDocuments = useOfflineCachedQuery(
    api.documents.listDocumentsByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
    "documents.listDocumentsByProject"
  );

  const convex = useConvex();
  const updateTask = useMutation(api.tasks.updateTask);
  const removeTask = useMutation(api.tasks.removeTask);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocumentRecord = useMutation(api.documents.createDocumentRecord);
  const deleteDocumentRecord = useMutation(api.documents.deleteDocumentRecord);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editWeather, setEditWeather] = useState("");
  const [editSubtradeIdsOnSite, setEditSubtradeIdsOnSite] = useState<Id<"projectSubtrades">[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveAttachmentIdx, setConfirmRemoveAttachmentIdx] = useState<number | null>(null);
  const [editPhotoUrls, setEditPhotoUrls] = useState<string[]>([]);
  const [editDocumentUrls, setEditDocumentUrls] = useState<string[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const photoPickTarget = useRef<"add" | number>("add");
  const docPickTarget = useRef<"add" | number>("add");

  const report =
    projectId && reportId && tasks !== undefined
      ? tasks.find((t) => t._id === reportId && t.isDailyReport === true)
      : undefined;

  useEffect(() => {
    let cancelled = false;
    if (project === undefined || project === null) return;
    const location = project.location?.trim();
    if (!editing || !editDate || !location) return;
    setWeatherLoading(true);
    fetchDailyWeatherSummary(location, editDate)
      .then((summary) => {
        if (!cancelled) setEditWeather(summary);
      })
      .catch(() => {
        if (!cancelled) setEditWeather("Weather unavailable");
      })
      .finally(() => {
        if (!cancelled) setWeatherLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, editDate, project]);

  if (!projectId || !reportId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Daily report not found.</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            marginTop: "0.5rem",
            padding: "0.4rem 0.8rem",
            borderRadius: "0.5rem",
            border: "1px solid #e5e7eb",
            backgroundColor: "var(--surface-panel)",
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            cursor: "pointer",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          Go back
        </button>
      </div>
    );
  }

  if (project === undefined || tasks === undefined || subtrades === undefined) {
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
        <Link to="/projects" style={{ color: "#059669", textDecoration: "none" }}>
          Back to projects
        </Link>
      </div>
    );
  }

  if (!report) {
    const backTo =
      fromFolderId && projectId
        ? `/projects/${projectId}/folders/${fromFolderId}`
        : projectId
          ? projectSectionHref(projectId, "daily_reports")
          : "/projects";
    const backLabel = fromFolderId ? "Back to folder" : "Back to daily reports";
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Daily report not found.</p>
        <Link to={backTo} style={{ color: "#059669", textDecoration: "none" }}>
          {backLabel}
        </Link>
      </div>
    );
  }

  const backToHref =
    fromFolderId && projectId
      ? `/projects/${projectId}/folders/${fromFolderId}`
      : projectId
        ? projectSectionHref(projectId, "daily_reports")
        : "/projects";
  const backToLabel = fromFolderId ? "Back to folder" : "Back to daily reports";

  const startEditing = () => {
    setEditTitle(report.title);
    setEditDescription(report.description ?? "");
    setEditDate(timestampToDateInputValue(report.dueDate));
    setEditWeather(report.weatherSummary ?? "");
    setEditSubtradeIdsOnSite(report.subtradeIdsOnSite ?? []);
    setEditPhotoUrls([...(report.photoUrls ?? [])]);
    setEditDocumentUrls([...(report.documentUrls ?? [])]);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditPhotoUrls([...(report.photoUrls ?? [])]);
    setEditDocumentUrls([...(report.documentUrls ?? [])]);
  };

  async function uploadFileAndGetUrl(file: File): Promise<string> {
    const uploadUrl = await generateUploadUrl();
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: file.type ? { "Content-Type": file.type } : {},
      body: file,
    });
    if (!res.ok) throw new Error("Upload failed");
    const { storageId } = (await res.json()) as { storageId: string };
    const urls = await convex.query(api.documents.getStorageUrlsForIds, {
      storageIds: [storageId as Id<"_storage">],
    });
    const url = urls[0];
    if (!url) throw new Error("Could not resolve file URL");
    return url;
  }

  async function handlePhotoFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isOffline) return;
    const target = photoPickTarget.current;
    setAttachmentBusy(true);
    setAttachmentError(null);
    try {
      const url = await uploadFileAndGetUrl(file);
      if (target === "add") setEditPhotoUrls((prev) => [...prev, url]);
      else
        setEditPhotoUrls((prev) => {
          const next = [...prev];
          if (target >= 0 && target < next.length) next[target] = url;
          return next;
        });
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : "Photo upload failed. Please try again.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function handleDocFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isOffline) return;
    const target = docPickTarget.current;
    setAttachmentBusy(true);
    setAttachmentError(null);
    try {
      const url = await uploadFileAndGetUrl(file);
      if (target === "add") setEditDocumentUrls((prev) => [...prev, url]);
      else
        setEditDocumentUrls((prev) => {
          const next = [...prev];
          if (target >= 0 && target < next.length) next[target] = url;
          return next;
        });
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : "Document upload failed. Please try again.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  const attachmentBtnStyle: CSSProperties = {
    padding: "0.3rem 0.55rem",
    fontSize: "0.78rem",
    borderRadius: "0.35rem",
    border: "1px solid #d1d5db",
    backgroundColor: "var(--surface-panel)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontFamily: "Montserrat, sans-serif",
  };

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", maxWidth: "48rem" }}>
      <Link
        to={backToHref}
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: "#059669",
          textDecoration: "none",
        }}
      >
        {"<-"} {backToLabel}
      </Link>

      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "#022c22",
          marginBottom: "0.25rem",
        }}
      >
        {project.name}
      </h1>
      <p
        style={{
          color: "#6b7280",
          fontSize: "0.875rem",
          marginBottom: "1.5rem",
        }}
      >
        Daily report for {formatDate(report.dueDate)}
      </p>

      {editing ? (
        <div
          style={{
            padding: "1.25rem",
            borderRadius: "0.75rem",
            backgroundColor: "var(--surface-card)",
            border: "1px solid var(--border-strong)",
            display: "grid",
            gap: "0.75rem",
            fontSize: "0.875rem",
          }}
        >
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Report date</label>
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Title</label>
            <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Details (optional)</label>
            <textarea
              rows={4}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem", color: "#6b7280" }}>Weather (auto)</label>
            <input
              type="text"
              value={editWeather}
              onChange={(e) => setEditWeather(e.target.value)}
              placeholder={weatherLoading ? "Loading weather..." : "Weather summary"}
              style={{ width: "100%" }}
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
              emptyMessage="No subtrades on this project."
            />
          </div>
          <input
            ref={photoFileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            disabled={attachmentBusy || isOffline}
            onChange={handlePhotoFileInput}
          />
          <input
            ref={docFileRef}
            type="file"
            style={{ display: "none" }}
            disabled={attachmentBusy || isOffline}
            onChange={handleDocFileInput}
          />
          <div>
            <label style={{ display: "block", marginBottom: "0.35rem", color: "#6b7280" }}>Photos</label>
            {attachmentError ? (
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.78rem", color: "#b91c1c" }}>
                {attachmentError}
              </p>
            ) : null}
            {isOffline ? (
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#9ca3af" }}>
                Connect to the internet to add or replace photos. You can still remove items from the list below before saving.
              </p>
            ) : null}
            <ul style={{ listStyle: "none", padding: 0, margin: "0.35rem 0 0", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {editPhotoUrls.map((url, idx) => (
                <li
                  key={`${url}-${idx}`}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.4rem 0.5rem",
                    borderRadius: "0.35rem",
                    border: "1px solid #e5e7eb",
                    fontSize: "0.8rem",
                  }}
                >
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#059669", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Photo {idx + 1}
                  </a>
                  <button
                    type="button"
                    disabled={attachmentBusy}
                    onClick={() => setEditPhotoUrls((prev) => prev.filter((_, j) => j !== idx))}
                    style={{ ...attachmentBtnStyle, color: "#b91c1c", borderColor: "#fecaca" }}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    disabled={attachmentBusy || isOffline}
                    onClick={() => {
                      photoPickTarget.current = idx;
                      photoFileRef.current?.click();
                    }}
                    style={attachmentBtnStyle}
                  >
                    Replace
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={attachmentBusy || isOffline}
              onClick={() => {
                photoPickTarget.current = "add";
                photoFileRef.current?.click();
              }}
              style={{ ...attachmentBtnStyle, marginTop: "0.4rem" }}
            >
              Add photo
            </button>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.35rem", color: "#6b7280" }}>Documents</label>
            {isOffline ? (
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#9ca3af" }}>
                Connect to the internet to add or replace documents. You can still remove items from the list below before saving.
              </p>
            ) : null}
            <ul style={{ listStyle: "none", padding: 0, margin: "0.35rem 0 0", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {editDocumentUrls.map((url, idx) => {
                const docRow = projectDocuments?.find((d: Doc<"documents">) => d.fileUrl === url);
                return (
                <li
                  key={`${url}-${idx}`}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.4rem 0.5rem",
                    borderRadius: "0.35rem",
                    border: "1px solid #e5e7eb",
                    fontSize: "0.8rem",
                  }}
                >
                  {docRow && projectId ? (
                    <Link
                      to={`/projects/${projectId}/documents/${docRow._id}/view`}
                      style={{ color: "#047857", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}
                    >
                      View
                    </Link>
                  ) : null}
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#059669", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Document {idx + 1}
                  </a>
                  <button
                    type="button"
                    disabled={attachmentBusy}
                    onClick={() => setConfirmRemoveAttachmentIdx(idx)}
                    style={{ ...attachmentBtnStyle, color: "#b91c1c", borderColor: "#fecaca" }}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    disabled={attachmentBusy || isOffline}
                    onClick={() => {
                      docPickTarget.current = idx;
                      docFileRef.current?.click();
                    }}
                    style={attachmentBtnStyle}
                  >
                    Replace
                  </button>
                </li>
                );
              })}
            </ul>
            <button
              type="button"
              disabled={attachmentBusy || isOffline}
              onClick={() => {
                docPickTarget.current = "add";
                docFileRef.current?.click();
              }}
              style={{ ...attachmentBtnStyle, marginTop: "0.4rem" }}
            >
              Add document
            </button>
          </div>
          <VoiceTranscriptionControl onTranscript={(text) => setEditDescription(text)} />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <button
              type="button"
              onClick={async () => {
                const dueMs = dateInputValueToTimestamp(editDate);
                const titleTrim = editTitle.trim();
                const prevDocs = report.documentUrls ?? [];
                if (isOffline) {
                  await queueJob({
                    type: "dailyReportUpdate",
                    payload: {
                      taskId: String(report._id),
                      projectId,
                      title: editTitle,
                      description: editDescription || undefined,
                      dueDate: dueMs,
                      weatherSummary: editWeather || undefined,
                      subtradeIdsOnSite: editSubtradeIdsOnSite.map((x) => String(x)),
                      photoUrls: editPhotoUrls,
                      documentUrls: editDocumentUrls,
                      newPhotoBlobIds: [],
                      newDocBlobIds: [],
                      newPhotoStorageIds: undefined,
                      newDocStorageIds: undefined,
                      editDailyReportFolderId: report.dailyReportFolderId
                        ? String(report.dailyReportFolderId)
                        : null,
                    },
                  });
                  setEditing(false);
                  return;
                }
                await updateTask({
                  taskId: report._id as Id<"projectTasks">,
                  title: editTitle,
                  description: editDescription || undefined,
                  dueDate: dueMs,
                  weatherSummary: editWeather || undefined,
                  subtradeIdsOnSite: editSubtradeIdsOnSite,
                  dailyReportFolderId: report.dailyReportFolderId ?? null,
                  photoUrls: editPhotoUrls,
                  documentUrls: editDocumentUrls,
                });
                if (
                  report.dailyReportFolderId &&
                  projectId &&
                  projectDocuments !== undefined &&
                  titleTrim
                ) {
                  const folderId = report.dailyReportFolderId;
                  const removedDocUrls = prevDocs.filter((u: string) => !editDocumentUrls.includes(u));
                  for (const url of removedDocUrls) {
                    const docRow = projectDocuments.find(
                      (d: Doc<"documents">) => d.fileUrl === url && d.folderId === folderId,
                    );
                    if (docRow) await deleteDocumentRecord({ documentId: docRow._id });
                  }
                  const addedDocUrls = editDocumentUrls.filter((u: string) => !prevDocs.includes(u));
                  if (addedDocUrls.length > 0) {
                    const inFolder = projectDocuments.filter((d: Doc<"documents">) => d.folderId === folderId);
                    const titleRe = new RegExp(`^${escapeRegExp(titleTrim)}\\s+-\\s+attachment\\s+(\\d+)`, "i");
                    let maxN = 0;
                    for (const d of inFolder) {
                      const m = d.name.match(titleRe);
                      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
                    }
                    const ms = dueMs ?? report.dueDate ?? Date.now();
                    for (let i = 0; i < addedDocUrls.length; i++) {
                      await createDocumentRecord({
                        projectId: projectId as Id<"projects">,
                        type: "other",
                        name: `${titleTrim} - attachment ${maxN + i + 1}`,
                        fileUrl: addedDocUrls[i],
                        folderId,
                        createdDate: ms,
                      });
                    }
                  }
                }
                setEditing(false);
              }}
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
            <button
              type="button"
              onClick={cancelEditing}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                border: "1px solid #e5e7eb",
                backgroundColor: "var(--surface-panel)",
                color: "var(--text-primary)",
                cursor: "pointer",
                fontFamily: "Montserrat, sans-serif",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: "1.25rem",
            borderRadius: "0.75rem",
            backgroundColor: "var(--surface-card)",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.04)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-primary)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "0.75rem",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                {report.title}
              </h2>
              <div
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                  marginTop: "0.25rem",
                }}
              >
                {formatDate(report.dueDate)}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
              <button
                type="button"
                onClick={startEditing}
                style={{
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.875rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #d1d5db",
                  backgroundColor: "var(--surface-panel)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.875rem",
                  borderRadius: "0.5rem",
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
          </div>

          <div
            style={{
              fontSize: "0.9375rem",
              color: "#374151",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {report.description || "No details were added for this daily report."}
          </div>
          {report.weatherSummary ? (
            <div style={{ marginTop: "0.9rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Weather:</strong> {report.weatherSummary}
            </div>
          ) : null}
          {report.subtradeIdsOnSite?.length ? (
            <div style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Trades on site:</strong>{" "}
              {subtrades === undefined
                ? "..."
                : report.subtradeIdsOnSite
                    .map((sid) => subtrades.find((st) => st._id === sid)?.name)
                    .filter(Boolean)
                    .join(", ") || "-"}
            </div>
          ) : null}
          {(report.photoUrls?.length || report.documentUrls?.length) ? (
            <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.5rem", fontSize: "0.875rem" }}>
              {report.photoUrls?.length ? (
                <div>
                  <div style={{ color: "#6b7280", marginBottom: "0.25rem" }}>Photos</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {report.photoUrls.map((url: string, idx: number) => (
                      <a key={`${url}-${idx}`} href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#059669", textDecoration: "none" }}>
                        Photo {idx + 1}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {report.documentUrls?.length ? (
                <div>
                  <div style={{ color: "#6b7280", marginBottom: "0.25rem" }}>Documents</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {report.documentUrls.map((url: string, idx: number) => {
                      const docRow = projectDocuments?.find((d: Doc<"documents">) => d.fileUrl === url);
                      return (
                        <span key={`${url}-${idx}`} style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
                          {docRow && projectId ? (
                            <Link
                              to={`/projects/${projectId}/documents/${docRow._id}/view`}
                              style={{ color: "#047857", textDecoration: "none", fontWeight: 600 }}
                            >
                              View
                            </Link>
                          ) : null}
                          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#059669", textDecoration: "none" }}>
                            Document {idx + 1}
                          </a>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={confirmRemoveAttachmentIdx !== null}
        message="Remove this attachment from the daily report? It will be deleted when you save."
        onCancel={() => setConfirmRemoveAttachmentIdx(null)}
        onConfirm={() => {
          if (confirmRemoveAttachmentIdx === null) return;
          const idx = confirmRemoveAttachmentIdx;
          setConfirmRemoveAttachmentIdx(null);
          setEditDocumentUrls((prev) => prev.filter((_, j) => j !== idx));
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        confirmLabel="Yes, continue"
        message={
          <>
            This will permanently delete daily report{" "}
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{report.title}</span>. This cannot be
            undone.
          </>
        }
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await removeTask({ taskId: report._id as Id<"projectTasks"> });
          if (fromFolderId && projectId) {
            navigate(`/projects/${projectId}/folders/${fromFolderId}`);
          } else {
            navigate(projectSectionHref(projectId, "daily_reports"));
          }
        }}
      />

    </div>
  );
}

export default DailyReportDetail;

