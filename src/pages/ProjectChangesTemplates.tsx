import { useState, useRef, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cardStyle } from "../theme";
import { projectQueryArgs } from "../lib/projectQueryArgs";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DocumentPlusIcon } from "../components/DocumentPlusIcon";
import { EditFormTemplateModal } from "../components/EditFormTemplateModal";
import {
  ALL_CHANGE_FORM_TYPES,
  BUILT_IN_FORM_TYPES,
  CHANGE_FORM_TYPE_LABEL,
  type ChangeFormType,
} from "../lib/changeFormTemplate";

const TEMPLATE_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.txt,.xlsx,.xls,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const TEMPLATE_CATEGORY_OPTIONS = [
  { value: "general" as const, label: "General" },
  { value: "rfi" as const, label: "RFI" },
  { value: "co" as const, label: "Change orders" },
  { value: "pcn" as const, label: "PCN" },
  { value: "si" as const, label: "SI" },
  { value: "cor" as const, label: "COR" },
];

function formatTemplateDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type ChangeTemplateRow = {
  _id: Id<"changeDocumentTemplates">;
  title: string;
  fileName: string;
  fileUrl: string;
  category: string;
  uploadedAt: number;
  uploadedByName: string;
};

type Props = {
  projectId?: string;
};

export function ProjectChangesTemplates({ projectId: projectIdProp }: Props) {
  const { id: idParam } = useParams<{ id: string }>();
  const projectId = projectIdProp ?? idParam;
  const project = useQuery(api.projects.getProjectById, projectQueryArgs(projectId));
  const currentUser = useQuery(api.users.current);
  const templates = useQuery(api.changeDocumentTemplates.list);
  const formTemplates = useQuery(api.changeFormTemplates.listAll);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const addTemplate = useMutation(api.changeDocumentTemplates.add);
  const removeTemplate = useMutation(api.changeDocumentTemplates.remove);

  const [pendingRemoveTemplate, setPendingRemoveTemplate] = useState<{ id: Id<"changeDocumentTemplates">; title: string } | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateCategory, setTemplateCategory] = useState<(typeof TEMPLATE_CATEGORY_OPTIONS)[number]["value"]>("general");
  const [templateUploading, setTemplateUploading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const templateFileRef = useRef<HTMLInputElement>(null);
  const [editingFormType, setEditingFormType] = useState<ChangeFormType | null>(null);
  const [formModalReadOnly, setFormModalReadOnly] = useState(false);

  const canManageTemplates =
    currentUser?.role === "admin" ||
    currentUser?.role === "project_manager" ||
    currentUser?.role === "coordinator";

  const formTemplateByType = new Map<ChangeFormType, FunctionReturnType<typeof api.changeFormTemplates.listAll>[number]>(
    (formTemplates ?? []).map((row) => [row.type as ChangeFormType, row]),
  );

  function openFormEditor(type: ChangeFormType, readOnly: boolean) {
    setFormModalReadOnly(readOnly);
    setEditingFormType(type);
  }

  if (projectId == null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>No project selected.</p>
      </div>
    );
  }

  if (project === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>Project not found.</p>
        <Link to="/projects" style={{ color: "#059669" }}>
          Back to projects
        </Link>
      </div>
    );
  }

  async function handleTemplateFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const extOk = /\.(pdf|doc|docx|ppt|pptx|txt|xlsx|xls)$/i.test(file.name);
    if (!extOk && file.type && !file.type.includes("pdf") && !file.type.includes("word") && !file.type.includes("sheet")) {
      setTemplateError("Please upload a PDF, Word, or common office file.");
      if (templateFileRef.current) templateFileRef.current.value = "";
      return;
    }
    setTemplateError(null);
    setTemplateUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const title = (templateTitle.trim() || file.name.replace(/\.[^.]+$/, "")).trim() || file.name;
      await addTemplate({ title, fileName: file.name, storageId, category: templateCategory });
      setTemplateTitle("");
      setCreating(false);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setTemplateUploading(false);
      if (templateFileRef.current) templateFileRef.current.value = "";
    }
  }

  function categoryLabel(cat: string) {
    return TEMPLATE_CATEGORY_OPTIONS.find((o) => o.value === cat)?.label ?? cat;
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <Link
        to={`/projects/${projectId}/changes`}
        style={{ fontSize: "0.875rem", color: "#059669", fontWeight: 500, textDecoration: "none" }}
      >
        {"<-"} Back to Changes
      </Link>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <h1 className="page-title" style={{ margin: 0 }}>
          Template library
        </h1>
        {canManageTemplates && !creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setTemplateError(null);
            }}
            disabled={templateUploading}
            aria-label="Add file template"
            title="Add blank file template"
            style={{
              width: "2.25rem",
              height: "2.25rem",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#059669",
              color: "#fff",
              cursor: templateUploading ? "not-allowed" : "pointer",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.06)",
            }}
          >
            <DocumentPlusIcon size={18} />
          </button>
        )}
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        {project.name} — configure change pop-up forms and upload blank PDF/Word copies shared across the company.
      </p>

      <section style={{ ...cardStyle, marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.35rem 0" }}>
          Pop-up form templates
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0 0 0.85rem 0" }}>
          Each change type has a pop-up form used when you click Add on the Changes hub. Use Preview pop-up to see
          how it looks
          {canManageTemplates
            ? ", or Edit form to add custom fields that appear in the pop-up and on the generated PDF."
            : ". Ask a project manager, coordinator, or admin to add custom fields."}
        </p>

        {formTemplates === undefined ? (
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>Loading form templates…</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {ALL_CHANGE_FORM_TYPES.map((type) => {
              const row = formTemplateByType.get(type);
              const fieldCount = row?.fields?.length ?? 0;
              const label = CHANGE_FORM_TYPE_LABEL[type];
              const hasBuiltIn = BUILT_IN_FORM_TYPES.has(type);
              return (
                <li
                  key={type}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "#f9fafb",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                      {hasBuiltIn
                        ? "Standard form + optional custom fields"
                        : "Custom fields only (configure below)"}
                      {" · "}
                      {fieldCount === 0
                        ? "No custom fields yet"
                        : `${fieldCount} custom field${fieldCount === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => openFormEditor(type, true)}
                      style={{
                        padding: "0.35rem 0.7rem",
                        borderRadius: "0.4rem",
                        border: "1px solid #d1d5db",
                        backgroundColor: "var(--surface-panel)",
                        color: "var(--text-primary)",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "Montserrat, sans-serif",
                      }}
                    >
                      Preview pop-up
                    </button>
                    {canManageTemplates ? (
                      <button
                        type="button"
                        onClick={() => openFormEditor(type, false)}
                        style={{
                          padding: "0.35rem 0.7rem",
                          borderRadius: "0.4rem",
                          border: "1px solid #059669",
                          backgroundColor: "#ecfdf5",
                          color: "#047857",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "Montserrat, sans-serif",
                        }}
                      >
                        Edit form
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.35rem 0" }}>
          Blank file templates
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0 0 0.85rem 0" }}>
          PDF, Word, and other blank forms anyone can download.
          {canManageTemplates ? " Project managers, coordinators, and admins can add or remove files." : ""}
        </p>

        {canManageTemplates && creating && (
          <div
            style={{
              marginBottom: "1.25rem",
              paddingBottom: "1.25rem",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 0.75rem 0" }}>
              New file template
            </h3>
            <label
              htmlFor="template-title"
              style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
            >
              Title (optional — defaults to file name)
            </label>
            <input
              id="template-title"
              type="text"
              value={templateTitle}
              onChange={(e) => setTemplateTitle(e.target.value)}
              placeholder="e.g. Blank RFI — owner format"
              disabled={templateUploading}
              style={{
                display: "block",
                width: "100%",
                maxWidth: "24rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid #d1d5db",
                fontSize: "0.9375rem",
                marginBottom: "0.5rem",
                fontFamily: "Montserrat, sans-serif",
              }}
            />
            <label
              htmlFor="template-category"
              style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.35rem" }}
            >
              Category
            </label>
            <select
              id="template-category"
              value={templateCategory}
              onChange={(e) =>
                setTemplateCategory(e.target.value as (typeof TEMPLATE_CATEGORY_OPTIONS)[number]["value"])
              }
              disabled={templateUploading}
              style={{
                display: "block",
                maxWidth: "24rem",
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid #d1d5db",
                fontSize: "0.9375rem",
                marginBottom: "0.75rem",
                fontFamily: "Montserrat, sans-serif",
                backgroundColor: "var(--surface-panel)",
              }}
            >
              {TEMPLATE_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              ref={templateFileRef}
              type="file"
              accept={TEMPLATE_ACCEPT}
              onChange={handleTemplateFile}
              disabled={templateUploading}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => templateFileRef.current?.click()}
                disabled={templateUploading}
                style={{
                  padding: "0.4rem 0.75rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: "#047857",
                  backgroundColor: "#ecfdf5",
                  border: "1px solid #059669",
                  cursor: templateUploading ? "not-allowed" : "pointer",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                {templateUploading ? "Uploading..." : "Choose file & upload"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setTemplateError(null);
                }}
                disabled={templateUploading}
                style={{
                  padding: "0.4rem 0.75rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  backgroundColor: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  cursor: templateUploading ? "not-allowed" : "pointer",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                Cancel
              </button>
            </div>
            {templateError && (
              <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "#dc2626", marginBottom: 0 }}>{templateError}</p>
            )}
          </div>
        )}

        {templates === undefined ? (
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>Loading templates...</p>
        ) : templates.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
            No file templates yet.
            {canManageTemplates ? " Use the green button above to add a blank form." : ""}
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {(templates as ChangeTemplateRow[]).map((t) => (
              <li
                key={t._id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  padding: "0.65rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#f9fafb",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <a
                    href={t.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontWeight: 600,
                      fontSize: "0.9375rem",
                      color: "#059669",
                      textDecoration: "none",
                      wordBreak: "break-word",
                    }}
                  >
                    {t.title}
                  </a>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.25rem 0 0 0" }}>
                    {categoryLabel(t.category)} · {t.fileName} · {formatTemplateDate(t.uploadedAt)}
                    {t.uploadedByName ? ` · ${t.uploadedByName}` : ""}
                  </p>
                </div>
                {canManageTemplates && (
                  <button
                    type="button"
                    onClick={() => setPendingRemoveTemplate({ id: t._id, title: t.title })}
                    style={{
                      flexShrink: 0,
                      padding: "0.25rem 0.5rem",
                      fontSize: "0.75rem",
                      color: "#b91c1c",
                      background: "transparent",
                      border: "1px solid #fecaca",
                      borderRadius: "0.375rem",
                      cursor: "pointer",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={pendingRemoveTemplate !== null}
        message={
          pendingRemoveTemplate ? (
            <>
              This will permanently remove template{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{pendingRemoveTemplate.title}</span>.
            </>
          ) : null
        }
        onCancel={() => setPendingRemoveTemplate(null)}
        onConfirm={async () => {
          if (!pendingRemoveTemplate) return;
          const { id: templateId } = pendingRemoveTemplate;
          setPendingRemoveTemplate(null);
          await removeTemplate({ templateId });
        }}
      />

      <EditFormTemplateModal
        open={editingFormType !== null}
        type={editingFormType ?? "rfi"}
        readOnly={formModalReadOnly}
        initialPreview={formModalReadOnly}
        onClose={() => {
          setEditingFormType(null);
          setFormModalReadOnly(false);
        }}
      />
    </div>
  );
}
