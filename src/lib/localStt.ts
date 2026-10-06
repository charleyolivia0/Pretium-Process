export type LocalSttResponse = {
  text: string;
};

const DEFAULT_LOCAL_STT_URL = "http://127.0.0.1:8787/transcribe";

export async function transcribeWavBlob(
  blob: Blob,
  opts?: { lang?: string; signal?: AbortSignal }
): Promise<LocalSttResponse> {
  const url = import.meta.env.VITE_LOCAL_STT_URL || DEFAULT_LOCAL_STT_URL;
  const lang = opts?.lang || "en";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "audio/wav",
      "X-STT-LANG": lang,
    },
    body: blob,
    signal: opts?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Local STT failed (${res.status}): ${text || res.statusText}`);
  }

  // Expected response: { "text": "..." }
  const data = (await res.json().catch(() => null)) as LocalSttResponse | null;
  if (!data || typeof data.text !== "string") throw new Error("Local STT returned unexpected response.");
  return data;
}

