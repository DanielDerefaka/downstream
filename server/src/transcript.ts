/**
 * Caption extraction for the lesson routes.
 *
 * YouTube's auto-generated VTT is a rolling display buffer, not a transcript:
 * every cue repeats the tail of the previous cue plus the newly spoken words,
 * and each word carries an inline timing tag. Parsed naively you get every
 * sentence two or three times over. The dedup pass below is what turns it back
 * into readable prose.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { run, ytdlpPath } from './bin.ts';

const CACHE_DIR = path.join(os.homedir(), '.downstream', 'transcripts');

export interface TranscriptSegment {
  /** Seconds from the start of the video. */
  t: number;
  text: string;
}

export interface Transcript {
  lang: string;
  auto: boolean;
  segments: TranscriptSegment[];
  /** Whole transcript as plain prose. */
  text: string;
}

function timestampToSeconds(stamp: string): number {
  const [hms, ms] = stamp.split('.');
  const parts = (hms ?? '').split(':').map(Number);
  const [h = 0, m = 0, s = 0] = parts.length === 3 ? parts : [0, ...parts];
  return h * 3600 + m * 60 + s + Number(ms ?? 0) / 1000;
}

/** Strip karaoke timing tags and entities that VTT wraps individual words in. */
function cleanCueText(raw: string): string {
  return raw
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
    .replace(/<\/?c[^>]*>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  // Track the last few emitted lines rather than just one: YouTube's buffer is
  // two lines tall, so a repeat can arrive one cue later than you'd expect.
  const recent: string[] = [];

  for (const block of vtt.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const cueIndex = lines.findIndex((l) => l.includes('-->'));
    if (cueIndex === -1) continue;

    const startRaw = lines[cueIndex]?.split('-->')[0]?.trim();
    if (!startRaw) continue;
    const t = timestampToSeconds(startRaw);

    for (const line of lines.slice(cueIndex + 1)) {
      const text = cleanCueText(line);
      if (!text) continue;
      if (recent.includes(text)) continue;
      recent.push(text);
      if (recent.length > 4) recent.shift();

      const last = segments[segments.length - 1];
      // Merge cues that land on the same second so the output reads as
      // sentences rather than a word-per-line ticker.
      if (last && t - last.t < 1) last.text = `${last.text} ${text}`.trim();
      else segments.push({ t, text });
    }
  }
  return segments;
}

function cachePath(videoId: string, lang: string): string {
  return path.join(CACHE_DIR, `${videoId}.${lang}.json`);
}

export async function fetchTranscript(
  url: string,
  videoId: string,
  lang = 'en',
): Promise<Transcript | null> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = cachePath(videoId, lang);
  try {
    return JSON.parse(fs.readFileSync(cached, 'utf8')) as Transcript;
  } catch {
    /* not cached yet */
  }

  const bin = await ytdlpPath();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'downstream-subs-'));
  const outTemplate = path.join(workDir, 'sub');

  try {
    await run(
      bin,
      [
        '--no-warnings',
        '--ignore-config',
        '--no-playlist',
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        `${lang}.*,${lang}`,
        '--sub-format',
        'vtt',
        '--extractor-args',
        'youtube:player_client=default,web_safari',
        '-o',
        outTemplate,
        url,
      ],
      { timeoutMs: 180_000 },
    );

    const files = fs.readdirSync(workDir).filter((f) => f.endsWith('.vtt'));
    if (files.length === 0) return null;
    // Prefer an authored track over the auto-generated one when both exist.
    const authored = files.find((f) => !f.includes('auto'));
    const chosen = authored ?? files[0];
    if (!chosen) return null;

    const raw = fs.readFileSync(path.join(workDir, chosen), 'utf8');
    const segments = parseVtt(raw);
    if (segments.length === 0) return null;

    const transcript: Transcript = {
      lang,
      auto: authored === undefined,
      segments,
      text: segments.map((s) => s.text).join(' '),
    };
    fs.writeFileSync(cached, JSON.stringify(transcript));
    return transcript;
  } catch {
    return null;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** Slice a transcript to a time window, e.g. one chapter. */
export function sliceTranscript(
  transcript: Transcript,
  start: number,
  end: number,
): TranscriptSegment[] {
  return transcript.segments.filter((s) => s.t >= start && s.t < end);
}

/** Render segments as `[mm:ss] text` lines, the form the skill reads. */
export function renderSegments(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const m = Math.floor(s.t / 60);
      const sec = Math.floor(s.t % 60);
      return `[${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}] ${s.text}`;
    })
    .join('\n');
}
