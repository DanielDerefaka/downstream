import { create } from 'zustand';
import type { Capabilities, Job, MediaProbe, Settings, TrimRange } from '@shared/types.ts';
import { api, connectEvents, RequestFailed } from '@/lib/api.ts';

export type Screen = 'intake' | 'studio';
export type Tab = 'video' | 'audio';

interface ProbeErrorState {
  message: string;
  code: string;
  detail?: string;
}

interface State {
  screen: Screen;
  url: string;
  probing: boolean;
  probeError: ProbeErrorState | null;
  media: MediaProbe | null;

  tab: Tab;
  selectedRungId: string | null;
  trim: TrimRange | null;
  trimEnabled: boolean;
  preciseCut: boolean;
  selectedSubtitles: string[];

  jobs: Job[];
  active: number;
  queued: number;
  queueOpen: boolean;
  connected: boolean;

  capabilities: Capabilities | null;
  settings: Settings | null;
  settingsOpen: boolean;

  toast: { id: number; message: string; tone: 'ok' | 'error' } | null;
}

interface Actions {
  setUrl: (url: string) => void;
  submitUrl: (url?: string) => Promise<void>;
  reset: () => void;

  setTab: (tab: Tab) => void;
  selectRung: (id: string) => void;
  setTrim: (trim: TrimRange | null) => void;
  setTrimEnabled: (enabled: boolean) => void;
  setPreciseCut: (precise: boolean) => void;
  toggleSubtitle: (lang: string) => void;

  startDownload: () => Promise<void>;
  startPlaylistDownload: () => Promise<void>;

  setQueueOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;

  cancelJob: (id: string) => Promise<void>;
  retryJob: (id: string) => Promise<void>;
  removeJob: (id: string) => Promise<void>;
  revealJob: (id: string) => Promise<void>;
  clearFinished: () => Promise<void>;

  notify: (message: string, tone?: 'ok' | 'error') => void;
  init: () => () => void;
}

/** Hosts we will silently prefix with https:// when the user pastes without one. */
const KNOWN_HOSTS =
  /^(https?:\/\/)?([\w-]+\.)*(youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com|tiktok\.com|instagram\.com|instagr\.am|soundcloud\.com|dailymotion\.com|twitch\.tv|reddit\.com|facebook\.com)\//i;

/** Accepts bare IDs and hostname-less pastes, both of which people do constantly. */
export function normalizeUrl(raw: string): string {
  const input = raw.trim();
  if (!input) return input;
  if (/^[\w-]{11}$/.test(input)) return `https://www.youtube.com/watch?v=${input}`;
  if (!/^https?:\/\//i.test(input) && KNOWN_HOSTS.test(input)) return `https://${input}`;
  return input;
}

let toastSeq = 0;
let toastTimer: number | null = null;

export const useStore = create<State & Actions>((set, get) => ({
  screen: 'intake',
  url: '',
  probing: false,
  probeError: null,
  media: null,

  tab: 'video',
  selectedRungId: null,
  trim: null,
  trimEnabled: false,
  preciseCut: false,
  selectedSubtitles: [],

  jobs: [],
  active: 0,
  queued: 0,
  queueOpen: false,
  connected: false,

  capabilities: null,
  settings: null,
  settingsOpen: false,

  toast: null,

  setUrl: (url) => set({ url, probeError: null }),

  submitUrl: async (override) => {
    const raw = override ?? get().url;
    const url = normalizeUrl(raw);
    if (!url) return;
    set({ probing: true, probeError: null, url });
    try {
      const media = await api.probe(url);
      set({
        media,
        screen: 'studio',
        probing: false,
        tab: 'video',
        selectedRungId: media.recommendedVideoId ?? media.video[0]?.id ?? null,
        trim: media.duration ? { start: 0, end: media.duration } : null,
        trimEnabled: false,
        selectedSubtitles: [],
      });
    } catch (err) {
      const failure = err instanceof RequestFailed ? err : null;
      set({
        probing: false,
        probeError: {
          message: failure?.message ?? 'Something went wrong reading that link.',
          code: failure?.code ?? 'UNKNOWN',
          detail: failure?.detail,
        },
      });
    }
  },

  reset: () =>
    set({
      screen: 'intake',
      url: '',
      media: null,
      probeError: null,
      selectedRungId: null,
      trim: null,
      trimEnabled: false,
      selectedSubtitles: [],
      tab: 'video',
    }),

  setTab: (tab) => {
    const { media } = get();
    if (!media) return set({ tab });
    const fallback =
      tab === 'video'
        ? (media.recommendedVideoId ?? media.video[0]?.id ?? null)
        : (media.audio[0]?.id ?? null);
    set({ tab, selectedRungId: fallback });
  },

  selectRung: (id) => set({ selectedRungId: id }),
  setTrim: (trim) => set({ trim }),
  setTrimEnabled: (trimEnabled) => {
    const { media } = get();
    set({
      trimEnabled,
      // Leaving trim mode restores the full range so a stale selection can
      // never silently clip the next download.
      trim: trimEnabled ? get().trim : media?.duration ? { start: 0, end: media.duration } : null,
    });
  },

  setPreciseCut: (preciseCut) => set({ preciseCut }),

  toggleSubtitle: (lang) =>
    set((s) => ({
      selectedSubtitles: s.selectedSubtitles.includes(lang)
        ? s.selectedSubtitles.filter((l) => l !== lang)
        : [...s.selectedSubtitles, lang],
    })),

  startDownload: async () => {
    const { media, selectedRungId, tab, trim, trimEnabled, preciseCut, selectedSubtitles, notify } =
      get();
    if (!media || !selectedRungId) return;
    const isFullRange =
      !trimEnabled ||
      !trim ||
      (trim.start <= 0.05 && media.duration !== null && trim.end >= media.duration - 0.05);
    try {
      await api.download({
        url: media.webpageUrl,
        rungId: selectedRungId,
        kind: tab,
        trim: isFullRange ? null : trim,
        preciseCut: isFullRange ? false : preciseCut,
        subtitles: tab === 'video' ? selectedSubtitles : [],
        embedMetadata: true,
        embedChapters: true,
        title: media.title,
        thumbnail: media.thumbnail,
      });
      set({ queueOpen: true });
      notify('Added to queue');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not start that download.', 'error');
    }
  },

  startPlaylistDownload: async () => {
    const { media, selectedRungId, tab, notify } = get();
    if (!media?.playlist || !selectedRungId) return;
    const entries = media.playlist.entries;
    try {
      await api.downloadBatch(
        entries.map((e) => e.url),
        selectedRungId,
        tab,
        entries.map((e) => e.title),
      );
      set({ queueOpen: true });
      notify(`Queued ${entries.length} videos`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not queue the playlist.', 'error');
    }
  },

  setQueueOpen: (queueOpen) => set({ queueOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  saveSettings: async (patch) => {
    try {
      const settings = await api.updateSettings(patch);
      set({ settings });
      get().notify('Settings saved');
    } catch (err) {
      get().notify(err instanceof Error ? err.message : 'Could not save settings.', 'error');
    }
  },

  cancelJob: async (id) => {
    await api.cancelJob(id).catch(() => undefined);
  },
  retryJob: async (id) => {
    await api.retryJob(id).catch(() => undefined);
  },
  removeJob: async (id) => {
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }));
    await api.removeJob(id).catch(() => undefined);
  },
  revealJob: async (id) => {
    try {
      await api.revealJob(id);
    } catch {
      get().notify('That file has moved or been deleted.', 'error');
    }
  },
  clearFinished: async () => {
    set((s) => ({
      jobs: s.jobs.filter(
        (j) => j.status !== 'done' && j.status !== 'failed' && j.status !== 'canceled',
      ),
    }));
    await api.clearFinished().catch(() => undefined);
  },

  notify: (message, tone = 'ok') => {
    toastSeq += 1;
    set({ toast: { id: toastSeq, message, tone } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => set({ toast: null }), 3200);
  },

  init: () => {
    void api.settings().then((settings) => set({ settings })).catch(() => undefined);

    const upsert = (job: Job) =>
      set((s) => {
        const idx = s.jobs.findIndex((j) => j.id === job.id);
        if (idx === -1) return { jobs: [job, ...s.jobs] };
        const jobs = s.jobs.slice();
        jobs[idx] = job;
        return { jobs };
      });

    return connectEvents(
      (event) => {
        switch (event.type) {
          case 'hello':
            set({ jobs: event.jobs, capabilities: event.capabilities });
            break;
          case 'job:created':
          case 'job:update':
            upsert(event.job);
            break;
          case 'job:done':
            upsert(event.job);
            get().notify(`${event.job.title} is ready`);
            break;
          case 'job:failed':
            upsert(event.job);
            get().notify(event.job.error ?? 'A download failed.', 'error');
            break;
          case 'queue:stats':
            set({ active: event.active, queued: event.queued });
            break;
        }
      },
      (connected) => set({ connected }),
    );
  },
}));
