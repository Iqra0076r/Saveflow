import type { PlatformDefinition, PlatformKey } from './types.js';

export const platformDefinitions: PlatformDefinition[] = [
  {
    key: 'youtube',
    name: 'YouTube',
    hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
    status: 'Limited Support',
    enabled: true,
    description: 'Public videos and Shorts where a permitted downloadable stream is available.',
  },
  {
    key: 'tiktok',
    name: 'TikTok',
    hosts: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
    status: 'Limited Support',
    enabled: true,
    description: 'Public TikTok video links where supported by the media engine.',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    hosts: ['instagram.com', 'www.instagram.com'],
    status: 'Limited Support',
    enabled: true,
    description: 'Public Reels and video posts only. Private accounts are not supported.',
  },
  {
    key: 'facebook',
    name: 'Facebook',
    hosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'],
    status: 'Limited Support',
    enabled: true,
    description: 'Public Facebook video links where a permitted stream is available.',
  },
  {
    key: 'x',
    name: 'X',
    hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
    status: 'Limited Support',
    enabled: true,
    description: 'Public posts containing video where the source exposes media to the extractor.',
  },
  {
    key: 'vimeo',
    name: 'Vimeo',
    hosts: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
    status: 'Limited Support',
    enabled: true,
    description: 'Permitted public Vimeo videos.',
  },
  {
    key: 'pinterest',
    name: 'Pinterest',
    hosts: ['pinterest.com', 'www.pinterest.com', 'pin.it'],
    status: 'Limited Support',
    enabled: true,
    description: 'Public video pins where available.',
  },
];

export function detectPlatform(hostname: string): PlatformKey | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  for (const platform of platformDefinitions) {
    if (platform.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      return platform.key;
    }
  }
  return null;
}

export function getPlatform(key: PlatformKey) {
  return platformDefinitions.find((item) => item.key === key)!;
}
