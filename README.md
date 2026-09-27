# SaveFlow

Premium React social-video downloader UI with a Node backend for public/authorized media.

## Architecture

- **Frontend:** React + Vite, deployed free with GitHub Pages.
- **Backend:** Node + Express + yt-dlp + FFmpeg, prepared for a Render Free Web Service.
- **Repository:** `Iqra0076r/Saveflow`.

## Frontend deployment

GitHub Pages is configured through `.github/workflows/pages.yml`. Every push to `main` rebuilds and deploys the React site.

Default project URL:

`https://iqra0076r.github.io/Saveflow/`

The workflow uses `VITE_API_URL`. If the Render URL differs from the default, create a repository variable named `VITE_API_URL` with the actual backend URL and rerun the Pages workflow.

## Free backend deployment — Render

This repository includes `render.yaml` and a Dockerfile with Node 22, yt-dlp and FFmpeg.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Iqra0076r/Saveflow)

After deployment, verify:

`https://YOUR-SERVICE.onrender.com/api/health`

Expected default service name:

`saveflow-api-iqra0076r`

## Local development

1. Install Node.js 22.
2. Install yt-dlp and FFmpeg so they are available in PATH.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open `http://localhost:5173`.

## Usage and compliance

SaveFlow is designed for public media the user owns, is authorized to save, or the source platform permits downloading. It does not implement DRM bypass, private-account access, authentication bypass, cookie theft, paywall circumvention, or CAPTCHA bypass.
