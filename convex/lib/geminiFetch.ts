/**
 * Google Gemini occasionally returns 429 (rate limit) or 503 (high demand).
 * Short exponential backoff usually clears transient spikes without surfacing a hard error.
 */
const RETRY_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS = 4;

export async function geminiFetch(url: string, init?: RequestInit): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    last = await fetch(url, init);
    if (last.ok || !RETRY_STATUSES.has(last.status)) {
      return last;
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      const base = 1000 * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 500);
      const delay = Math.min(base + jitter, 10_000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return last!;
}
