# Lean Construction Ops

A lean construction operations web app for general contractors: project tracking, tasks, documents, accounting, and role-based workspaces (Project Managers, Coordinators, Accounting, Estimating, Safety, Admin).

## Stack

- **Frontend:** React 18, Vite, TypeScript, React Router
- **Backend:** Convex (database, auth, real-time sync)
- **Auth:** Convex Auth with email/password

## Design

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

## Deploy

- **Convex:** Deploy the backend with `npx convex deploy`.
- **Frontend:** Build with `npm run build` and host the `dist/` output on any static host (Vercel, Netlify, etc.). Set `VITE_CONVEX_URL` in the build environment to your production Convex URL.

## Roles

- **Project Manager / Coordinator / Estimating / Safety:** Dashboard and Project Tracker; read-only access to accounting summary where applicable.
- **Accounting:** Full accounting page; can add/edit accounting records.
- **Admin:** All of the above plus Admin page (user list, role changes, active/inactive).
