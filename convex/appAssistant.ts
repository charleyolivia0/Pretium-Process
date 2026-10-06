import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { geminiFetch } from "./lib/geminiFetch";
import { filterProjectsForUser, isVisibleInProjectTracker } from "./lib/projectAccess";

const GEMINI_MODEL = "gemini-2.5-flash";
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_QUESTION_CHARS = 500;
const MAX_CONTEXT_CHARS = 18000;
const MAX_PROJECTS = 50;
const MAX_TASKS_PER_PROJECT = 20;
const MAX_CHAT_BODY_CHARS = 12000;
const MAX_MANUALS = 8;
const MAX_MANUAL_TEXT_CHARS = 6000;
const MAX_MANUAL_CONTEXT_CHARS = 12000;
const MAX_PDF_BYTES = 3_000_000;
const SUPPORTED_MANUAL_EXTENSIONS = [".txt", ".md", ".markdown", ".pdf", ".docx"] as const;

type ManualContext = {
  title: string;
  fileName: string;
  excerpt: string;
};

type GeminiPdfInput = {
  title: string;
  fileName: string;
  base64: string;
};

type AskResult = {
  conversationId: Id<"assistantConversations">;
  answer: string | null;
  error: string | null;
  note: string | null;
};

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

function sanitizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isSupportedManualFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_MANUAL_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function extractManualText(fileName: string, blob: Blob): Promise<string | null> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const arrayBuffer = await blob.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value ?? null;
  }
  return await blob.text();
}

function buildManualContextBlock(manuals: ManualContext[]): { context: string; sourceTitles: string[] } {
  const sourceTitles: string[] = [];
  const sections: string[] = [];
  let usedChars = 0;
  for (const manual of manuals) {
    const section = `Handbook: ${manual.title}\nFile: ${manual.fileName}\nContent:\n${manual.excerpt}`;
    const nextLen = usedChars + section.length + 2;
    if (nextLen > MAX_MANUAL_CONTEXT_CHARS) break;
    sections.push(section);
    sourceTitles.push(manual.title);
    usedChars = nextLen;
  }
  return { context: sections.join("\n\n"), sourceTitles };
}

function buildSnapshotJson(
  snapshot: {
    user: { name?: string; email?: string; role?: string };
    projects: Array<{
      id: string;
      name: string;
      clientName: string;
      location?: string;
      status: string;
      startDate?: number;
      endDate?: number;
      healthStatus?: string;
      healthNotes?: string;
      pmName?: string;
      coordinatorName?: string;
      tasks: Array<{
        title: string;
        status: string;
        dueDate?: number;
        category?: string;
        description?: string;
      }>;
    }>;
  },
  maxTasksPerProject: number
): string {
  const trimmed = {
    ...snapshot,
    projects: snapshot.projects.map((p) => ({
      ...p,
      tasks: p.tasks.slice(0, maxTasksPerProject),
    })),
  };
  return JSON.stringify(trimmed, null, 2);
}

function fitSnapshotUnderCap(
  snapshot: Parameters<typeof buildSnapshotJson>[0],
  maxTasks: number
): string {
  let text = buildSnapshotJson(snapshot, maxTasks);
  while (text.length > MAX_CONTEXT_CHARS && maxTasks > 0) {
    maxTasks -= 1;
    text = buildSnapshotJson(snapshot, maxTasks);
  }
  while (text.length > MAX_CONTEXT_CHARS && snapshot.projects.length > 1) {
    snapshot = {
      ...snapshot,
      projects: snapshot.projects.slice(0, snapshot.projects.length - 1),
    };
    text = buildSnapshotJson(snapshot, maxTasks);
  }
  if (text.length > MAX_CONTEXT_CHARS) {
    text = truncateText(text, MAX_CONTEXT_CHARS);
  }
  return text;
}

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const rows = await ctx.db
      .query("assistantConversations")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    return rows.map((r) => ({
      _id: r._id,
      preview: r.preview,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  },
});

export const listMessagesForConversation = query({
  args: { conversationId: v.id("assistantConversations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || conv.userId !== userId) {
      throw new Error("Conversation not found");
    }
    const rows = await ctx.db
      .query("assistantConversationMessages")
      .withIndex("by_conversation_created", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .take(500);
    return rows
      .filter((r) => r.userId === undefined || r.userId === userId)
      .map((r) => ({
        _id: r._id,
        role: r.role,
        body: r.body,
        createdAt: r.createdAt,
      }));
  },
});

export const assertConversationOwner = internalQuery({
  args: {
    userId: v.id("users"),
    conversationId: v.id("assistantConversations"),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.conversationId);
    if (!c || c.userId !== args.userId) return null;
    return { _id: c._id };
  },
});

export const createConversation = internalMutation({
  args: {
    userId: v.id("users"),
    preview: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const preview =
      args.preview.length > 120 ? `${args.preview.slice(0, 120)}…` : args.preview;
    return await ctx.db.insert("assistantConversations", {
      userId: args.userId,
      preview,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const appendMessage = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("assistantConversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("error")),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || conv.userId !== args.userId) {
      throw new Error("Invalid conversation");
    }
    const body =
      args.body.length > MAX_CHAT_BODY_CHARS
        ? `${args.body.slice(0, MAX_CHAT_BODY_CHARS)}…`
        : args.body;
    const now = Date.now();
    await ctx.db.insert("assistantConversationMessages", {
      conversationId: args.conversationId,
      userId: args.userId,
      role: args.role,
      body,
      createdAt: now,
    });
    await ctx.db.patch(args.conversationId, { updatedAt: now });
  },
});

/** One-time: backfill userId on assistant messages from parent conversation. */
export const backfillMessageUserIds = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    const rows = await ctx.db.query("assistantConversationMessages").take(limit);
    let patched = 0;
    for (const row of rows) {
      if (row.userId) continue;
      const conv = await ctx.db.get(row.conversationId);
      if (!conv) continue;
      await ctx.db.patch(row._id, { userId: conv.userId });
      patched++;
    }
    return { scanned: rows.length, patched };
  },
});

export const buildSnapshot = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return { context: "" };
    }

    let q = ctx.db.query("projects").withIndex("by_updated").order("desc");
    if (user.role === "project_manager") {
      q = q.filter((q) => q.eq(q.field("pmId"), args.userId));
    }
    let list = await q.take(user.role === "site_superintendent" ? 500 : 100);
    if (user.role === "site_superintendent") {
      list = filterProjectsForUser(list, args.userId, user).slice(0, 100);
    }
    const inTracker = list.filter((p) => isVisibleInProjectTracker(p));
    const sorted = inTracker
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .slice(0, MAX_PROJECTS);

    const nameCache = new Map<string, string>();
    async function userName(id: Id<"users"> | undefined): Promise<string | undefined> {
      if (!id) return undefined;
      const key = id as string;
      if (nameCache.has(key)) return nameCache.get(key);
      const u = await ctx.db.get(id);
      const n = u?.name ?? u?.email ?? key;
      nameCache.set(key, n);
      return n;
    }

    const projectsOut: Parameters<typeof fitSnapshotUnderCap>[0]["projects"] = [];

    for (const p of sorted) {
      const tasks = await ctx.db
        .query("projectTasks")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .order("desc")
        .take(MAX_TASKS_PER_PROJECT);

      const pmName = await userName(p.pmId);
      const coordinatorName = await userName(p.coordinatorId);

      projectsOut.push({
        id: p._id as string,
        name: p.name,
        clientName: p.clientName,
        location: p.location,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        healthStatus: p.healthStatus,
        healthNotes: p.healthNotes ? truncateText(p.healthNotes, 200) : undefined,
        pmName,
        coordinatorName,
        tasks: tasks.map((t) => ({
          title: t.title,
          status: t.status,
          dueDate: t.dueDate,
          category: t.category,
          description: t.description ? truncateText(t.description, 150) : undefined,
        })),
      });
    }

    const snapshot = {
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
      },
      projects: projectsOut,
    };

    const context = fitSnapshotUnderCap(snapshot, MAX_TASKS_PER_PROJECT);
    return { context };
  },
});

async function askGemini(
  apiKey: string,
  question: string,
  appContext: string,
  manualContext: string,
  manualPdfInputs: GeminiPdfInput[]
): Promise<{ answer: string | null; error?: string }> {
  const instruction =
    "You are Chuck, the Pretium Process helper. Answer using ONLY the provided Pretium app data snapshot and employee handbook context. " +
    "Do not use web search, outside knowledge, or information not in the provided sources. " +
    'If the answer is not in the provided app data or handbook context, reply exactly: "I could not find that in your Pretium data or employee handbook." ' +
    "Keep answers concise and practical.";
  const textPart =
    `${instruction}\n\nQuestion:\n${question}\n\n` +
    `App data snapshot:\n${appContext || "(none)"}\n\n` +
    `Employee handbook text context:\n${manualContext || "(none)"}\n\n` +
    "Employee handbook PDFs are attached below when available. Use only the provided app data and handbook materials as sources.";
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: textPart }];
  for (const pdf of manualPdfInputs) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdf.base64,
      },
    });
  }
  const res = await geminiFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 800 },
      }),
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    return {
      answer: null,
      error: `Gemini API error (${res.status}): ${errBody.slice(0, 180)}`,
    };
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  return { answer: text };
}

async function askOpenAI(
  apiKey: string,
  question: string,
  appContext: string,
  manualContext: string
): Promise<{ answer: string | null; error?: string }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Chuck, the Pretium Process helper. Answer using ONLY the app data snapshot and employee handbook context in the user message. " +
            "Do not use web search or outside knowledge. " +
            'If the answer is not in the provided sources, reply exactly: "I could not find that in your Pretium data or employee handbook."',
        },
        {
          role: "user",
          content:
            `Question:\n${question}\n\n` +
            `App data snapshot:\n${appContext || "(none)"}\n\n` +
            `Employee handbook context:\n${manualContext || "(none)"}`,
        },
      ],
      max_tokens: 800,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    return {
      answer: null,
      error: `OpenAI API error (${res.status}): ${errBody.slice(0, 180)}`,
    };
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim() ?? null;
  return { answer: text };
}

export const ask = action({
  args: {
    question: v.string(),
    conversationId: v.optional(v.id("assistantConversations")),
  },
  handler: async (ctx, args): Promise<AskResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rawQuestion = args.question.trim();
    if (!rawQuestion) throw new Error("Question is required");
    const question = truncateText(rawQuestion, MAX_QUESTION_CHARS);

    let conversationId = args.conversationId;
    if (conversationId) {
      const ok = await ctx.runQuery(internal.appAssistant.assertConversationOwner, {
        userId,
        conversationId,
      });
      if (!ok) throw new Error("Conversation not found");
    } else {
      const preview = truncateText(rawQuestion.replace(/\s+/g, " "), 72);
      conversationId = await ctx.runMutation(internal.appAssistant.createConversation, {
        userId,
        preview,
      });
    }
    if (!conversationId) throw new Error("Failed to create conversation");

    await ctx.runMutation(internal.appAssistant.appendMessage, {
      userId,
      conversationId,
      role: "user",
      body: question,
    });

    const { context: appContext } = await ctx.runQuery(internal.appAssistant.buildSnapshot, { userId });
    const manualRows = await ctx.runQuery(api.employeeManuals.list, {});
    const selectedManuals = manualRows.slice(0, MAX_MANUALS);
    const manualContexts: ManualContext[] = [];
    const geminiPdfInputs: GeminiPdfInput[] = [];

    for (const row of selectedManuals) {
      if (!isSupportedManualFile(row.fileName)) continue;
      const blob = await fetch(row.fileUrl).then((r) => (r.ok ? r.blob() : null));
      if (!blob) continue;

      if (row.fileName.toLowerCase().endsWith(".pdf")) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.length <= MAX_PDF_BYTES) {
          geminiPdfInputs.push({
            title: row.title,
            fileName: row.fileName,
            base64: uint8ToBase64(bytes),
          });
        }
        continue;
      }

      const extracted = await extractManualText(row.fileName, blob);
      if (!extracted) continue;
      const text = sanitizeText(extracted);
      if (!text) continue;
      manualContexts.push({
        title: row.title,
        fileName: row.fileName,
        excerpt: truncateText(text, MAX_MANUAL_TEXT_CHARS),
      });
    }

    const { context: manualContext, sourceTitles: manualSourceTitles } =
      buildManualContextBlock(manualContexts);
    const manualPdfTitles = geminiPdfInputs.map((pdf) => pdf.title);
    const hasAppContext = !!appContext && appContext.length >= 10;
    const hasManualContext = !!manualContext || geminiPdfInputs.length > 0;

    if (!hasAppContext && !hasManualContext) {
      const answer =
        "There is not enough Pretium data or employee handbook content available to answer yet.";
      await ctx.runMutation(internal.appAssistant.appendMessage, {
        userId,
        conversationId,
        role: "assistant",
        body: answer,
      });
      return {
        conversationId,
        answer,
        error: null as string | null,
        note: null as string | null,
      };
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      const gemini = await askGemini(geminiKey, question, appContext, manualContext, geminiPdfInputs);
      if (gemini.answer) {
        await ctx.runMutation(internal.appAssistant.appendMessage, {
          userId,
          conversationId,
          role: "assistant",
          body: gemini.answer,
        });
        return {
          conversationId,
          answer: gemini.answer,
          error: null as string | null,
          note:
            manualSourceTitles.length || manualPdfTitles.length
              ? `Answer generated from your Pretium app data and employee handbook sources: ${[...manualSourceTitles, ...manualPdfTitles].join(", ")}.`
              : "Answer generated from your Pretium app data only (not web search).",
        };
      }
      if (gemini.error && !openaiKey) {
        await ctx.runMutation(internal.appAssistant.appendMessage, {
          userId,
          conversationId,
          role: "error",
          body: gemini.error,
        });
        return {
          conversationId,
          answer: null as string | null,
          error: gemini.error,
          note: null as string | null,
        };
      }
    }

    if (openaiKey) {
      const openai = await askOpenAI(openaiKey, question, appContext, manualContext);
      if (openai.answer) {
        await ctx.runMutation(internal.appAssistant.appendMessage, {
          userId,
          conversationId,
          role: "assistant",
          body: openai.answer,
        });
        return {
          conversationId,
          answer: openai.answer,
          error: null as string | null,
          note:
            manualContext
              ? `Answer generated from your Pretium app data and employee handbook sources: ${manualSourceTitles.join(", ")}.`
              : "Answer generated from your Pretium app data only (not web search).",
        };
      }
      if (openai.error) {
        await ctx.runMutation(internal.appAssistant.appendMessage, {
          userId,
          conversationId,
          role: "error",
          body: openai.error,
        });
        return {
          conversationId,
          answer: null as string | null,
          error: openai.error,
          note: null as string | null,
        };
      }
    }

    const err =
      "No API key set. Add GEMINI_API_KEY (recommended) or OPENAI_API_KEY in Convex environment variables.";
    await ctx.runMutation(internal.appAssistant.appendMessage, {
      userId,
      conversationId,
      role: "error",
      body: err,
    });
    return {
      conversationId,
      answer: null as string | null,
      error: err,
      note: null as string | null,
    };
  },
});
