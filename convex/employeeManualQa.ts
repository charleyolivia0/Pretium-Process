import { action } from "./_generated/server";
import { v } from "convex/values";
import { geminiFetch } from "./lib/geminiFetch";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api } from "./_generated/api";

const GEMINI_MODEL = "gemini-2.5-flash";
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_QUESTION_CHARS = 500;
const MAX_MANUALS = 8;
const MAX_CONTEXT_CHARS = 18000;
const MAX_MANUAL_TEXT_CHARS = 4500;
const MAX_PDF_BYTES = 3_000_000;
const SUPPORTED_EXTENSIONS = [".txt", ".md", ".markdown", ".pdf", ".docx"] as const;

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

function isSupportedTextFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function sanitizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function buildContextBlock(manuals: ManualContext[]): { context: string; sourceTitles: string[] } {
  const sourceTitles: string[] = [];
  const sections: string[] = [];
  let usedChars = 0;
  for (const manual of manuals) {
    const section = `Manual: ${manual.title}\nFile: ${manual.fileName}\nContent:\n${manual.excerpt}`;
    const nextLen = usedChars + section.length + 2;
    if (nextLen > MAX_CONTEXT_CHARS) break;
    sections.push(section);
    sourceTitles.push(manual.title);
    usedChars = nextLen;
  }
  return { context: sections.join("\n\n"), sourceTitles };
}

async function askGemini(
  apiKey: string,
  question: string,
  context: string,
  pdfInputs: GeminiPdfInput[]
): Promise<{ answer: string | null; error?: string }> {
  const instruction =
    "You answer employee questions using only the provided employee manual context. " +
    'If the answer is not in the context, reply exactly: "I could not find that in the employee manuals." ' +
    "Do not use outside knowledge. Keep answers concise and practical.";
  const textPart =
    `${instruction}\n\nQuestion:\n${question}\n\n` +
    `Text manual context:\n${context || "(none)"}\n\n` +
    "PDF manuals are attached below. Use only attached/context manuals as sources.";
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: textPart }];
  for (const pdf of pdfInputs) {
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
        contents: [
          {
            parts,
          },
        ],
        generationConfig: { maxOutputTokens: 500 },
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

async function askOpenAI(apiKey: string, question: string, context: string): Promise<{ answer: string | null; error?: string }> {
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
            "You answer employee questions using only provided employee manual context. " +
            'If the answer is not in the context, reply exactly: "I could not find that in the employee manuals." ' +
            "Never use outside knowledge.",
        },
        {
          role: "user",
          content: `Question:\n${question}\n\nManual context:\n${context}`,
        },
      ],
      max_tokens: 500,
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rawQuestion = args.question.trim();
    if (!rawQuestion) throw new Error("Question is required");
    const question = truncateText(rawQuestion, MAX_QUESTION_CHARS);

    const manualRows = await ctx.runQuery(api.employeeManuals.list, {});
    if (!manualRows.length) {
      return {
        answer: "No employee manuals are uploaded yet.",
        sources: [] as string[],
        confidenceNote: "Add manuals first, then ask a question.",
      };
    }

    const selectedManuals = manualRows.slice(0, MAX_MANUALS);
    const contexts: ManualContext[] = [];
    const geminiPdfInputs: GeminiPdfInput[] = [];
    for (const row of selectedManuals) {
      if (!isSupportedTextFile(row.fileName)) continue;
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
      contexts.push({
        title: row.title,
        fileName: row.fileName,
        excerpt: truncateText(text, MAX_MANUAL_TEXT_CHARS),
      });
    }

    if (!contexts.length && !geminiPdfInputs.length) {
      return {
        answer: "I could not find readable text manuals to answer from.",
        sources: [] as string[],
        confidenceNote:
          "Current AI bot supports .txt, .md, .docx, and .pdf manuals. Very large PDFs plus .doc/.xlsx are not readable yet.",
      };
    }

    const { context, sourceTitles } = buildContextBlock(contexts);
    const pdfSourceTitles = geminiPdfInputs.map((p) => p.title);
    const combinedSources = [...sourceTitles, ...pdfSourceTitles];
    if (!context && geminiPdfInputs.length === 0) {
      return {
        answer: "I could not find enough manual content to answer that.",
        sources: [] as string[],
        confidenceNote: "Try asking a shorter, more specific question.",
      };
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      const gemini = await askGemini(geminiKey, question, context, geminiPdfInputs);
      if (gemini.answer) {
        return {
          answer: gemini.answer,
          sources: combinedSources,
          confidenceNote: "Answer generated from uploaded manuals.",
        };
      }
      if (gemini.error) {
        if (!openaiKey) {
          return { answer: null as string | null, sources: combinedSources, error: gemini.error };
        }
      }
    }

    if (openaiKey && context) {
      const openai = await askOpenAI(openaiKey, question, context);
      if (openai.answer) {
        return {
          answer: openai.answer,
          sources: combinedSources,
          confidenceNote: "Answer generated from uploaded manuals.",
        };
      }
      if (openai.error) {
        return { answer: null as string | null, sources: combinedSources, error: openai.error };
      }
    }

    if (openaiKey && !context && geminiPdfInputs.length > 0) {
      return {
        answer: null as string | null,
        sources: combinedSources,
        error: "PDF-only manual Q&A currently requires GEMINI_API_KEY in Convex env.",
      };
    }

    return {
      answer: null as string | null,
      sources: combinedSources,
      error:
        "No API key set. Add GEMINI_API_KEY (recommended) or OPENAI_API_KEY in Convex environment variables.",
    };
  },
});
