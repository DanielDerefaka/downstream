import type { MediaProbe, PlaylistSummary, SubtitleTrack } from '../../shared/types.ts';
import { run, ytdlpPath } from './bin.ts';
import { buildLadder, type RawFormat } from './ladder.ts';
import { loadSettings } from './config.ts';

interface RawInfo {
  _type?: string;
  id: string;
  title?: string;
  description?: string | null;
  channel?: string | null;
  uploader?: string | null;
  channel_url?: string | null;
  uploader_url?: string | null;
  thumbnail?: string | null;
  thumbnails?: Array<{ url: string; width?: number; height?: number; preference?: number }>;
  duration?: number | null;
  upload_date?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  is_live?: boolean;
  age_limit?: number;
  extractor_key?: string;
  extractor?: string;
  webpage_url?: string;
  original_url?: string;
  formats?: RawFormat[];
  chapters?: Array<{ title?: string; start_time?: number; end_time?: number }> | null;
  subtitles?: Record<string, Array<{ ext?: string; name?: string }>>;
  automatic_captions?: Record<string, Array<{ ext?: string; name?: string }>>;
  entries?: RawInfo[];
  playlist_count?: number;
}

/** Cache probes briefly — the trim screen and the format screen both need them. */
const cache = new Map<string, { at: number; probe: MediaProbe }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const BASE_ARGS = [
  '--no-warnings',
  '--no-playlist-reverse',
  '--ignore-config',
  // YouTube throttles the default client hard; these two are what keep 4K
  // manifests appearing at all on a residential IP.
  '--extractor-args',
  'youtube:player_client=default,web_safari',
];

function pickThumbnail(info: RawInfo): string | null {
  if (info.thumbnail) return info.thumbnail;
  const list = info.thumbnails ?? [];
  if (list.length === 0) return null;
  const best = list.reduce((a, b) => ((b.width ?? 0) > (a.width ?? 0) ? b : a));
  return best.url ?? null;
}

function collectSubtitles(info: RawInfo): SubtitleTrack[] {
  const out: SubtitleTrack[] = [];
  const seen = new Set<string>();
  for (const [lang, tracks] of Object.entries(info.subtitles ?? {})) {
    if (seen.has(lang)) continue;
    seen.add(lang);
    out.push({ lang, label: tracks[0]?.name ?? lang, auto: false });
  }
  for (const [lang, tracks] of Object.entries(info.automatic_captions ?? {})) {
    if (seen.has(lang)) continue;
    // Auto-caption lists run to 150+ machine-translated variants. Only the
    // handful the uploader actually spoke in are worth surfacing.
    if (lang.includes('-') && !lang.startsWith('zh')) continue;
    seen.add(lang);
    out.push({ lang, label: tracks[0]?.name ?? lang, auto: true });
  }
  return out.slice(0, 40);
}

function classifyError(message: string): { code: MediaProbeErrorCode; friendly: string } {
  const m = message.toLowerCase();
  if (m.includes('private video')) {
    return { code: 'PRIVATE_VIDEO', friendly: 'This video is private.' };
  }
  if (m.includes('age') && (m.includes('restrict') || m.includes('confirm'))) {
    return {
      code: 'AGE_RESTRICTED',
      friendly: 'This video is age-restricted and needs a signed-in session.',
    };
  }
  if (m.includes('not available in your country') || m.includes('geo')) {
    return { code: 'GEO_BLOCKED', friendly: 'This video is blocked in your region.' };
  }
  if (m.includes('unsupported url') || m.includes('is not a valid url')) {
    return { code: 'UNSUPPORTED_URL', friendly: "That link isn't one we can read." };
  }
  if (m.includes('unable to download') || m.includes('network') || m.includes('timed out')) {
    return { code: 'NETWORK', friendly: 'Could not reach the server. Check your connection.' };
  }
  if (m.includes('video unavailable')) {
    return { code: 'UNSUPPORTED_URL', friendly: 'This video is unavailable or has been removed.' };
  }
  return { code: 'UNKNOWN', friendly: message.split('\n')[0] ?? 'Something went wrong.' };
}

export type MediaProbeErrorCode =
  | 'MISSING_YTDLP'
  | 'UNSUPPORTED_URL'
  | 'PRIVATE_VIDEO'
  | 'AGE_RESTRICTED'
  | 'GEO_BLOCKED'
  | 'NETWORK'
  | 'UNKNOWN';

export class ProbeError extends Error {
  code: MediaProbeErrorCode;
  detail: string;
  constructor(code: MediaProbeErrorCode, friendly: string, detail: string) {
    super(friendly);
    this.code = code;
    this.detail = detail;
  }
}

export async function probe(url: string, force = false): Promise<MediaProbe> {
  const key = url.trim();
  const hit = cache.get(key);
  if (hit && !force && Date.now() - hit.at < CACHE_TTL_MS) return hit.probe;

  const bin = await ytdlpPath();
  let raw: string;
  try {
    raw = await run(
      bin,
      [...BASE_ARGS, '--dump-single-json', '--flat-playlist', '--no-download', key],
      { timeoutMs: 45_000 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { code, friendly } = classifyError(message);
    throw new ProbeError(code, friendly, message);
  }

  const info = JSON.parse(raw) as RawInfo;

  // A playlist URL comes back flat: entries carry titles but no formats. Probe
  // the first entry properly so the UI has a real ladder to render.
  let playlist: PlaylistSummary | null = null;
  let subject: RawInfo = info;

  if (info._type === 'playlist' && Array.isArray(info.entries) && info.entries.length > 0) {
    playlist = {
      id: info.id,
      title: info.title ?? 'Playlist',
      uploader: info.channel ?? info.uploader ?? null,
      count: info.playlist_count ?? info.entries.length,
      entries: info.entries.map((e) => ({
        id: e.id,
        url: e.webpage_url ?? e.original_url ?? `https://www.youtube.com/watch?v=${e.id}`,
        title: e.title ?? 'Untitled',
        duration: e.duration ?? null,
        thumbnail: pickThumbnail(e),
      })),
    };
    const first = playlist.entries[0];
    if (first) {
      const detailed = await run(
        bin,
        [...BASE_ARGS, '--dump-single-json', '--no-playlist', '--no-download', first.url],
        { timeoutMs: 45_000 },
      );
      subject = JSON.parse(detailed) as RawInfo;
    }
  }

  const settings = loadSettings();
  const ladder = buildLadder(subject.formats ?? [], subject.duration ?? null, settings.preferCodec);

  const result: MediaProbe = {
    id: subject.id,
    url: key,
    webpageUrl: subject.webpage_url ?? subject.original_url ?? key,
    title: subject.title ?? 'Untitled',
    description: subject.description ?? null,
    channel: subject.channel ?? subject.uploader ?? 'Unknown channel',
    channelUrl: subject.channel_url ?? subject.uploader_url ?? null,
    channelThumbnail: null,
    thumbnail: pickThumbnail(subject),
    duration: subject.duration ?? null,
    uploadDate: subject.upload_date ?? null,
    viewCount: subject.view_count ?? null,
    likeCount: subject.like_count ?? null,
    isLive: subject.is_live ?? false,
    ageLimit: subject.age_limit ?? 0,
    chapters: (subject.chapters ?? [])
      .filter((c) => typeof c.start_time === 'number')
      .map((c) => ({
        title: c.title ?? 'Chapter',
        start: c.start_time as number,
        end: c.end_time ?? (subject.duration ?? 0),
      })),
    subtitles: collectSubtitles(subject),
    video: ladder.video,
    audio: ladder.audio,
    recommendedVideoId: ladder.recommendedVideoId,
    playlist,
    extractor: subject.extractor_key ?? subject.extractor ?? 'generic',
  };

  cache.set(key, { at: Date.now(), probe: result });
  return result;
}

/** The queue needs a rung's selector at download time without re-probing. */
export function cachedProbe(url: string): MediaProbe | null {
  return cache.get(url.trim())?.probe ?? null;
}
