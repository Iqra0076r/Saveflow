# SaveFlow

SaveFlow is a full-stack React social-video downloader website built around the approved purple / ultraviolet Gen-Z visual direction from the supplied SaveFlow artwork. The primary interaction is **paste → auto-detect → fetch thumbnail/metadata → preselect best available quality → download**.

## What is included

- React 19 frontend with a Vite build.
- Node/Express backend.
- Automatic client-side platform detection on paste.
- Backend validation and public-domain allowlisting for YouTube, TikTok, Instagram, Facebook, X/Twitter, Vimeo, and Pinterest URLs.
- Real media metadata extraction through `yt-dlp` when installed: title, creator, thumbnail, duration and available formats.
- **Best available** is selected by default.
- Download jobs with real progress when the extractor reports it, plus automatic browser download when ready.
- FFmpeg-compatible best-video + best-audio merge flow when the source streams are legitimately available.
- Temporary files with automatic expiry.
- Responsive premium purple/glass/chrome UI, supported-sites page, platform landing pages, FAQ, legal pages, contact page, hidden admin area and basic runtime analytics.
- Admin platform enable/disable controls.
- URL allowlisting, DNS checks against private/local addresses, rate limiting, secure headers, CORS, sanitized filenames, HttpOnly admin session cookie and non-verbose production errors.

## Important compliance behavior

SaveFlow does **not** implement private-account scraping, social-login cookie extraction, credential collection, DRM bypass, paywall/subscriber bypass, CAPTCHA bypass, geographic-restriction circumvention, or authentication bypass. If a public source cannot be downloaded through the media engine without those techniques, the request fails with a user-friendly message.

## Local setup

Requirements: Node.js 22+, npm, FFmpeg, and internet access for the media sources.

1. Copy `.env.example` to `.env` and change the admin credentials/session secret.
2. Install JavaScript dependencies with `npm install`.
3. Install the media engine with `npm run setup:media`. This downloads the official `yt-dlp` standalone binary into `server/bin/yt-dlp`.
4. Make sure FFmpeg is installed and available on PATH.
5. Run `npm run dev`.
6. Open `http://localhost:5173`.

The React dev server proxies `/api` calls to `http://localhost:5000`.

## Production build

Run `npm run build`, then set `NODE_ENV=production` and run `npm start`. The Express server serves the built React frontend from `client/dist` and the API from the same origin.

The easiest deployment path is Docker because the supplied `Dockerfile` installs FFmpeg and `yt-dlp` in the runtime image automatically.

## Core API

- `GET /api/health` — API and media-engine readiness.
- `GET /api/v1/platforms` — runtime platform/status information.
- `POST /api/v1/analyze` — `{ "url": "PUBLIC_VIDEO_URL" }`.
- `POST /api/v1/download` — `{ "url": "PUBLIC_VIDEO_URL", "formatId": "best", "title": "..." }`.
- `GET /api/v1/jobs/:jobId` — poll download preparation/progress.
- `GET /api/v1/jobs/:jobId/file` — retrieve a ready temporary file.

## Admin

The admin area lives at `/admin` and is deliberately absent from the public navbar. Set these environment variables before exposing it publicly:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

The included dashboard tracks runtime events in memory. For a multi-instance production deployment, replace the in-memory analytics/config store with PostgreSQL/Supabase and Redis/BullMQ.

## Platform support

The UI intentionally starts platform labels as **Limited Support**, not “Supported,” because actual extraction changes as source platforms change. A platform is usable when the server has a working media engine and the specific public URL exposes media through a compliant method.

## Design assets

The approved SaveFlow artwork is retained in `client/public/art/` and used as subtle ambient visual texture behind the live React UI. The text, URL field, result cards, quality selection, buttons and dashboard are actual interactive interface elements rather than baked into screenshot images.

## GitHub Actions deployment

This repository includes three workflows:

- `CI` builds the React client, Node server, and Docker image on pushes and pull requests.
- `Deploy React frontend to GitHub Pages` publishes `client/dist` to GitHub Pages.
- `Deploy full-stack SaveFlow to VPS` builds/pushes a Docker image to GHCR and can deploy it to a Linux VPS when SSH secrets are configured.

### Repository variables for Pages

Set these in **Settings → Secrets and variables → Actions → Variables**:

- `VITE_API_URL`: public HTTPS URL of the SaveFlow backend, for example `https://api.example.com`.
- `CUSTOM_DOMAIN`: set to `true` when Pages is served from a custom domain; otherwise the Vite build automatically uses the repository subpath.
- `CUSTOM_DOMAIN_NAME`: optional custom Pages hostname, for example `www.example.com`.
- `FRONTEND_URL`: public frontend origin allowed by the backend CORS policy.

### Repository secrets for full-stack VPS deployment

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_PORT` (optional)
- `SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

GitHub Pages is static hosting and cannot execute the Node/yt-dlp/FFmpeg backend. For real analysis and downloads, deploy the backend through the VPS workflow (or another compatible Docker host) and set `VITE_API_URL` to that HTTPS backend URL.


## Free backend deployment (Render)

This repository includes `render.yaml` for a free Docker web service named `saveflow-api-iqra0076r`. The container installs FFmpeg and yt-dlp and serves the API on Render's injected `PORT`.

1. Open `https://render.com/deploy?repo=https://github.com/Iqra0076r/Saveflow`.
2. Approve the Blueprint and select the Free plan if prompted.
3. Enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` when Render asks for the unsynced environment variables.
4. The expected API URL is `https://saveflow-api-iqra0076r.onrender.com`.
5. GitHub Pages uses that URL by default. You can override it by creating a repository variable named `VITE_API_URL`.

Render Free web services can sleep after inactivity, so the first request after a quiet period can be slower. Temporary downloads are intentionally stored only on the ephemeral filesystem and are cleaned up automatically.
