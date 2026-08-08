import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore, normalizeUrl } from '@/state/store.ts';
import { api } from '@/lib/api.ts';
import { duration, relativeTime } from '@/lib/format.ts';
import { AlertIcon, ArrowRightIcon, ClipboardIcon, Logo, LinkIcon } from '@/components/Icons.tsx';
import PlatformNav from '@/components/PlatformNav.tsx';
import { detectPlatform, platformById, type PlatformId } from '@/lib/platforms.ts';

/** Recovery hints keyed by the server's error code — a dead end is never just a red message. */
const RECOVERY: Record<string, string> = {
  MISSING_YTDLP: 'Install the engine with `brew install yt-dlp`, then try again.',
  MISSING_FFMPEG: 'Install ffmpeg with `brew install ffmpeg`, then try again.',
  UNSUPPORTED_URL: 'Paste a full video link — youtube.com/watch?v=…, youtu.be/…, or a bare video ID.',
  PRIVATE_VIDEO: 'Only the owner can reach this one. There is nothing Downstream can do.',
  AGE_RESTRICTED: 'Age-gated videos need a signed-in session, which Downstream does not carry.',
  GEO_BLOCKED: 'The uploader blocked your region. A VPN in a permitted country would resolve it.',
  NETWORK: 'Check your connection, then try again.',
};

const KeyCap = ({ children }: { children: React.ReactNode }) => (
  <span className="surface-3 inline-flex h-7 min-w-7 items-center justify-center rounded-[7px] px-1.5 font-mono text-[11px] text-chalk-dim">
    {children}
  </span>
);

export default function Intake() {
  const url = useStore((s) => s.url);
  const setUrl = useStore((s) => s.setUrl);
  const submitUrl = useStore((s) => s.submitUrl);
  const probing = useStore((s) => s.probing);
  const probeError = useStore((s) => s.probeError);
  const jobs = useStore((s) => s.jobs);

  const inputRef = useRef<HTMLInputElement>(null);
  const [clipboardHint, setClipboardHint] = useState<string | null>(null);
  const [pickedPlatform, setPickedPlatform] = useState<PlatformId>('youtube');

  // What the user typed always wins over what they clicked, so the nav tracks
  // a pasted link instead of arguing with it.
  const detectedPlatform = detectPlatform(url);
  const activePlatform = detectedPlatform ?? pickedPlatform;
  const platform = platformById(activePlatform);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /**
   * Reading the clipboard needs a user gesture in every browser, so we cannot
   * pre-fill on load. Instead we offer a one-tap paste chip the moment the
   * window regains focus — the common case is a user who just copied a link.
   */
  const offerClipboard = useCallback(async () => {
    if (url.trim()) return;
    try {
      const text = await navigator.clipboard.readText();
      const candidate = normalizeUrl(text);
      if (/^https?:\/\//i.test(candidate) && candidate !== url) setClipboardHint(candidate);
    } catch {
      // Permission denied or unsupported: the manual paste path still works.
    }
  }, [url]);

  useEffect(() => {
    const onFocus = () => void offerClipboard();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [offerClipboard]);

  const recent = jobs.filter((j) => j.status === 'done').slice(0, 3);
  const canSubmit = url.trim().length > 0 && !probing;

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[560px]"
      >
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3">
            <Logo size={38} />
            <span className="text-[27px] font-semibold tracking-[-0.03em] text-chalk">
              downstream<span className="text-iris-400">.</span>
            </span>
          </div>

          <h1 className="text-gradient mt-9 text-center text-[38px] leading-[1.08] font-bold tracking-[-0.035em]">
            Take any video offline
          </h1>
          <p className="mt-3.5 max-w-[420px] text-center text-[14.5px] leading-relaxed text-chalk-dim">
            YouTube, X, TikTok, Instagram and a thousand more. Every quality the source
            actually has — up to 8K, audio, captions and chapters intact.
          </p>
        </div>

        <div className="mt-8">
          <PlatformNav
            active={activePlatform}
            detected={detectedPlatform !== null}
            onSelect={(id) => {
              setPickedPlatform(id);
              inputRef.current?.focus();
            }}
          />
        </div>

        <form
          className="relative mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void submitUrl();
          }}
        >
          <div className="input-field flex items-center gap-3 rounded-[var(--radius-control)] px-4 py-3.5">
            <LinkIcon size={17} className="shrink-0 text-chalk-ghost" />
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={platform.placeholder}
              spellCheck={false}
              autoComplete="off"
              aria-label="Video link"
              className="min-w-0 flex-1 bg-transparent text-[14.5px] text-chalk outline-none placeholder:text-chalk-ghost"
            />
            {url.length > 0 && (
              <button
                type="button"
                onClick={() => setUrl('')}
                aria-label="Clear link"
                className="shrink-0 text-[11px] text-chalk-ghost transition-colors hover:text-chalk-dim"
              >
                clear
              </button>
            )}
          </div>

          <AnimatePresence>
            {clipboardHint && !url.trim() && (
              <motion.button
                type="button"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                onClick={() => {
                  setUrl(clipboardHint);
                  setClipboardHint(null);
                  void submitUrl(clipboardHint);
                }}
                className="surface-2 row-interactive mt-2 flex w-full items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 text-left"
              >
                <ClipboardIcon size={15} className="shrink-0 text-iris-400" />
                <span className="truncate text-[12.5px] text-chalk-dim">
                  Use the link on your clipboard —{' '}
                  <span className="text-chalk">{clipboardHint}</span>
                </span>
              </motion.button>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] text-[15px] font-semibold text-white"
          >
            {probing ? (
              <>
                <motion.span
                  className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
                Reading the source…
              </>
            ) : (
              <>
                Fetch formats
                <ArrowRightIcon size={17} />
              </>
            )}
          </button>
        </form>

        <AnimatePresence>
          {probeError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex gap-3 rounded-[var(--radius-control)] border border-coral/25 bg-coral/[0.07] px-4 py-3.5">
                <AlertIcon size={17} className="mt-px shrink-0 text-coral" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-chalk">{probeError.message}</p>
                  {RECOVERY[probeError.code] && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-chalk-faint">
                      {RECOVERY[probeError.code]}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {platform.note && !probeError && (
          <motion.p
            key={platform.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 px-1 text-center text-[12px] leading-relaxed text-chalk-faint"
          >
            {platform.note}
          </motion.p>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-[12px] text-chalk-ghost">
          <span>Copy a link, then</span>
          <KeyCap>⌘</KeyCap>
          <KeyCap>V</KeyCap>
          <span>anywhere in this window</span>
        </div>

        {recent.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-8"
          >
            <p className="mb-2 text-[10.5px] font-semibold tracking-[0.09em] text-chalk-ghost uppercase">
              Recently saved
            </p>
            <div className="space-y-1">
              {recent.map((job) => (
                <div
                  key={job.id}
                  className="row-interactive flex items-center gap-3 rounded-[9px] px-3 py-2"
                >
                  {api.thumbUrl(job.thumbnail) ? (
                    <img
                      src={api.thumbUrl(job.thumbnail) as string}
                      alt=""
                      className="drag-none h-7 w-12 shrink-0 rounded-[5px] object-cover"
                    />
                  ) : (
                    <div className="h-7 w-12 shrink-0 rounded-[5px] bg-ink-750" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-chalk-dim">
                    {job.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-chalk-ghost tabular">
                    {job.finishedAt ? relativeTime(job.finishedAt) : duration(null)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
