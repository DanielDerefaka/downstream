/**
 * Runs a single download job end to end: yt-dlp for the fetch and mux, ffmpeg
 * (driven by yt-dlp) for trimming and audio conversion.
 *
 * Trimming is done with `--download-sections`, which asks the CDN for a byte
 * range instead of pulling the whole file and cutting it afterwards. Trimming
 * 30 seconds out of a two-hour 4K video downloads ~40 MB, not ~8 GB. That is
 * the single biggest behavioural difference between this and the web tools.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { DownloadRequest, Job, VideoRung, AudioRung } from '../../shared/types.ts';
import { ytdlpPath, ffmpegPath } from './bin.ts';
import { loadSettings, WORK_DIR } from './config.ts';
import { cachedProbe, probe } from './probe.ts';

/** Set DOWNSTREAM_DEBUG=1 to echo every yt-dlp/ffmpeg line to the console. */
const DEBUG = process.env.DOWNSTREAM_DEBUG === '1';

const PROGRESS_PREFIX = 'PROG|';
const FILE_PREFIX = 'FILE|';

export interface RunHandle {
  cancel: () => void;
  promise: Promise<{ outputPath: string; bytes: number }>;
}

/** Maps yt-dlp's postprocessor chatter onto a phase the UI can show. */
function phaseFromLine(line: string): Job['status'] | null {
  if (line.includes('[Merger]')) return 'merging';
  if (line.includes('[ExtractAudio]')) return 'converting';
  if (line.includes('[VideoConvertor]') || line.includes('[VideoRemuxer]')) return 'converting';
  if (line.includes('[SplitChapters]') || line.includes('[ModifyChapters]')) return 'trimming';
  if (
    line.includes('[Metadata]') ||
    line.includes('[EmbedSubtitle]') ||
    line.includes('[ThumbnailsConvertor]') ||
    line.includes('[EmbedThumbnail]')
  ) {
    return 'finalizing';
  }
  return null;
}

const PHASE_LABELS: Partial<Record<Job['status'], string>> = {
  downloading: 'Downloading',
  merging: 'Muxing video + audio',
  converting: 'Converting audio',
  trimming: 'Cutting to your selection',
  finalizing: 'Writing tags and artwork',
};

function audioArgsFor(rung: AudioRung): string[] {
  const args = ['-f', 'bestaudio/best', '-x'];
  if (rung.format === 'm4a' || rung.format === 'opus') {
    // Keep the exact stream YouTube served — no generation loss.
    args.push('--audio-format', 'best');
  } else {
    args.push('--audio-format', rung.format);
    if (rung.kbps) args.push('--audio-quality', `${rung.kbps}K`);
  }
  return args;
}

function videoArgsFor(rung: VideoRung): string[] {
  return ['-f', rung.selector, '--merge-output-format', rung.container];
}

export function startRun(
  job: Job,
  onProgress: (patch: Partial<Job>) => void,
): RunHandle {
  // stdin is 'ignore', so the spawned type carries a null stdin.
  type Child = ChildProcessByStdio<null, Readable, Readable>;
  let child: Child | null = null;
  let canceled = false;

  const promise = (async () => {
    const bin = await ytdlpPath();
    const settings = loadSettings();
    const req: DownloadRequest = job.request;

    // The selector lives on the probed rung; re-probe if the cache aged out.
    let info = cachedProbe(req.url);
    if (!info) info = await probe(req.url);

    const rung =
      req.kind === 'video'
        ? info.video.find((r) => r.id === req.rungId)
        : info.audio.find((r) => r.id === req.rungId);
    if (!rung) throw new Error(`Format ${req.rungId} is no longer available for this video.`);

    const outDir = req.outputDir ?? settings.downloadDir;
    fs.mkdirSync(outDir, { recursive: true });

    const args: string[] = [
      '--no-warnings',
      '--ignore-config',
      '--no-playlist',
      '--newline',
      '--progress',
      // `--print` implies --quiet and --simulate. Both have to be switched back
      // off explicitly, or yt-dlp swallows every phase line and ffmpeg's output
      // with them, and the UI can never tell downloading from merging.
      '--no-simulate',
      '--no-quiet',
      '--extractor-args',
      'youtube:player_client=default,web_safari',
      // Resume partials and keep them out of the user's Downloads folder.
      '--continue',
      '--paths',
      `temp:${WORK_DIR}`,
      '--paths',
      `home:${outDir}`,
      '-o',
      `${settings.filenameTemplate}.%(ext)s`,
      '--progress-template',
      `download:${PROGRESS_PREFIX}%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress.status)s`,
      '--print',
      `after_move:${FILE_PREFIX}%(filepath)s`,
      '--ffmpeg-location',
      await ffmpegPath(),
    ];

    if (req.kind === 'video') {
      args.push(...videoArgsFor(rung as VideoRung));
    } else {
      args.push(...audioArgsFor(rung as AudioRung));
    }

    if (req.trim && req.trim.end > req.trim.start) {
      args.push('--download-sections', `*${req.trim.start.toFixed(3)}-${req.trim.end.toFixed(3)}`);
      // Frame-accurate cuts force ffmpeg to re-encode, and ffmpeg re-encodes to
      // H.264 — so an AV1 4K pick silently stops being AV1. Only pay that price
      // when the user explicitly asks for it.
      if (req.preciseCut) args.push('--force-keyframes-at-cuts');
    }

    if (req.embedMetadata ?? settings.embedMetadata) {
      args.push('--embed-metadata', '--embed-thumbnail');
    }
    if ((req.embedChapters ?? settings.embedChapters) && !req.trim) {
      // Chapter markers are meaningless once the timeline has been cut.
      args.push('--embed-chapters');
    }
    if (req.kind === 'video' && req.subtitles && req.subtitles.length > 0) {
      args.push(
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        req.subtitles.join(','),
        '--embed-subs',
      );
    }

    args.push(req.url);

    return await new Promise<{ outputPath: string; bytes: number }>((resolve, reject) => {
      const proc: Child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      child = proc;
      let finalPath: string | null = null;
      let stderrTail = '';
      let stdoutBuf = '';
      let currentStatus: Job['status'] = 'downloading';
      let leftProbing = false;

      /**
       * `--download-sections` hands the fetch to ffmpeg, which never emits
       * yt-dlp's progress template — so without this the bar would sit at zero
       * for the whole clip. ffmpeg does report `time=HH:MM:SS.mm` on stderr,
       * and for a section download that clock runs across the clip length,
       * which converts straight into a completion ratio.
       */
      const clipSeconds =
        req.trim && req.trim.end > req.trim.start ? req.trim.end - req.trim.start : null;

      const readFfmpegClock = (line: string): boolean => {
        if (clipSeconds === null) return false;
        const match = /time=(\d+):(\d{2}):(\d{2})\.(\d{1,3})/.exec(line);
        if (!match) return false;
        const [, h, m, s, frac] = match;
        const elapsed =
          Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${frac ?? '0'}`);
        onProgress({
          status: 'downloading',
          progress: Math.min(0.99, Math.max(0, elapsed / clipSeconds)),
          phase: PHASE_LABELS.downloading ?? null,
        });
        return true;
      };

      const handleLine = (line: string) => {
        if (DEBUG && line) console.error(`[yt-dlp] ${line}`);
        if (line.startsWith(PROGRESS_PREFIX)) {
          const [downloaded, total, estimate, speed, eta, status] = line
            .slice(PROGRESS_PREFIX.length)
            .split('|');
          const num = (v: string | undefined): number | null => {
            if (!v || v === 'NA' || v === 'None') return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          const downloadedBytes = num(downloaded);
          const totalBytes = num(total) ?? num(estimate);
          const ratio =
            downloadedBytes !== null && totalBytes && totalBytes > 0
              ? Math.min(0.99, downloadedBytes / totalBytes)
              : null;
          onProgress({
            status: status === 'finished' ? 'merging' : currentStatus,
            downloadedBytes,
            totalBytes,
            speed: num(speed),
            eta: num(eta),
            ...(ratio !== null ? { progress: ratio } : {}),
            phase: PHASE_LABELS[currentStatus] ?? null,
          });
          return;
        }
        if (line.startsWith(FILE_PREFIX)) {
          finalPath = line.slice(FILE_PREFIX.length).trim();
          return;
        }
        const phase = phaseFromLine(line);
        if (phase) {
          currentStatus = phase;
          onProgress({ status: phase, phase: PHASE_LABELS[phase] ?? null, speed: null, eta: null });
          return;
        }
        if (readFfmpegClock(line)) return;
        /*
         * The job starts life as `probing`. Which line proves we have left that
         * phase depends on the downloader yt-dlp picks: the native one emits
         * `[download] Destination:`, while `--download-sections` hands off to
         * ffmpeg, which emits neither that nor the progress template. The one
         * line common to every path is yt-dlp's format announcement, so that is
         * what flips the status.
         */
        if (
          !leftProbing &&
          (line.startsWith('[download] Destination:') ||
            (line.startsWith('[info]') && line.includes('Downloading')))
        ) {
          leftProbing = true;
          onProgress({ status: 'downloading', phase: PHASE_LABELS.downloading ?? null });
        }
      };

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop() ?? '';
        for (const line of lines) handleLine(line.trim());
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrTail = (stderrTail + text).slice(-4000);
        // ffmpeg rewrites its status line with \r rather than emitting a new
        // line, so splitting on \n alone would hide every progress update.
        for (const line of text.split(/[\r\n]/)) handleLine(line.trim());
      });

      proc.on('error', reject);

      proc.on('close', (code) => {
        if (canceled) {
          reject(Object.assign(new Error('Canceled'), { canceled: true }));
          return;
        }
        if (code !== 0) {
          const firstError =
            stderrTail
              .split('\n')
              .find((l) => l.toUpperCase().includes('ERROR'))
              ?.replace(/^ERROR:\s*/i, '') ?? `yt-dlp exited with code ${code}`;
          reject(new Error(firstError.trim()));
          return;
        }
        if (!finalPath) {
          reject(new Error('Download finished but the output file could not be located.'));
          return;
        }
        let bytes = 0;
        try {
          bytes = fs.statSync(finalPath).size;
        } catch {
          /* size is cosmetic */
        }
        resolve({ outputPath: finalPath, bytes });
      });
    });
  })();

  return {
    cancel: () => {
      canceled = true;
      // SIGTERM lets yt-dlp clean up its .part files; the queue treats the
      // rejection that follows as a cancel rather than a failure.
      child?.kill('SIGTERM');
    },
    promise,
  };
}

export function revealInFinder(filePath: string): void {
  if (process.platform === 'darwin') {
    spawn('open', ['-R', filePath], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'win32') {
    spawn('explorer', ['/select,', filePath], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [path.dirname(filePath)], { detached: true, stdio: 'ignore' }).unref();
  }
}
