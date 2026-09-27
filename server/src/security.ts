import dns from 'node:dns/promises';
import net from 'node:net';
import { z } from 'zod';
import { detectPlatform, getPlatform } from './platforms.js';
import type { PlatformKey } from './types.js';

const urlSchema = z.string().trim().min(8).max(2048).url();

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      parts[0] >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase();
    return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
  }
  return true;
}

export async function validatePublicMediaUrl(input: unknown): Promise<{ url: URL; platform: PlatformKey }> {
  const raw = urlSchema.parse(input);
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS links are supported.');
  if (url.username || url.password) throw new Error('URLs containing credentials are not supported.');

  const platform = detectPlatform(url.hostname);
  if (!platform) throw new Error('Unsupported platform.');
  if (!getPlatform(platform).enabled) throw new Error('This platform is currently disabled.');

  if (net.isIP(url.hostname) && isPrivateIp(url.hostname)) throw new Error('Private or local network URLs are not allowed.');
  const resolved = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!resolved.length || resolved.some((entry) => isPrivateIp(entry.address))) {
    throw new Error('This URL resolves to a blocked network address.');
  }
  return { url, platform };
}

export function safeFormatId(value: unknown): string {
  const result = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_.+:-]+$/).safeParse(value);
  if (!result.success) throw new Error('Invalid media format.');
  return result.data;
}

export function sanitizeFilename(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '-')
    .replace(/\.\.+/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'saveflow-download';
}
