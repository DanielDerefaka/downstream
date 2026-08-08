/**
 * Per-platform metadata for the source nav.
 *
 * The notes are deliberately blunt about what does and does not work. A
 * downloader that lists Instagram as a headline feature and then fails on
 * private posts has lied to the user; saying so up front costs nothing.
 */

export type PlatformId = 'youtube' | 'x' | 'tiktok' | 'instagram' | 'other';

export interface Platform {
  id: PlatformId;
  name: string;
  /** Placeholder shown in the URL field when this source is selected. */
  placeholder: string;
  /** One-line caveat shown under the field. Null when there is nothing to warn about. */
  note: string | null;
  /** Hosts that map to this platform. */
  hosts: RegExp;
}

export const PLATFORMS: Platform[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    placeholder: 'https://www.youtube.com/watch?v=…',
    note: 'Videos, Shorts and playlists. Up to 8K where the uploader published it.',
    hosts: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i,
  },
  {
    id: 'x',
    name: 'X',
    placeholder: 'https://x.com/user/status/…',
    note: 'Link a specific post, not a profile. Public posts only.',
    hosts: /(^|\.)(x\.com|twitter\.com)$/i,
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    placeholder: 'https://www.tiktok.com/@user/video/…',
    note: 'Downloads without the watermark, at the original vertical resolution.',
    hosts: /(^|\.)(tiktok\.com|vm\.tiktok\.com)$/i,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    placeholder: 'https://www.instagram.com/reel/…',
    note: 'Reels and posts from public accounts. Private accounts and Stories need a login Downstream does not carry.',
    hosts: /(^|\.)(instagram\.com|instagr\.am)$/i,
  },
];

/** Everything else still works — yt-dlp covers well over a thousand sites. */
export const OTHER_PLATFORM: Platform = {
  id: 'other',
  name: 'Other',
  placeholder: 'Paste any video link…',
  note: 'Vimeo, Reddit, Twitch, SoundCloud, Dailymotion and ~1,800 more.',
  hosts: /.^/,
};

export function detectPlatform(rawUrl: string): PlatformId | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return null;
  }
  return PLATFORMS.find((p) => p.hosts.test(host))?.id ?? 'other';
}

export function platformById(id: PlatformId): Platform {
  return PLATFORMS.find((p) => p.id === id) ?? OTHER_PLATFORM;
}
