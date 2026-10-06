# Pretium Process

A construction operations web app for general contractors: project tracking, tasks, documents, accounting, and role-based workspaces (Project Managers, Coordinators, Accounting, Estimating, Safety, Admin).

## Stack

- **Frontend:** React 18, Vite, TypeScript, React Router
- **Backend:** Convex (database, auth, real-time sync)
- **Auth:** Convex Auth with email/password

## Design
npm 
- **Font:** Montserrat
- **Colors:** White, emerald green, gray
- **UI:** Rounded corners, soft shadows, minimal layout

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Convex backend**

   - Run `npx convex dev` and follow the prompts (sign in, create/link project).
   - This generates `convex/_generated` and sets up your deployment.
   - Set env vars in the Convex dashboard if required (e.g. `JWT_PRIVATE_KEY`, `JWKS` for Convex Auth; see [Convex Auth setup](https://labs.convex.dev/auth/setup)).

3. **Frontend env**

   - Copy `.env.example` to `.env.local`.
   - Set `VITE_CONVEX_URL` to your Convex deployment URL (e.g. from `.env.local` created by `npx convex dev`, or the Convex dashboard).

4. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173). Use **Sign up** to create an account (choose a role). After login you’ll see the dashboard and sidebar (Dashboard, Project Tracker, Accounting, Admin).

- **Public inventory form:** Anyone can submit equipment checkouts at `/inventory-form` (no login). Set `VITE_CONVEX_SITE_URL` in `.env.local` to your Convex site URL (e.g. `https://your-deployment.convex.site`) so the form can submit; if unset, it is derived from `VITE_CONVEX_URL`. Share the link with people who don’t have app access.

### Email (Gmail) inbox

To use **Email** (inbox view, sort by importance, draft replies):

1. **Google Cloud Console:** Create a project (or use existing), enable the **Gmail API**, and create **OAuth 2.0 Client ID** (Web application). Add an **Authorized redirect URI**:  
   `https://<your-convex-site-host>/api/oauth/gmail/callback`  
   (e.g. `https://happy-animal-123.convex.site/api/oauth/gmail/callback` — use your Convex deployment’s site URL).

2. **Convex env** (Dashboard → Settings → Environment Variables):
   - `GMAIL_CLIENT_ID` – from Google Cloud Console
   - `GMAIL_CLIENT_SECRET` – from Google Cloud Console
   - `CONVEX_SITE_URL` – your Convex HTTP site URL (e.g. `https://happy-animal-123.convex.site`)
   - `APP_URL` – your frontend URL so OAuth can redirect back (e.g. `http://localhost:5173` in dev, or your production app URL)

3. In the app, go to **Email**, click **Connect Gmail**, sign in with Google, and grant access. You can then list inbox messages, sort by “Unread first” or date, open a message, and create a draft reply that appears in Gmail.

## Deploy

- **Convex:** Deploy the backend with `npx convex deploy`.
- **Frontend:** Build with `npm run build` and host the `dist/` output on any static host (Vercel, Netlify, etc.). Set `VITE_CONVEX_URL` in the build environment to your production Convex URL.

## Shijima-Qt Companion (GitHub source)

This project now includes the upstream Shijima-Qt codebase at `tools/Shijima-Qt` from [pixelomer/Shijima-Qt](https://github.com/pixelomer/Shijima-Qt.git).

- Clone location: `tools/Shijima-Qt`
- Build on Windows (Docker-based, upstream method):

  ```bash
  npm run companion:qt:build
  ```

- Run companion:

  ```bash
  npm run companion:qt:run
  ```

If you want the character to look like a specific person (girl with brown hair/light skin), edit or replace mascot assets in the Shijima mascot package and load that package in Shijima-Qt.

## Roles

- **Project Manager / Coordinator / Estimating / Safety:** Dashboard and Project Tracker; read-only access to accounting summary where applicable.
- **Site Superintendent:** Dashboard and Project Tracker only; within projects can only view the Tasks and Schedule (calendar) tabs—no Summary or Documents; tasks are read-only (no add/edit).
- **Accounting:** Full accounting page; can add/edit accounting records.
- **Admin:** All of the above plus Admin page (user list, role changes, active/inactive).
