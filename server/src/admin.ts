import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

const COOKIE = 'sf_admin';

function b64(value: string) { return Buffer.from(value).toString('base64url'); }
function sign(value: string) { return crypto.createHmac('sha256', config.adminSessionSecret).update(value).digest('base64url'); }

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function createSessionCookie() {
  const payload = b64(JSON.stringify({ email: config.adminEmail, exp: Date.now() + 12 * 60 * 60_000 }));
  return `${payload}.${sign(payload)}`;
}

function parseCookie(req: Request) {
  const raw = req.headers.cookie || '';
  const item = raw.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE}=`));
  return item?.slice(COOKIE.length + 1);
}

export function authenticateAdmin(email: string, password: string) {
  return safeEqual(email, config.adminEmail) && safeEqual(password, config.adminPassword);
}

export function setAdminCookie(res: Response) {
  res.cookie(COOKIE, createSessionCookie(), {
    httpOnly: true,
    sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: 12 * 60 * 60_000,
    path: '/',
  });
}

export function clearAdminCookie(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = parseCookie(req);
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) throw new Error('expired');
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
}
