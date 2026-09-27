import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const numberEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const frontendUrls = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: numberEnv('PORT', 5000),
  frontendUrls,
  maxFileSizeMb: numberEnv('MAX_FILE_SIZE_MB', 500),
  maxVideoDurationMinutes: numberEnv('MAX_VIDEO_DURATION_MINUTES', 60),
  tempFileTtlMinutes: numberEnv('TEMP_FILE_TTL_MINUTES', 30),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-this-password',
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || 'dev-only-change-me',
  tempDir: resolve(projectRoot, 'server/.tmp'),
  clientDist: resolve(projectRoot, 'client/dist'),
};
