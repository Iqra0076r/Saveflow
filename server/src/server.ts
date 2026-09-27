import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { platformDefinitions, getPlatform } from './platforms.js';
import { validatePublicMediaUrl, safeFormatId } from './security.js';
import { analyzeMedia, engineInfo } from './engine.js';
import { createDownloadJob, getJob, metricsSnapshot, recordEvent } from './jobs.js';
import { authenticateAdmin, clearAdminCookie, requireAdmin, setAdminCookie } from './admin.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));
app.use(cors({ origin: config.nodeEnv === 'production' ? config.frontendUrls : [...config.frontendUrls, 'http://127.0.0.1:5173'], credentials: true }));
app.use(express.json({ limit: '32kb' }));

const analyzeLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
const downloadLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true });

app.get('/api/health', async (_req, res) => {
  const engine = await engineInfo();
  res.json({ status: 'ok', mediaEngine: engine });
});

app.get('/api/v1/platforms', async (_req, res) => {
  const engine = await engineInfo();
  res.json({
    success: true,
    engine,
    platforms: platformDefinitions.map((p) => ({ ...p, status: !engine.ready ? 'Unavailable' : p.status })),
  });
});

app.post('/api/v1/analyze', analyzeLimiter, async (req, res) => {
  try {
    const { url, platform } = await validatePublicMediaUrl(req.body?.url);
    const data = await analyzeMedia(url.toString(), platform);
    recordEvent('analysis', platform);
    res.json({ success: true, ...data });
  } catch (error) {
    const message = error instanceof z.ZodError ? 'Enter a valid public video URL.' : error instanceof Error ? error.message : 'Unable to analyze this link.';
    res.status(400).json({ success: false, message });
  }
});

app.post('/api/v1/download', downloadLimiter, async (req, res) => {
  try {
    const { url, platform } = await validatePublicMediaUrl(req.body?.url);
    const formatId = safeFormatId(req.body?.formatId || 'best');
    const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 200) : undefined;
    const job = createDownloadJob({ url: url.toString(), platform, formatId, title });
    res.status(202).json({ success: true, jobId: job.id });
  } catch (error) {
    res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Could not start the download.' });
  }
});

app.get('/api/v1/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, message: 'Download job not found.' });
  res.json({ success: true, job: { id: job.id, status: job.status, progress: job.progress, message: job.message, error: job.error, fileReady: job.status === 'ready' } });
});

app.get('/api/v1/jobs/:jobId/file', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job || job.status !== 'ready' || !job.filePath) return res.status(404).json({ success: false, message: 'Download file is not ready.' });
  res.download(job.filePath, job.downloadName || 'saveflow-download', (error) => {
    if (error && !res.headersSent) res.status(500).json({ success: false, message: 'Could not send the file.' });
  });
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!authenticateAdmin(email, password)) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  setAdminCookie(res);
  res.json({ success: true });
});
app.post('/api/admin/logout', (_req, res) => { clearAdminCookie(res); res.json({ success: true }); });
app.get('/api/admin/session', requireAdmin, (_req, res) => res.json({ success: true, email: config.adminEmail }));
app.get('/api/admin/overview', requireAdmin, async (_req, res) => res.json({ success: true, ...metricsSnapshot(), engine: await engineInfo() }));
app.get('/api/admin/platforms', requireAdmin, (_req, res) => res.json({ success: true, platforms: platformDefinitions }));
app.post('/api/admin/platforms/:key', requireAdmin, (req, res) => {
  const platform = platformDefinitions.find((p) => p.key === req.params.key);
  if (!platform) return res.status(404).json({ success: false, message: 'Platform not found.' });
  if (typeof req.body?.enabled === 'boolean') platform.enabled = req.body.enabled;
  res.json({ success: true, platform });
});

if (config.nodeEnv === 'production' && existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist, { maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(config.clientDist, 'index.html'));
  });
}

app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found.' }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ success: false, message: 'Server unavailable.' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`SaveFlow server listening on 0.0.0.0:${config.port}`);
  if (config.nodeEnv !== 'production' && config.adminPassword === 'change-this-password') {
    console.warn('Change ADMIN_PASSWORD before exposing the admin panel publicly.');
  }
});
