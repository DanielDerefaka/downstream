/** Display formatters. Every number the user sees goes through here. */

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Sub-10 values keep a decimal so "1.4 GB" doesn't collapse into "1 GB".
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function speed(bytesPerSecond: number | null | undefined): string {
  if (!bytesPerSecond) return '—';
  return `${bytes(bytesPerSecond)}/s`;
}

/** Seconds → 1:23 or 1:02:03. */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Seconds → 01:26.5, the precise form the trim fields use. */
export function timecode(seconds: number | null | undefined, decimals = 1): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '00:00.0';
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const secStr = sec.toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${secStr}`;
  return `${String(m).padStart(2, '0')}:${secStr}`;
}

/** Accepts "90", "1:30", "01:30.5", "1:02:03" → seconds. Null when unparseable. */
export function parseTimecode(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || Number.isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0] ?? null;
  if (nums.length === 2) return (nums[0] ?? 0) * 60 + (nums[1] ?? 0);
  if (nums.length === 3) return (nums[0] ?? 0) * 3600 + (nums[1] ?? 0) * 60 + (nums[2] ?? 0);
  return null;
}

export function eta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

export function compactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

/** yt-dlp gives "20240115"; we want "Jan 15, 2024". */
export function uploadDate(raw: string | null | undefined): string | null {
  if (!raw || raw.length !== 8) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function relativeTime(epochMs: number): string {
  const delta = Date.now() - epochMs;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

export const CODEC_LABEL: Record<string, string> = {
  av1: 'AV1',
  vp9: 'VP9',
  h264: 'H.264',
  h265: 'H.265',
  unknown: '—',
};

/** Plain-language note shown under a codec badge on hover. */
export const CODEC_NOTE: Record<string, string> = {
  av1: 'Smallest files. Needs a recent device to play smoothly.',
  vp9: 'Efficient and widely supported in browsers.',
  h264: 'Plays on everything — TVs, phones, older editors.',
  h265: 'Efficient, Apple-friendly, patent-encumbered elsewhere.',
  unknown: '',
};
