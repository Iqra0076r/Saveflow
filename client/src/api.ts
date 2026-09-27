import type { MediaMetadata, PlatformInfo } from './types';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const apiUrl = (path: string) => `${API_BASE}${path}`;

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(url), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed.');
  return data as T;
}

export const api = {
  platforms: () => request<{ success: true; engine: { ready: boolean; version: string | null }; platforms: PlatformInfo[] }>('/api/v1/platforms'),
  analyze: (url: string) => request<MediaMetadata & { success: true }>('/api/v1/analyze', { method: 'POST', body: JSON.stringify({ url }) }),
  startDownload: (url: string, formatId: string, title: string) => request<{ success: true; jobId: string }>('/api/v1/download', { method: 'POST', body: JSON.stringify({ url, formatId, title }) }),
  job: (jobId: string) => request<{ success: true; job: { id: string; status: string; progress: number | null; message: string; error?: string; fileReady: boolean } }>(`/api/v1/jobs/${jobId}`),
  downloadUrl: (jobId: string) => apiUrl(`/api/v1/jobs/${jobId}/file`),
  adminLogin: (email: string, password: string) => request<{ success: true }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  adminSession: () => request<{ success: true; email: string }>('/api/admin/session'),
  adminOverview: () => request<any>('/api/admin/overview'),
  adminPlatforms: () => request<{ success: true; platforms: PlatformInfo[] }>('/api/admin/platforms'),
  setPlatform: (key: string, enabled: boolean) => request<any>(`/api/admin/platforms/${key}`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  logout: () => request<any>('/api/admin/logout', { method: 'POST', body: '{}' }),
};
