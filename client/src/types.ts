export type PlatformKey = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'x' | 'vimeo' | 'pinterest';

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

export interface PlatformInfo {
  key: PlatformKey;
  name: string;
  status: 'Supported' | 'Limited Support' | 'Unavailable';
  enabled: boolean;
  description: string;
}
