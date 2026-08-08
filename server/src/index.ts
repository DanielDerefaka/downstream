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
import { fetchTranscript, renderSegments, sliceTranscript } from './transcript.ts';

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
/**
 * Allowlisted thumbnail hosts. This is an allowlist rather than an open proxy
 * so the route cannot be turned into an SSRF primitive against the loopback
 * interface or a cloud metadata endpoint.
 */
const THUMB_HOSTS =
  /^(?:[\w-]+\.)*(?:ggpht\.com|googleusercontent\.com|ytimg\.com|tiktokcdn\.com|tiktokcdn-us\.com|ibyteimg\.com|cdninstagram\.com|fbcdn\.net|twimg\.com|redd\.it|redditmedia\.com|vimeocdn\.com|jtvnw\.net|sndcdn\.com|dmcdn\.net)$/i;

app.get<{ Querystring: { url?: string } }>('/api/thumb', async (req, reply) => {
  const target = req.query.url;
  let host: string | null = null;
  try {
    const parsed = new URL(target ?? '');
    if (parsed.protocol === 'https:') host = parsed.hostname;
  } catch {
    host = null;
  }
  if (!host || !THUMB_HOSTS.test(host)) {
    return reply.status(400).send({ error: 'Unsupported thumbnail host.' });
  }
  try {
    const upstream = await fetch(target as string, { signal: AbortSignal.timeout(10_000) });
    if (!upstream.ok) return reply.status(502).send({ error: 'Upstream failed.' });
    const type = upstream.headers.get('content-type') ?? 'image/jpeg';
    // Refuse to relay anything that is not an image, so the proxy cannot be
    // used to launder arbitrary content through this origin.
    if (!type.startsWith('image/')) {
      return reply.status(415).send({ error: 'Upstream did not return an image.' });
    }
    reply.header('Cache-Control', 'public, max-age=86400');
    reply.type(type);
    return reply.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    // DNS failure, timeout, connection reset — a dead thumbnail is not a
    // server error, and the UI already falls back to a placeholder.
    return reply.status(502).send({ error: 'Thumbnail unreachable.' });
  }
});

/* --------------------------------------------------------------- lessons */

/**
 * Everything an agent needs to work through a tutorial: the chapter outline,
 * the resources named in the description, and the transcript — sliced to one
 * chapter at a time, because a 13-hour course is ~165k tokens of prose and
 * nobody should read it all to implement step three.
 */
app.post<{ Body: { url?: string } }>('/api/lesson', async (req, reply) => {
  const url = req.body?.url?.trim();
  if (!url) return reply.status(400).send({ error: 'A URL is required.' });

  try {
    const media = await probe(url);
    const description = media.description ?? '';
    const links = [...new Set(description.match(/https?:\/\/[^\s)<>"']+/g) ?? [])];
    const repos = links.filter((l) => /github\.com\/[\w.-]+\/[\w.-]+/.test(l));

    // Chapters give real boundaries. Without them, fall back to 10-minute
    // blocks so the chapter-at-a-time workflow still applies.
    const duration = media.duration ?? 0;
    const chapters =
      media.chapters.length > 0
        ? media.chapters
        : Array.from({ length: Math.max(1, Math.ceil(duration / 600)) }, (_, i) => ({
            title: `Part ${i + 1}`,
            start: i * 600,
            end: Math.min((i + 1) * 600, duration),
          }));

    const transcript = await fetchTranscript(media.webpageUrl, media.id);

    return {
      id: media.id,
      url: media.webpageUrl,
      title: media.title,
      channel: media.channel,
      duration: media.duration,
      description,
      repos,
      links: links.filter((l) => !repos.includes(l)).slice(0, 25),
      hasTranscript: transcript !== null,
      transcriptSegments: transcript?.segments.length ?? 0,
      synthesizedChapters: media.chapters.length === 0,
      chapters: chapters.map((c, i) => ({
        index: i,
        title: c.title,
        start: c.start,
        end: c.end,
        minutes: Math.round((c.end - c.start) / 60),
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.status(422).send({ error: message });
  }
});

app.post<{ Body: { url?: string; start?: number; end?: number; chapter?: number } }>(
  '/api/lesson/transcript',
  async (req, reply) => {
    const url = req.body?.url?.trim();
    if (!url) return reply.status(400).send({ error: 'A URL is required.' });

    const media = await probe(url);
    const transcript = await fetchTranscript(media.webpageUrl, media.id);
    if (!transcript) {
      return reply
        .status(404)
        .send({ error: 'This video has no captions, so there is nothing to read.' });
    }

    let start = req.body?.start ?? 0;
    let end = req.body?.end ?? (media.duration ?? Number.MAX_SAFE_INTEGER);

    if (typeof req.body?.chapter === 'number' && media.chapters.length > 0) {
      const chapter = media.chapters[req.body.chapter];
      if (!chapter) return reply.status(404).send({ error: 'No such chapter.' });
      start = chapter.start;
      end = chapter.end;
    }

    const segments = sliceTranscript(transcript, start, end);
    return {
      start,
      end,
      auto: transcript.auto,
      count: segments.length,
      text: renderSegments(segments),
    };
  },
);

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
