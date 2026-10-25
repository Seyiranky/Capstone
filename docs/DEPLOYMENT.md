# Deploying Isoko (free tier)

Isoko runs on two free services:

| Part | Where | Why there |
|---|---|---|
| Web app (React, built by Vite) | Render static site `isoko-web` | Free, served from a CDN, never sleeps |
| API (Node, Express, Socket.IO) | Render web service `isoko-api`, from `server/Dockerfile.prod` | Free; runs the same container CI builds |
| Database (PostgreSQL) | Supabase | Free with no 30-day expiry (Render's free Postgres is deleted after 30 days) |
| Uploaded files | Supabase Storage, private bucket `uploads` | A free Render service's disk is wiped on every redeploy |
| Keep-awake ping | cron-job.org | A free Render service sleeps after 15 minutes without traffic |

`render.yaml` at the root of the repository describes both Render services. Secrets are never
in git: Render generates the signing secrets, and you paste the rest into Render's dashboard.

Regions: Render **Frankfurt** and Supabase **Central EU (Frankfurt)**, the closest to Kigali, and
next to each other, so the API reaches its database quickly.

---

## 1. Supabase: database and file storage (about 5 minutes)

1. Go to **supabase.com** › **Start your project** › sign in with GitHub.
2. **New project**: name `isoko`, choose a **database password of letters and numbers only** (symbols such
   as `@ # / ? $ )` break the database address unless encoded); keep it, you need it in step 5,
   region **Central EU (Frankfurt)**, plan **Free**. Wait about a minute while it starts.
3. **Storage** (left menu) › **New bucket**: name `uploads`, leave **Public bucket off** (private).
   Isoko's server is the only thing that reads it, after checking each request's signed link.
4. **Project Settings** › **API Keys**:
   - copy the **Project URL** (`https://<something>.supabase.co`);
   - copy a **secret key** (starts `sb_secret_`). If you only see legacy keys, use the
     **service_role** key. This key gives full access: it goes only into Render, never into the
     web app or a chat.
5. Top of the dashboard › **Connect** › **Session pooler** › copy the URI. It looks like
   `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`.
   Replace `[YOUR-PASSWORD]` with the password from step 2.
   Use the **session pooler**, not the direct connection: the direct host is IPv6-only, and Render
   connects over IPv4.
   The API checks this address before it starts and stops with a plain explanation (never the
   address itself) if the password is still a placeholder, breaks the address, or it is the direct host.

## 2. Render: API and web app (about 5 minutes, then about 10 minutes of building)

1. Go to **render.com** › sign in with GitHub, and allow it to see the `Capstone` repository.
2. **New** › **Blueprint** › choose `Seyiranky/Capstone`. Render reads `render.yaml` and shows two
   services, `isoko-api` and `isoko-web`.
3. Fill in the values it asks for:

   **isoko-api**

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the session pooler URI from Supabase step 5 |
   | `APP_URL` | `https://isoko-web.onrender.com` |
   | `SUPABASE_URL` | Project URL from Supabase step 4 |
   | `SUPABASE_SERVICE_KEY` | the secret key from Supabase step 4 |
   | `MOMO_COLLECTION_KEY`, `MOMO_COLLECTION_USER`, `MOMO_COLLECTION_API_KEY` | copy each from `server/.env` on your Mac (open it in the editor) |
   | `MOMO_CALLBACK_URL` | `https://isoko-api.onrender.com/api/webhooks/momo`, **only if** the sandbox API user was created with that host (`MOMO_CALLBACK_HOST=isoko-api.onrender.com npm run momo:sandbox-user`). MTN refuses every payment request whose callback host differs from the user's (`INVALID_CALLBACK_URL_HOST`); a user created with the default host `localhost` must leave this unset. Payments are still confirmed without it, by status polling |
   | `GOOGLE_CLIENT_ID` | the same value as in `server/.env` |

   **isoko-web**

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://isoko-api.onrender.com/api` |
   | `VITE_GOOGLE_CLIENT_ID` | the same value as in `client/.env` |

4. **Apply**. The API builds its Docker image (about 5 minutes), migrates the empty database, loads
   the demo accounts, and starts. The web app builds in about 3 minutes.
5. **If Render added a suffix to a name** (for example `isoko-api-x1y2.onrender.com`, because the
   plain name was taken), use the real addresses instead: update `APP_URL` and `MOMO_CALLBACK_URL`
   on the API, and `VITE_API_URL` on the web app. The web app reads `VITE_*` values while it is
   built, so after changing them choose **Manual Deploy** › **Clear build cache & deploy**.

## 3. Google sign-in (2 minutes)

console.cloud.google.com › **Google Auth Platform** (or APIs & Services) › **Clients** › your web
client › **Authorized JavaScript origins** › add `https://isoko-web.onrender.com` › **Save**.
Google can take a few minutes to apply it.

## 4. cron-job.org: keep the API awake (2 minutes)

1. **cron-job.org** › sign up (free).
2. **Create cronjob**: URL `https://isoko-api.onrender.com/health`, every **10 minutes**, save.

This also keeps the server's 10-minute background checks running (payment status, reminders,
safety alerts, disputes), and since those touch the database, Supabase does not pause the
project for inactivity (it pauses free projects after 7 days without database activity).
One service awake all month is about 744 hours, inside Render's 750 free hours.

## 5. Check it works

| Check | Expected |
|---|---|
| `https://isoko-api.onrender.com/health` | `{"status":"ok"}` |
| Open `https://isoko-web.onrender.com`, sign in as `admin@isoko.demo` / `password123` | the admin dashboard |
| As a worker, upload a profile picture; in Render, **Manual Deploy** › **Deploy latest commit**; reload | the picture is still there (it came back from Supabase) |
| Two browsers, a client and a worker, send a chat message | it arrives at once (Socket.IO) |
| As a client, mark a job done and pay with MTN MoMo | "Waiting for MTN to approve the test payment", then Paid, with a receipt |
| Admin › Payments | the "MTN MoMo · sandbox" badge |

## What runs where, and what is not real

- **Payments**: MTN MoMo **sandbox**; requests and confirmations are real API calls, no real money
  moves and no phone is prompted.
- **Text messages**: the `log` driver; printed in Render's logs, not sent. New sign-ups cannot
  confirm a phone number.
- **Email**: real, through **Brevo's HTTPS API** (free, 300 emails a day). Not Brevo's SMTP relay:
  Render's free tier blocks outbound SMTP (ports 25, 465, 587) since September 2025, and the
  connection just times out. On `isoko-api` › Environment set `EMAIL_DRIVER=brevo`,
  `BREVO_API_KEY` (Brevo › SMTP & API › **API Keys** › Generate a new API key; this is not the
  SMTP key), and `EMAIL_FROM`, e.g. `Isoko <you@gmail.com>`, a sender verified in Brevo
  (Senders, Domains & Dedicated IPs › Senders). A person asks for a confirmation email in
  **Settings › Notifications** by choosing email; password resets and email notices follow.
  The demo accounts' addresses (`@isoko.demo`) are not real inboxes: test with your own.
- **Demo data** is loaded only into an empty database. To start empty instead, set
  `SEED_DEMO_DATA=false` on the API before the first deploy.
- **First request after a long idle**: if the ping stops, the first visitor waits about a minute
  while Render wakes the API.

## Running the production image on your own machine

```bash
cd server
docker build -f Dockerfile.prod -t isoko-api:prod .
docker network create isoko-local
docker run -d --name pg --network isoko-local -e POSTGRES_USER=isoko -e POSTGRES_PASSWORD=isoko -e POSTGRES_DB=isoko postgres:16-alpine
docker run --rm -p 4100:4000 --network isoko-local \
  -e DATABASE_URL=postgres://isoko:isoko@pg:5432/isoko -e DATABASE_SSL=false \
  -e JWT_SECRET=local-only -e APP_URL=http://localhost:5173 isoko-api:prod
```

`DATABASE_SSL=false` is for a local database only; every managed Postgres requires SSL.
