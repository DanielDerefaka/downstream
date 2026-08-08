import type {
  ApiError,
  Capabilities,
  DownloadRequest,
  Job,
  MediaProbe,
  ServerEvent,
  Settings,
} from '@shared/types.ts';

export class RequestFailed extends Error {
  code: ApiError['code'];
  detail: string | undefined;
  constructor(message: string, code: ApiError['code'], detail?: string) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new RequestFailed(
      'Downstream’s engine is not responding. Is the server running?',
      'NETWORK',
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as ApiError;
    throw new RequestFailed(body.error ?? 'Request failed.', body.code ?? 'UNKNOWN', body.detail);
  }
  return (await res.json()) as T;
}

export const api = {
  capabilities: () => call<Capabilities>('/capabilities'),

  probe: (url: string, force = false) =>
    call<MediaProbe>('/probe', { method: 'POST', body: JSON.stringify({ url, force }) }),

  download: (request: DownloadRequest) =>
    call<Job>('/download', { method: 'POST', body: JSON.stringify(request) }),

  downloadBatch: (urls: string[], rungId: string, kind: 'video' | 'audio', titles?: string[]) =>
    call<Job[]>('/download/batch', {
      method: 'POST',
      body: JSON.stringify({ urls, rungId, kind, titles }),
    }),

  jobs: () => call<{ jobs: Job[]; active: number; queued: number }>('/jobs'),
  cancelJob: (id: string) => call<{ ok: boolean }>(`/jobs/${id}/cancel`, { method: 'POST' }),
  retryJob: (id: string) => call<Job>(`/jobs/${id}/retry`, { method: 'POST' }),
  revealJob: (id: string) => call<{ ok: boolean }>(`/jobs/${id}/reveal`, { method: 'POST' }),
  removeJob: (id: string) => call<{ ok: boolean }>(`/jobs/${id}`, { method: 'DELETE' }),
  clearFinished: () => call<{ ok: boolean }>('/jobs/clear', { method: 'POST' }),

  settings: () => call<Settings>('/settings'),
  updateSettings: (patch: Partial<Settings>) =>
    call<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(patch) }),

  fileUrl: (id: string) => `/api/jobs/${id}/file`,
  thumbUrl: (url: string | null) => (url ? `/api/thumb?url=${encodeURIComponent(url)}` : null),
};

/**
 * SSE with reconnect. EventSource retries on its own, but only for transport
 * drops — it gives up silently if the server was down when the page loaded, so
 * we drive the retry loop ourselves and surface connection state to the UI.
 */
export function connectEvents(
  onEvent: (event: ServerEvent) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  let source: EventSource | null = null;
  let retryTimer: number | null = null;
  let attempts = 0;
  let closed = false;

  const open = () => {
    if (closed) return;
    source = new EventSource('/api/events');

    source.onopen = () => {
      attempts = 0;
      onStatus(true);
    };

    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as ServerEvent);
      } catch {
        // A malformed frame is not worth tearing the stream down for.
      }
    };

    source.onerror = () => {
      onStatus(false);
      source?.close();
      source = null;
      if (closed) return;
      attempts += 1;
      const backoff = Math.min(500 * 2 ** (attempts - 1), 8000);
      retryTimer = window.setTimeout(open, backoff);
    };
  };

  open();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    source?.close();
  };
}
