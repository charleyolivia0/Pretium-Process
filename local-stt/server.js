/* eslint-disable no-console */
"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";

function getEnv(name, def) {
  const v = process.env[name];
  return v && v.length ? v : def;
}

function jsonResponse(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
  });
  res.end(body);
}

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-STT-LANG");
}

const PORT = Number(getEnv("PORT", DEFAULT_PORT));
const HOST = getEnv("HOST", DEFAULT_HOST);

const WHISPER_BIN =
  getEnv("WHISPER_BIN", path.resolve(__dirname, "..", "whisper.cpp", "build", "bin", "whisper-cli")) || "";
const WHISPER_MODEL = getEnv("WHISPER_MODEL", path.resolve(__dirname, "..", "models", "ggml-base.en.bin"));
const WHISPER_THREADS = Number(getEnv("WHISPER_THREADS", "4"));

const MAX_BYTES = 30 * 1024 * 1024; // 30MB

const server = http.createServer((req, res) => {
  corsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (url.pathname !== "/transcribe") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  if (!WHISPER_BIN || !fs.existsSync(WHISPER_BIN)) {
    jsonResponse(res, 500, {
      text: "",
      error: `WHISPER_BIN not found. Set env var WHISPER_BIN to your whisper-cli binary.`,
      hint: `Tried: ${WHISPER_BIN}`,
    });
    return;
  }

  if (!WHISPER_MODEL || !fs.existsSync(WHISPER_MODEL)) {
    jsonResponse(res, 500, {
      text: "",
      error: `WHISPER_MODEL not found. Set env var WHISPER_MODEL to your ggml-base.en.bin model.`,
      hint: `Tried: ${WHISPER_MODEL}`,
    });
    return;
  }

  const lang = (req.headers["x-stt-lang"] || url.searchParams.get("lang") || "en").toString();

  const chunks = [];
  let total = 0;

  req.on("data", (d) => {
    total += d.length;
    if (total > MAX_BYTES) {
      res.writeHead(413);
      res.end("Payload too large");
      req.destroy();
    } else {
      chunks.push(d);
    }
  });

  req.on("end", () => {
    const buffer = Buffer.concat(chunks);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pretium-stt-"));

    const wavPath = path.join(tmpDir, "input.wav");
    const outStem = path.join(tmpDir, "out");
    const jsonPath = `${outStem}.json`;

    try {
      fs.writeFileSync(wavPath, buffer);

      // whisper.cpp CLI reference: -oj outputs JSON; -of sets output file stem (without extension).
      const args = [
        "-m",
        WHISPER_MODEL,
        "-t",
        String(WHISPER_THREADS),
        "-l",
        lang,
        "-f",
        wavPath,
        "-oj",
        "-of",
        outStem,
      ];

      const result = spawnSync(WHISPER_BIN, args, { encoding: "utf8" });
      if (result.error) throw result.error;

      if (!fs.existsSync(jsonPath)) {
        return jsonResponse(res, 500, {
          text: "",
          error: "Whisper did not produce JSON output.",
          hint: `stdout: ${String(result.stdout || "").slice(0, 5000)}`,
          hint2: `stderr: ${String(result.stderr || "").slice(0, 5000)}`,
        });
      }

      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      let text = "";

      if (typeof data.text === "string") text = data.text;
      else if (Array.isArray(data.segments)) text = data.segments.map((s) => s.text ?? "").join("");
      else if (Array.isArray(data.transcript)) text = data.transcript.map((s) => s.text ?? "").join("");

      return jsonResponse(res, 200, { text: String(text).trim() });
    } catch (e) {
      return jsonResponse(res, 500, {
        text: "",
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      // Best-effort cleanup
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Local STT listening on http://${HOST}:${PORT}/transcribe`);
  console.log(`WHISPER_BIN: ${WHISPER_BIN}`);
  console.log(`WHISPER_MODEL: ${WHISPER_MODEL}`);
});

