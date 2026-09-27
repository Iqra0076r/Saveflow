import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = Number(process.env.PORT || 10000);
const MAX_FILE_SIZE_MB = Math.max(25, Number(process.env.MAX_FILE_SIZE_MB || 250));
const MAX_VIDEO_DURATION_MINUTES = Math.max(1, Number(process.env.MAX_VIDEO_DURATION_MINUTES || 60));
const TEMP_FILE_TTL_MINUTES = Math.max(5, Number(process.env.TEMP_FILE_TTL_MINUTES || 30));
const FRONTEND_ORIGINS = (process.env.FRONTEND_URL || "http://localhost:5173,https://iqra0076r.github.io")
  .split(",")
  .map((item) => item.trim().replace(/\/$/, ""))
  .filter(Boolean);

const PLATFORM_RULES = [
  { id: "youtube", label: "Supported where source permits", domains: ["youtube.com", "youtu.be"] },
  { id: "tiktok", label: "Supported where source permits", domains: ["tiktok.com"] },
  { id: "instagram", label: "Limited / public media only", domains: ["instagram.com"] },
  { id: "facebook", label: "Limited / public media only", domains: ["facebook.com", "fb.watch"] },
  { id: "x", label: "Limited / public media only", domains: ["x.com", "twitter.com"] },
  { id: "vimeo", label: "Supported where source permits", domains: ["vimeo.com"] },
  { id: "pinterest", label: "Limited / public media only", domains: ["pinterest.com", "pin.it"] }
];

const jobs = new Map();
const tempRoot = join(os.tmpdir(), "saveflow-downloads");
await fs.mkdir(tempRoot, { recursive: true });

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function parseSourceUrl(input) {
  if (typeof input !== "string" || input.length > 2048) {
    throw new Error("Invalid URL.");
  }

  let parsed;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error("Invalid URL.");
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS links are supported.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs containing credentials are not supported.");
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("Private or local network addresses are not supported.");
  }

  const platform = PLATFORM_RULES.find((item) => item.domains.some((domain) => hostMatches(host, domain)));
  if (!platform) {
    throw new Error("Unsupported platform.");
  }

  return { normalized: parsed.toString(), platform };
}

function safeMessage(raw = "") {
  const text = String(raw).replace(/https?:\/\/\S+/gi, "[source]").replace(/\s+/g, " ").trim();
  if (/private|login required|sign in|cookies/i.test(text)) {
    return "This media is private, login-restricted, or otherwise unavailable through a supported public method.";
  }
  if (/copyright|drm|protected/i.test(text)) {
    return "This content cannot currently be downloaded through a supported method.";
  }
  if (/unsupported url/i.test(text)) {
    return "The supplied link is not supported by the current media engine.";
  }
  if (/429|too many requests|rate limit/i.test(text)) {
    return "The source platform is temporarily rate limiting requests. Please try again later.";
  }
  if (/403|forbidden/i.test(text)) {
    return "The source platform did not permit this request.";
  }
  if (/not available|unavailable|removed|deleted/i.test(text)) {
    return "This media is unavailable or no longer public.";
  }
  return "The source platform could not provide this media through a supported method.";
}

function runYtDlp(args, { timeoutMs = 90000, maxOutput = 18_000_000, onLine } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("yt-dlp", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
    });

    let stdout = "";
    let stderr = "";
    let total = 0;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new Error("Media processing timed out."));
    }, timeoutMs);

    function append(kind, chunk) {
      const value = chunk.toString();
      total += Buffer.byteLength(value);
      if (total > maxOutput) {
        child.kill("SIGKILL");
        clearTimeout(timer);
        rejectPromise(new Error("Source response was too large."));
        return;
      }
      if (kind === "out") stdout += value;
      else stderr += value;
      if (onLine) value.split(/\r?\n/).filter(Boolean).forEach(onLine);
    }

    child.stdout.on("data", (chunk) => append("out", chunk));
    child.stderr.on("data", (chunk) => append("err", chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(stderr || stdout || `yt-dlp exited with code ${code}`));
    });
  });
}

function makeFormatList(info) {
  const raw = Array.isArray(info.formats) ? info.formats : [];
  const videoFormats = raw.filter((f) => f && f.vcodec && f.vcodec !== "none");
  const heights = [...new Set(videoFormats.map((f) => Number(f.height)).filter((h) => Number.isFinite(h) && h >= 144))]
    .sort((a, b) => b - a)
    .slice(0, 5);

  const bestRaw = videoFormats
    .slice()
    .sort((a, b) => (Number(b.height || 0) - Number(a.height || 0)) || (Number(b.tbr || 0) - Number(a.tbr || 0)))[0];

  const result = [{
    id: "best",
    quality: "Best",
    badge: "BEST",
    label: bestRaw?.height ? `Best available · up to ${bestRaw.height}p` : "Best available",
    ext: "mp4",
    filesize: bestRaw?.filesize || bestRaw?.filesize_approx || null,
    recommended: true
  }];

  for (const height of heights) {
    const candidate = videoFormats
      .filter((f) => Number(f.height) === height)
      .sort((a, b) => Number(b.tbr || 0) - Number(a.tbr || 0))[0];

    result.push({
      id: String(height),
      quality: `${height}p`,
      badge: height >= 1080 ? "FHD" : height >= 720 ? "HD" : "SD",
      label: `${height}p video`,
      ext: candidate?.ext || "mp4",
      filesize: candidate?.filesize || candidate?.filesize_approx || null,
      recommended: false
    });
  }

  if (raw.some((f) => f?.acodec && f.acodec !== "none")) {
    result.push({
      id: "audio",
      quality: "Audio",
      badge: "AUDIO",
      label: "Audio only",
      ext: "m4a",
      filesize: null,
      recommended: false
    });
  }

  return result;
}

function downloadSelector(formatId) {
  if (formatId === "best") return "bestvideo*+bestaudio/best";
  if (formatId === "audio") return "bestaudio/best";
  const height = Number(formatId);
  if (![2160, 1440, 1080, 720, 480, 360, 240, 144].includes(height)) {
    throw new Error("Invalid format selection.");
  }
  return `bestvideo*[height<=${height}]+bestaudio/best[height<=${height}]`;
}

async function processDownload(job, sourceUrl, formatId) {
  job.status = "processing";
  job.updatedAt = Date.now();
  const dir = join(tempRoot, job.id);
  await fs.mkdir(dir, { recursive: true });

  try {
    const selector = downloadSelector(formatId);
    const output = join(dir, "%(title).100B-%(id)s.%(ext)s");
    const args = [
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--restrict-filenames",
      "--max-filesize", `${MAX_FILE_SIZE_MB}M`,
      "-f", selector,
      "-o", output
    ];

    if (formatId === "audio") {
      args.push("-x", "--audio-format", "m4a");
    } else {
      args.push("--merge-output-format", "mp4");
    }
    args.push(sourceUrl);

    await runYtDlp(args, {
      timeoutMs: 12 * 60 * 1000,
      maxOutput: 6_000_000,
      onLine(line) {
        const match = line.match(/\[download\]\s+([0-9.]+)%/);
        if (match) {
          job.progress = Math.min(99, Math.max(0, Number(match[1])));
          job.updatedAt = Date.now();
        }
      }
    });

    const files = (await fs.readdir(dir)).filter((name) => !name.endsWith(".part") && !name.endsWith(".ytdl"));
    if (!files.length) throw new Error("No downloadable file was produced.");

    const withStats = await Promise.all(files.map(async (name) => {
      const path = join(dir, name);
      const stat = await fs.stat(path);
      return { name, path, size: stat.size };
    }));
    withStats.sort((a, b) => b.size - a.size);
    const file = withStats[0];

    job.filePath = file.path;
    job.fileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
    job.size = file.size;
    job.progress = 100;
    job.status = "ready";
    job.updatedAt = Date.now();
  } catch (error) {
    job.status = "failed";
    job.message = safeMessage(error.message);
    job.updatedAt = Date.now();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function deleteJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;
  jobs.delete(jobId);
  await fs.rm(join(tempRoot, jobId), { recursive: true, force: true }).catch(() => {});
}

setInterval(() => {
  const cutoff = Date.now() - TEMP_FILE_TTL_MINUTES * 60_000;
  for (const [id, job] of jobs.entries()) {
    if (job.updatedAt < cutoff) deleteJob(id);
  }
}, 60_000).unref();

app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, "");
    if (FRONTEND_ORIGINS.includes(normalized) || normalized === "https://iqra0076r.github.io") {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  exposedHeaders: ["Content-Disposition", "Content-Length"]
}));
app.use(express.json({ limit: "8kb" }));

const analyzeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const downloadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "SaveFlow API",
    engine: "yt-dlp + FFmpeg",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/v1/platforms", (_req, res) => {
  res.json({
    platforms: PLATFORM_RULES.map(({ id, label }) => ({
      id,
      status: label.startsWith("Supported") ? "supported" : "limited",
      label
    }))
  });
});

app.post("/api/v1/analyze", analyzeLimiter, async (req, res) => {
  try {
    const { normalized, platform } = parseSourceUrl(req.body?.url);
    const { stdout } = await runYtDlp([
      "--dump-single-json",
      "--no-playlist",
      "--no-warnings",
      "--skip-download",
      normalized
    ], { timeoutMs: 75_000 });

    const info = JSON.parse(stdout);
    const duration = Number(info.duration || 0);
    if (duration > MAX_VIDEO_DURATION_MINUTES * 60) {
      return res.status(413).json({ message: `This video exceeds the ${MAX_VIDEO_DURATION_MINUTES}-minute processing limit.` });
    }

    const formats = makeFormatList(info);
    if (!formats.length) {
      return res.status(422).json({ message: "No downloadable format is currently available through a supported method." });
    }

    res.json({
      success: true,
      platform: platform.id,
      sourceUrl: normalized,
      title: info.title || info.fulltitle || "Untitled media",
      creator: info.uploader || info.channel || info.creator || info.extractor_key || "",
      thumbnail: info.thumbnail || info.thumbnails?.at(-1)?.url || "",
      duration,
      formats
    });
  } catch (error) {
    res.status(422).json({ message: safeMessage(error.message) });
  }
});

app.post("/api/v1/download", downloadLimiter, async (req, res) => {
  try {
    const { normalized } = parseSourceUrl(req.body?.url);
    const formatId = String(req.body?.formatId || "");
    downloadSelector(formatId);

    const job = {
      id: randomUUID(),
      status: "queued",
      progress: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      message: ""
    };
    jobs.set(job.id, job);
    setImmediate(() => processDownload(job, normalized, formatId));
    res.status(202).json({ jobId: job.id, status: job.status });
  } catch (error) {
    res.status(400).json({ message: error.message || "Invalid download request." });
  }
});

app.get("/api/v1/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ message: "Download job not found or expired." });
  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message || "",
    size: job.size || null,
    fileName: job.status === "ready" ? job.fileName : null
  });
});

app.get("/api/v1/jobs/:jobId/file", async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.status !== "ready" || !job.filePath) {
    return res.status(404).json({ message: "Download is not ready or has expired." });
  }

  try {
    const stat = await fs.stat(job.filePath);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${job.fileName.replace(/"/g, "")}"`);
    const stream = createReadStream(job.filePath);
    stream.pipe(res);
    stream.on("error", () => res.destroy());
  } catch {
    res.status(404).json({ message: "Temporary download file is no longer available." });
  }
});

const clientDist = resolve(__dirname, "../client/dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDist, { maxAge: "1h", index: false }));
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(join(clientDist, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  console.error("[SaveFlow]", error?.message || error);
  if (res.headersSent) return;
  res.status(500).json({ message: "The SaveFlow server could not complete that request." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SaveFlow API listening on 0.0.0.0:${PORT}`);
});
