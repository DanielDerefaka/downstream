/** `pnpm doctor` — tells the user exactly what is missing and how to fix it. */
import { getCapabilities } from './bin.ts';
import { loadSettings } from './config.ts';

const caps = await getCapabilities(true);
const settings = loadSettings();

const line = (ok: boolean, label: string, detail: string) =>
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label.padEnd(10)} ${detail}`);

console.log('\n  \x1b[1mDownstream — environment check\x1b[0m\n');
line(caps.ytdlp.available, 'yt-dlp', caps.ytdlp.path ?? 'not found — run: brew install yt-dlp');
line(caps.ffmpeg.available, 'ffmpeg', caps.ffmpeg.path ?? 'not found — run: brew install ffmpeg');
line(true, 'downloads', settings.downloadDir);
line(true, 'concurrent', String(settings.maxConcurrent));
line(true, 'codec', settings.preferCodec);

if (!caps.ytdlp.available || !caps.ffmpeg.available) {
  console.log('\n  \x1b[33mDownstream needs both binaries to run.\x1b[0m\n');
  process.exit(1);
}
console.log('\n  All good.\n');
