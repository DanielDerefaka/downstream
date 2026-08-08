import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Capabilities, Settings } from '@shared/types.ts';
import { useStore } from '@/state/store.ts';
import { CheckIcon, CloseIcon } from '@/components/Icons.tsx';

type Codec = Settings['preferCodec'];

const CODECS: { id: Codec; label: string; note: string }[] = [
  { id: 'auto', label: 'Auto', note: 'Compatibility first — H.264 when available.' },
  { id: 'h264', label: 'H.264', note: 'Plays on everything.' },
  { id: 'av1', label: 'AV1', note: 'Smallest files, needs a recent device.' },
  { id: 'vp9', label: 'VP9', note: 'Efficient, great browser support.' },
];

const CONCURRENCY = [1, 2, 3, 4, 5, 6];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4">
      <h3 className="mb-3 text-[10.5px] font-semibold tracking-wider text-chalk-faint uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="row-interactive flex w-full items-center gap-4 rounded-[var(--radius-control)] px-2 py-2 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-chalk">{label}</span>
        <span className="mt-0.5 block text-[11.5px] text-chalk-faint">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200 ease-[var(--ease-out-soft)] ${
          checked
            ? 'bg-iris-600 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.3),0_0_16px_-4px_var(--color-iris-500)]'
            : 'bg-ink-700 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 620, damping: 34, mass: 0.6 }}
          className="size-4 rounded-full bg-chalk shadow-[0_1px_3px_rgb(0_0_0/0.5)]"
          style={{ marginLeft: checked ? 16 : 0 }}
        />
      </span>
    </button>
  );
}

function EngineRow({
  name,
  tool,
  hint,
}: {
  name: string;
  tool: Capabilities['ytdlp'] | undefined;
  hint: string;
}) {
  const ok = tool?.available ?? false;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2">
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full ${
          ok ? 'bg-mint/15 text-mint' : 'bg-coral/15 text-coral'
        }`}
      >
        {ok ? <CheckIcon size={12} /> : <CloseIcon size={12} />}
      </span>
      <span className="flex-1 text-[13px] font-medium text-chalk">{name}</span>
      <span
        className={`tabular truncate text-[11.5px] ${ok ? 'text-chalk-faint' : 'text-coral'}`}
        title={ok ? (tool?.path ?? undefined) : hint}
      >
        {ok ? (tool?.version ?? 'installed') : hint}
      </span>
    </div>
  );
}

function SettingsDialog({
  settings,
  capabilities,
  onClose,
}: {
  settings: Settings;
  capabilities: Capabilities | null;
  onClose: () => void;
}) {
  const saveSettings = useStore((s) => s.saveSettings);
  const [dir, setDir] = useState(settings.downloadDir);

  // The server can rewrite the path it accepted (expanding ~, trimming), so the
  // draft follows the authoritative value whenever a save comes back.
  useEffect(() => setDir(settings.downloadDir), [settings.downloadDir]);

  const commitDir = () => {
    const next = dir.trim();
    if (!next || next === settings.downloadDir) {
      setDir(settings.downloadDir);
      return;
    }
    void saveSettings({ downloadDir: next });
  };

  const selectedCodec = CODECS.find((c) => c.id === settings.preferCodec) ?? CODECS[0];

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      initial={{ opacity: 0, scale: 0.95, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }}
      className="glass-card relative z-10 flex max-h-[86vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[var(--radius-card)]"
    >
      <header className="flex items-center gap-3 px-5 pt-5 pb-1">
        <h2 className="flex-1 text-[15px] font-semibold tracking-tight text-chalk">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          title="Close settings"
          className="btn-ghost grid size-8 place-items-center rounded-[10px] text-chalk-dim transition duration-200 ease-[var(--ease-out-soft)] hover:text-chalk"
        >
          <CloseIcon size={16} />
        </button>
      </header>

      <div className="mask-fade-y min-h-0 flex-1 divide-y divide-white/6 overflow-y-auto">
        <Section title="Downloads">
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] text-chalk-faint">Save files to</span>
            <span className="input-field flex items-center rounded-[var(--radius-control)] px-3 py-2">
              <input
                value={dir}
                spellCheck={false}
                onChange={(e) => setDir(e.target.value)}
                onBlur={commitDir}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setDir(settings.downloadDir);
                }}
                className="w-full bg-transparent font-mono text-[12px] text-chalk outline-none placeholder:text-chalk-ghost"
                placeholder="~/Downloads"
              />
            </span>
          </label>

          <div className="mt-4 flex items-center gap-4">
            <span className="flex-1 text-[12.5px] text-chalk-dim">Downloads at once</span>
            <div className="flex items-center gap-0.5 rounded-[var(--radius-control)] bg-black/30 p-[3px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]">
              {CONCURRENCY.map((n) => {
                const on = settings.maxConcurrent === n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} at once`}
                    aria-pressed={on}
                    onClick={() => {
                      if (!on) void saveSettings({ maxConcurrent: n });
                    }}
                    className={`tabular relative grid size-7 place-items-center rounded-[8px] text-[12px] transition duration-200 ease-[var(--ease-out-soft)] active:scale-95 ${
                      on ? 'text-chalk' : 'text-chalk-faint hover:text-chalk-dim'
                    }`}
                  >
                    {on && (
                      <motion.span
                        layoutId="concurrency-pill"
                        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                        className="absolute inset-0 rounded-[8px] bg-iris-600 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.28)]"
                      />
                    )}
                    <span className="relative">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title="Quality">
          <div className="flex flex-wrap gap-2">
            {CODECS.map((codec) => {
              const on = settings.preferCodec === codec.id;
              return (
                <button
                  key={codec.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (!on) void saveSettings({ preferCodec: codec.id });
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition duration-200 ease-[var(--ease-spring)] active:scale-95 ${
                    on
                      ? 'row-selected text-chalk'
                      : 'btn-ghost text-chalk-dim hover:text-chalk'
                  }`}
                >
                  {codec.label}
                </button>
              );
            })}
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={selectedCodec?.id ?? 'auto'}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2.5 text-[11.5px] text-chalk-faint"
            >
              {selectedCodec?.note}
            </motion.p>
          </AnimatePresence>
        </Section>

        <Section title="Metadata">
          <div className="flex flex-col gap-1">
            <Switch
              label="Embed metadata"
              hint="Cover art, title, artist and date written into the file."
              checked={settings.embedMetadata}
              onChange={(embedMetadata) => void saveSettings({ embedMetadata })}
            />
            <Switch
              label="Embed chapters"
              hint="Chapter markers your player can jump between."
              checked={settings.embedChapters}
              onChange={(embedChapters) => void saveSettings({ embedChapters })}
            />
          </div>
        </Section>

        <Section title="Engine">
          <div className="flex flex-col gap-1">
            <EngineRow
              name="yt-dlp"
              tool={capabilities?.ytdlp}
              hint="not found — run: brew install yt-dlp"
            />
            <EngineRow
              name="ffmpeg"
              tool={capabilities?.ffmpeg}
              hint="not found — run: brew install ffmpeg"
            />
          </div>
        </Section>
      </div>
    </motion.div>
  );
}

export default function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const capabilities = useStore((s) => s.capabilities);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, setSettingsOpen]);

  return (
    <AnimatePresence>
      {settingsOpen && settings && (
        <div className="fixed inset-0 z-50 grid place-items-center p-5">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => setSettingsOpen(false)}
            className="absolute inset-0 bg-ink-1000/60 backdrop-blur-[8px]"
          />
          <SettingsDialog
            settings={settings}
            capabilities={capabilities}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
