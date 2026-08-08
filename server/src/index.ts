import Fastify from 'fastify';
import cors from '@fastify/cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DownloadRequest, ServerEvent, Settings } from '../../shared/types.ts';
import { PORT, loadSettings, saveSettings } from './config.ts';
import { getCapabilities } from './bin.ts';
import { probe, ProbeError } from './probe.ts';
import { subscribe } from './events.ts';
import {
  cancel,
  clearFinished,
  enqueue,
  getJob,
  listJobs,
  loadHistory,
  queueStats,
  remove,
  retry,
} from './queue.ts';
import { revealInFinder } from './runner.ts';

const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });

await app.register(cors, { origin: true });

loadHistory();

/* --------------------------------------------------------- capabilities */

app.get('/api/capabilities', async () => getCapabilities(true));

/* ---------------------------------------------------------------- probe */

app.post<{ Body: { url?: string; force?: boolean } }>('/api/probe', async (req, reply) => {
  const url = req.body?.url?.trim();
  if (!url) return reply.status(400).send({ error: 'A URL is required.', code: 'UNSUPPORTED_URL' });
  try {
    return await probe(url, req.body?.force ?? false);
  } catch (err) {
    if (err instanceof ProbeError) {
      return reply.status(422).send({ error: err.message, detail: err.detail, code: err.code });
    }
    const message = err instanceof Error ? err.message : String(err);
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code: string }).code
        : 'UNKNOWN';
    return reply.status(500).send({ error: message, code });
  }
});

/* ------------------------------------------------------------- download */

app.post<{ Body: DownloadRequest }>('/api/download', async (req, reply) => {
  const body = req.body;
  if (!body?.url || !body?.rungId) {
    return reply.status(400).send({ error: 'url and rungId are required.' });
  }
  return reply.status(201).send(enqueue(body));
});

/** Queue an entire playlist at one quality. */
app.post<{ Body: { urls: string[]; rungId: string; kind: 'video' | 'audio'; titles?: string[] } }>(
  '/api/download/batch',
  async (req, reply) => {
    const { urls, rungId, kind, titles } = req.body ?? {};
    if (!Array.isArray(urls) || urls.length === 0) {
      return reply.status(400).send({ error: 'urls must be a non-empty array.' });
    }
    const created = urls.map((url, i) =>
      enqueue({ url, rungId, kind, title: titles?.[i] ?? url, embedMetadata: true }),
    );
    return reply.status(201).send(created);
  },
);

/* ----------------------------------------------------------------- jobs */

app.get('/api/jobs', async () => ({ jobs: listJobs(), ...queueStats() }));

app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (req, reply) =>
  cancel(req.params.id) ? { ok: true } : reply.status(404).send({ error: 'No such job.' }),
);

app.post<{ Params: { id: string } }>('/api/jobs/:id/retry', async (req, reply) => {
  const job = retry(req.params.id);
  return job ?? reply.status(404).send({ error: 'No such job.' });
});

app.post<{ Params: { id: string } }>('/api/jobs/:id/reveal', async (req, reply) => {
  const job = getJob(req.params.id);
  if (!job?.outputPath) return reply.status(404).send({ error: 'That file is not on disk.' });
  revealInFinder(job.outputPath);
  return { ok: true };
});

/** Stream the finished file to the browser so downloads work from a remote host too. */
app.get<{ Params: { id: string } }>('/api/jobs/:id/file', async (req, reply) => {
  const job = getJob(req.params.id);
  if (!job?.outputPath || !fs.existsSync(job.outputPath)) {
    return reply.status(404).send({ error: 'That file is not on disk.' });
  }
  const name = path.basename(job.outputPath);
  reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
  reply.header('Content-Length', String(fs.statSync(job.outputPath).size));
  reply.type('application/octet-stream');
  return reply.send(fs.createReadStream(job.outputPath));
});

app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (req) => ({
  ok: remove(req.params.id),
}));

app.post('/api/jobs/clear', async () => {
  clearFinished();
  return { ok: true };
});

/* ------------------------------------------------------------- settings */

app.get('/api/settings', async () => loadSettings());

app.patch<{ Body: Partial<Settings> }>('/api/settings', async (req) => saveSettings(req.body ?? {}));

/* --------------------------------------------------------------- thumbs */

/**
 * YouTube's thumbnail CDN is fine with cross-origin <img>, but the channel and
 * storyboard hosts are not consistent about it. Proxying keeps the UI from
 * showing broken tiles on some videos and not others.
 */
app.get<{ Querystring: { url?: string } }>('/api/thumb', async (req, reply) => {
  const target = req.query.url;
  if (!target || !/^https:\/\/[\w.-]+\.(ggpht|googleusercontent|ytimg)\.com\//.test(target)) {
    return reply.status(400).send({ error: 'Unsupported thumbnail host.' });
  }
  const upstream = await fetch(target);
  if (!upstream.ok || !upstream.body) return reply.status(502).send({ error: 'Upstream failed.' });
  reply.header('Cache-Control', 'public, max-age=86400');
  reply.type(upstream.headers.get('content-type') ?? 'image/jpeg');
  return reply.send(Buffer.from(await upstream.arrayBuffer()));
});

/* ---------------------------------------------------------------- events */

app.get('/api/events', (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: ServerEvent) => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  void getCapabilities().then((capabilities) => {
    send({ type: 'hello', jobs: listJobs(), capabilities });
  });

  const unsubscribe = subscribe(send);
  // Proxies and laptops-going-to-sleep both kill idle SSE streams; a comment
  // frame every 20s keeps the connection classified as active.
  const keepalive = setInterval(() => reply.raw.write(': ping\n\n'), 20_000);

  req.raw.on('close', () => {
    clearInterval(keepalive);
    unsubscribe();
  });
});

/* ----------------------------------------------------------- static web */

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../web/dist');
if (fs.existsSync(dist)) {
  const staticPlugin = await import('@fastify/static');
  await app.register(staticPlugin.default, { root: dist, prefix: '/' });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.status(404).send({ error: 'Not found.' });
    return reply.sendFile('index.html');
  });
}

/* ------------------------------------------------------------------ boot */

const caps = await getCapabilities();
const listenHost = process.env.DOWNSTREAM_HOST ?? '127.0.0.1';
await app.listen({ port: PORT, host: listenHost });

const ok = (v: boolean) => (v ? '[32m✓[0m' : '[31m✗[0m');
console.log(`\n  [1mDownstream[0m server on http://${listenHost}:${PORT}`);
console.log(`  ${ok(caps.ytdlp.available)} yt-dlp ${caps.ytdlp.version ?? '(not found)'}`);
console.log(`  ${ok(caps.ffmpeg.available)} ffmpeg ${caps.ffmpeg.version ?? '(not found)'}`);
console.log(`  → ${caps.downloadDir}\n`);
