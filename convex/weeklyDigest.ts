import { query, action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { geminiFetch } from "./lib/geminiFetch";
import { filterProjectsForUser, userCanAccessProject } from "./lib/projectAccess";
import {
  DAY_MS,
  startOfTodayCentral,
  startOfWeekCentral,
} from "./lib/centralTime";

function resolveWeekStart(raw?: number): number {
  return startOfWeekCentral(raw ?? Date.now());
}

function isDailyReportTask(t: { isDailyReport?: boolean; createdFromPortal?: boolean }) {
  return t.isDailyReport === true || t.createdFromPortal === true;
}

type DigestReport = {
  _id: Id<"projectTasks">;
  dueDate: number;
  title: string;
  description?: string;
  tradesOnSite?: string;
};

type PrincipalBriefProject = {
  name: string;
  clientName: string;
  healthStatus?: string;
  healthNotes?: string;
  dailyReports: DigestReport[];
  priorWeekReports: DigestReport[];
  overdueTaskCount: number;
  reportCount: number;
};

type PrincipalBrief = {
  weekStart: number;
  weekEnd: number;
  priorWeekStart: number;
  priorWeekEnd: number;
  projects: PrincipalBriefProject[];
};

type SummarizationResult = { summary: string | null; error?: string };

function mapReport(
  t: Doc<"projectTasks">,
  subtradeNameById: Map<Id<"projectSubtrades">, string>
): DigestReport {
  const tradeNames = (t.subtradeIdsOnSite ?? [])
    .map((id) => subtradeNameById.get(id))
    .filter((n): n is string => !!n);
  return {
    _id: t._id,
    dueDate: t.dueDate!,
    title: t.title,
    description: t.description,
    ...(tradeNames.length ? { tradesOnSite: tradeNames.join(", ") } : {}),
  };
}

/** Daily reports = project tasks with dueDate in [weekStart, weekEnd), sorted by dueDate. */
export const getWeeklyDigest = query({
  args: {
    weekStart: v.number(),
    weekEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { projects: [] };

    const user = await ctx.db.get(userId);
    let projects = await ctx.db.query("projects").withIndex("by_updated").order("desc").collect();
    projects = filterProjectsForUser(projects, userId, user);

    const allTasks = await ctx.db.query("projectTasks").collect();
    const tasksInRange = allTasks.filter((t) => {
      if (!isDailyReportTask(t)) return false;
      const due = t.dueDate;
      if (due == null) return false;
      return due >= args.weekStart && due < args.weekEnd;
    });
    tasksInRange.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));

    const projectIds = new Set(projects.map((p) => p._id as string));
    const subtradeNameById = new Map<Id<"projectSubtrades">, string>();
    for (const p of projects) {
      const subs = await ctx.db
        .query("projectSubtrades")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      for (const s of subs) subtradeNameById.set(s._id, s.name);
    }
    const byProject = new Map<string, DigestReport[]>();
    for (const t of tasksInRange) {
      const pid = t.projectId as string;
      if (!projectIds.has(pid)) continue;
      if (!byProject.has(pid)) byProject.set(pid, []);
      byProject.get(pid)!.push(mapReport(t, subtradeNameById));
    }

    return {
      projects: projects.map((p) => ({
        projectId: p._id,
        name: p.name,
        clientName: p.clientName,
        dailyReports: byProject.get(p._id as string) ?? [],
      })),
    };
  },
});

/**
 * Returns distinct week start timestamps (America/Chicago) that have at least one daily report
 * with a `dueDate` for the current user's accessible projects.
 */
export const listWeeklyUpdateWeeks = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { weekStarts: [] as number[] };

    const user = await ctx.db.get(userId);
    let projects = await ctx.db.query("projects").withIndex("by_updated").order("desc").collect();
    projects = filterProjectsForUser(projects, userId, user);

    const projectIds = new Set(projects.map((p) => p._id as string));
    const allTasks = await ctx.db.query("projectTasks").collect();

    const weekStartsSet = new Set<number>();
    for (const t of allTasks) {
      if (!isDailyReportTask(t)) continue;
      if (!t.dueDate) continue;
      const pid = t.projectId as string;
      if (!projectIds.has(pid)) continue;
      weekStartsSet.add(startOfWeekCentral(t.dueDate));
    }

    const maxWeeks = Math.max(1, args.limit ?? 30);
    const weekStarts = Array.from(weekStartsSet).sort((a, b) => b - a).slice(0, maxWeeks);
    return { weekStarts };
  },
});

/** Daily reports for a single project in the given week range. */
export const getProjectWeeklyReports = query({
  args: {
    projectId: v.id("projects"),
    weekStart: v.number(),
    weekEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const project = await ctx.db.get(args.projectId);
    if (!project) return [];
    const user = await ctx.db.get(userId);
    if (!userCanAccessProject(project, userId, user)) {
      return [];
    }

    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const inRange = tasks.filter((t) => {
      if (!isDailyReportTask(t)) return false;
      const due = t.dueDate;
      if (due == null) return false;
      return due >= args.weekStart && due < args.weekEnd;
    });
    inRange.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
    return inRange.map((t) => ({
      _id: t._id,
      dueDate: t.dueDate!,
      title: t.title,
      description: t.description,
    }));
  },
});

/** Principal weekly brief: all projects with current + prior week daily reports and overdue counts. */
export const getPrincipalWeeklyBrief = query({
  args: {
    weekStart: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        weekStart: 0,
        weekEnd: 0,
        priorWeekStart: 0,
        priorWeekEnd: 0,
        projects: [],
      };
    }

    const weekStart = resolveWeekStart(args.weekStart);
    const weekEnd = weekStart + 7 * DAY_MS;
    const priorWeekStart = weekStart - 7 * DAY_MS;
    const priorWeekEnd = weekStart;

    const user = await ctx.db.get(userId);
    let projects = await ctx.db.query("projects").withIndex("by_updated").order("desc").collect();
    projects = filterProjectsForUser(projects, userId, user);

    const allTasks = await ctx.db.query("projectTasks").collect();
    const startOfToday = startOfTodayCentral();
    const projectIds = new Set(projects.map((p) => p._id as string));

    const subtradeNameById = new Map<Id<"projectSubtrades">, string>();
    for (const p of projects) {
      const subs = await ctx.db
        .query("projectSubtrades")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
      for (const s of subs) subtradeNameById.set(s._id, s.name);
    }

    const reportsByProject = new Map<string, { current: DigestReport[]; prior: DigestReport[] }>();
    const overdueByProject = new Map<string, number>();

    for (const pid of projectIds) {
      reportsByProject.set(pid, { current: [], prior: [] });
      overdueByProject.set(pid, 0);
    }

    for (const t of allTasks) {
      const pid = t.projectId as string;
      if (!projectIds.has(pid)) continue;

      if (!isDailyReportTask(t) && t.status !== "done" && t.dueDate != null && t.dueDate < startOfToday) {
        overdueByProject.set(pid, (overdueByProject.get(pid) ?? 0) + 1);
      }

      if (!isDailyReportTask(t) || t.dueDate == null) continue;
      const due = t.dueDate;
      const bucket = reportsByProject.get(pid)!;
      if (due >= weekStart && due < weekEnd) {
        bucket.current.push(mapReport(t, subtradeNameById));
      } else if (due >= priorWeekStart && due < priorWeekEnd) {
        bucket.prior.push(mapReport(t, subtradeNameById));
      }
    }

    for (const bucket of reportsByProject.values()) {
      bucket.current.sort((a, b) => a.dueDate - b.dueDate);
      bucket.prior.sort((a, b) => a.dueDate - b.dueDate);
    }

    return {
      weekStart,
      weekEnd,
      priorWeekStart,
      priorWeekEnd,
      projects: projects.map((p) => {
        const reports = reportsByProject.get(p._id as string) ?? { current: [], prior: [] };
        return {
          projectId: p._id,
          name: p.name,
          clientName: p.clientName,
          healthStatus: p.healthStatus,
          healthNotes: p.healthNotes,
          dailyReports: reports.current,
          priorWeekReports: reports.prior,
          overdueTaskCount: overdueByProject.get(p._id as string) ?? 0,
          reportCount: reports.current.length,
        };
      }),
    };
  },
});

/**
 * Builds a plain-text block of all daily reports for the given digest (for LLM summarization).
 */
function buildDigestText(
  projects: {
    name: string;
    clientName: string;
    dailyReports: { dueDate: number; title: string; description?: string; tradesOnSite?: string }[];
  }[]
): string {
  const lines: string[] = [];
  for (const p of projects.filter((proj) => proj.dailyReports.length > 0)) {
    lines.push(`Project: ${p.name}${p.clientName ? ` (${p.clientName})` : ""}`);
    for (const r of p.dailyReports) {
      const dateStr = new Date(r.dueDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      lines.push(`  ${dateStr}: ${r.title}`);
      if (r.description?.trim()) lines.push(`    ${r.description.trim().replace(/\n/g, " ")}`);
      if (r.tradesOnSite?.trim()) lines.push(`    Trades on site: ${r.tradesOnSite.trim()}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function buildPrincipalBriefText(
  projects: {
    name: string;
    clientName: string;
    healthStatus?: string;
    healthNotes?: string;
    overdueTaskCount: number;
    reportCount: number;
    dailyReports: { dueDate: number; title: string; description?: string; tradesOnSite?: string }[];
    priorWeekReports: { dueDate: number; title: string; description?: string; tradesOnSite?: string }[];
  }[]
): string {
  const lines: string[] = [];
  for (const p of projects) {
    lines.push(`Project: ${p.name}${p.clientName ? ` (${p.clientName})` : ""}`);
    if (p.healthStatus) lines.push(`  Health: ${p.healthStatus}${p.healthNotes ? ` — ${p.healthNotes}` : ""}`);
    if (p.overdueTaskCount > 0) lines.push(`  Overdue schedule tasks: ${p.overdueTaskCount}`);
    if (p.reportCount === 0) {
      lines.push("  No daily reports filed this week.");
    } else {
      lines.push("  This week's daily reports:");
      for (const r of p.dailyReports) {
        const dateStr = new Date(r.dueDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        lines.push(`    ${dateStr}: ${r.title}`);
        if (r.description?.trim()) lines.push(`      ${r.description.trim().replace(/\n/g, " ")}`);
      }
    }
    if (p.priorWeekReports.length > 0) {
      lines.push("  Prior week's daily reports:");
      for (const r of p.priorWeekReports) {
        const dateStr = new Date(r.dueDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        lines.push(`    ${dateStr}: ${r.title}`);
        if (r.description?.trim()) lines.push(`      ${r.description.trim().replace(/\n/g, " ")}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

const SUMMARY_PROMPT =
  "You are a concise project coordinator. Summarize the given daily project reports into a short, readable weekly summary. Focus on: key progress, blockers or issues, and notable updates across projects. Use clear paragraphs; no bullet points unless listing several distinct items. Keep the summary under 300 words.";

const PRINCIPAL_BRIEF_PROMPT =
  "You are a construction principal reviewing weekly project updates. For each project with activity (or flagged amber/red health), write a short section covering: (1) brief overview from this week's daily reports, (2) what appears behind schedule or blocked, (3) what was mentioned last week but not completed, (4) outstanding items still open. For projects with no daily reports this week, note \"No reports filed.\" Keep each project to 2–4 sentences; use clear headings per project.";

/** Gemini model for summarization. Switch here if needed (e.g. gemini-flash-latest, gemini-3-flash-preview). */
const GEMINI_MODEL = "gemini-2.5-flash";

async function summarizeWithGemini(
  apiKey: string,
  prompt: string,
  weekLabel: string,
  text: string,
  maxTokens = 600
): Promise<{ summary: string | null; error?: string }> {
  const res = await geminiFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${prompt}\n\nSummarize these daily reports for the week of ${weekLabel}:\n\n${text}`,
              },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    const hint =
      res.status === 429
        ? "Free tier limit reached—try again later or add GEMINI_API_KEY to a different project."
        : res.status === 503
          ? "Model is temporarily overloaded—wait a minute and retry."
          : errBody.slice(0, 150);
    return {
      summary: null,
      error: `Gemini API error (${res.status}). ${hint}`,
    };
  }

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  return { summary: content };
}

async function summarizeWithOpenAI(
  apiKey: string,
  prompt: string,
  weekLabel: string,
  text: string,
  maxTokens = 600
): Promise<{ summary: string | null; error?: string }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Summarize these daily reports for the week of ${weekLabel}:\n\n${text}` },
      ],
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    const isQuota = res.status === 429 || (errBody.includes("quota") || errBody.includes("billing"));
    return {
      summary: null,
      error: isQuota
        ? "OpenAI quota exceeded. Add GEMINI_API_KEY (free) in Convex env and remove or leave OPENAI_API_KEY unset to use Google's free tier instead."
        : `OpenAI API error (${res.status}): ${errBody.slice(0, 150)}`,
    };
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim() ?? null;
  return { summary: content };
}

async function runSummarization(
  prompt: string,
  weekLabel: string,
  text: string,
  maxTokens = 600
): Promise<{ summary: string | null; error?: string }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    const result = await summarizeWithGemini(geminiKey, prompt, weekLabel, text, maxTokens);
    if (result.summary !== null) return { summary: result.summary };
    if (result.error) return { summary: null, error: result.error };
  }

  if (openaiKey) {
    const result = await summarizeWithOpenAI(openaiKey, prompt, weekLabel, text, maxTokens);
    if (result.summary !== null) return { summary: result.summary };
    if (result.error) return { summary: null, error: result.error };
  }

  return {
    summary: null,
    error:
      "No API key set. Add GEMINI_API_KEY (free) in Convex: Settings → Environment Variables. Get a key at https://aistudio.google.com/app/apikey",
  };
}

/**
 * Generates a short AI summary of the week's daily reports.
 * Uses Gemini (free) if GEMINI_API_KEY is set; otherwise OpenAI if OPENAI_API_KEY is set.
 */
export const generateWeeklySummary = action({
  args: {
    weekStart: v.number(),
    weekEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const digest = await ctx.runQuery(api.weeklyDigest.getWeeklyDigest, {
      weekStart: args.weekStart,
      weekEnd: args.weekEnd,
    });

    const projectsWithReports = digest.projects.filter((p) => p.dailyReports.length > 0);
    if (projectsWithReports.length === 0) {
      return { summary: null as string | null };
    }

    const text = buildDigestText(digest.projects);
    const weekLabel = `${new Date(args.weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} – ${new Date(args.weekEnd - 1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

    return runSummarization(SUMMARY_PROMPT, weekLabel, text);
  },
});

/** Principal-focused AI brief with behind/outstanding/prior-week context. */
export const generatePrincipalWeeklyBrief = action({
  args: {
    weekStart: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SummarizationResult> => {
    const brief: PrincipalBrief = await ctx.runQuery(api.weeklyDigest.getPrincipalWeeklyBrief, {
      weekStart: args.weekStart,
    });

    type BriefProject = PrincipalBriefProject;
    const hasAnyReports = brief.projects.some(
      (p: BriefProject) => p.dailyReports.length > 0 || p.priorWeekReports.length > 0
    );
    const hasAnyActivity =
      hasAnyReports ||
      brief.projects.some(
        (p: BriefProject) => p.healthStatus === "amber" || p.healthStatus === "red" || p.overdueTaskCount > 0
      );

    if (!hasAnyActivity) {
      return { summary: null as string | null };
    }

    const text = buildPrincipalBriefText(brief.projects);
    const weekLabel: string = `${new Date(brief.weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} – ${new Date(brief.weekEnd - 1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

    return runSummarization(PRINCIPAL_BRIEF_PROMPT, weekLabel, text, 1200);
  },
});

/** Saved editable weekly summary draft for a given week. */
export const getWeeklySummaryDraft = query({
  args: {
    weekStart: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const weekStart = resolveWeekStart(args.weekStart);
    const row = await ctx.db
      .query("weeklyUpdateSummaries")
      .withIndex("by_weekStart", (q) => q.eq("weekStart", weekStart))
      .unique();

    if (!row) return null;

    const editor = await ctx.db.get(row.lastEditedByUserId);
    return {
      weekStart: row.weekStart,
      summaryText: row.summaryText,
      aiGeneratedText: row.aiGeneratedText,
      aiGeneratedAt: row.aiGeneratedAt,
      updatedAt: row.updatedAt,
      lastEditorName: editor?.name ?? editor?.email ?? "Unknown",
    };
  },
});

/** Upsert user-edited weekly summary text. */
export const saveWeeklySummaryDraft = mutation({
  args: {
    weekStart: v.number(),
    summaryText: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const weekStart = resolveWeekStart(args.weekStart);
    const now = Date.now();
    const existing = await ctx.db
      .query("weeklyUpdateSummaries")
      .withIndex("by_weekStart", (q) => q.eq("weekStart", weekStart))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        summaryText: args.summaryText,
        lastEditedByUserId: userId,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("weeklyUpdateSummaries", {
      weekStart,
      summaryText: args.summaryText,
      lastEditedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Persist AI-generated weekly summary (initial seed or regenerate). */
export const saveAiWeeklySummary = mutation({
  args: {
    weekStart: v.number(),
    summaryText: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const weekStart = resolveWeekStart(args.weekStart);
    const now = Date.now();
    const existing = await ctx.db
      .query("weeklyUpdateSummaries")
      .withIndex("by_weekStart", (q) => q.eq("weekStart", weekStart))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        summaryText: args.summaryText,
        aiGeneratedText: args.summaryText,
        aiGeneratedAt: now,
        lastEditedByUserId: userId,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("weeklyUpdateSummaries", {
      weekStart,
      summaryText: args.summaryText,
      aiGeneratedText: args.summaryText,
      aiGeneratedAt: now,
      lastEditedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});
