/**
 * Turns yt-dlp's raw (and frankly hostile) format list into a clean ladder.
 *
 * YouTube hands back 40+ formats: the same resolution three times over in AV1,
 * VP9 and H.264, video-only DASH streams, audio-only streams at four bitrates,
 * plus storyboards and a couple of legacy progressive muxes. The reference apps
 * either dump all of it on the user or collapse it to "1080p / 720p / audio".
 * We keep every resolution the source actually has, pick a sane codec per rung,
 * and pair each with an audio stream whose container matches so the mux is a
 * stream copy rather than a re-encode.
 */

import type {
  AudioCodecFamily,
  AudioRung,
  CodecFamily,
  VideoRung,
} from '../../shared/types.ts';
import type { Settings } from '../../shared/types.ts';

export interface RawFormat {
  format_id: string;
  ext: string;
  vcodec?: string;
  acodec?: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  vbr?: number | null;
  abr?: number | null;
  asr?: number | null;
  dynamic_range?: string | null;
  protocol?: string;
  format_note?: string | null;
  language?: string | null;
}

/**
 * Only the literal string "none" means a stream is absent. An undefined codec
 * means the extractor simply did not report one — X/Twitter does exactly that
 * for its HLS audio tracks and its progressive MP4s. Treating undefined as
 * "absent" drops those audio tracks on the floor and yields silent downloads.
 */
const ABSENT = (codec: string | null | undefined) => codec === 'none';

export function videoCodecFamily(vcodec: string | null | undefined): CodecFamily {
  if (!vcodec || vcodec === 'none') return 'unknown';
  const c = vcodec.toLowerCase();
  if (c.startsWith('av01') || c.startsWith('av1')) return 'av1';
  if (c.startsWith('vp9') || c.startsWith('vp09') || c.startsWith('vp8')) return 'vp9';
  if (c.startsWith('avc') || c.startsWith('h264') || c.startsWith('h.264')) return 'h264';
  // TikTok reports a bare "h265" that matches none of the fourcc prefixes.
  if (c.startsWith('hev') || c.startsWith('hvc') || c.startsWith('h265') || c.startsWith('hevc')) {
    return 'h265';
  }
  return 'unknown';
}

export function audioCodecFamily(acodec: string | null | undefined): AudioCodecFamily {
  if (!acodec || acodec === 'none') return 'unknown';
  const c = acodec.toLowerCase();
  if (c.startsWith('opus')) return 'opus';
  if (c.startsWith('mp4a') || c.startsWith('aac')) return 'aac';
  if (c.startsWith('mp3')) return 'mp3';
  if (c.startsWith('flac')) return 'flac';
  return 'unknown';
}

/**
 * Quality is named after the *short* edge, so a 1080x1920 TikTok reads "1080p"
 * the way it does everywhere else, rather than "1920p".
 */
function shortEdge(width: number | null | undefined, height: number): number {
  return width && width > 0 ? Math.min(width, height) : height;
}

function tierName(edge: number): string {
  if (edge >= 4320) return '8K';
  if (edge >= 2880) return '5K';
  if (edge >= 2160) return '4K Ultra HD';
  if (edge >= 1440) return '2K QHD';
  if (edge >= 1080) return 'Full HD';
  if (edge >= 720) return 'HD';
  if (edge >= 480) return 'SD';
  return 'Low';
}

function sizeOf(f: RawFormat): { bytes: number | null; approximate: boolean } {
  if (typeof f.filesize === 'number' && f.filesize > 0) {
    return { bytes: f.filesize, approximate: false };
  }
  if (typeof f.filesize_approx === 'number' && f.filesize_approx > 0) {
    return { bytes: f.filesize_approx, approximate: true };
  }
  return { bytes: null, approximate: true };
}

/** Estimate bytes from a bitrate (kbps) over a duration (s). */
function bytesFromBitrate(kbps: number | null | undefined, duration: number | null): number | null {
  if (!kbps || !duration) return null;
  return Math.round((kbps * 1000 * duration) / 8);
}

/** Higher is better. Prefers real bitrate, then resolution, then fps. */
function videoScore(f: RawFormat): number {
  return (f.vbr ?? f.tbr ?? 0) * 1000 + (f.height ?? 0) + (f.fps ?? 0) / 1000;
}

function audioScore(f: RawFormat): number {
  return (f.abr ?? f.tbr ?? 0) * 100 + (f.asr ?? 0) / 1000;
}

/**
 * Codec preference. `auto` leads with H.264 because it is the only family that
 * plays everywhere without a re-encode — QuickTime, Premiere, older TVs, phones.
 * Above 1080p YouTube usually stops publishing H.264 at all, so the fallback
 * chain matters more than the head of it.
 */
const CODEC_ORDER: Record<Settings['preferCodec'], CodecFamily[]> = {
  auto: ['h264', 'av1', 'vp9', 'h265'],
  h264: ['h264', 'av1', 'vp9', 'h265'],
  av1: ['av1', 'vp9', 'h264', 'h265'],
  vp9: ['vp9', 'av1', 'h264', 'h265'],
};

/**
 * Which container the muxed result belongs in. Extension is checked before
 * codec family because several extractors report the extension reliably and
 * the codec not at all — falling back to MKV on an unknown codec would label
 * an ordinary Twitter MP4 as a Matroska file.
 */
function containerFor(
  videoExt: string | undefined,
  audioExt: string | undefined,
  video: CodecFamily,
  audio: AudioCodecFamily,
): 'mp4' | 'webm' | 'mkv' {
  const mp4ish = (ext: string | undefined) => ext === 'mp4' || ext === 'm4a';

  if (video === 'vp9') return audio === 'opus' || audioExt === 'webm' ? 'webm' : 'mkv';
  if (audio === 'aac') return 'mp4';
  if (audio === 'opus') return video === 'av1' ? 'mkv' : 'webm';
  // No separate audio track, or an unreported codec: trust the extension.
  if (mp4ish(videoExt) && (audioExt === undefined || mp4ish(audioExt))) return 'mp4';
  if (videoExt === 'webm' && (audioExt === undefined || audioExt === 'webm')) return 'webm';
  return 'mkv';
}

export interface BuiltLadder {
  video: VideoRung[];
  audio: AudioRung[];
  recommendedVideoId: string | null;
  bestAudioFormatId: string | null;
}

export function buildLadder(
  formats: RawFormat[],
  duration: number | null,
  prefer: Settings['preferCodec'] = 'auto',
): BuiltLadder {
  const videoOnly = formats.filter((f) => !ABSENT(f.vcodec) && ABSENT(f.acodec) && f.height);
  const audioOnly = formats.filter((f) => ABSENT(f.vcodec) && !ABSENT(f.acodec));
  // Muxed streams: YouTube's legacy itag 18, but also everything TikTok,
  // Instagram and Twitter's progressive MP4s serve.
  const progressive = formats.filter((f) => !ABSENT(f.vcodec) && !ABSENT(f.acodec) && f.height);

  /* ---------------------------------------------------------- audio picks */

  const bestAac = pickBest(audioOnly.filter((f) => audioCodecFamily(f.acodec) === 'aac'));
  const bestOpus = pickBest(audioOnly.filter((f) => audioCodecFamily(f.acodec) === 'opus'));
  const bestAudioOverall = pickBest(audioOnly);

  function pickBest(list: RawFormat[]): RawFormat | null {
    if (list.length === 0) return null;
    return list.reduce((a, b) => (audioScore(b) > audioScore(a) ? b : a));
  }

  /* ---------------------------------------------------------- video rungs */

  // Bucket by the short edge so a portrait 1080x1920 and a landscape 1920x1080
  // both land in the "1080p" rung rather than being ranked against each other
  // by raw height.
  const byEdge = new Map<number, RawFormat[]>();
  for (const f of videoOnly) {
    const edge = shortEdge(f.width, f.height as number);
    const bucket = byEdge.get(edge);
    if (bucket) bucket.push(f);
    else byEdge.set(edge, [f]);
  }
  // Fold in progressive streams for rungs the adaptive formats don't cover.
  for (const f of progressive) {
    const edge = shortEdge(f.width, f.height as number);
    if (!byEdge.has(edge)) byEdge.set(edge, [f]);
  }

  const order = CODEC_ORDER[prefer] ?? CODEC_ORDER.auto;
  const video: VideoRung[] = [];

  for (const [edge, bucket] of [...byEdge.entries()].sort((a, b) => b[0] - a[0])) {
    // Within a height, honour the codec preference; inside a family take the
    // highest-bitrate variant (YouTube ships both a low and a high tier at 4K).
    let chosen: RawFormat | null = null;
    for (const family of order) {
      const inFamily = bucket.filter((f) => videoCodecFamily(f.vcodec) === family);
      if (inFamily.length > 0) {
        chosen = inFamily.reduce((a, b) => (videoScore(b) > videoScore(a) ? b : a));
        break;
      }
    }
    if (!chosen) chosen = bucket.reduce((a, b) => (videoScore(b) > videoScore(a) ? b : a));

    const family = videoCodecFamily(chosen.vcodec);
    const isProgressive = !ABSENT(chosen.acodec);

    // Pair with audio whose container matches, so the mux is a stream copy.
    const audioMate = isProgressive
      ? null
      : family === 'vp9'
        ? (bestOpus ?? bestAudioOverall)
        : (bestAac ?? bestAudioOverall);

    const vSize = sizeOf(chosen);
    const aSize = audioMate ? sizeOf(audioMate) : { bytes: 0, approximate: false };
    const vBytes = vSize.bytes ?? bytesFromBitrate(chosen.vbr ?? chosen.tbr, duration);
    const aBytes = audioMate
      ? (aSize.bytes ?? bytesFromBitrate(audioMate.abr ?? audioMate.tbr, duration))
      : 0;
    const bytes = vBytes === null ? null : vBytes + (aBytes ?? 0);

    const audioFamily = audioMate ? audioCodecFamily(audioMate.acodec) : audioCodecFamily(chosen.acodec);

    // Fallbacks are expressed against the real pixel height, not the short
    // edge, or a portrait rung would ask yt-dlp for `height<=1080` on a
    // 1920-tall video and match nothing.
    const px = chosen.height as number;
    const selector = audioMate
      ? `${chosen.format_id}+${audioMate.format_id}/bv*[height<=${px}]+ba/b[height<=${px}]`
      : isProgressive
        ? `${chosen.format_id}/b[height<=${px}]`
        : // Video-only with no audio track detected: never emit a bare
          // video-only selector, or the download comes out silent.
          `${chosen.format_id}+ba/b[height<=${px}]`;

    video.push({
      id: `v:${edge}:${family}`,
      label: `${edge}p${(chosen.fps ?? 0) >= 50 ? Math.round(chosen.fps as number) : ''}`,
      tier: tierName(edge),
      width: chosen.width ?? Math.round((px * 16) / 9),
      height: px,
      fps: Math.round(chosen.fps ?? 30),
      codec: family,
      hdr: (chosen.dynamic_range ?? '').toUpperCase().includes('HDR'),
      bytes,
      approximate: vSize.approximate || aSize.approximate,
      container: containerFor(chosen.ext, audioMate?.ext, family, audioFamily),
      selector,
      needsMerge: !isProgressive,
    });
  }

  /* ---------------------------------------------------------- audio rungs */

  const audio: AudioRung[] = [];
  const sourceKbps = bestAudioOverall?.abr ?? bestAudioOverall?.tbr ?? 128;

  if (bestAudioOverall) {
    const nativeFamily = audioCodecFamily(bestAudioOverall.acodec);
    const nativeSize = sizeOf(bestAudioOverall);
    audio.push({
      id: 'a:source',
      label: nativeFamily === 'opus' ? 'Opus' : 'M4A',
      tier: `Original · ${Math.round(sourceKbps)}k`,
      format: nativeFamily === 'opus' ? 'opus' : 'm4a',
      kbps: Math.round(sourceKbps),
      codec: nativeFamily,
      bytes: nativeSize.bytes ?? bytesFromBitrate(sourceKbps, duration),
      approximate: nativeSize.approximate,
      // No re-encode: this is the exact stream YouTube served.
      transcoded: false,
    });
  }

  for (const kbps of [320, 192, 128] as const) {
    audio.push({
      id: `a:mp3:${kbps}`,
      label: 'MP3',
      tier: `${kbps} kbps`,
      format: 'mp3',
      kbps,
      codec: 'mp3',
      bytes: bytesFromBitrate(kbps, duration),
      approximate: true,
      transcoded: true,
    });
  }

  audio.push({
    id: 'a:flac',
    label: 'FLAC',
    tier: 'Lossless',
    format: 'flac',
    kbps: null,
    codec: 'flac',
    // FLAC of a lossy source lands around 5-6x the source bitrate.
    bytes: bytesFromBitrate(sourceKbps * 5.5, duration),
    approximate: true,
    transcoded: true,
  });

  audio.push({
    id: 'a:wav',
    label: 'WAV',
    tier: 'Uncompressed',
    format: 'wav',
    kbps: 1411,
    codec: 'unknown',
    bytes: bytesFromBitrate(1411, duration),
    approximate: true,
    transcoded: true,
  });

  /* ------------------------------------------------------- recommendation */

  // Default to 1080p when it exists — the sweet spot most people actually want —
  // otherwise the highest rung available.
  const recommended =
    video.find((r) => r.height === 1080) ?? video.find((r) => r.height <= 2160) ?? video[0] ?? null;

  return {
    video,
    audio,
    recommendedVideoId: recommended?.id ?? null,
    bestAudioFormatId: bestAudioOverall?.format_id ?? null,
  };
}

/** Look a rung back up by id so the download route can recover its selector. */
export function findRung(
  ladder: { video: VideoRung[]; audio: AudioRung[] },
  id: string,
): VideoRung | AudioRung | null {
  return ladder.video.find((r) => r.id === id) ?? ladder.audio.find((r) => r.id === id) ?? null;
}
