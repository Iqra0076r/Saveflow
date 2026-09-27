export type PlatformKey = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'x' | 'vimeo' | 'pinterest';

export type SupportStatus = 'Supported' | 'Limited Support' | 'Unavailable';

export interface PlatformDefinition {
  key: PlatformKey;
  name: string;
  hosts: string[];
  status: SupportStatus;
  enabled: boolean;
  description: string;
}

export interface MediaFormat {
  id: string;
  label: string;
  quality: string;
  ext: string;
  size?: number;
  height?: number;
  fps?: number;
  recommended?: boolean;
  audioOnly?: boolean;
}

export interface MediaMetadata {
  id: string;
  platform: PlatformKey;
  title: string;
  creator?: string;
  thumbnail?: string;
  duration?: number;
  webpageUrl: string;
  formats: MediaFormat[];
}

export type JobStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'expired';

export interface DownloadJob {
  id: string;
  url: string;
  platform: PlatformKey;
  formatId: string;
  title?: string;
  status: JobStatus;
  progress: number | null;
  message: string;
  createdAt: number;
  updatedAt: number;
  filePath?: string;
  downloadName?: string;
  error?: string;
}
