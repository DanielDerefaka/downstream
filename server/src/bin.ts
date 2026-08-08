import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Capabilities } from '../../shared/types.ts';
import { loadSettings } from './config.ts';

const exec = promisify(execFile);

/** Places to look before falling back to a bundled download. */
const CANDIDATE_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  path.join(os.homedir(), '.local', 'bin'),
  path.join(os.homedir(), '.downstream', 'bin'),
];

function findOnDisk(name: string): string | null {
  for (const dir of CANDIDATE_DIRS) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

async function findOnPath(name: string): Promise<string | null> {
  try {
    const { stdout } = await exec('which', [name]);
    const resolved = stdout.trim();
    return resolved.length > 0 ? resolved : null;
  } catch {
    return null;
  }
}

export interface ResolvedBinary {
  path: string | null;
  version: string | null;
}

async function resolve(name: string, versionArgs: string[]): Promise<ResolvedBinary> {
  const found = (await findOnPath(name)) ?? findOnDisk(name);
  if (!found) return { path: null, version: null };
  try {
    const { stdout } = await exec(found, versionArgs);
    const first = stdout.trim().split('\n')[0] ?? '';
    return { path: found, version: first };
  } catch {
    return { path: found, version: null };
  }
}

let capabilitiesCache: Capabilities | null = null;

export async function getCapabilities(force = false): Promise<Capabilities> {
  if (capabilitiesCache && !force) return capabilitiesCache;
  const [ytdlp, ffmpeg] = await Promise.all([
    resolve('yt-dlp', ['--version']),
    resolve('ffmpeg', ['-version']),
  ]);
  const settings = loadSettings();
  capabilitiesCache = {
    ytdlp: { available: ytdlp.path !== null, version: ytdlp.version, path: ytdlp.path },
    ffmpeg: {
      available: ffmpeg.path !== null,
      // "ffmpeg version 8.1.2 Copyright ..." -> "8.1.2"
      version: ffmpeg.version?.split(' ')[2] ?? ffmpeg.version,
      path: ffmpeg.path,
    },
    downloadDir: settings.downloadDir,
    maxConcurrent: settings.maxConcurrent,
  };
  return capabilitiesCache;
}

export async function ytdlpPath(): Promise<string> {
  const caps = await getCapabilities();
  if (!caps.ytdlp.path) {
    throw Object.assign(new Error('yt-dlp is not installed'), { code: 'MISSING_YTDLP' });
  }
  return caps.ytdlp.path;
}

export async function ffmpegPath(): Promise<string> {
  const caps = await getCapabilities();
  if (!caps.ffmpeg.path) {
    throw Object.assign(new Error('ffmpeg is not installed'), { code: 'MISSING_FFMPEG' });
  }
  return caps.ffmpeg.path;
}

/** Run a binary to completion, capturing stdout. Rejects with stderr on non-zero exit. */
export function run(
  bin: string,
  args: string[],
  opts: { timeoutMs?: number; onStderr?: (chunk: string) => void } = {},
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`${path.basename(bin)} timed out after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs)
      : null;

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      opts.onStderr?.(text);
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(stderr.trim() || `${path.basename(bin)} exited with code ${code}`));
    });
  });
}

export { spawn };
