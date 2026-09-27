import crypto from 'node:crypto';
import { beginDownload, cleanupJobFile } from './engine.js';
import { config } from './config.js';
import type { DownloadJob, PlatformKey } from './types.js';

const jobs = new Map<string, DownloadJob>();

type EventKind = 'analysis' | 'download_success' | 'download_failed';
const events: Array<{ kind: EventKind; platform: PlatformKey; time: number }> = [];

export function recordEvent(kind: EventKind, platform: PlatformKey) {
  events.push({ kind, platform, time: Date.now() });
  if (events.length > 5000) events.splice(0, events.length - 5000);
}

export function metricsSnapshot() {
  const totalAnalyses = events.filter((e) => e.kind === 'analysis').length;
  const successfulDownloads = events.filter((e) => e.kind === 'download_success').length;
  const failedDownloads = events.filter((e) => e.kind === 'download_failed').length;
  const platformCounts: Record<string, number> = {};
  for (const event of events.filter((e) => e.kind === 'analysis')) {
    platformCounts[event.platform] = (platformCounts[event.platform] || 0) + 1;
  }
  return {
    totalAnalyses,
    successfulDownloads,
    failedDownloads,
    successRate: successfulDownloads + failedDownloads ? Number((successfulDownloads / (successfulDownloads + failedDownloads) * 100).toFixed(1)) : 100,
    queue: [...jobs.values()].filter((j) => j.status === 'queued' || j.status === 'processing').length,
    platformCounts,
    recent: [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10).map((j) => ({
      id: j.id,
      platform: j.platform,
      formatId: j.formatId,
      status: j.status,
      progress: j.progress,
      createdAt: j.createdAt,
      title: j.title,
    })),
  };
}

export function createDownloadJob(input: { url: string; platform: PlatformKey; formatId: string; title?: string }): DownloadJob {
  const job: DownloadJob = {
    id: crypto.randomUUID(),
    url: input.url,
    platform: input.platform,
    formatId: input.formatId,
    title: input.title,
    status: 'queued',
    progress: null,
    message: 'Queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  queueMicrotask(() => runJob(job.id));
  return job;
}

async function runJob(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'processing';
  job.message = 'Preparing your download…';
  job.updatedAt = Date.now();
  try {
    const result = await beginDownload(job, (progress, message) => {
      job.progress = progress;
      job.message = message;
      job.updatedAt = Date.now();
    });
    job.filePath = result.filePath;
    job.downloadName = result.downloadName;
    job.status = 'ready';
    job.progress = 100;
    job.message = 'Download ready';
    job.updatedAt = Date.now();
    recordEvent('download_success', job.platform);
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Download failed.';
    job.message = 'Download failed';
    job.updatedAt = Date.now();
    recordEvent('download_failed', job.platform);
  }
}

export function getJob(id: string) { return jobs.get(id); }

setInterval(async () => {
  const ttl = config.tempFileTtlMinutes * 60_000;
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt < ttl) continue;
    if (job.status === 'ready') await cleanupJobFile(job);
    job.status = 'expired';
    job.message = 'Expired';
    if (now - job.updatedAt > ttl * 2) jobs.delete(id);
  }
}, 60_000).unref();
