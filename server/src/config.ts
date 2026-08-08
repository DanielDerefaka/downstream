import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { Settings } from '../../shared/types.ts';

const CONFIG_DIR = path.join(os.homedir(), '.downstream');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

export const PORT = Number(process.env.DOWNSTREAM_PORT ?? 5174);

export const DEFAULT_SETTINGS: Settings = {
  downloadDir: path.join(os.homedir(), 'Downloads', 'Downstream'),
  maxConcurrent: 3,
  preferCodec: 'auto',
  embedMetadata: true,
  embedChapters: true,
  filenameTemplate: '%(title).120B [%(id)s]',
};

let cached: Settings | null = null;

export function loadSettings(): Settings {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    cached = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    cached = { ...DEFAULT_SETTINGS };
  }
  fs.mkdirSync(cached.downloadDir, { recursive: true });
  return cached;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(next.downloadDir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  cached = next;
  return next;
}

/** Scratch space for partial downloads, kept off the user's Downloads folder. */
export const WORK_DIR = path.join(os.tmpdir(), 'downstream-work');
fs.mkdirSync(WORK_DIR, { recursive: true });

export const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');
