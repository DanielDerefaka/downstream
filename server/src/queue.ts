import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DownloadRequest, Job } from '../../shared/types.ts';
import { ACTIVE_STATUSES } from '../../shared/types.ts';
import { startRun, type RunHandle } from './runner.ts';
import { emit } from './events.ts';
import { HISTORY_FILE, loadSettings } from './config.ts';

const jobs = new Map<string, Job>();
const running = new Map<string, RunHandle>();
const waiting: string[] = [];

/* -------------------------------------------------------------- history */

function persistHistory(): void {
  const finished = [...jobs.values()]
    .filter((j) => j.status === 'done')
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, 200);
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(finished, null, 2));
  } catch {
    // History is a convenience, never a reason to fail a download.
  }
}

export function loadHistory(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) as Job[];
    for (const job of raw) {
      // Drop entries whose file the user has since moved or deleted.
      if (job.outputPath && fs.existsSync(job.outputPath)) jobs.set(job.id, job);
    }
  } catch {
    /* first run */
  }
}

/* ---------------------------------------------------------------- queue */

function activeCount(): number {
  return [...jobs.values()].filter((j) => ACTIVE_STATUSES.includes(j.status)).length;
}

function update(id: string, patch: Partial<Job>, event: 'update' | 'done' | 'failed' = 'update'): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
  emit(
    event === 'done'
      ? { type: 'job:done', job }
      : event === 'failed'
        ? { type: 'job:failed', job }
        : { type: 'job:update', job },
  );
  emitStats();
}

function emitStats(): void {
  emit({ type: 'queue:stats', active: activeCount(), queued: waiting.length });
}

function pump(): void {
  const { maxConcurrent } = loadSettings();
  while (activeCount() < maxConcurrent && waiting.length > 0) {
    const id = waiting.shift();
    if (!id) break;
    const job = jobs.get(id);
    if (!job || job.status !== 'queued') continue;
    launch(job);
  }
  emitStats();
}

function launch(job: Job): void {
  job.status = 'probing';
  job.startedAt = Date.now();
  job.phase = 'Resolving streams';
  emit({ type: 'job:update', job });

  // Coalesce the progress firehose: yt-dlp emits several updates per second per
  // job, and with 3 concurrent downloads that is enough SSE traffic to make the
  // client's list janky. 200ms is below the threshold where a progress bar
  // looks like it stalled.
  let pending: Partial<Job> | null = null;
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    timer = null;
    if (!pending) return;
    const patch = pending;
    pending = null;
    update(job.id, patch);
  };

  const handle = startRun(job, (patch) => {
    pending = { ...(pending ?? {}), ...patch };
    if (!timer) timer = setTimeout(flush, 200);
  });

  running.set(job.id, handle);

  handle.promise
    .then(({ outputPath, bytes }) => {
      if (timer) clearTimeout(timer);
      update(
        job.id,
        {
          status: 'done',
          progress: 1,
          outputPath,
          outputBytes: bytes,
          finishedAt: Date.now(),
          speed: null,
          eta: null,
          phase: null,
        },
        'done',
      );
      persistHistory();
    })
    .catch((err: unknown) => {
      if (timer) clearTimeout(timer);
      const canceled = typeof err === 'object' && err !== null && 'canceled' in err;
      update(
        job.id,
        {
          status: canceled ? 'canceled' : 'failed',
          error: canceled ? null : err instanceof Error ? err.message : String(err),
          finishedAt: Date.now(),
          speed: null,
          eta: null,
          phase: null,
        },
        canceled ? 'update' : 'failed',
      );
    })
    .finally(() => {
      running.delete(job.id);
      pump();
    });
}

/* ----------------------------------------------------------------- api */

export function enqueue(request: DownloadRequest): Job {
  const job: Job = {
    id: randomUUID(),
    status: 'queued',
    request,
    title: request.title ?? request.url,
    thumbnail: request.thumbnail ?? null,
    progress: 0,
    speed: null,
    eta: null,
    downloadedBytes: null,
    totalBytes: null,
    outputPath: null,
    outputBytes: null,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    phase: 'Waiting in queue',
  };
  jobs.set(job.id, job);
  waiting.push(job.id);
  emit({ type: 'job:created', job });
  pump();
  return job;
}

export function cancel(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  const handle = running.get(id);
  if (handle) {
    handle.cancel();
    return true;
  }
  const idx = waiting.indexOf(id);
  if (idx >= 0) waiting.splice(idx, 1);
  update(id, { status: 'canceled', finishedAt: Date.now(), phase: null });
  return true;
}

export function retry(id: string): Job | null {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === 'queued' || ACTIVE_STATUSES.includes(job.status)) return job;
  Object.assign(job, {
    status: 'queued' as const,
    progress: 0,
    error: null,
    speed: null,
    eta: null,
    downloadedBytes: null,
    totalBytes: null,
    outputPath: null,
    outputBytes: null,
    startedAt: null,
    finishedAt: null,
    phase: 'Waiting in queue',
  });
  waiting.push(job.id);
  emit({ type: 'job:update', job });
  pump();
  return job;
}

export function remove(id: string): boolean {
  cancel(id);
  const existed = jobs.delete(id);
  persistHistory();
  emitStats();
  return existed;
}

export function clearFinished(): void {
  for (const [id, job] of jobs) {
    if (job.status === 'done' || job.status === 'failed' || job.status === 'canceled') {
      jobs.delete(id);
    }
  }
  persistHistory();
  emitStats();
}

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null;
}

export function queueStats(): { active: number; queued: number } {
  return { active: activeCount(), queued: waiting.length };
}
