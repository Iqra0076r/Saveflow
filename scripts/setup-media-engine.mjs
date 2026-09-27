import { createWriteStream, chmodSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

const target = resolve(process.cwd(), 'server/bin/yt-dlp');
if (existsSync(target)) {
  console.log(`yt-dlp already exists at ${target}`);
  process.exit(0);
}
mkdirSync(dirname(target), { recursive: true });
const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
console.log('Downloading the official yt-dlp standalone binary from GitHub...');
const response = await fetch(url, { redirect: 'follow' });
if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
await pipeline(response.body, createWriteStream(target));
chmodSync(target, 0o755);
console.log(`Installed media engine at ${target}`);
