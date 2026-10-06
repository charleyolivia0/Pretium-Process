# Local STT (Speech to Text) for Daily Reports

This server runs on your machine and transcribes audio using `whisper.cpp` locally (no cloud STT).

The web app records audio in your browser, then POSTs it to:

`POST http://127.0.0.1:8787/transcribe`

and expects a JSON response like:

```json
{ "text": "transcribed text here" }
```

## Start the server

Set env vars to point at:
- your `whisper-cli` binary
- your English base model `ggml-base.en.bin`

Example (Windows cmd):

```bat
set WHISPER_BIN=PATH\TO\whisper-cli.exe
set WHISPER_MODEL=PATH\TO\ggml-base.en.bin
node local-stt/server.js
```

Optional:

```bat
set PORT=8787
set WHISPER_THREADS=4
```

## Configure the web app URL

The browser client defaults to `http://127.0.0.1:8787/transcribe`.
If you change the port/host, set `VITE_LOCAL_STT_URL` in `.env.local`.

