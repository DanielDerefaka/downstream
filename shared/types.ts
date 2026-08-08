/**
 * Downstream — shared API contract between the server and the web client.
 * This file is the single source of truth for every payload crossing the wire.
 */

/* ------------------------------------------------------------------ probe */

export type CodecFamily = 'av1' | 'vp9' | 'h264' | 'h265' | 'unknown';
export type AudioCodecFamily = 'opus' | 'aac' | 'mp3' | 'flac' | 'unknown';

/** One selectable video rung in the quality ladder. */
export interface VideoRung {
  /** Stable id used when requesting a download, e.g. "v:2160:av1". */
  id: string;
  /** Display label, e.g. "2160p". */
  label: string;
  /** Marketing-friendly name, e.g. "4K Ultra HD". */
  tier: string;
  width: number;
  height: number;
  fps: number;
  codec: CodecFamily;
  /** True when the source stream carries HDR metadata. */
  hdr: boolean;
  /** Best-effort byte estimate for video+audio combined. */
  bytes: number | null;
  /** True when the estimate came from yt-dlp's approximation rather than a real header. */
  approximate: boolean;
  /** Container the merged file will land in. */
  container: 'mp4' | 'webm' | 'mkv';
  /** The raw yt-dlp format selector this rung resolves to. */
  selector: string;
  /** Set when the rung is video-only and must be muxed with a separate audio track. */
  needsMerge: boolean;
}

/** One selectable audio-only rung. */
export interface AudioRung {
  id: string;
  label: string;
  /** e.g. "MP3 320" */
  tier: string;
  format: 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav';
  /** Target bitrate in kbps; null for lossless. */
  kbps: number | null;
  codec: AudioCodecFamily;
  bytes: number | null;
  approximate: boolean;
  /** True when we transcode rather than copy the source stream. */
  transcoded: boolean;
}

export interface Chapter {
  title: string;
  start: number;
  end: number;
}

export interface SubtitleTrack {
  lang: string;
  label: string;
  /** Auto-generated captions rather than an authored track. */
  auto: boolean;
}

export interface MediaProbe {
  id: string;
  url: string;
  webpageUrl: string;
  title: string;
  description: string | null;
  channel: string;
  channelUrl: string | null;
  channelThumbnail: string | null;
  thumbnail: string | null;
  /** Duration in seconds. Null for live streams. */
  duration: number | null;
  uploadDate: string | null;
  viewCount: number | null;
  likeCount: number | null;
  isLive: boolean;
  ageLimit: number;
  chapters: Chapter[];
  subtitles: SubtitleTrack[];
  video: VideoRung[];
  audio: AudioRung[];
  /** id of the rung we recommend by default. */
  recommendedVideoId: string | null;
  /** Present when the URL resolved to a playlist. */
  playlist: PlaylistSummary | null;
  extractor: string;
}

export interface PlaylistSummary {
  id: string;
  title: string;
  uploader: string | null;
  count: number;
  entries: PlaylistEntry[];
}

export interface PlaylistEntry {
  id: string;
  url: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
}

/* --------------------------------------------------------------- requests */

export interface TrimRange {
  /** Seconds, inclusive. */
  start: number;
  /** Seconds, exclusive. */
  end: number;
}

export interface DownloadRequest {
  url: string;
  /** VideoRung.id or AudioRung.id. */
  rungId: string;
  kind: 'video' | 'audio';
  /** Optional trim; omit for the full asset. */
  trim?: TrimRange | null;
  /**
   * Frame-accurate trimming. Costs a re-encode of the clip (and with it the
   * chosen codec — ffmpeg re-encodes to H.264). When false, the clip is a
   * stream copy that keeps the exact codec and quality but starts at the
   * nearest keyframe before the requested point.
   */
  preciseCut?: boolean;
  /** Language codes of subtitle tracks to embed (video only). */
  subtitles?: string[];
  /** Embed cover art + title/artist/date tags. */
  embedMetadata?: boolean;
  /** Write chapter markers into the container. */
  embedChapters?: boolean;
  /** Destination directory override; defaults to the server's download dir. */
  outputDir?: string | null;
  /** Human-friendly title carried through for optimistic UI. */
  title?: string;
  thumbnail?: string | null;
}

/* ------------------------------------------------------------------- jobs */

export type JobStatus =
  | 'queued'
  | 'probing'
  | 'downloading'
  | 'merging'
  | 'trimming'
  | 'converting'
  | 'finalizing'
  | 'done'
  | 'failed'
  | 'canceled';

/** Phases that still count as "in flight" for queue accounting. */
export const ACTIVE_STATUSES: JobStatus[] = [
  'probing',
  'downloading',
  'merging',
  'trimming',
  'converting',
  'finalizing',
];

export interface Job {
  id: string;
  status: JobStatus;
  request: DownloadRequest;
  title: string;
  thumbnail: string | null;
  /** 0..1 overall completion. */
  progress: number;
  /** Bytes per second, when known. */
  speed: number | null;
  /** Seconds remaining, when known. */
  eta: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  /** Absolute path of the finished file. */
  outputPath: string | null;
  outputBytes: number | null;
  error: string | null;
  /** Epoch millis. */
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** Short human label for the current phase, e.g. "Merging 4K video + audio". */
  phase: string | null;
}

/* ----------------------------------------------------------------- events */

export type ServerEvent =
  | { type: 'hello'; jobs: Job[]; capabilities: Capabilities }
  | { type: 'job:created'; job: Job }
  | { type: 'job:update'; job: Job }
  | { type: 'job:done'; job: Job }
  | { type: 'job:failed'; job: Job }
  | { type: 'queue:stats'; active: number; queued: number }
  | { type: 'ping' };

export interface Capabilities {
  ytdlp: { available: boolean; version: string | null; path: string | null };
  ffmpeg: { available: boolean; version: string | null; path: string | null };
  downloadDir: string;
  maxConcurrent: number;
}

/* -------------------------------------------------------------- settings */

export interface Settings {
  downloadDir: string;
  maxConcurrent: number;
  /** Default container preference when several codecs are available. */
  preferCodec: 'auto' | 'av1' | 'vp9' | 'h264';
  embedMetadata: boolean;
  embedChapters: boolean;
  /** Filename template in yt-dlp syntax. */
  filenameTemplate: string;
}

/* ---------------------------------------------------------------- errors */

export interface ApiError {
  error: string;
  detail?: string;
  /** Machine-readable reason so the UI can render a tailored recovery hint. */
  code?:
    | 'MISSING_YTDLP'
    | 'MISSING_FFMPEG'
    | 'UNSUPPORTED_URL'
    | 'PRIVATE_VIDEO'
    | 'AGE_RESTRICTED'
    | 'GEO_BLOCKED'
    | 'NETWORK'
    | 'UNKNOWN';
}
