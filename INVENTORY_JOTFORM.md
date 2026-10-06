# Connecting JotForm to Auto-Fill the Inventory Table

When someone submits your JotForm (e.g. equipment checkout), the submission can automatically add a row to the **Inventory** table in Pretium Process.

## How it works

1. You expose a **webhook URL** from this app (Convex HTTP endpoint).
2. When your JotForm is submitted, JotForm (or an automation like Zapier/Make) sends an HTTP POST with the form data to that URL.
3. The webhook handler maps the payload to one new inventory row: equipment name, location (project), who took it out, and date taken.

## Step 1: Get your webhook URL

After deployment, your endpoint is:

```text
https://<your-deployment-name>.convex.site/jotform-inventory
```

- In Convex: open your [dashboard](https://dashboard.convex.dev) → your project → **Settings** → **URL and Deploy Key**.
- Use the URL that ends in **`.convex.site`** (not `.convex.cloud`).  
  Example: `https://happy-animal-123.convex.site/jotform-inventory`

## Step 2: (Optional) Secure the webhook

So only your form (or Zapier/Make) can call the URL:

1. In Convex dashboard: **Settings** → **Environment Variables**.
2. Add:  
   **Name:** `JOTFORM_WEBHOOK_SECRET`  
   **Value:** a long random string you choose (e.g. from a password generator).
3. When sending the POST request, send the **same value** in a header:  
   `X-Webhook-Secret: <your-secret>`  
   If you use Zapier/Make, set this header in the “Webhook” or “HTTP” step.

If you don’t set this env var, the webhook does not check a secret (anyone with the URL could add rows).

## Step 3: Expected JSON body

The endpoint expects a **POST** with **JSON** body. Supported fields:

| Field             | Required | Description |
|-------------------|----------|-------------|
| `equipmentName` or `name` | Yes     | Equipment name. |
| `projectId` or `projectName` | Yes (one of them) | **projectId:** Convex project ID. **projectName:** Exact project name (must match a project in the app). |
| `takenOutByName`   | No      | Name of the person who took the equipment out. |
| `dateTaken`        | No      | When it was taken. ISO date string (e.g. `"2025-03-11"`) or Unix timestamp in ms. Defaults to “now” if omitted. |

Example (by project ID):

```json
{
  "name": "Forklift #3",
  "projectId": "jd7abc123xyz456...",
  "takenOutByName": "Jane Smith",
  "dateTaken": "2025-03-11T14:00:00.000Z"
}
```

Example (by project name, often easier for forms):

```json
{
  "name": "Forklift #3",
  "projectName": "Riverside Phase 2",
  "takenOutByName": "Jane Smith"
}
```

### Getting `projectId` (if you don’t use `projectName`)

- **Option A:** In the Pretium Process app, open a project and copy its ID from the URL:  
  `/projects/<this-is-the-projectId>`  
  or from the Inventory page (e.g. via browser dev tools when changing the project dropdown).
- **Option B:** Use the Convex dashboard **Data** tab → **projects** table → copy the `_id` of the project.

Using **projectName** is often easier: in JotForm use a dropdown whose options are your project names (exactly as in the app). No IDs needed.

For multiple projects with **projectId**, you can:
- Use a **hidden field** in JotForm that you set per link (e.g. different “Equipment checkout” links per project), or
- Use a **dropdown** in the form and map each option’s value to the correct Convex `projectId` in Zapier/Make.

## Step 4: Connect JotForm

JotForm does not send arbitrary JSON directly to a custom URL. You have two practical options.

### Option A: Zapier or Make (Integromat)

1. **Trigger:** JotForm – “New Submission” (or “New Submission in Form”).
2. **Action:** Webhooks by Zapier – “POST” (or Make “HTTP” module).
   - **URL:** `https://<your-deployment>.convex.site/jotform-inventory`
   - **Headers:**  
     `Content-Type: application/json`  
     If you set a secret: `X-Webhook-Secret: <your-secret>`
   - **Body:** map JotForm fields to the JSON above, e.g.:
     - `name` or `equipmentName` ← JotForm question (e.g. “Equipment name”).
     - `projectId` ← fixed value or from a JotForm hidden/dropdown.
     - `takenOutByName` ← JotForm “Full name” or “Who took it out”.
     - `dateTaken` ← JotForm “Date” field (format as ISO) or leave empty for “now”.

3. Save and test with a form submission.

### Option B: JotForm Webhooks (if you can send JSON)

If your plan supports it, you can try JotForm’s **Webhooks** (Form → Settings → Webhooks) and point it to your URL. JotForm often sends form data in its own format (e.g. `q3_equipmentName`), not the exact keys above. In that case:

- Either add a small **middleware** (e.g. a serverless function or another HTTP endpoint) that converts JotForm’s payload into the JSON above and then POSTs to `https://<deployment>.convex.site/jotform-inventory`.
- Or use Zapier/Make (Option A) to receive JotForm’s submission and then POST the mapped JSON to the Convex URL.

## Step 5: Test

Send a test POST (replace `<deployment>` and optional header):

```bash
# Using project name (replace with a real project name from your app):
curl -X POST "https://<deployment>.convex.site/jotform-inventory" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: YOUR_SECRET" \
  -d '{"name":"Test Equipment","projectName":"Your Project Name","takenOutByName":"Test User"}'
```

Then open **Inventory** in the app and confirm the new row appears with the right equipment name, location (project), “Taken out by”, and “Date taken”.

## Troubleshooting

- **401 Unauthorized:** You set `JOTFORM_WEBHOOK_SECRET` but the request doesn’t send the same value in `X-Webhook-Secret`, or the header is missing.
- **400 Bad Request:** Body is not valid JSON, or `name`/`equipmentName` or `projectId` is missing.
- **422 Unprocessable Entity:** `projectId` is not a valid Convex project ID, or the backend rejected the insert (e.g. no admin user in the system). Ensure at least one user exists and has the Admin role.

For more on Convex HTTP actions: [Convex – HTTP Actions](https://docs.convex.dev/functions/http-actions).
