import { access, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { config, projectRoot } from './config.js';
import { sanitizeFilename } from './security.js';
import type { DownloadJob, MediaFormat, MediaMetadata, PlatformKey } from './types.js';

const localEngine = resolve(projectRoot, 'server/bin/yt-dlp');

async function canExecute(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveEngine(): Promise<string | null> {
  if (process.env.MEDIA_ENGINE_PATH && await canExecute(process.env.MEDIA_ENGINE_PATH)) return process.env.MEDIA_ENGINE_PATH;
  if (await canExecute(localEngine)) return localEngine;
  return 'yt-dlp';
}

function run(command: string, args: string[], timeoutMs = 35_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('The source took too long to respond.'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => stdout += chunk.toString());
    child.stderr.on('data', (chunk) => stderr += chunk.toString());
    child.on('error', (error) => {
      clearTimeout(timer);
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Media engine is not installed. Run npm run setup:media first.'));
      } else reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveRun({ stdout, stderr });
      else reject(new Error(normalizeEngineError(stderr)));
    });
  });
}

function normalizeEngineError(stderr: string): string {
  const text = stderr.toLowerCase();
  if (text.includes('private')) return 'Private content cannot be accessed.';
  if (text.includes('login') || text.includes('sign in') || text.includes('cookies')) return 'This source requires authentication and is not supported.';
  if (text.includes('drm')) return 'DRM-protected content is not supported.';
  if (text.includes('unsupported url')) return 'This link is not supported by the media engine.';
  if (text.includes('not available') || text.includes('unavailable')) return 'This media is currently unavailable.';
  if (text.includes('429') || text.includes('too many requests')) return 'The source is rate-limiting requests. Try again later.';
  return 'The media source could not be analyzed through a supported method.';
}

function readableSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function chooseFormats(info: any): MediaFormat[] {
  const raw = Array.isArray(info.formats) ? info.formats : [];
  const progressive = raw
    .filter((f: any) => f && f.format_id && f.vcodec && f.vcodec !== 'none' && f.ext)
    .map((f: any) => ({
      id: String(f.format_id),
      height: Number(f.height) || undefined,
      fps: Number(f.fps) || undefined,
      ext: String(f.ext || 'mp4'),
      size: Number(f.filesize || f.filesize_approx) || undefined,
      hasAudio: Boolean(f.acodec && f.acodec !== 'none'),
      tbr: Number(f.tbr) || 0,
    }))
    .sort((a: any, b: any) => (b.height || 0) - (a.height || 0) || Number(b.hasAudio) - Number(a.hasAudio) || b.tbr - a.tbr);

  const seen = new Set<string>();
  const formats: MediaFormat[] = [{
    id: 'best',
    label: 'Best available',
    quality: 'Best',
    ext: 'mp4',
    recommended: true,
  }];

  for (const item of progressive) {
    const quality = item.height ? `${item.height}p${item.fps && item.fps > 30 ? ` ${Math.round(item.fps)}fps` : ''}` : 'Video';
    const dedupe = `${item.height || 0}-${item.ext}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    formats.push({
      id: item.id,
      label: [quality, item.ext.toUpperCase(), readableSize(item.size)].filter(Boolean).join(' • '),
      quality,
      ext: item.ext,
      size: item.size,
      height: item.height,
      fps: item.fps,
    });
    if (formats.length >= 6) break;
  }

  const audio = raw
    .filter((f: any) => f && f.format_id && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
    .sort((a: any, b: any) => Number(b.abr || b.tbr || 0) - Number(a.abr || a.tbr || 0))[0];
  if (audio) {
    formats.push({
      id: 'audio',
      label: ['Audio', 'M4A', readableSize(Number(audio.filesize || audio.filesize_approx) || undefined)].filter(Boolean).join(' • '),
      quality: 'Audio',
      ext: 'm4a',
      size: Number(audio.filesize || audio.filesize_approx) || undefined,
      audioOnly: true,
    });
  }
  return formats;
}

export async function engineInfo() {
  const command = await resolveEngine();
  if (!command) return { ready: false, version: null };
  try {
    const { stdout } = await run(command, ['--version'], 5_000);
    return { ready: true, version: stdout.trim() };
  } catch {
    return { ready: false, version: null };
  }
}

export async function analyzeMedia(url: string, platform: PlatformKey): Promise<MediaMetadata> {
  const command = await resolveEngine();
  if (!command) throw new Error('Media engine is not installed. Run npm run setup:media first.');
  const { stdout } = await run(command, [
    '--dump-single-json',
    '--skip-download',
    '--no-playlist',
    '--no-warnings',
    '--no-colors',
    '--socket-timeout', '15',
    url,
  ]);
  const info = JSON.parse(stdout);
  if (info.is_live) throw new Error('Live streams are not supported.');
  if (info.duration && Number(info.duration) > config.maxVideoDurationMinutes * 60) {
    throw new Error(`Videos longer than ${config.maxVideoDurationMinutes} minutes are not supported.`);
  }
  return {
    id: String(info.id || crypto.randomUUID()),
    platform,
    title: String(info.title || 'Untitled video'),
    creator: String(info.uploader || info.channel || info.creator || '') || undefined,
    thumbnail: String(info.thumbnail || '') || undefined,
    duration: Number(info.duration) || undefined,
    webpageUrl: String(info.webpage_url || url),
    formats: chooseFormats(info),
  };
}

export async function beginDownload(job: DownloadJob, onProgress: (progress: number | null, message: string) => void): Promise<{ filePath: string; downloadName: string }> {
  const command = await resolveEngine();
  if (!command) throw new Error('Media engine is not installed. Run npm run setup:media first.');

  const jobDir = join(config.tempDir, job.id);
  await mkdir(jobDir, { recursive: true });
  const output = join(jobDir, '%(title).90s-%(id)s.%(ext)s');
  const args = [
    '--no-playlist',
    '--newline',
    '--no-warnings',
    '--no-colors',
    '--socket-timeout', '20',
    '--max-filesize', `${config.maxFileSizeMb}M`,
    '--restrict-filenames',
    '--trim-filenames', '110',
    '--progress-template', 'download:%(progress._percent_str)s',
    '-o', output,
  ];

  if (job.formatId === 'audio') {
    args.push('-f', 'bestaudio/best', '-x', '--audio-format', 'm4a');
  } else if (job.formatId === 'best') {
    args.push('-f', 'bestvideo*+bestaudio/best', '--merge-output-format', 'mp4');
  } else {
    args.push('-f', `${job.formatId}+bestaudio/best/${job.formatId}`, '--merge-output-format', 'mp4');
  }
  args.push(job.url);

  return new Promise((resolveDownload, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    onProgress(null, 'Preparing your download…');
    child.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^download:\s*([\d.]+)%/i);
        if (match) onProgress(Math.max(0, Math.min(100, Number(match[1]))), 'Downloading best available media…');
      }
    });
    child.stderr.on('data', (chunk) => stderr += chunk.toString());
    child.on('error', (error) => reject(error));
    child.on('close', async (code) => {
      if (code !== 0) return reject(new Error(normalizeEngineError(stderr)));
      try {
        const entries = await readdir(jobDir);
        const files = entries.filter((name) => !name.endsWith('.part') && !name.endsWith('.ytdl') && !name.endsWith('.temp'));
        if (!files.length) throw new Error('The media engine did not produce a downloadable file.');
        const withStats = await Promise.all(files.map(async (name) => ({ name, stats: await stat(join(jobDir, name)) })));
        withStats.sort((a, b) => b.stats.size - a.stats.size);
        const filePath = join(jobDir, withStats[0].name);
        const extension = extname(filePath);
        const title = sanitizeFilename(job.title || basename(filePath, extension));
        resolveDownload({ filePath, downloadName: `${title}${extension}` });
      } catch (error) {
        reject(error);
      }
    });
  });
}

export async function cleanupJobFile(job: DownloadJob) {
  if (!job.filePath) return;
  try { await rm(dirname(job.filePath), { recursive: true, force: true }); } catch { /* no-op */ }
}
