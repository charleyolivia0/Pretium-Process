# Offline / on-site QA checklist

Use this after changes to the offline queue (`src/offline/*`) or wired pages.

## Setup

1. Run the app (web or Electron). Sign in.
2. Open Chrome/Edge DevTools → **Network** → check **Offline** (or disconnect Wi‑Fi / disable data on device).

## Cases

### 1. Daily report (Project → Tasks tab)

- [ ] While **online**, open a project, add a **New daily report** (text only), submit — appears in list.
- [ ] Go **offline**, add another daily report — should complete without network error; after reconnect, report appears in Convex.
- [ ] **Restart** the app offline — queued job should still sync after going online (IndexedDB persistence).

### 2. Daily report edit (detail page)

- [ ] Open `/projects/:projectId/daily-report/:reportId`, edit fields, **Save** while offline — queues; syncs when online.

### 3. Safety job sign-in/out (external)

- [ ] Visit `/safety/project/:projectId/job-sign-in-out/external` (load once **online** so trades list is cached).
- [ ] Go **offline**, submit sign-in/out — success message mentions offline/queue; after online, entry appears in logs inside the app.

### 4. Safety incidents

- [ ] On `/safety/project/:id/incidents`, add an incident while **offline** — queues; syncs when online.
- [ ] Changing **status** on an existing row while offline queues an update (UI may not reflect until sync).

### 5. Inventory form

- [ ] Open `/inventory-form` once **online** (projects + equipment catalog cached).
- [ ] **Offline**, submit a checkout — success text mentions queue; after online, checkout appears in inventory views.

### 6. Site photos

- [ ] Project → **Site Photos** tab, upload/capture photos while **offline** — queues; thumbnails appear after sync.

## Bar / status

- [ ] With app **online** and queue empty, the green/amber status bar in the main shell is **hidden**.
- [ ] While **offline**, the bar shows an offline message.
- [ ] With pending jobs, the bar shows queue/sync state after going back online.

## Notes

- Creating a **new document folder** for daily reports while offline is disabled (requires server).
- Failed sync items stay in the queue with `failed` status until the next successful online sync retry.
